/**
 * plugins/سحب.js
 * أمر مطورين فقط: البوت (لو أدمن) بينزل كل الأدمنية، يطرد كل الأعضاء
 * ويسيب بس اللي كتب الأمر + البوت، وبعدين يقفل الجروب (يعلّقه).
 */

const handler = async (m, { conn }) => {
  const chat = m.chat;
  const react = (e) => conn.sendMessage(chat, { react: { text: e, key: m.key } }).catch(() => {});

  if (!m.isGroup) {
    await react('❌');
    return m.reply('❌ الأمر ده بيشتغل جوه الجروبات بس.');
  }

  await react('⏳');

  try {
    const meta = await conn.groupMetadata(chat);
    const botId = conn.user?.id ? conn.decodeJid(conn.user.id) : conn.decodeJid(meta.participants.find(p => p.id.includes('bot'))?.id);
    const botJid = conn.decodeJid(conn.user.id);
    const senderJid = conn.decodeJid(m.sender);

    const botPart = meta.participants.find(p => conn.decodeJid(p.id) === botJid);
    if (!botPart?.admin) {
      await react('❌');
      return m.reply('❌ لازم البوت يكون أدمن في الجروب الأول عشان ينفّذ الأمر ده.');
    }

    const others = meta.participants.filter(p => {
      const jid = conn.decodeJid(p.id);
      return jid !== botJid && jid !== senderJid;
    });
    const otherAdmins = others.filter(p => p.admin);

    // 1) تنزيل باقي الأدمنية (دفعات صغيرة عشان نتجنب الحظر)
    for (const batch of chunk(otherAdmins.map(p => p.id), 5)) {
      await conn.groupParticipantsUpdate(chat, batch, 'demote').catch(() => {});
      await sleep(800);
    }

    // 2) طرد كل الأعضاء ما عدا اللي كتب الأمر والبوت
    let removed = 0, failed = 0;
    for (const batch of chunk(others.map(p => p.id), 5)) {
      try {
        await conn.groupParticipantsUpdate(chat, batch, 'remove');
        removed += batch.length;
      } catch {
        failed += batch.length;
      }
      await sleep(900);
    }

    // 3) قفل الجروب: الإعدادات والرسايل يبقوا للأدمنية بس (البوت هو الوحيد المتبقي)
    await conn.groupSettingUpdate(chat, 'announcement').catch(() => {});
    await conn.groupSettingUpdate(chat, 'locked').catch(() => {});

    await react('✅');
    await conn.sendMessage(chat, {
      text:
        `🔒 *تم سحب الجروب بنجاح*\n\n` +
        `👢 الأعضاء المطرودين: ${removed}\n` +
        (failed ? `⚠️ فشل طرد: ${failed}\n` : '') +
        `👑 الأدمنية المتبقية: البوت فقط\n` +
        `🔐 الجروب مقفول (رسائل وإعدادات الأدمن فقط)\n\n` +
        `> ⛩️ SUKUNA BOT ⛩️`
    }, { quoted: m });
  } catch (e) {
    console.error('[سحب]', e?.message || e);
    await react('❌');
    await m.reply(`❌ حصل خطأ: ${e?.message || e}`);
  }
};

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

handler.help = ['سحب'];
handler.tags = ['group'];
handler.command = /^(سحب|سحب_الجروب|takeover)$/i;
handler.admin = false;
handler.botAdmin = true;
handler.group = true;
handler.developer = true; // مطورين فقط
handler.owner = true;     // احتياط لو نظامك بيشيك على owner بدل developer

export default handler;