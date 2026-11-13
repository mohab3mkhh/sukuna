/**
 * plugins/منشن.js
 * منشن الكل / الأعضاء / المشرفين
 */

import moment from 'moment-timezone';

// ✅ استخدام ملف الأزرار
import { sendButtons, btn, getButtonId } from '../lib/buttons.js';

const COVER_IMAGE_URL = 'https://i.postimg.cc/mDPmxFLv/9b1bbcfd49629dc706d7c4437228cb9f.jpg';

// ══════════════════════════════════════════════════
//  الأمر الرئيسي
// ══════════════════════════════════════════════════
let handler = async (m, { isOwner, isAdmin, conn, command }) => {
  if (!(isAdmin || isOwner)) {
    global.dfail?.('admin', m, conn);
    throw false;
  }

  const chatId = m.chat;

  // ✅ أمر .منشن — عرض القائمة
  if (command === 'منشن') {
    const textMsg = `
*◞👥‟⌝╎قــائـمـة أوامـر المنـشـن ⸃⤹*  

*⌝💬╎اخـتـر النـوع المـناسـب مـن الأسـفـل ⌞*  
> *╭*  
> *┊ 👥╎منشن الكل*  
> *┊ 🌟╎منشن الأعضاء فقط*  
> *┊ 👑╎منشن المشرفين*  
> *╰*
`;

    await sendButtons(conn, chatId, {
      title: '👥 المنشن',
      subtitle: 'اختر النوع',
      text: textMsg,
      footer: '⛩️ SUKUNA BOT',
      image: COVER_IMAGE_URL,
      buttons: [
        btn.reply('👥 منشن الكل', '.منشن_الكل'),
        btn.reply('🌟 منشن الأعضاء', '.منشن_اعضاء'),
        btn.reply('👑 منشن المشرفين', '.منشن_مشرفين')
      ],
      mentions: [m.sender]
    }, m);
    return;
  }

  // ✅ جلب الأعضاء
  const meta = await conn.groupMetadata(chatId).catch(() => null);
  if (!meta) return m.reply('⚠️ تعذر جلب بيانات المجموعة.');

  const allParticipants = meta.participants || [];

  let time = moment.tz('Asia/Riyadh').format('hh:mm A');
  let date = moment.tz('Asia/Riyadh').format('YYYY/MM/DD');

  let filteredParticipants =
    command === 'منشن_اعضاء' ? allParticipants.filter(p => !p.admin) :
    command === 'منشن_مشرفين' ? allParticipants.filter(p => p.admin) :
    allParticipants;

  if (filteredParticipants.length === 0) {
    return m.reply('⚠️ لا يوجد أعضاء متاحين للمنشن.');
  }

  const typeLabel = command === 'منشن_اعضاء' ? 'الأعـضـاء' :
    command === 'منشن_مشرفين' ? 'المشرفـين' : 'الجميع';

  const teks = `
*◞👥‟⌝╎مـنـشـن جـديـد ⸃⤹*  
*~⌝˼‏※⪤˹͟͞≽⌯⧽°⸂◞✨◜⸃°⧼⌯≼˹͟͞⪤※˹⌞~*

*⌝📌╎الـنـوع:* ⌞ ${typeLabel} ⌞*  
> *╭*  
${filteredParticipants.map(mem => `> ┊  @${mem.id.split('@')[0]}`).join('\n')}
> *╰*

*⌝🕒╎الـوقـت:* ${time}  
*⌝📅╎التـاريـخ:* ${date}  

*~⌝˼‏※⪤˹͟͞≽⌯⧽°⸂◞💮◜⸃°⧼⌯≼˹͟͞⪤※˹⌞~*  
*🤖╎SUKUNA | 𝐁𝐎𝐓 ⛩️*
`;

  await conn.sendMessage(chatId, {
    image: { url: COVER_IMAGE_URL },
    caption: teks,
    mentions: filteredParticipants.map(a => a.id)
  });
};

// ══════════════════════════════════════════════════
//  معالج الأزرار
// ══════════════════════════════════════════════════
handler.before = async function (m, { conn, isAdmin, isOwner, command }) {
  const buttonId = getButtonId(m);
  if (!buttonId) return false;

  if (!(isAdmin || isOwner)) return false;

  // ✅ إذا ضغط زر، نفذ الأمر
  const match = buttonId.match(/^\.?(منشن_الكل|منشن_اعضاء|منشن_مشرفين)$/);
  if (!match) return false;

  const cmd = match[1];
  const chatId = m.chat;

  const meta = await conn.groupMetadata(chatId).catch(() => null);
  if (!meta) {
    await m.reply('⚠️ تعذر جلب بيانات المجموعة.');
    return true;
  }

  const allParticipants = meta.participants || [];

  let time = moment.tz('Asia/Riyadh').format('hh:mm A');
  let date = moment.tz('Asia/Riyadh').format('YYYY/MM/DD');

  let filteredParticipants =
    cmd === 'منشن_اعضاء' ? allParticipants.filter(p => !p.admin) :
    cmd === 'منشن_مشرفين' ? allParticipants.filter(p => p.admin) :
    allParticipants;

  if (filteredParticipants.length === 0) {
    await m.reply('⚠️ لا يوجد أعضاء متاحين للمنشن.');
    return true;
  }

  const typeLabel = cmd === 'منشن_اعضاء' ? 'الأعـضـاء' :
    cmd === 'منشن_مشرفين' ? 'المشرفـين' : 'الجميع';

  const teks = `
*◞👥‟⌝╎مـنـشـن جـديـد ⸃⤹*  
*~⌝˼‏※⪤˹͟͞≽⌯⧽°⸂◞✨◜⸃°⧼⌯≼˹͟͞⪤※˹⌞~*

*⌝📌╎الـنـوع:* ⌞ ${typeLabel} ⌞*  
> *╭*  
${filteredParticipants.map(mem => `> ┊  @${mem.id.split('@')[0]}`).join('\n')}
> *╰*

*⌝🕒╎الـوقـت:* ${time}  
*⌝📅╎التـاريـخ:* ${date}  

*~⌝˼‏※⪤˹͟͞≽⌯⧽°⸂◞💮◜⸃°⧼⌯≼˹͟͞⪤※˹⌞~*  
*🤖╎SUKUNA | 𝐁𝐎𝐓 ⛩️*
`;

  await conn.sendMessage(chatId, {
    image: { url: COVER_IMAGE_URL },
    caption: teks,
    mentions: filteredParticipants.map(a => a.id)
  });

  return true;
};

handler.help = ['منشن', 'منشن_الكل', 'منشن_اعضاء', 'منشن_مشرفين'];
handler.tags = ['group'];
handler.command = /^(منشن|منشن_الكل|منشن_اعضاء|منشن_مشرفين)$/i;
handler.group = true;
handler.admin = true;

export default handler;