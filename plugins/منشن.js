import pkg from '@whiskeysockets/baileys';
import moment from 'moment-timezone';
const { generateWAMessageFromContent, prepareWAMessageMedia, proto } = pkg;

let handler = async (m, { isOwner, isAdmin, conn, command, groupMetadata }) => {
  if (!(isAdmin || isOwner)) {
    global.dfail?.('admin', m, conn);
    throw false;
  }

  const chatId = m.chat;
  const coverImageUrl = 'https://i.postimg.cc/mDPmxFLv/9b1bbcfd49629dc706d7c4437228cb9f.jpg';

  if (command === 'منشن') {
    const media = await prepareWAMessageMedia(
      { image: { url: coverImageUrl } },
      { upload: conn.waUploadToServer }
    );

    const textMsg = `
*◞👥‟⌝╎قــائـمـة أوامـر المنـشـن ⸃⤹*  

*⌝💬╎اخـتـر النـوع المـناسـب مـن الأسـفـل ⌞*  
> *╭*  
> *┊ 👥╎منشن الكل*  
> *┊ 🌟╎منشن الأعضاء فقط*  
> *┊ 👑╎منشن المشرفين*  
> *╰*
`;

    const msg = generateWAMessageFromContent(chatId, {
      viewOnceMessage: {
        message: {
          interactiveMessage: proto.Message.InteractiveMessage.create({
            body: { text: textMsg },
            header: media,
            nativeFlowMessage: {
              buttons: [
                { name: "quick_reply", buttonParamsJson: `{"display_text":"👥 منشن الكل","id":".منشن_الكل"}` },
                { name: "quick_reply", buttonParamsJson: `{"display_text":"🌟 منشن الأعضاء","id":".منشن_اعضاء"}` },
                { name: "quick_reply", buttonParamsJson: `{"display_text":"👑 منشن المشرفين","id":".منشن_مشرفين"}` }
              ]
            },
            contextInfo: { mentionedJid: [m.sender] }
          })
        }
      }
    }, {});

    await conn.relayMessage(chatId, msg.message, { messageId: msg.key.id });
    return;
  }

  // ✅ جيب الأعضاء من groupMetadata مباشرةً
  const meta = await conn.groupMetadata(chatId).catch(() => null)
  if (!meta) return m.reply('⚠️ تعذر جلب بيانات المجموعة.')

  const allParticipants = meta.participants || []

  let time = moment.tz('Asia/Riyadh').format('hh:mm A');
  let date = moment.tz('Asia/Riyadh').format('YYYY/MM/DD');

  let filteredParticipants =
    command === 'منشن_اعضاء'   ? allParticipants.filter(p => !p.admin) :
    command === 'منشن_مشرفين'  ? allParticipants.filter(p => p.admin)  :
    allParticipants;

  if (filteredParticipants.length === 0) {
    return m.reply('⚠️ لا يوجد أعضاء متاحين للمنشن.');
  }

  const media = await prepareWAMessageMedia(
    { image: { url: coverImageUrl } },
    { upload: conn.waUploadToServer }
  );

  const teks = `
*◞👥‟⌝╎مـنـشـن جـديـد ⸃⤹*  
*~⌝˼‏※⪤˹͟͞≽⌯⧽°⸂◞✨◜⸃°⧼⌯≼˹͟͞⪤※˹⌞~*

*⌝📌╎الـنـوع:* ⌞ ${command === 'منشن_اعضاء' ? 'الأعـضـاء' : command === 'منشن_مشرفين' ? 'المشرفـين' : 'الجميع'} ⌞*  
> *╭*  
${filteredParticipants.map(mem => `> ┊  @${mem.id.split('@')[0]}`).join('\n')}
> *╰*

*⌝🕒╎الـوقـت:* ${time}  
*⌝📅╎التـاريـخ:* ${date}  

*~⌝˼‏※⪤˹͟͞≽⌯⧽°⸂◞💮◜⸃°⧼⌯≼˹͟͞⪤※˹⌞~*  
*🤖╎SUKUNA | 𝐁𝐎𝐓 ⛩️*
`;

  await conn.sendMessage(chatId, {
    image: media.imageMessage,
    caption: teks,
    mentions: filteredParticipants.map(a => a.id)
  });
};

handler.help = ['منشن', 'منشن_الكل', 'منشن_اعضاء', 'منشن_مشرفين'];
handler.tags = ['group'];
handler.command = /^(منشن|منشن_الكل|منشن_اعضاء|منشن_مشرفين)$/i;
handler.group = true;
handler.admin = true;

export default handler;