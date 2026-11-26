"use strict";

/* ═══════════════════════════════════════════════════════
   ✦ 𝑰𝑻𝑨𝑪𝑯𝑰 𝑩𝑶𝑻 — GROUP WALLPAPER ✦
   تغيير خلفية الجروب المشتركة لكل الأعضاء
═══════════════════════════════════════════════════════ */

const fs = require("fs");
const axios = require("axios");
const pb = require("protobufjs/minimal");
const baileys = require("@whiskeysockets/baileys");

const Writer = pb.Writer || (pb.default && pb.default.Writer);
const { downloadContentFromMessage } = baileys;

const THEME_EMOJI = "🌌";
const PINTEREST_API = "https://api-tyson-md.vercel.app/api/download/pinterest";

const installed = new WeakSet();
const reacted = new Set();
const lastChange = new Map();

const NOT_THEME_STUBS = new Set([
    27, 28, 29, 30, 31, 32
]);

// ================================================
// 🛠️ أدوات مساعدة
// ================================================

function normId(jid) {
    return String(jid || "")
        .split("@")[0]
        .split(":")[0]
        .toLowerCase();
}

function unwrapMessage(message) {
    let msg = message?.message || message;

    for (let i = 0; i < 30; i++) {
        if (!msg) return null;

        const next =
            msg.ephemeralMessage?.message ||
            msg.viewOnceMessage?.message ||
            msg.viewOnceMessageV2?.message ||
            msg.viewOnceMessageV2Extension?.message ||
            msg.documentWithCaptionMessage?.message ||
            msg.deviceSentMessage?.message;

        if (!next) break;
        msg = next;
    }

    return msg;
}

function getText(msg) {
    const content = unwrapMessage(msg?.message);

    return String(
        msg?.text ||
        msg?.body ||
        content?.conversation ||
        content?.extendedTextMessage?.text ||
        content?.imageMessage?.caption ||
        ""
    ).trim();
}

function getContextInfo(msg) {
    const content = unwrapMessage(msg?.message);

    return (
        content?.extendedTextMessage?.contextInfo ||
        content?.imageMessage?.contextInfo ||
        content?.videoMessage?.contextInfo ||
        null
    );
}

function findQuotedMessage(root) {
    const visited = new Set();

    function scan(obj, depth = 0) {
        if (!obj || typeof obj !== "object" || depth > 30) {
            return null;
        }

        if (visited.has(obj)) return null;
        visited.add(obj);

        if (obj.contextInfo?.quotedMessage) {
            return obj.contextInfo.quotedMessage;
        }

        for (const key of Object.keys(obj)) {
            const value = obj[key];

            if (!value || typeof value !== "object") continue;

            const found = scan(value, depth + 1);
            if (found) return found;
        }

        return null;
    }

    return scan(root);
}

function findImageMessage(root) {
    const visited = new Set();

    function scan(obj, depth = 0) {
        if (!obj || typeof obj !== "object" || depth > 30) {
            return null;
        }

        if (visited.has(obj)) return null;
        visited.add(obj);

        const msg = unwrapMessage(obj);

        if (msg && msg !== obj) {
            const found = scan(msg, depth + 1);
            if (found) return found;
        }

        if (obj.imageMessage) {
            return obj.imageMessage;
        }

        for (const key of Object.keys(obj)) {
            const value = obj[key];

            if (!value || typeof value !== "object") continue;

            const found = scan(value, depth + 1);
            if (found) return found;
        }

        return null;
    }

    return scan(root);
}

function getImageFromMessage(msg) {
    const sources = [
        findQuotedMessage(msg),
        msg?.quoted?.message,
        msg?.quoted?.msg?.message,
        msg?.quoted?.msg,
        msg?.quoted,
        msg?.quotedMessage,
        msg?.msg?.message?.extendedTextMessage?.contextInfo?.quotedMessage,
        msg?.msg?.extendedTextMessage?.contextInfo?.quotedMessage,
        msg?.message?.extendedTextMessage?.contextInfo?.quotedMessage,
        msg?.msg,
        msg?.message,
        msg
    ];

    for (const source of sources) {
        if (!source) continue;

        const image = findImageMessage(source);
        if (image) return image;
    }

    return null;
}

// ================================================
// 🖼️ تحميل الصورة
// ================================================

