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

        // الـ API بيرجع JSON فيه رابط رغم إن content-type بيقول image/gif
        const res = await axios.get(endpoint, {
            timeout: 20000,
            // بدون responseType عشان axios يفسره كـ JSON تلقائياً
            headers: {
                'User-Agent': 'Mozilla/5.0',
                'Accept': 'application/json, */*'
            },
            validateStatus: () => true
        });

        if (res.status >= 400) throw new Error(`HTTP ${res.status}`);

        const data = res.data;
        console.log('[boobs] data:', JSON.stringify(data)?.slice(0, 300));

        // طلّع الرابط من الـ JSON
        const mediaUrl =
            data?.url        ||
            data?.result     ||
            data?.image      ||
            data?.video      ||
            data?.link       ||
            data?.data?.url  ||
            (typeof data === 'string' && data.startsWith('http') ? data : null);

        if (!mediaUrl) throw new Error('مش لاقي رابط — JSON: ' + JSON.stringify(data)?.slice(0, 100));

        console.log('[boobs] mediaUrl:', mediaUrl);

        const isVideo = /\.(mp4|webm|mov)(\?|$)/i.test(mediaUrl);

        if (isVideo) {
            await conn.sendMessage(m.chat, {
                video: { url: mediaUrl },
                mimetype: 'video/mp4',
                caption
            }, { quoted: m });
        } else {
            await conn.sendMessage(m.chat, {
                image: { url: mediaUrl },
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