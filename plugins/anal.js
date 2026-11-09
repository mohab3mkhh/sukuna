import axios from 'axios';

let handler = async (m, { conn }) => {
    const title = "Anal";
    const emoji = "🔞";
    const endpoint = "https://prexzyapis.com/nsfw/anal";

    try {
        // إرسال تفاعل جاري التحميل
        await conn.sendMessage(m.chat, { 
            react: { text: '⏳', key: m.key } 
        }).catch(() => {});

        // جلب الرد من الـ API
        const res = await axios.get(endpoint, {
            timeout: 20000,
            responseType: 'arraybuffer',
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 
                'Accept': '*/*' 
            },
            validateStatus: () => true
        });

        if (res.status >= 400) {
            throw new Error(`API error status: ${res.status}`);
        }

        const buffer = Buffer.from(res.data);
        const contentType = String(res.headers?.['content-type'] || '').toLowerCase();
        const caption = `${emoji} *${title}*\n\n> 么⃝Sukuna 𝑩𝑶𝑻 • 18+`;

        // فحص إذا كان الرد عبارة عن رابط داخل JSON
        let mediaUrl = null;
        try {
            const textData = buffer.toString('utf8').trim();
            if (textData.startsWith('{') || textData.startsWith('[')) {
                const json = JSON.parse(textData);
                mediaUrl = json.url || json.result || json.image;
            }
        } catch (e) {}

        if (mediaUrl) {
            const isVideo = /\.(mp4|webm|mov|m4v)(\?|$)/i.test(mediaUrl);
            if (isVideo) {
                await conn.sendMessage(m.chat, { video: { url: mediaUrl }, mimetype: 'video/mp4', caption }, { quoted: m });
            } else {
                await conn.sendMessage(m.chat, { image: { url: mediaUrl }, caption }, { quoted: m });
            }
        } else {
            // إرسال الميديا مباشرة كمخزن مؤقت (Buffer)
            const isVideo = contentType.includes('video');
            if (isVideo) {
                await conn.sendMessage(m.chat, {
                    video: buffer,
                    mimetype: contentType.includes('video') ? contentType : 'video/mp4',
                    caption
                }, { quoted: m });
            } else {
                await conn.sendMessage(m.chat, {
                    image: buffer,
                    mimetype: contentType.includes('image') ? contentType : 'image/jpeg',
                    caption
                }, { quoted: m });
            }
        }

        // تفاعل النجاح
        await conn.sendMessage(m.chat, { 
            react: { text: '✅', key: m.key } 
        }).catch(() => {});

    } catch (err) {
        console.error(`[anal error]:`, err.message);
        try { 
            await conn.sendMessage(m.chat, { 
                react: { text: '❌', key: m.key } 
            }); 
        } catch {}
        
        return conn.reply(m.chat, `❌ ${title} غير متوفر مؤقتاً أو حدث خطأ في الاتصال بالـ API.`, m);
    }
};

handler.help = ['anal'];
handler.tags = ['18plus'];
handler.command = /^anal$/i;

export default handler;