// ════════════════════════════════════════════════════════
// ⛩️ SUKUNA BOT — مضاد الرسائل الخاصة (Anti-Private)
// ════════════════════════════════════════════════════════

import fs from 'fs';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'database', 'antiprivate.json');
const DEV_NUMBERS = ['201150572826', '201016855501'];

function loadAntiPrivate() {
  try {
    if (fs.existsSync(DB_PATH)) return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
  } catch (e) {}
  return {};
}

function saveAntiPrivate(data) {
  try {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
  } catch (e) {}
}

if (!global._antiPrivate) global._antiPrivate = loadAntiPrivate();

const handler = async function (m, { conn, args, isROwner }) {
  const senderNumber = m.sender.split('@')[0];

  if (!DEV_NUMBERS.includes(senderNumber) && !isROwner)
    return m.reply('❌ هذا الأمر للمطورين فقط!');

  if (!m.isGroup)
    return m.reply('❌ هذا الأمر للمجموعات فقط!');

  const arg = (args[0] || '').toLowerCase();

  if (arg !== 'on' && arg !== 'off')
    return m.reply('⚠️ استخدم:\n.antiprivate on ← تفعيل\n.antiprivate off ← تعطيل');

  const chatId = m.chat;
  if (!global._antiPrivate) global._antiPrivate = {};

  if (arg === 'on') {
    global._antiPrivate[chatId] = true;
    saveAntiPrivate(global._antiPrivate);
    return m.reply('✅ تم تفعيل مضاد الخاص!\nأي شخص يبعت للبوت خاص سيتم تحذيره.');
  }

  global._antiPrivate[chatId] = false;
  saveAntiPrivate(global._antiPrivate);
  return m.reply('⛔ تم إيقاف مضاد الخاص!');
};

handler.command = /^antiprivate$/i;
handler.help = ['antiprivate on/off'];
handler.tags = ['group'];
handler.group = true;
handler.admin = true;

// ════════════════════════════════════════════════════════
// 🔍 before — كشف الرسائل الخاصة
// ════════════════════════════════════════════════════════
handler.before = async function (m, { conn }) {
  try {
    if (m.isGroup) return false;
    if (!m.text) return false;
    if (m.fromMe) return false;

    const sender = m.sender;
    const senderNumber = sender.split('@')[0];

    if (DEV_NUMBERS.includes(senderNumber)) return false;

    // التحقق من تفعيل النظام في أي جروب
    let activeChats = [];
    for (const [chatId, status] of Object.entries(global._antiPrivate || {})) {
      if (status === true) activeChats.push(chatId);
    }

    if (!activeChats.length) return false;

    // رسالة تحذير بسيطة بدون أزرار
    await conn.sendMessage(sender, {
      text: `🚫 *لا يمكنك التواصل مع البوت خاصةً*\n\n` +
            `👹 أرسل رسالتك في المجموعة\n\n` +
            `❪🔥❫ *𝑺𝑼𝑲𝑼𝑵𝑨 𝑩𝑶𝑻*`
    }).catch(() => {});

    // إشعار الجروبات
    for (const chatId of activeChats) {
      await conn.sendMessage(chatId, {
        text: `🚫 *تحذير*\n\n@${senderNumber} حاول التواصل مع البوت خاصةً`,
        mentions: [sender]
      }).catch(() => {});
    }

  } catch (e) {
    console.error('[AntiPrivate]', e.message);
  }

  return false;
};

export default handler;