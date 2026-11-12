/**
 * plugins/احصائيات.js
 * إحصائيات الجروب
 */

import moment from 'moment-timezone';
import pkg from '@whiskeysockets/baileys';
const { generateWAMessageFromContent, proto } = pkg;

// ✅ استخدام ملف الأزرار
import { sendButtons, btn } from '../lib/buttons.js';

global.groupStats = global.groupStats || {};

const parseRange = (text) => {
  if (!text) return null;
  const match = text.match(/^(\d+)-(\d+)$/);
  if (!match) return null;
  const start = parseInt(match[1]);
  const end = parseInt(match[2]);
  if (start > end || start < 1 || end > 31) return null;
  return { start, end };
};

let handler = async (m, { conn, text, isAdmin, isOwner }) => {
  if (!isAdmin && !isOwner) return conn.sendMessage(m.chat, { text:'❌ هذا الأمر للأدمنز فقط!');

  const id = m.chat;
  const stats = global.groupStats[id] || {};
  const metadata = await conn.groupMetadata(id);

  const totalMembers = metadata.participants.length;
  const admins = metadata.participants.filter(p => p.admin).length;
  const regular = totalMembers - admins;

  const now = moment().tz('Africa/Cairo');
  const currentMonth = now.format('YYYY-MM');

  const range = parseRange(text?.trim());
  let dateLabel = '📅 اليوم فقط';
  let filteredDates = [];

  if (range) {
    for (let d = range.start; d <= range.end; d++) {
      const day = String(d).padStart(2, '0');
      filteredDates.push(`${currentMonth}-${day}`);
    }
    dateLabel = `📆 من يوم ${range.start} لحد يوم ${range.end}`;
  } else {
    filteredDates = [now.format('YYYY-MM-DD')];
  }

  let totalMsgs = 0;
  let sendersCount = {};
  let msgsByType = { text: 0, image: 0, video: 0, audio: 0, sticker: 0 };

  for (const date of filteredDates) {
    const dayCount = stats[date];
    if (dayCount) totalMsgs += dayCount;

    const dayTypes = stats[`${date}_types`];
    if (dayTypes) {
      for (const [type, count] of Object.entries(dayTypes)) {
        if (msgsByType[type] !== undefined) msgsByType[type] += count;
      }
    }
  }

  const senders = stats.senders || {};
  sendersCount = { ...senders };

  const allSenders = Object.entries(sendersCount)
    .sort((a, b) => b[1] - a[1]);

  const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
  const topList = allSenders.map(([jid, count], i) => {
    const num = jid.split('@')[0];
    const medal = medals[i] || `${i + 1}.`;
    return `${medal} @${num} ┄ *${count}* رسالة`;
  });

  const created = metadata.creation
    ? moment.unix(metadata.creation).tz('Africa/Cairo').format('DD/MM/YYYY')
    : 'غير معروف';

  const mentionedJids = allSenders.map(([jid]) => jid);

  let caption = `
╔══✦❁✦══════════════╗
   📊 *إحصـائيات الجـروب* 📊
╚══════════════✦❁✦══╝

🏷️ *الاسم* ⇇ ${metadata.subject}
🗓️ *تاريخ الإنشاء* ⇇ ${created}

╔══✦❁✦══════════════╗
        👥 *بيانات الأعضاء*
╚══════════════✦❁✦══╝

👤 *إجمالي الأعضاء* ⇇ ${totalMembers} عضو
👑 *الأدمنز* ⇇ ${admins} أدمن
🙋 *الأعضاء العاديين* ⇇ ${regular} عضو

╔══✦❁✦══════════════╗
   💬 *إحصائيات الرسائل* • ${dateLabel}
╚══════════════✦❁✦══╝

📨 *إجمالي الرسائل* ⇇ ${totalMsgs} رسالة
🔤 *نصوص* ⇇ ${msgsByType.text}
🖼️ *صور* ⇇ ${msgsByType.image}
🎥 *فيديوهات* ⇇ ${msgsByType.video}
🎵 *مقاطع صوتية* ⇇ ${msgsByType.audio}
🎭 *ستيكرات* ⇇ ${msgsByType.sticker}

╔══✦❁✦══════════════╗
   🏆 *قائمة الأكثر تفاعلاً* (${allSenders.length} عضو)
╚══════════════✦❁✦══╝

${topList.length ? topList.join('\n') : '⚠️ لا توجد بيانات بعد'}

╔══✦❁✦══════════════╗
   👑 *المطور* ⇇ MOHAB
╚══════════════✦❁✦══╝`.trim();

  // ✅ استخدام sendButtons
  await sendButtons(conn, id, {
    text: caption,
    footer: '📊 إحصائيات الجروب',
    mentions: mentionedJids,
    buttons: [
      btn.reply('👨‍💻 تواصل مع المطورين', '.المطورين')
    ]
  }, m);
};

handler.all = async function (m) {
  if (!m.chat.endsWith('@g.us')) return true;
  if (m.key.fromMe) return true;

  const id = m.chat;
  const today = moment().tz('Africa/Cairo').format('YYYY-MM-DD');

  if (!global.groupStats[id]) global.groupStats[id] = { senders: {} };
  if (!global.groupStats[id][today]) global.groupStats[id][today] = 0;
  if (!global.groupStats[id].senders) global.groupStats[id].senders = {};
  if (!global.groupStats[id].senders[m.sender]) global.groupStats[id].senders[m.sender] = 0;

  global.groupStats[id][today]++;
  global.groupStats[id].senders[m.sender]++;

  const mtype = m.mtype || '';
  let type = null;
  if (mtype.includes('conversation') || mtype.includes('extendedText')) type = 'text';
  else if (mtype.includes('image')) type = 'image';
  else if (mtype.includes('video')) type = 'video';
  else if (mtype.includes('audio') || mtype.includes('ptt')) type = 'audio';
  else if (mtype.includes('sticker')) type = 'sticker';

  if (type) {
    if (!global.groupStats[id][`${today}_types`]) global.groupStats[id][`${today}_types`] = {};
    global.groupStats[id][`${today}_types`][type] = (global.groupStats[id][`${today}_types`][type] || 0) + 1;
  }

  return true;
};

handler.help = ['احصائيات', 'احصائيات 10-22'];
handler.tags = ['group'];
handler.command = /^(إحصائيات|احصائيات|stats)$/i;
handler.group = true;
handler.admin = true;

export default handler;