async function downloadImageBuffer(imageMessage) {
    const stream = await downloadContentFromMessage(
        imageMessage,
        "image"
    );

    const chunks = [];

    for await (const chunk of stream) {
        chunks.push(chunk);
    }

    return Buffer.concat(chunks);
}

// ================================================
// 🔎 البحث في Pinterest
// ================================================

async function fetchPinterestImage(query) {
    const response = await axios.get(PINTEREST_API, {
        params: { q: query },
        timeout: 30000,
        headers: {
            "User-Agent": "Mozilla/5.0"
        },
        validateStatus: () => true
    });

    if (
        response.status < 200 ||
        response.status >= 300
    ) {
        throw new Error("API_ERROR");
    }

    const pins = (response.data?.pins || [])
        .filter(pin => pin?.image);

    if (!pins.length) {
        throw new Error("NO_RESULTS");
    }

    const shuffled = pins
        .slice()
        .sort(() => Math.random() - 0.5)
        .slice(0, 6);

    for (const pin of shuffled) {
        try {
            const image = await axios.get(pin.image, {
                responseType: "arraybuffer",
                timeout: 30000,
                headers: {
                    "User-Agent": "Mozilla/5.0"
                },
                validateStatus: () => true
            });

            const type = String(
                image.headers["content-type"] || ""
            );

            if (
                image.status >= 200 &&
                image.status < 300 &&
                type.startsWith("image/") &&
                image.data?.byteLength > 1000
            ) {
                return Buffer.from(image.data);
            }
        } catch {}
    }

    throw new Error("NO_IMAGES");
}

// ================================================
// 💬 الردود والتفاعلات
// ================================================

async function react(sock, msg, emoji) {
    try {
        await sock.sendMessage(msg.key.remoteJid, {
            react: {
                text: emoji,
                key: msg.key
            }
        });
    } catch {}
}

async function sendText(sock, msg, text) {
    return sock.sendMessage(
        msg.key.remoteJid,
        { text },
        { quoted: msg }
    );
}

// ================================================
// 🎨 مراقبة تغيير سمة الجروب
// ================================================

function stubName(stub) {
    if (typeof stub === "number") {
        return (
            baileys.proto?.WebMessageInfo?.StubType?.[stub] ||
            String(stub)
        );
    }

    return String(stub || "");
}

function installThemeListener(sock) {
    if (!sock?.ev || installed.has(sock)) return;

    installed.add(sock);

    sock.ev.on("messages.upsert", async ({ messages }) => {
        try {
            for (const msg of messages || []) {
                const chat = msg?.key?.remoteJid;
                const stub = msg?.messageStubType;

                if (!chat?.endsWith("@g.us")) continue;

                const changeTime = lastChange.get(chat);

                if (
                    changeTime &&
                    Date.now() - changeTime < 20000
                ) {
                    console.log(
                        "[ITACHI GROUP BG][DEBUG]",
                        JSON.stringify({
                            id: msg.key.id,
                            fromMe: msg.key.fromMe,
                            stub,
                            stubName: stubName(stub),
                            stubParams: msg.messageStubParameters,
                            msgKeys: Object.keys(msg.message || {}),
                            protocolType:
                                msg.message?.protocolMessage?.type
                        })
                    );
                }

                const isThemeProto = /CHAT_THEME/i.test(
                    String(msg.message?.protocolMessage?.type)
                );

                if (
                    isThemeProto &&
                    msg.key.id &&
                    !reacted.has(msg.key.id)
                ) {
                    reacted.add(msg.key.id);

                    await sock.sendMessage(chat, {
                        react: {
                            text: THEME_EMOJI,
                            key: msg.key
                        }
                    });

                    continue;
                }

                if (stub === undefined || stub === null) {
                    continue;
                }

                const name = stubName(stub);
                const number = Number(stub);

                const byName = /THEME|WALLPAPER/i.test(name);

                const time = lastChange.get(chat);

                const byWindow =
                    time &&
                    Date.now() - time < 20000 &&
                    !NOT_THEME_STUBS.has(number);

                if (!byName && !byWindow) continue;

                const id = msg.key.id;

                if (!id || reacted.has(id)) continue;

                reacted.add(id);

                if (reacted.size > 500) {
                    reacted.delete(
                        reacted.values().next().value
                    );
                }

                if (byWindow) {
                    lastChange.delete(chat);
                }

                console.log(
                    "[ITACHI GROUP BG] Theme detected:",
                    stub,
                    name
                );

                await sock.sendMessage(chat, {
                    react: {
                        text: THEME_EMOJI,
                        key: msg.key
                    }
                });
            }
        } catch (error) {
            console.error(
                "[ITACHI GROUP BG] Theme listener:",
                error
            );
        }
    });

    console.log(
        "[ITACHI GROUP BG] Theme listener installed"
    );
}

