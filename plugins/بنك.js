/**
 * plugins/البنك.js
 * عرض معلومات البنك
 */

// ✅ استخدام ملف الأزرار
import { sendButtons, btn, getButtonId } from '../lib/buttons.js';

const handler = async (m, { conn, usedPrefix }) => {
    let user = global.db.data.users[m.sender] || {};
    let name = await conn.getName(m.sender);

    let { bank = 0, exp = 0, health = 100 } = user;

    // ✅ تحديد الثروة حسب الرصيد
    let wealth = '🪙 *مفلس* 😭';
    if (bank > 3000) wealth = '💼 *فقير 😞*';
    if (bank > 6000) wealth = '🧑‍💼 *موظف حكومي*';
    if (bank > 100000) wealth = '🤴🏼 *رجل أعمال*';
    if (bank > 1000000) wealth = '💸 *غني*';
    if (bank > 10000000) wealth = '🤑 *مليونير*';
    if (bank > 1000000000) wealth = '💰 *ملياردير*';

    let response = `╭━━━══━━❪🏦❫━━══━━━╮
┃ 💎 ˼ الــــبــــنــــك ╿↶ 💎
┃ 🎀 الاسم: ${name}
┃ 💰 الرصيد: ${bank} دولار
┃ 🎖 الثروة: ${wealth}
┃ ❤️ الصحة: ${health}/1000
┃ ✨ الخبرة: ${exp} XP
╰━━━══━━❪🏦❫━━══━━━╯
┃ 📜 نصائح مالية:
┃ 🏦 اكتب ⟪ .إيداع ⟫ لإيداع المال
┃ 💸 اكتب ⟪ .سحب ⟫ لسحب الأموال
╰━━━══━━❪💳❫━━══━━━╯`;

    const imageUrl = 'https://files.catbox.moe/xcqk22.jpg';

    // ✅ إرسال باستخدام sendButtons
    await sendButtons(conn, m.chat, {
        title: '🏦 البنك',
        subtitle: name,
        text: response,
        footer: '⛩️ SUKUNA BOT',
        image: imageUrl,
        buttons: [
            btn.reply('💰 الـبـنـك', `${usedPrefix}بنك`),
            btn.reply('🏆 الـمـسـتـوى', `${usedPrefix}لفل`),
            btn.reply('💳 مـحـفـظـتـي', `${usedPrefix}محفظة`)
        ]
    }, m);
};

handler.help = ['البنك', 'بنك'];
handler.tags = ['economy'];
handler.command = /^(البنك|بنك)$/i;

export default handler;