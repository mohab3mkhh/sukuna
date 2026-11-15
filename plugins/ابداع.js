/**
 * 🫧 𝓖𝓮𝓸 — ابداع
 * بتحفظ ملصق، وبعدها البوت بيتفاعل بيه مع رسايلك العادية (الإضافة plugins/ibdaa.js).
 *
 *   .ابداع          (ردّ على ملصق)  ← يحفظ الملصق
 *   .ابداع حذف                      ← يمسح الملصق ويوقف التفاعل
 *   .ابداع                          ← يعرض حالتك
 */
"use strict";

const fs = require("fs");
const path = require("path");

const DB_DIR = path.join(process.cwd(), "database");
const DB_FILE = path.join(DB_DIR, "ibdaa.json");

const LINE = "≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋";

/* ═══════════ التخزين ═══════════ */

function loadDB() {
    try {
        return fs.existsSync(DB_FILE)
            ? JSON.parse(fs.readFileSync(DB_FILE, "utf8"))
            : {};
    } catch {
        return {};
    }
}

function saveDB(db) {
    fs.mkdirSync(DB_DIR, { recursive: true });
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

/* ═══════════ الملصق ═══════════ */

function findSticker(obj, depth = 0, seen = new Set()) {

    if (!obj || typeof obj !== "object" || depth > 7) return null;
    if (seen.has(obj)) return null;
    seen.add(obj);

    if (obj.stickerMessage) return obj.stickerMessage;

    if (obj.mtype === "stickerMessage" && obj.msg) return obj.msg;

    if (obj.mimetype === "image/webp" && obj.fileSha256 && obj.mediaKey) {
        return obj;
    }

    for (const key of Object.keys(obj)) {
        if (["key", "chat", "sender"].includes(key)) continue;

        const found = findSticker(obj[key], depth + 1, seen);
        if (found) return found;
    }

    return null;
}

function toBase64(value) {
    if (!value) return value;
    if (Buffer.isBuffer(value)) return value.toString("base64");
    if (value instanceof Uint8Array) return Buffer.from(value).toString("base64");
    return value;
}

function prepareSticker(sticker) {
    return {
        url: sticker.url,
        fileSha256: toBase64(sticker.fileSha256),
        fileEncSha256: toBase64(sticker.fileEncSha256),
        mediaKey: toBase64(sticker.mediaKey),
        mimetype: sticker.mimetype || "image/webp",
        height: sticker.height || 512,
        width: sticker.width || 512,
        directPath: sticker.directPath,
        fileLength: sticker.fileLength,
        mediaKeyTimestamp: sticker.mediaKeyTimestamp,
        firstFrameLength: sticker.firstFrameLength,
        firstFrameSidecar: toBase64(sticker.firstFrameSidecar),
        isAnimated: sticker.isAnimated || false,
        contextInfo: {},
        stickerSentTs: Date.now(),
        isAvatar: false,
        isAiSticker: false,
        isLottie: false
    };
}

/* ═══════════ الردود ═══════════ */

function card(title, lines = [], footer = "") {
    return [
        `🫧 ⟪ ${title} ⟫ 🫧`,
        LINE,
        ...lines,
        LINE,
        ...(footer ? [footer] : [])
    ].join("\n");
}

async function say(geo, m, text) {
    return geo.sendMessage(
        m.chat,
        { text },
        { quoted: m.msg || m }
    );
}

/* ═══════════ الأمر ═══════════ */

module.exports = {

    name: "إبهار",

    aliases: ["ابداع", "ibdaa", "ابداع_ملصق"],

    category: "fun",

    description: "🫧 البوت يتفاعل مع رسايلك بالملصق اللي تحفظه",

    async run({ geo, m }) {

        const sender = m.sender;

        if (!sender) return;

        const db = loadDB();
        const arg = String((m.args || [])[0] || "").trim();

        /* ─── حذف ─── */
        if (/^(حذف|مسح|ايقاف|إيقاف|delete|off)$/i.test(arg)) {

            if (!db[sender]) {
                return say(geo, m, card(
                    "𝓘𝓫𝓭𝓪𝓪",
                    [`🚫 لا يوجد ملصق محفوظ على رقمك.`]
                ));
            }

            delete db[sender];
            saveDB(db);

            return say(geo, m, card(
                "𝓘𝓫𝓭𝓪𝓪",
                [
                    `☑️ مسحت الملصق.`,
                    `🐚 التفاعل التلقائي وقف.`
                ]
            ));
        }

        /* ─── حفظ (ردّ على ملصق) ─── */
        if (m.quoted) {

            const sticker = findSticker(m.quoted);

            if (!sticker) {
                return say(geo, m, card(
                    "𝓘𝓫𝓭𝓪𝓪",
                    [`🚫 الرسالة الذي رديت علماذاا مش ملصق.`]
                ));
            }

            const prepared = prepareSticker(sticker);

            if (!prepared.url || !prepared.mediaKey) {
                return say(geo, m, card(
                    "𝓘𝓫𝓭𝓪𝓪",
                    [`🚫 لم أتمكن من أقرأ بيانات الملصق، جرب ملصق تاني.`]
                ));
            }

            db[sender] = {
                sticker: prepared,
                updated: Date.now()
            };

            saveDB(db);

            return say(geo, m, card(
                "𝓘𝓫𝓭𝓪𝓪",
                [
                    `☑️ الملصق اتحفظ.`,
                    ``,
                    `> 🐚 مش هبعته دلوقتي`,
                    `> 🐚 هتفاعل بيه مع رسايلك العادية`,
                    `> 🐚 للإلغاء اكتب: .ابداع حذف`
                ]
            ));
        }

        /* ─── مفيش ردّ: نعرض الحالة والشرح ─── */
        return say(geo, m, card(
            "𝓘𝓫𝓭𝓪𝓪",
            [
                db[sender]
                    ? `🐟 حالتك ‹ شغّال ☑️ (عندك ملصق محفوظ)`
                    : `🐟 حالتك ‹ مفيش ملصق محفوظ`,
                ``,
                `🪸 *.ابداع* (ردّ على ملصق) ‹ يحفظه`,
                `🪸 *.ابداع حذف* ‹ يمسحه`
            ]
        ));
    }
};