// ================================================
// 🌌 تغيير الخلفية المشتركة
// ================================================

async function setSharedGroupWallpaper(
    sock,
    chat,
    metadata,
    imageBuffer
) {
    if (
        !baileys.MEDIA_PATH_MAP ||
        !baileys.MEDIA_HKDF_KEY_MAPPING
    ) {
        throw new Error(
            "نسخة Baileys لا تدعم إعدادات chat-wallpaper-image."
        );
    }

    baileys.MEDIA_PATH_MAP["chat-wallpaper-image"] =
        "/mms/chat-wallpaper-image";

    baileys.MEDIA_HKDF_KEY_MAPPING["chat-wallpaper-image"] =
        "Chat Wallpaper";

    let encFilePath = null;

    try {
        const encrypted = await baileys.encryptedStream(
            imageBuffer,
            "chat-wallpaper-image"
        );

        encFilePath = encrypted.encFilePath;

        if (!encFilePath || !fs.existsSync(encFilePath)) {
            throw new Error(
                "تعذر إنشاء ملف الصورة المشفر."
            );
        }

        const uploaded = await sock.waUploadToServer(
            encFilePath,
            {
                fileEncSha256B64:
                    encrypted.fileEncSha256.toString("base64"),
                mediaType: "chat-wallpaper-image",
                timeoutMs: 120000
            }
        );

        if (!uploaded?.directPath) {
            throw new Error(
                "فشل رفع الصورة إلى خوادم واتساب."
            );
        }

        const themeData = Writer.create()
            .uint32(8).int64(Date.now())
            .uint32(106).fork()
                .uint32(10).string(uploaded.directPath)
                .uint32(18).bytes(encrypted.mediaKey)
                .uint32(26).bytes(encrypted.fileEncSha256)
                .uint32(34).bytes(encrypted.fileSha256)
            .ldelim()
            .finish();

        const messageData = Writer.create()
            .uint32(98).fork()
                .uint32(16).int32(34)
                .uint32(242).bytes(themeData)
            .ldelim()
            .finish();

        const me = sock.user || {};
        const mode = metadata.addressingMode || "lid";

        const meId =
            mode === "lid" && me.lid
                ? me.lid
                : me.id;

        if (!meId) {
            throw new Error(
                "تعذر تحديد هوية البوت."
            );
        }

        const encryptedGroupMessage =
            await sock.signalRepository.encryptGroupMessage({
                group: chat,
                data: baileys.writeRandomPadMax16(messageData),
                meId
            });

        const themeMessageId =
            baileys.generateMessageIDV2(me.id);

        await sock.sendNode({
            tag: "message",

            attrs: {
                id: themeMessageId,
                to: chat,
                type: "media",
                addressing_mode: mode
            },

            content: [{
                tag: "enc",

                attrs: {
                    v: "2",
                    type: "skmsg",
                    mediatype: "chat_theme"
                },

                content: encryptedGroupMessage.ciphertext
            }]
        });

        return themeMessageId;

    } finally {
        if (
            encFilePath &&
            fs.existsSync(encFilePath)
        ) {
            try {
                fs.unlinkSync(encFilePath);
            } catch {}
        }
    }
}

// ================================================
// 🔐 التحقق من المشرفين
// ================================================

function isAdmin(participant) {
    return (
        participant &&
        (
            participant.admin === "admin" ||
            participant.admin === "superadmin"
        )
    );
}

function idsOf(participant = {}) {
    return [
        participant.id,
        participant.lid,
        participant.phoneNumber,
        participant.jid
    ]
        .filter(Boolean)
        .map(normId);
}

