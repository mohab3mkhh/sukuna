/**
 * plugins/كود.js
 * عرض محتوى ملفات البوت
 */

import fs from "fs";
import path from "path";
import { sendButtons, btn } from '../lib/buttons.js';

const BOT_NAME = "Sukuna ✦ 𝑩𝑶𝑻";
const ROOT = process.cwd();
const MAX_FILE_SIZE = 100 * 1024; // 100 KB

const IGNORED = new Set([
  "node_modules", ".git", ".cache", "sessions", "auth_info", "store"
]);

// ══════════════════════════════════════════════════
//  دوال مساعدة
// ══════════════════════════════════════════════════
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

function splitCode(code, limit = 3000) {
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

// ══════════════════════════════════════════════════
//  عرض المساعدة
// ══════════════════════════════════════════════════
async function showHelp(conn, jid, m) {
  const helpText = `
╔═══━━━══━━━❪👑❫━━━══━━━═══╗
║  ❪🔥❫ *ＫＩＮＧ ＯＦ ＣＵＲＳＥＳ*  ║
║  ❪⚔️❫ *مَلِكُ اللَّعَنَات*      ║
║  ──━━━══━━━──                  ║
║  ❪📂❫ *عَارِضُ المَلَفَّات*     ║
║  ──━━━══━━━──                  ║
║  ❝ *لَا يُوجَدُ عَدُوٌّ*         ║
║  *لَا أَسْتَطِيعُ سَحْقَهُ…* ❞  ║
╚═══━━━══━━━❪👑❫━━━══━━━═══╝

*║* *『 ⌬╎°⃟𑁁📝❯ أمثلة الاستخدام 』*
*║* *『 ⌬╎°⃟𑁁🔥❯ .كود handler 』*
*║* *『 ⌬╎°⃟𑁁⚔️❯ .كود index.js 』*
*║* *『 ⌬╎°⃟𑁁👑❯ .كود plugins/ميتا.js 』*

> ⛩️ اختر أول ملف مطابق تلقائياً ⛩️
  `;

  await sendButtons(conn, jid, {
    title: '👑 KING OF CURSES',
    subtitle: 'عارض ملفات البوت',
    text: helpText,
    footer: '◜⏤͟͟͞͞ 𝙎𝙐𝙆𝙐𝙉𝘼 ✦ 𝘽𝙊𝙏 ˖࣪⃟🔥 ◞',
    image: 'https://files.catbox.moe/owmlfv.jpg',
    buttons: [
      btn.reply('📂 عارض الملفات', '.كود'),
      btn.reply('🔥 المطورين', '.المطورين')
    ]
  }, m);
}

// ══════════════════════════════════════════════════
//  عرض الملف
// ══════════════════════════════════════════════════
async function showFile(conn, jid, file, m) {
  let stat;
  let code;

  try {
    stat = fs.statSync(file);
    if (stat.size > MAX_FILE_SIZE) {
      return sendButtons(conn, jid, {
        title: '⚠️ الملف كبير',
        subtitle: 'خطأ',
        text: `الملف أكبر من الحد المسموح (100 KB)\n📦 الحجم: ${(stat.size / 1024).toFixed(1)} KB`,
        footer: '◜⏤͟͟͞͞ 𝙎𝙐𝙆𝙐𝙉𝘼 ✦ 𝘽𝙊𝙏 ˖࣪⃟🔥 ◞',
        buttons: [btn.reply('🔙 رجوع', '.كود')]
      }, m);
    }
    code = fs.readFileSync(file, "utf8");
  } catch (error) {
    return conn.sendMessage(jid, {
      text: "❌ تعذر قراءة الملف: " + String(error.message || error).slice(0, 150)
    }, { quoted: m });
  }

  const relative = path.relative(ROOT, file).replace(/\\/g, "/");
  const language = path.extname(file).slice(1) || "text";

  const fileInfoText = `
╔═══━━━══━━━❪👑❫━━━══━━━═══╗
║  ❪🔥❫ *ＫＩＮＧ ＯＦ ＣＵＲＳＥＳ*  ║
║  ❪⚔️❫ *مَلِكُ اللَّعَنَات*      ║
╚═══━━━══━���━❪👑❫━━━══━━━═══╝

╟「 📄 」↬ *الاسم:* ${relative}
╟「 📦 」↬ *الحجم:* ${(stat.size / 1024).toFixed(2)} KB
╟「 💻 」↬ *اللغة:* ${language.toUpperCase()}

> ⛩️ محتوى الملف تحت ⛩️
  `;

  // ✅ إرسال معلومات الملف + الأزرار
  await sendButtons(conn, jid, {
    title: '📄 معلومات الملف',
    subtitle: relative,
    text: fileInfoText,
    footer: '◜⏤͟͟͞͞ 𝙎𝙐𝙆𝙐𝙉𝘼 ✦ 𝘽𝙊𝙏 ˖࣪⃟🔥 ◞',
    buttons: [
      btn.reply('📋 نسخ الكود', `.كود ${relative}`),
      btn.reply('🔙 رجوع', '.كود')
    ]
  }, m);

  // ✅ إرسال الكود مقسم
  const chunks = splitCode(code);
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const header = i === 0 ? `\`\`\`${language}\n` : '';
    const footer = i === chunks.length - 1 ? '\n```' : '';

    await conn.sendMessage(jid, {
      text: `${header}${chunk}${footer}`
    }, { quoted: m });

    // انتظار بسيط بين الرسائل
    if (i < chunks.length - 1) {
      await new Promise(r => setTimeout(r, 500));
    }
  }
}

// ══════════════════════════════════════════════════
//  Handler الرئيسي
// ══════════════════════════════════════════════════
let handler = async (m, { conn, text, usedPrefix, command }) => {
  const jid = m.chat;
  const args = getArgs(m, text);

  // لو مفيش اسم ملف، اعرض المساعدة
  if (!args) {
    return showHelp(conn, jid, m);
  }

  let input = args.split(/\s+/)[0].trim();

  if (!/\.(js|json)$/i.test(input)) {
    input += ".js";
  }

  const file = findFirstFile(input);

  if (!file) {
    return sendButtons(conn, jid, {
      title: '❌ الملف غير موجود',
      subtitle: input,
      text: `⚠️ مش لاقي الملف: *${input}*\n\nتأكد من كتابة الاسم بشكل صحيح`,
      footer: '◜⏤͟͟͞͞ 𝙎𝙐𝙆𝙐𝙉𝘼 ✦ 𝘽𝙊𝙏 ˖࣪⃟🔥 ◞',
      buttons: [btn.reply('🔙 رجوع', '.كود')]
    }, m);
  }

  return showFile(conn, jid, file, m);
};

// ─── إعدادات الأمر ───
handler.command = /^(كود|code)$/i;
handler.tags = ["developer"];
handler.help = ["كود <اسم الملف>"];

export default handler;