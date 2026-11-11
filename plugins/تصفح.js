import axios from 'axios';
import { pinterest } from '../lib/scraper.js';

let handler = async (m, { conn, usedPrefix, command, text }) => {
    if (!text) throw `⚠️ أدخل مصطلح البحث.\n\nمثال: *${usedPrefix + command} nayeon*`;

    await m.react("⌛");
    await conn.sendMessage(m.chat, { text: '> ⏳ جاري البحث عن الصور...' }, { quoted: m });

    const sources = [
        async () => {
            const response = await pinterest.search(text, 6);
            return response.result.pins.slice(0, 6).map(pin => pin.media.images.orig.url);
        },
        async () => {
            const res = await axios.get(`https://api.siputzx.my.id/api/s/pinterest?query=${encodeURIComponent(text)}`);
            return res.data.data.slice(0, 6).map(result => result.images_url);
        },
        async () => {
            const res = await axios.get(`https://api.dorratz.com/v2/pinterest?q=${encodeURIComponent(text)}`);
            return res.data.slice(0, 6).map(result => result.image);
        }
    ];

    let images = [];
    for (const source of sources) {
        try {
            images = await source();
            if (images.length > 0) break;
        } catch (e) {
            console.error(`⚠️ خطأ أثناء البحث: ${e.message}`);
        }
    }

    if (images.length === 0) {
        await m.react("❌");
        return conn.sendMessage(m.chat, { text: `❌ لم يتم العثور على نتائج لـ *"${text}"*.` }, { quoted: m });
    }

    await m.react("✅");

    // بناء قائمة الصور للـ Album
    const mediaList = images.map((url, i) => ({
        type: 'image',
        data: { url },
        caption: i === 0
            ? `🔎 *نتيجة البحث عن:* ${text}\n\n🔗 https://www.pinterest.com/search/pins/?q=${encodeURIComponent(text)}`
            : ''
    }));

    // sendAdonix = Album بيبعت الصور جنب بعض
    await conn.sendAdonix(m.chat, mediaList, { quoted: m });
};

handler.help = ['pinterest <keyword>'];
handler.tags = ['بحث'];
handler.command = /^(pin|تصفح)$/i;
handler.register = true;
handler.limit = 1;

export default handler;