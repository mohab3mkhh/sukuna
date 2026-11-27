/**
 * plugins/سحب.js
 * أمر مطورين فقط: البوت (لو أدمن) بينزل كل الأدمنية ويخليهم أعضاء عاديين،
 * وبعدين يقفل الجروب (رسايل وإعدادات للأدمن بس، واللي فاضل أدمن هو البوت).
 * محدش بيتطرد.
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

    const decode = (jid) => (typeof conn.decodeJid === 'function' ? conn.decodeJid(jid) : jid) || '';
    const num = (jid) => decode(jid || '').replace(/^.*?(\d+)(?::\d+)?@.*$/, '$1');

    // واتساب بقى بيدّي رقمين مختلفين لنفس الشخص: رقم الهاتف (@s.whatsapp.net) ورقم الخصوصية (@lid).
    // بنجمع كل الأرقام المعروفة للبوت من كل مصدر متاح، وبنقارن بأي واحد منهم.
    const numsOf = (...jids) => [...new Set(jids.filter(Boolean).map(num).filter(Boolean))];
    const botNums = numsOf(conn.user?.id, conn.user?.lid, conn.user?.jid);
    const senderNums = numsOf(m.sender, m.key?.participant, m.key?.participantPn, m.key?.participantAlt);

    const partNums = (p) => numsOf(p.id, p.jid, p.lid, p.phoneNumber);
    const overlaps = (a, b) => a.some((x) => b.includes(x));

    const botPart = meta.participants.find((p) => overlaps(partNums(p), botNums));
    if (!botPart || !botPart.admin) {
      await react('❌');
      return m.reply(
        `❌ لازم البوت يكون أدمن في الجروب الأول عشان ينفّذ الأمر ده.\n` +
          `🔧 أرقام البوت المعروفة: ${botNums.join(', ') || 'مش متعرف'}\n` +
          `👑 أدمنية الجروب: ${meta.participants.filter((p) => p.admin).map((p) => partNums(p).join('/')).join(', ') || 'لا يوجد'}`
      );
    }

    // كل الأدمنية ما عدا البوت واللي كتب الأمر (بكل أرقامه/معرفاته)
    const otherAdmins = meta.participants.filter(
      (p) => p.admin && !overlaps(partNums(p), botNums) && !overlaps(partNums(p), senderNums)
    );

    let demoted = 0,
      failed = 0;
    for (const batch of chunk(otherAdmins.map((p) => p.id), 5)) {
      try {
        await conn.groupParticipantsUpdate(chat, batch, 'demote');
        demoted += batch.length;
      } catch {
        failed += batch.length;
      }
      await sleep(800);
    }

    // قفل الجروب: الرسايل والإعدادات تبقى للأدمن بس (البوت هو الأدمن الوحيد المتبقي)
    await conn.groupSettingUpdate(chat, 'announcement').catch(() => {});
    await conn.groupSettingUpdate(chat, 'locked').catch(() => {});

    await react('✅');
    await conn.sendMessage(
      chat,
      {
        text:
          `🔒 *تم قفل الجروب بنجاح*\n\n` +
          `⬇️ الأدمنية اللي اتنزلت: ${demoted}\n` +
          (failed ? `⚠️ فشل تنزيل: ${failed}\n` : '') +
          `👑 الأدمن المتبقي: البوت فقط\n` +
          `🔐 الرسائل والإعدادات بقت للأدمن بس\n\n` +
          `> ⛩️ SUKUNA BOT ⛩️`,
      },
      { quoted: m }
    );
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
handler.owner = true; // احتياط لو نظامك بيشيك على owner بدل developer

export default handler;