function getCommandArgs(msg, text) {
    if (Array.isArray(msg.args)) {
        return [...msg.args];
    }

    if (Array.isArray(msg.commandArgs)) {
        return [...msg.commandArgs];
    }

    // حذف الأمر الأول واستخراج بقية النص
    return text
        .replace(/^\s*[.!#/،]?\S+\s*/, "")
        .trim()
        .split(/\s+/)
        .filter(Boolean);
}

// ================================================
// 👑 ITACHI COMMAND
// ================================================

module.exports = {
    command: "خلفية",

    aliases: [
        "gg",
        "GG",
        "bg",
        "جروب_خلفية",
        "جروبخلفية",
        "خلفية_جروب",
        "خلفيةجروب",
        "background-group",
        "backgroundgroup",
        "background_group",
        "groupwallpaper",
        "wallpaper"
    ],

    category: "group",

    description: "تغيير خلفية الجروب المشتركة أو صورته",

    async execute(sock, msg) {
        const chat = msg?.key?.remoteJid;

        if (!chat) return;

        const m = {
            ...msg,
            chat,
            sender:
                msg.key.participant ||
                msg.participant ||
                ""
        };

        installThemeListener(sock);

        const rawText = getText(msg);
        const args = getCommandArgs(msg, rawText);

        const picMode = [
            "pic",
            "صورة"
        ].includes(String(args[0] || "").toLowerCase());

        if (picMode) {
            args.shift();
        }

        const query = args.join(" ").trim();

        try {
            // الجروبات فقط
            if (!chat.endsWith("@g.us")) {
                await sendText(
                    sock,
                    msg,
                    "╭━━━〔 ❌ 𝑰𝑻𝑨𝑪𝑯𝑰 〕━━━⬣\n" +
                    "│ هذا الأمر للجروبات فقط.\n" +
                    "╰━━━━━━━━━━━━━━━━━━⬣"
                );

                return;
            }

            // استخراج الصورة المقتبسة
            const imageMessage = getImageFromMessage(m);

            if (!imageMessage && !query) {
                await sendText(
                    sock,
                    msg,
                    "╭━━━〔 🖼️ 𝑮𝑹𝑶𝑼𝑷 𝑾𝑨𝑳𝑳𝑷𝑨𝑷𝑬𝑹 〕━━━⬣\n" +
                    "│\n" +
                    "│ ↳ قم بالرد على صورة واكتب:\n" +
                    "│ .خلفية\n" +
                    "│\n" +
                    "│ ↳ البحث عن خلفية:\n" +
                    "│ .خلفية anime\n" +
                    "│\n" +
                    "│ ↳ تغيير صورة الجروب:\n" +
                    "│ .خلفية pic anime\n" +
                    "│\n" +
                    "╰━━━━━━━━━━━━━━━━━━⬣"
                );

                return;
            }

            // بيانات الجروب
            const metadata = await sock
                .groupMetadata(chat)
                .catch(() => null);

            if (!metadata) {
                await sendText(
                    sock,
                    msg,
                    "╭━━━〔 ❌ 𝑰𝑻𝑨𝑪𝑯𝑰 〕━━━⬣\n" +
                    "│ فشل جلب بيانات الجروب.\n" +
                    "╰━━━━━━━━━━━━━━━━━━⬣"
                );

                return;
            }

            const participants = metadata.participants || [];

            // التحقق من المشرف
            const senderId = normId(m.sender);

            const senderParticipant = participants.find(
                participant =>
                    idsOf(participant).includes(senderId)
            );

            if (!isAdmin(senderParticipant)) {
                await sendText(
                    sock,
                    msg,
                    "╭━━━〔 ❌ 𝑰𝑻𝑨𝑪𝑯𝑰 〕━━━⬣\n" +
                    "│ الأمر متاح لمشرفي الجروب فقط.\n" +
                    "╰━━━━━━━━━━━━━━━━━━⬣"
                );

                return;
            }

            // التحقق من إشراف البوت
            const me = sock.user || {};

            const botIds = [
                me.id,
                me.lid
            ]
                .filter(Boolean)
                .map(normId);

            const botParticipant = participants.find(
                participant =>
                    idsOf(participant).some(id =>
                        botIds.includes(id)
                    )
            );

            if (!isAdmin(botParticipant)) {
                await sendText(
                    sock,
                    msg,
                    "╭━━━〔 ❌ 𝑰𝑻𝑨𝑪𝑯𝑰 〕━━━⬣\n" +
                    "│ يجب ترقية البوت إلى مشرف أولاً.\n" +
                    "╰━━━━━━━━━━━━━━━━━━⬣"
                );

                return;
            }

            // التأكد من توفر الأدوات
            if (!picMode) {
                const missing = [
                    ["protobuf Writer", Writer],
                    ["encryptedStream", baileys.encryptedStream],
                    ["writeRandomPadMax16", baileys.writeRandomPadMax16],
                    ["generateMessageIDV2", baileys.generateMessageIDV2],
                    ["MEDIA_PATH_MAP", baileys.MEDIA_PATH_MAP],
                    ["MEDIA_HKDF_KEY_MAPPING", baileys.MEDIA_HKDF_KEY_MAPPING],
                    ["waUploadToServer", sock.waUploadToServer],
                    ["encryptGroupMessage", sock.signalRepository?.encryptGroupMessage],
                    ["sendNode", sock.sendNode]
                ]
                    .filter(([, value]) => !value)
                    .map(([name]) => name);

                if (missing.length) {
                    await sendText(
                        sock,
                        msg,
                        "╭━━━〔 ⚠️ 𝑩𝑨𝑰𝑳𝑬𝒀𝑺 〕━━━⬣\n" +
                        "│ توجد دوال غير متاحة:\n" +
                        "│\n" +
                        missing.map(name => `│ • ${name}`).join("\n") +
                        "\n╰━━━━━━━━━━━━━━━━━━⬣"
                    );

                    return;
                }
            }

            // بدء التنفيذ
            await react(sock, msg, "⏳");

            let buffer;

            if (imageMessage) {
                buffer = await downloadImageBuffer(imageMessage);
            } else {
                buffer = await fetchPinterestImage(query);
            }

            if (!buffer || !buffer.length) {
                throw new Error("EMPTY_MEDIA");
            }

            // تغيير صورة الجروب
            if (picMode) {
                if (typeof sock.updateProfilePicture !== "function") {
                    throw new Error(
                        "دالة تغيير صورة الجروب غير متاحة."
                    );
                }

                await sock.updateProfilePicture(chat, buffer);

            } else {
                // تغيير الخلفية المشتركة
                lastChange.set(chat, Date.now());

                const themeMessageId =
                    await setSharedGroupWallpaper(
                        sock,
                        chat,
                        metadata,
                        buffer
                    );

                // التفاعل على رسالة تغيير السمة
                setTimeout(async () => {
                    try {
                        await sock.sendMessage(chat, {
                            react: {
                                text: THEME_EMOJI,

                                key: {
                                    remoteJid: chat,
                                    fromMe: true,
                                    id: themeMessageId
                                }
                            }
                        });

                        reacted.add(themeMessageId);

                    } catch (error) {
                        console.error(
                            "[ITACHI GROUP BG] Theme reaction:",
                            error.message
                        );
                    }
                }, 1500);
            }

            await react(sock, msg, "✅");

            await sendText(
                sock,
                msg,
                "╭━━━〔 ✅ 𝑰𝑻𝑨𝑪𝑯𝑰 〕━━━⬣\n" +
                "│\n" +
                (
                    picMode
                        ? "│ تم تغيير صورة الجروب بنجاح.\n"
                        : "│ تم إرسال تغيير الخلفية المشتركة.\n"
                ) +
                "│\n" +
                `│ ${picMode ? "🖼️ GROUP PICTURE" : "🌌 GROUP WALLPAPER"}\n` +
                "│\n" +
                "╰━━━━━━━━━━━━━━━━━━⬣"
            );

            return;

        } catch (error) {
            console.error(
                "[ITACHI GROUP BG ERROR]",
                error?.stack || error
            );

            await react(sock, msg, "❌");

            const reasons = {
                API_ERROR: "تعذر الاتصال بخدمة Pinterest.",
                NO_RESULTS: "لم يتم العثور على نتائج للبحث.",
                NO_IMAGES: "تعذر تحميل الصور من نتائج البحث.",
                EMPTY_MEDIA: "الصورة فارغة أو غير صالحة."
            };

            const reason =
                reasons[error?.message] ||
                String(error?.message || error || "خطأ غير معروف");

            await sendText(
                sock,
                msg,
                "╭━━━〔 ❌ 𝑰𝑻𝑨𝑪𝑯𝑰 〕━━━⬣\n" +
                "│ فشل تنفيذ طلب الخلفية.\n" +
                "│\n" +
                `│ السبب: ${reason.slice(0, 600)}\n` +
                "│\n" +
                "╰━━━━━━━━━━━━━━━━━━⬣"
            ).catch(() => {});
        }
    }
};