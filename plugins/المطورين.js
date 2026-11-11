import fetch from 'node-fetch';
import pkg from '@whiskeysockets/baileys';
const { generateWAMessageFromContent, prepareWAMessageMedia } = pkg;

const VIDEO_URL = 'https://files.catbox.moe/97or2g.mp4';
const AUDIO_URL = 'https://files.catbox.moe/9n2llm.aac';
const CONTACT_NUMBERS = [
  { name: 'المايسترو ادم', number: '201150572826' },
  { name: 'الفحل مهاب', number: '201016855501' }
];
const FANCY_NAME = '◜⏤͟͟͞͞ 𝙎𝙐𝙆𝙐𝙉𝘼 ✦ 𝙆𝙄𝙉𝙂 ✦ 𝙊𝙁 𝘾𝙐𝙍𝙎𝙀𝙎 ˖࣪⃟🔥 ◞';

let handler = async (m, { conn }) => {
  try {
    await conn.sendMessage(m.chat, { react: { text: '🔥', key: m.key } });

    const mediaPrepared = await prepareWAMessageMedia(
      { video: { url: VIDEO_URL, gifPlayback: true, ptv: false } },
      { upload: conn.waUploadToServer }
    );

    const bodyText = `╔═══━━━══━━━❪👑❫━━━══━━━═══╗
║  ❪🔥❫ *ＫＩＮＧ ＯＦ ＣＵＲＳＥＳ*  ║
║  ❪⚔️❫ *مَلِكُ اللَّعَنَات*      ║
║  ──━━━══━━━──                  ║
║  ❪👥❫ *مُطَوِّرِي سُوكُونَا*    ║
║  ──━━━══━━━──                  ║
║  ❝ *لَا يُوجَدُ عَدُوٌّ*         ║
║  *لَا أَسْتَطِيعُ سَحْقَهُ…* ❞  ║
╚═══━━━══━━━❪👑❫━━━══━━━═══╝`;

    const message = {
      viewOnceMessage: {
        message: {
          interactiveMessage: {
            header: {
              hasMediaAttachment: true,
              ...mediaPrepared,
              videoMessage: {
                ...mediaPrepared.videoMessage,
                gifPlayback: true
              }
            },
            body: { text: bodyText },
            nativeFlowMessage: {
              buttons: CONTACT_NUMBERS.map(({ name, number }) => ({
                name: 'cta_url',
                buttonParamsJson: JSON.stringify({
                  display_text: `📞 ${name}`,
                  url: `https://wa.me/${number}`,
                  merchant_url: `https://wa.me/${number}`
                })
              }))
            }
          }
        }
      }
    };

    const msg = generateWAMessageFromContent(m.chat, message, { userJid: m.sender });
    await conn.relayMessage(m.chat, msg.message, { messageId: msg.key.id });

    // الريكورد
    const audioRes = await fetch(AUDIO_URL);
    const audioBuffer = Buffer.from(await audioRes.arrayBuffer());
    await conn.sendMessage(m.chat, {
      audio: audioBuffer,
      mimetype: 'audio/mpeg',
      ptt: true
    }, { quoted: m });

  } catch (err) {
    console.error('Error:', err);
    await conn.sendMessage(m.chat, {
      text: `🔥 *${FANCY_NAME}*\n\n⚡ Sukuna Bot`
    }, { quoted: m });
  }
};

handler.help = ['المطورين'];
handler.tags = ['main'];
handler.command = /^(المطورين|مطور|مطورين|devs)$/i;

export default handler;