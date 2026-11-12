import fs from "fs";
import path from "path";
import pkg from "@whiskeysockets/baileys";
const { generateWAMessageFromContent } = pkg;

const BOT_NAME = "Sukuna ✦ 𝑩𝑶𝑻";
const ROOT = process.cwd();
const MAX_FILE_SIZE = 100 * 1024; // 100 KB

const IGNORED = new Set([
    "node_modules", ".git", ".cache", "sessions", "auth_info", "store"
]);

// ─── دوال مساعدة ───
function getArgs(m, text) {
    return (text || "").trim();
}

function normalizePath(value) {
    return value.replace(/\\/g, "/").replace(/^\.?\//, "").trim();
}

function findFirstFile(input, dir = ROOT, depth = 0) {
    if (depth > 10) return null;
    let entries;
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
        return null;
    }

    const wanted = normalizePath(input).toLowerCase();

    if (wanted.includes("/")) {
        const directPath = path.resolve(ROOT, input);
        if (directPath.startsWith(ROOT + path.sep) && fs.existsSync(directPath)) {
            try {
                if (fs.statSync(directPath).isFile() && /\.(js|json)$/i.test(directPath)) {
                    return directPath;
                }
            } catch { }
        }
    }

    for (const entry of entries) {
        if (entry.isFile() && entry.name.toLowerCase() === path.basename(wanted) && /\.(js|json)$/i.test(entry.name)) {
            return path.join(dir, entry.name);
        }
    }

    for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith(".") || IGNORED.has(entry.name)) continue;
        const result = findFirstFile(input, path.join(dir, entry.name), depth + 1);
        if (result) return result;
    }
    return null;
}

function splitCode(code, limit = 2500) {
    const chunks = [];
    while (code.length) {
        let end = Math.min(limit, code.length);
        if (end < code.length) {
            const newline = code.lastIndexOf("\n", end);
            if (newline > limit / 2) {
                end = newline + 1;
            }
        }
        chunks.push(code.slice(0, end));
        code = code.slice(end);
    }
    return chunks.length ? chunks : [""];
}

// ─── دالة إرسال الكود المزخرف ───
async function sendRich(conn, jid, richMessage) {
    try {
        const userId = conn.user?.id;
        const botJid = userId ? (userId.includes(":") ? userId.split(":")[0] + "@s.whatsapp.net" : userId) : undefined;

        const contextInfo = {
            isForwarded: true,
            forwardingScore: 999,
            forwardedAiBotMessageInfo: { botJid: "867051314767696@bot" },
            forwardOrigin: 4
        };

        const message = await generateWAMessageFromContent(
            jid,
            {
                botForwardedMessage: {
                    message: {
                        richResponseMessage: { ...richMessage, contextInfo }
                    }
                }
            },
            {
                ...(botJid ? { userJid: botJid, senderId: botJid } : {}),
                messageId: typeof conn.generateMessageIDV2 === "function" ? conn.generateMessageIDV2(botJid) : "ADAM-" + Date.now().toString(36).toUpperCase()
            }
        );

        return await conn.relayMessage(jid, message.message, { messageId: message.key.id });
    } catch (error) {
        console.error("[ADAM CODE] Rich Message Failed:", error);
        throw error; 
    }
}

// ─── أمر عرض المساعدة (مزخرف) ───
async function showHelp(conn, jid) {
    return conn.sendMessage(jid, {
        text:
            "╔══════════════════════════════════════╗\n" +
            "      ≪  ❪ 🍎 𝑨𝑫𝑨𝑴 𝑩𝑶𝑻 🍏 ❫  ≫\n" +
            "             ❪ 𝑭𝒊𝒍𝒆 ✦ 𝑹𝒆𝒂𝒅𝒆𝒓 ❫\n" +
            "╚══════════════════════════════════════╝\n\n" +
            "  🍎 ⌈ 𝑺𝒕𝒂𝒕𝒖𝒔 ⌋ ⇢ 📂 عارض ملفات البوت\n" +
            "  🍏 ⌈ 𝑻𝒚𝒑𝒆 ⌋ ⇢ 𝐉𝐒 & 𝐉𝐒𝐎𝐍\n\n" +
            "  ✦ O Human… This Is Your World ✦\n\n" +
            "⌬──══─┈•⤣🍏⤤•┈─══──⌬\n" +
            "*║* *『 ⌬╎°⃟𑁁📝❯ أمثلة الاستخدام 』*\n" +
            "*║* *『 ⌬╎°⃟𑁁🍎❯ .كود handler 』*\n" +
            "*║* *『 ⌬╎°⃟𑁁🍏❯ .كود index.js 』*\n" +
            "*║* *『 ⌬╎°⃟𑁁🍎❯ .كود plugins/ai/ميتا.js 』*\n" +
            "⌬──══─┈•⤣🍏⤤•┈─══──⌬\n\n" +
            "  ⟣ ✧ اختر أول ملف مطابق تلقائيًا ✧ ⟢\n\n" +
            "╔══════════════════════════════════════╗\n" +
            "  ╟「 👑 」↬ *Dev · Adam ✦ The Absolute*\n" +
            "  ╟「 📢 」↬ *قناة البوت:*\n" +
            "  ╟「 🍎 」↬ https://whatsapp.com/channel/0029VbE0J4s8PgsIDawj9f0S\n" +
            "╚══════════════════════════════════════╝"
    });
}

