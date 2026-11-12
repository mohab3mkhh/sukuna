/**
 * plugins/تقييم.js
 * نظام تقييم البوت
 */

import { sendButtons, btn, getButtonId } from '../lib/buttons.js';

// ✅ رقم المطور
const DEVELOPER = '201016855501@s.whatsapp.net';

const IMAGE_URL = 'https://files.catbox.moe/o1ewkf.jpg';

// ══════════════════════════════════════════════════
//  الأمر الرئيسي
// ══════════════════════════════════════════════════
const handler = async (message, { conn }) => {
    // ✅ إرسال رسالة التقييم باستخدام sendButtons
    await sendButtons(conn, message.chat, {
        title: '⭐ تقييم البوت',
        subtitle: 'كن صادقاً في تقييمك',
        text: `مرحبا يا حب 👋 أتمنى أنك بخير ♥️\nالان يمكنك تقييم البوت لكي يتحسن اكثر\n\n*خلـيك صـادق فـي تـقـيـمـك يا حب* ❤️🥹`,
        footer: '⛩️ SUKUNA BOT',
        image: IMAGE_URL,
        buttons: [
            btn.reply('⭐', '.قيم 1'),
            btn.reply('⭐⭐', '.قيم 2'),
            btn.reply('⭐⭐⭐', '.قيم 3'),
            btn.reply('⭐⭐⭐⭐', '.قيم 4'),
            btn.reply('⭐⭐⭐⭐⭐', '.قيم 5')
        ]
    }, message);
};

// ══════════════════════════════════════════════════
//  معالج التقييم
// ══════════════════════════════════════════════════
const sendFeedbackResponse = async (stars, m, conn) => {
    let feedbackMessage = '';

    switch (stars) {
        case 1:
            feedbackMessage = '*❒═[تقييم بنجمة واحدة]═❒*\n\n*❒ أوووه يا حب، تقييم نجمة بس؟ قولنا إيه اللي مضايقك ونحسنه! 🙁*';
            break;
        case 2:
            feedbackMessage = '*❒═[تقييم بنجمتين]═❒*\n\n*❒ مش بطال بس نقدر نعمل أحسن من كده، قول لنا نغير إيه! 😅*';
            break;
        case 3:
            feedbackMessage = '*❒═[تقييم بثلاث نجوم]═❒*\n\n*❒ تقييم لطيف، مبسوط إنك معانا، بس عايزين نوصل للكمال يا حب 🌟*';
            break;
        case 4:
            feedbackMessage = '*❒═[تقييم بأربع نجوم]═❒*\n\n*❒ تقييم جامد يا نجم! بنوعدك دايمًا نبقى على مستوى توقعاتك 💪*';
            break;
        case 5:
            feedbackMessage = '*❒═[تقييم بخمس نجوم]═❒*\n\n*❒ الله عليك يا أسطورة! شكراً على دعمك، انت كده بتخلينا نطير من الفرحة! 🚀❤️*';
            break;
        default:
            feedbackMessage = '*❒═[تقييم غير صالح]═❒*\n\n*❒ من فضلك اختار عدد النجوم من 1 لحد 5 يا حب 😅*';
            break;
    }

    let developerMessage = `*❒═[تم استلام تقييم للبوت]═❒*\n\n*❒ التقييم: [ ${stars} نجوم ]*\n*❒ بواسطة: [ +${m.sender.split('@')[0]} ]*\n\n*❒ نأمل أن نكون عند حسن ظنك.*`;

    try {
        await conn.sendMessage(DEVELOPER, { text: developerMessage }, { quoted: m });
    } catch (error) {
        console.error("❌ فشل إرسال التقييم للمطور:", error);
    }

    await m.reply(feedbackMessage + `\n\n*رابط التواصل مع المطور:* wa.me/${DEVELOPER.split('@')[0]}`);
};

// ══════════════════════════════════════════════════
//  معالج الأزرار
// ══════════════════════════════════════════════════
handler.before = async function (m, { conn }) {
    // ✅ التحقق من زر التقييم
    const buttonId = getButtonId(m);
    
    if (buttonId && buttonId.startsWith('.قيم ')) {
        const stars = parseInt(buttonId.replace('.قيم ', '').trim());
        
        if (isNaN(stars) || stars < 1 || stars > 5) {
            return m.reply('❌ اختار تقييم من 1 لـ 5');
        }

        await m.react('⭐');
        await sendFeedbackResponse(stars, m, conn);
        return true;
    }

    // ✅ التحقق من النص العادي (لو المستخدم كتب .قيم 3)
    if (m.text && m.text.startsWith('.قيم ')) {
        const stars = parseInt(m.text.replace('.قيم ', '').trim());
        
        if (isNaN(stars) || stars < 1 || stars > 5) {
            return m.reply('❌ اختار تقييم من 1 لـ 5');
        }

        await m.react('⭐');
        await sendFeedbackResponse(stars, m, conn);
        return true;
    }

    return false;
};

// ══════════════════════════════════════════════════
//  إعدادات الأمر
// ══════════════════════════════════════════════════
handler.customPrefix = /^[.!#]?(تقييم|قيم)$/i;
handler.command = new RegExp();
handler.tags = ['tools'];
handler.help = ['تقييم'];

export default handler;