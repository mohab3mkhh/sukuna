/**
 * plugins/المطورين.js
 * معلومات المطورين
 */

import fetch from 'node-fetch';

// ✅ استخدام ملف الأزرار
import { sendButtons, btn } from '../lib/buttons.js';

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

    const bodyText = `╔═══━━━══━━━❪👑❫━━━══━━━═══╗
║  ❪🔥❫ *ＫＩＮＧ ＯＦ ＣＵＲＳＥＳ*  ║
║  ❪⚔️❫ *مَلِكُ اللَّعَنَات*      ║
║  ──━━━══━━━──                  ║
║  ❪👥❫ *مُطَوِّرِي سُوكُونَا*    ║
║  ──━━━══━━━──                  ║
║  ❝ *لَا يُوجَدُ عَدُوٌّ*         ║
║  *لَا أَسْتَطِيعُ سَحْقَهُ…* ❞  ║
╚═══━━━══━━━❪👑❫━━━══━━━═══╝`;

    // ✅ بناء أزرار الاتصال باستخدام btn.url
    const buttons = CONTACT_NUMBERS.map(({ name, number }) => 
      btn.url(`📞 ${name}`, `https://wa.me/${number}`)
    );

    // ✅ إرسال باستخدام sendButtons
    await sendButtons(conn, m.chat, {
      title: '👑 KING OF CURSES',
      subtitle: 'مطوري سوكونا',
      text: bodyText,
      footer: FANCY_NAME,
      video: VIDEO_URL,
      gif: true,
      buttons
    }, m);

    // ✅ الريكورد
    try {
      const audioRes = await fetch(AUDIO_URL);
      const audioBuffer = Buffer.from(await audioRes.arrayBuffer());
      await conn.sendMessage(m.chat, {
        audio: audioBuffer,
        mimetype: 'audio/mpeg',
        ptt: true
      }, { quoted: m });
    } catch (e) {
      console.error('[المطورين] فشل إرسال الصوت:', e.message);
    }

  } catch (err) {
    console.error('[المطورين Error]', err);
    await conn.sendMessage(m.chat, {
      text: `🔥 *${FANCY_NAME}*\n\n⚡ Sukuna Bot`
    }, { quoted: m });
  }
};

handler.help = ['المطورين'];
handler.tags = ['main'];
handler.command = /^(المطورين|مطور|مطورين|devs)$/i;

export default handler;