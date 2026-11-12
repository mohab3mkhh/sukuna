/**
 * plugins/جروب.js
 * إعدادات الجروب (فتح/قفل)
 */

// ✅ استخدام ملف الأزرار
import { sendButtons, btn, getButtonId } from '../lib/buttons.js';

const IMAGE_URL = 'https://files.catbox.moe/gbt34x.jpg';

// ══════════════════════════════════════════════════
//  الأمر الرئيسي
// ══════════════════════════════════════════════════
const handler = async (m, { conn, usedPrefix }) => {
    if (!m.isGroup) {
        return m.reply('❌ هذا الأمر للمجموعات فقط');
    }

    let tagUser = `@${m.sender.split('@')[0]}`;

    await conn.sendMessage(m.chat, { react: { text: '🩸', key: m.key } });

    const bodyText = `
╭──❖ ⛩️ ❖──╮
⛩️⚡️ *يــاهــلا بـيـك، ${tagUser}!* ⚡️⛩️
🩸🔐 *سـوكـونـا فـي خـدمـتـك لإدارة الـجـروب!* 🔐🩸
╰──❖ ⛩️ ❖──╯

🌀*『 ☁️ خــيــارات الإدارة ☁️ 』* 🌀
🌀*اخــتــر أحــد الــزراريــن أدنــاه لــفــتــح أو قــفــل الــجــروب!*
⛩️ *سـوكـونـا جـاهـز لأوامـركـ!* ⛩️
    `.trim();

    // ✅ إرسال باستخدام sendButtons
    await sendButtons(conn, m.chat, {
        title: '⛩️ إعدادات الجروب',
        subtitle: 'سوكونا في خدمتك',
        text: bodyText,
        footer: '⛩️ SUKUNA BOT ⛩️',
        image: IMAGE_URL,
        buttons: [
            btn.reply('✨ فــتــح ✨', `${usedPrefix}group فتح`),
            btn.reply('🔒 قــفــل 🔒', `${usedPrefix}group قفل`)
        ],
        mentions: [m.sender]
    }, m);
};

// ══════════════════════════════════════════════════
//  معالج الأزرار
// ══════════════════════════════════════════════════
handler.before = async function (m, { conn, isAdmin, isBotAdmin }) {
    if (!m.isGroup) return false;

    // ✅ التحقق من زر الفتح/القفل
    const buttonId = getButtonId(m);
    const text = m.text || '';
    
    const isOpen = buttonId?.includes('group فتح') || text.includes('group فتح');
    const isClose = buttonId?.includes('group قفل') || text.includes('group قفل');

    if (!isOpen && !isClose) return false;

    if (!isAdmin) {
        return m.reply('❌ هذا الأمر للأدمنية فقط');
    }

    if (!isBotAdmin) {
        return m.reply('❌ البوت مش أدمن، مش هينفع');
    }

    try {
        if (isOpen) {
            await conn.groupSettingUpdate(m.chat, 'not_announcement');
            await m.react('🔓');
            await m.reply('✅ *تم فتح الجروب*\n\n⛩️ SUKUNA BOT');
        } else {
            await conn.groupSettingUpdate(m.chat, 'announcement');
            await m.react('🔒');
            await m.reply('✅ *تم قفل الجروب*\n\n⛩️ SUKUNA BOT');
        }
    } catch (e) {
        console.error('[جروب]', e.message);
        await m.react('❌');
        await m.reply(`❌ فشل: ${e.message}`);
    }

    return true;
};

handler.help = ['group *فتح/قفل*'];
handler.tags = ['group'];
handler.command = ['جروب', 'روم', 'اعدادات'];
handler.admin = true;
handler.botAdmin = true;

export default handler;