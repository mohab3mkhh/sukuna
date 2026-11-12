// دالة تحول الـ lid لرقم حقيقي من الجروب
const resolveLid = async (jid, conn, groupId) => {
  if (!jid || !jid.endsWith('@lid')) return jid
  try {
    const meta = await conn.groupMetadata(groupId).catch(() => null)
    if (!meta) return jid
    const match = meta.participants.find(p => p.id === jid || p.lid === jid)
    if (match?.jid && !match.jid.endsWith('@lid')) return match.jid
  } catch {}
  return jid
}

const handler = async (m, { conn, text, command, usedPrefix }) => {
  if (m.mentionedJid.includes(conn.user.jid)) return;

  const pp = './src/warn.jpg';
  let who;
  if (m.isGroup) {
    if (m.mentionedJid[0]) {
      who = await resolveLid(m.mentionedJid[0], conn, m.chat)
    } else if (m.quoted) {
      who = await resolveLid(m.quoted.sender, conn, m.chat)
    } else {
      who = text
    }
  } else {
    who = m.chat;
  }

  if (!who) {
    const warntext = `
❪⛩️❫⇇ *قم بالرد على رسالة أو منشن المستخدم* ⇇❪❫
⧈═━━━━✦⛩️✦━━━━═⧈
*—◉ مثال:*
*${usedPrefix + command} @${global.suittag}*
    `.trim();
    throw m.reply(warntext, m.chat, { mentions: conn.parseMention(warntext) });
  }

  // التأكد من أن المستخدم موجود في قاعدة البيانات
  let user = global.db.data.users[who];
  if (!user) {
    global.db.data.users[who] = { warn: 0 };
    user = global.db.data.users[who];
  }

  const dReason = 'بدون سبب';
  const msgtext = text || dReason;
  const sdms = msgtext.replace(/@\d+-?\d* /g, '');
  user.warn = (user.warn || 0) + 1;

  await m.reply(
    `
⧈═━━━━✦⛩️✦━━━━═⧈
❪⚡️❫⇇ *@${who.split`@`[0]}* لقد تلقيت تحذيرًا! ⇇❪⛩️❫
❪☠️❫⇇ *السبب:* ${sdms}
❪👾❫⇇ *عدد التحذيرات:* ❪${user.warn}/3❫
⧈═━━━━✦⛩️✦━━━━═⧈
    `.trim(),
    null,
    { mentions: [who] }
  );

  if (user.warn >= 3) {
    user.warn = 0;
    await m.reply(
      `
⧈═━━━━✦⛩️✦━━━━═⧈
❪⚡️❫⇇ *حذرتك ثلاث مرات!!* ⇇❪⛩️❫
❪☠️❫⇇ *@${who.split`@`[0]}* لقد تجاوزت *3* تحذيرات.
❪👾❫⇇ *سيتم طردك الآن! 👽*
⧈═━━━━✦⛩️✦━━━━═⧈
      `.trim(),
      null,
      { mentions: [who] }
    );
    await conn.groupParticipantsUpdate(m.chat, [who], 'remove');
  }

  return !1;
};

handler.command = /^(advertir|advertencia|تحذير|warn|انذار)$/i;
handler.group = true;
handler.admin = true;
handler.botAdmin = true;

export default handler;