/**
 * plugins/boobs.js
 * محتوى 18+ - للمطور فقط
 */

import axios from 'axios';

let handler = async (m, { conn, isROwner, isOwner }) => {
    if (!isROwner && !isOwner) {
        return conn.reply(m.chat, '❌ هذا الأمر للمطور فقط.', m);
    }

    const title    = "Boobs";
    const emoji    = "🔞";
    const endpoint = "https://prexzyapis.com/nsfw/boobs";
    const caption  = `${emoji} *${title}*\n\n> ⛩️ SUKUNA BOT • 18+`;

    try {
        await m.react('⏳');

        // الـ API بيرجع binary مباشرة (gif/image/video) مش JSON
        const res = await axios.get(endpoint, {
            timeout: 20000,
            responseType: 'arraybuffer',
            headers: {
                'User-Agent': 'Mozilla/5.0',
                'Accept': '*/*'
            },
            validateStatus: () => true
        });

        if (res.status >= 400) throw new Error(`HTTP ${res.status}`);

        const buffer      = Buffer.from(res.data);
        const contentType = String(res.headers?.['content-type'] || '').toLowerCase().split(';')[0].trim();

        console.log('[boobs] content-type:', contentType, '| size:', buffer.length);

        if (buffer.length < 500) throw new Error('الملف فارغ أو صغير جداً');

        const isVideo = contentType.includes('video');
        const isGif   = contentType.includes('gif');

        if (isVideo) {
            await conn.sendMessage(m.chat, {
                video: buffer,
                mimetype: 'video/mp4',
                caption
            }, { quoted: m });
        } else if (isGif) {
            // GIF نبعته كـ image/gif مباشرة
            await conn.sendMessage(m.chat, {
                image: buffer,
                mimetype: 'image/gif',
                caption
            }, { quoted: m });
        } else {
            // image (jpeg, png, webp...)
            await conn.sendMessage(m.chat, {
                image: buffer,
                mimetype: contentType || 'image/jpeg',
                caption
            }, { quoted: m });
        }

        await m.react('✅');

    } catch (err) {
        console.error('[boobs error]:', err.message);
        await m.react('❌').catch(() => {});
        return conn.reply(m.chat, `❌ حدث خطأ: ${err.message}`, m);
    }
};

handler.help    = ['boobs'];
handler.tags    = ['18plus'];
handler.command = /^boobs$/i;
handler.owner   = true;

export default handler;