/**
 * plugins/لينك.js
 * إرسال لينك الجروب مع زر نسخ
 */

// ✅ استخدام ملف الأزرار
import { sendButtons, btn, getButtonId } from '../lib/buttons.js';

const DEFAULT_IMAGE = 'https://telegra.ph/file/b9c7242b2ea534c9fea51.jpg';

const handler = async (m, { conn }) => {
    if (!m.isGroup) {
        return m.reply('❌ هذا الأمر للمجموعات فقط');
    }

    const mentionId = m.key.participant || m.key.remoteJid;

    try {
        // ✅ جلب لينك الجروب
        const inviteCode = await conn.groupInviteCode(m.chat);
        const link = `https://chat.whatsapp.com/${inviteCode}`;

        // ✅ جلب صورة الجروب (أو الصورة الافتراضية)
        let groupImage = null;
        try {
            groupImage = await conn.profilePictureUrl(m.chat, 'image');
        } catch {
            groupImage = DEFAULT_IMAGE;
        }

        // ✅ إرسال باستخدام sendButtons
        await sendButtons(conn, m.chat, {
            title: '🔗 لينك الجروب',
            subtitle: `مرحبا يا @${mentionId.split('@')[0]}`,
            text: `*⌬═━━━═⌬┋⊰🎶⊱┋⌬═━━━═⌬*\n\n` +
                  `🔗 *لينك الجروب:*\n${link}\n\n` +
                  `📌 اضغط على الزر لنسخ الرابط`,
            footer: '⛩️ SUKUNA BOT ⛩️',
            image: groupImage,
            buttons: [
                btn.copy('⛩️┊انـسـخ الـرابـط┊⛩️', link)
            ],
            mentions: [mentionId]
        }, m);

    } catch (e) {
        console.error('[لينك]', e.message);
        await m.reply(`❌ فشل جلب لينك الجروب: ${e.message}`);
    }
};

handler.help = ['لينك'];
handler.tags = ['group'];
handler.command = ['لينك', 'link'];
handler.group = true;

export default handler;