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

        // الـ API بيرجع binary مباشرة (JPEG/GIF)
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

        const buffer = Buffer.from(res.data);
        if (buffer.length < 500) throw new Error('الملف فارغ');

        // اكتشف النوع من أول bytes (magic bytes)
        const magic = buffer.slice(0, 4).toString('hex');
        const isGif  = magic.startsWith('47494638')  // GIF8
        const isJpeg = magic.startsWith('ffd8ff')    // JPEG
        const isPng  = magic.startsWith('89504e47')  // PNG
        const isMp4  = magic.startsWith('00000018') || magic.startsWith('00000020')

        let mimetype = 'image/jpeg'
        if (isGif)  mimetype = 'image/gif'
        if (isPng)  mimetype = 'image/png'
        if (isMp4)  mimetype = 'video/mp4'

        console.log('[boobs] magic:', magic, '| mimetype:', mimetype, '| size:', buffer.length)

        if (isMp4) {
            await conn.sendMessage(m.chat, {
                video: buffer,
                mimetype: 'video/mp4',
                caption
            }, { quoted: m });
        } else {
            await conn.sendMessage(m.chat, {
                image: buffer,
                mimetype,
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