// ─── دالة عرض الملف ───
async function showFile(conn, jid, file) {
    let stat;
    let code;

    try {
        stat = fs.statSync(file);
        if (stat.size > MAX_FILE_SIZE) {
            return conn.sendMessage(jid, {
                text: 
                    "╔══════════════════════════════════════╗\n" +
                    "      ≪  ❪ 🍎 𝑨𝑫𝑨𝑴 𝑩𝑶𝑻 🍏 ❫  ≫\n" +
                    "╚══════════════════════════════════════╝\n\n" +
                    "  ╟「 ⚠️ 」↬ *الملف أكبر من الحد المسموح!*\n" +
                    "  ╟「 📦 」↬ *الحد الأقصى:* 100 KB"
            });
        }
        code = fs.readFileSync(file, "utf8");
    } catch (error) {
        return conn.sendMessage(jid, { 
            text: "❌ تعذر قراءة الملف: " + String(error.message || error).slice(0, 150) 
        });
    }

    const relative = path.relative(ROOT, file).replace(/\\/g, "/");
    const language = path.extname(file).slice(1) || "text";

    const fileInfoText = 
        "╔══════════════════════════════════════╗\n" +
        "      ≪  ❪ 🍎 𝑨𝑫𝑨𝑴 𝑩𝑶𝑻 🍏 ❫  ≫\n" +
        "╚══════════════════════════════════════╝\n\n" +
        `  🍎 ⌈ 𝑵𝒂𝒎𝒆 ⌋ ⇢ ${relative}\n` +
        `  🍏 ⌈ 𝑺𝒊𝒛𝒆 ⌋ ⇢ ${stat.size} bytes\n` +
        `  🍎 ⌈ 𝑳𝒂𝒏𝒈 ⌋ ⇢ ${language.toUpperCase()}\n\n` +
        "  ✦ O Human… This Is Your World ✦";

    try {
        // محاولة إرسال الكود بالتنسيق المزخرف
        return await sendRich(conn, jid, {
            messageType: 1,
            submessages: [
                {
                    messageType: 2,
                    messageText: fileInfoText
                },
                {
                    messageType: 5,
                    codeMetadata: {
                        codeLanguage: language,
                        codeBlocks: splitCode(code).map(part => ({ highlightType: 1, codeContent: part }))
                    }
                }
            ]
        });
    } catch (e) {
        // الفولباك: لو الميزة مش مدعومة في نسخة البايلز، هنبعت الكود كنص عادي
        return conn.sendMessage(jid, {
            text: `${fileInfoText}\n\n\`\`\`${language}\n${code}\n\`\`\``
        });
    }
}

// ═══════════════════════════════════════════════════
//  Handler الرئيسي (متوافق مع هيكل بوتك)
// ═══════════════════════════════════════════════════
let handler = async (m, { conn, text, usedPrefix, command }) => {
    const jid = m.chat;
    const args = getArgs(m, text);

    // لو مفيش اسم ملف، اعرض المساعدة
    if (!args) {
        return showHelp(conn, jid);
    }

    let input = args.split(/\s+/)[0].trim();

    if (!/\.(js|json)$/i.test(input)) {
        input += ".js";
    }

    const file = findFirstFile(input);

    if (!file) {
        return conn.sendMessage(jid, {
            text: 
                "╔══════════════════════════════════════╗\n" +
                "      ≪  ❪ 🍎 𝑨𝑫𝑨𝑴 𝑩𝑶𝑻 🍏 ❫  ≫\n" +
                "╚══════════════════════════════════════╝\n\n" +
                "  ╟「 ❌ 」↬ *الملف غير موجود!*\n" +
                `  ╟「 📄 」↬ *الاسم:* ${input}\n` +
                "  ╟「 ⚠️ 」↬ *تأكد من كتابة الاسم بشكل صحيح.*"
        }, { quoted: m });
    }

    return showFile(conn, jid, file);
};

// ─── إعدادات الأمر ───
handler.command = /^(كود|code)$/i;
handler.tags = ["developer"];
handler.help = ["كود <اسم الملف>"];

export default handler;