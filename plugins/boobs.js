/**
 * plugins/boobs.js
 * محتوى 18+ - للمطور فقط
 *
 * 🔧 طريقة الإصلاح:
 * المشكلة كانت إن الكود بيجيب الـ API كـ arraybuffer دايماً،
 * لكن معظم APIs بترجع JSON فيه رابط مش binary مباشرة.
 * الحل: نجيب JSON الأول، نطلع الرابط منه، نحمل الميديا.
 */

import axios from 'axios';

let handler = async (m, { conn, isROwner, isOwner }) => {
    if (!isROwner && !isOwner) {
        return conn.reply(m.chat, '❌ هذا الأمر للمطور فقط.', m);
    }

    const title   = "Boobs";
    const emoji   = "🔞";
    const endpoint = "https://prexzyapis.com/nsfw/boobs";
    const caption  = `${emoji} *${title}*\n\n> ⛩️ SUKUNA BOT • 18+`;

    try {
        await m.react('⏳');

        // ━━━ خطوة 1: جيب الـ API كـ JSON (مش arraybuffer) ━━━
        const res = await axios.get(endpoint, {
            timeout: 20000,
            // ❌ مش هنحط responseType: 'arraybuffer' هنا
            // لأن الـ API غالباً بيرجع JSON
            headers: {
                'User-Agent': 'Mozilla/5.0',
                'Accept': 'application/json, */*'
            },
            validateStatus: () => true
        });

        console.log('[boobs] status:', res.status);
        console.log('[boobs] content-type:', res.headers?.['content-type']);
        console.log('[boobs] data sample:', JSON.stringify(res.data)?.slice(0, 200));

        if (res.status >= 400) throw new Error(`HTTP ${res.status}`);

        const data = res.data;

        // ━━━ خطوة 2: طلّع الرابط من الـ JSON ━━━
        // جرب كل الحقول الشائعة
        let mediaUrl =
            data?.url        ||
            data?.result     ||
            data?.image      ||
            data?.video      ||
            data?.link       ||
            data?.data?.url  ||
            data?.data?.image ||
            null;

        // لو الـ data نفسه string وهو رابط
        if (!mediaUrl && typeof data === 'string' && data.startsWith('http')) {
            mediaUrl = data;
        }

        if (!mediaUrl) {
            console.error('[boobs] JSON كامل:', JSON.stringify(data));
            throw new Error('مش لاقي رابط في الرد — شوف الـ console للـ JSON الكامل');
        }

        console.log('[boobs] mediaUrl:', mediaUrl);

        // ━━━ خطوة 3: حدد النوع من الرابط ━━━
        const isVideo = /\.(mp4|webm|mov|m4v|avi)(\?|$)/i.test(mediaUrl);

        // ━━━ خطوة 4: حمّل الميديا كـ buffer وابعتها ━━━
        const mediaRes = await axios.get(mediaUrl, {
            responseType: 'arraybuffer',
            timeout: 30000,
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });

        const buffer = Buffer.from(mediaRes.data);

        if (buffer.length < 1000) throw new Error('الملف فارغ أو صغير جداً');

        if (isVideo) {
            await conn.sendMessage(m.chat, {
                video: buffer,
                mimetype: 'video/mp4',
                caption
            }, { quoted: m });
        } else {
            await conn.sendMessage(m.chat, {
                image: buffer,
                mimetype: 'image/jpeg',
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