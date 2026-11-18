// ════════════════════════════════════════════════════════
// ⛩️ SUKUNA BOT — مضاد الرسائل الخاصة (Anti-Private)
//   .antiprivate on  /  .مضاد_الخاص اون   ← تشغيل
//   .antiprivate off /  .مضاد_الخاص اوف   ← إيقاف
//   .antiprivate                          ← الحالة
// بيشتغل من أي مكان (جروب أو خاص)، وللمطورين بس.
// ════════════════════════════════════════════════════════

import fs from 'fs';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'database', 'antiprivate.json');
const DEV_NUMBERS = ['201150572826', '201016855501'];
const WARN_COOLDOWN = 60 * 1000;           // تحذير واحد لكل شخص كل دقيقة (عشان مايتكررش)

function load() {
  try {
    if (fs.existsSync(DB_PATH)) {
      const d = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
      if (typeof d.enabled === 'boolean') return { enabled: d.enabled, groups: d.groups || {} };
      // تحويل الصيغة القديمة { chatId: true }
      const groups = Object.fromEntries(Object.entries(d).filter(([, v]) => v === true));
      return { enabled: Object.keys(groups).length > 0, groups };
    }
  } catch (e) {}
  return { enabled: false, groups: {} };
}

function save(data) {
  try {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
  } catch (e) {}
}

if (!global._antiPrivate || typeof global._antiPrivate.enabled !== 'boolean') global._antiPrivate = load();
const warned = new Map();

const ON = ['on', 'اون', 'تشغيل', 'فعل', '1'];
const OFF = ['off', 'اوف', 'ايقاف', 'إيقاف', 'وقف', 'فصل', '0'];

const handler = async function (m, { conn, args, isROwner }) {
  const senderNumber = String(m.sender).split('@')[0].split(':')[0];
  if (!DEV_NUMBERS.includes(senderNumber) && !isROwner)
    return m.reply('❌ هذا الأمر للمطورين فقط!');

  const st = global._antiPrivate;
  const arg = (args?.[0] || '').toLowerCase();
  const isGroup = m.isGroup ?? String(m.chat).endsWith('@g.us');

  if (ON.includes(arg)) {
    st.enabled = true;
    if (isGroup) st.groups[m.chat] = true;     // الجروب ده يتبلّغ بالمحاولات
    save(st);
    return m.reply('✅ *تم تفعيل مضاد الخاص*\nأي شخص يبعت للبوت خاص هيتحذّر.' +
      (isGroup ? '\n📢 المحاولات هتتبلّغ في الجروب ده.' : '') + '\n\n> ⛩️ SUKUNA BOT ⛩️');
  }

  if (OFF.includes(arg)) {
    st.enabled = false;
    st.groups = {};
    save(st);
    return m.reply('⛔ *تم إيقاف مضاد الخاص*\nالخاص مفتوح للكل.\n\n> ⛩️ SUKUNA BOT ⛩️');
  }

  return m.reply(
    `🛡️ *مضاد الخاص*\n\nالحالة: ${st.enabled ? '✅ شغّال' : '❌ مقفول'}\n\n` +
    `• .antiprivate on  (أو .مضاد_الخاص اون)\n• .antiprivate off (أو .مضاد_الخاص اوف)\n\n> ⛩️ SUKUNA BOT ⛩️`
  );
};

handler.command = /^(antiprivate|مضاد_الخاص|مضاد-الخاص)$/i;
handler.help = ['antiprivate on/off'];
handler.tags = ['group'];

// ════════════════════════════════════════════════════════
// 🔍 before — كشف الرسائل الخاصة
// ════════════════════════════════════════════════════════
handler.before = async function (m, { conn }) {
  try {
    const st = global._antiPrivate;
    if (!st?.enabled) return false;
    if (m.isGroup ?? String(m.chat).endsWith('@g.us')) return false;
    if (!m.text || m.fromMe) return false;

    const sender = m.sender;
    const senderNumber = String(sender).split('@')[0].split(':')[0];
    if (DEV_NUMBERS.includes(senderNumber)) return false;

    // مايكررش التحذير لنفس الشخص
    if (Date.now() - (warned.get(sender) || 0) < WARN_COOLDOWN) return false;
    warned.set(sender, Date.now());

    await conn.sendMessage(sender, {
      text: `🚫 *لا يمكنك التواصل مع البوت خاصةً*\n\n` +
            `👹 أرسل رسالتك في المجموعة\n\n` +
            `❪🔥❫ *𝑺𝑼𝑲𝑼𝑵𝑨 𝑩𝑶𝑻*`
    }).catch(() => {});

    for (const chatId of Object.keys(st.groups || {})) {
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