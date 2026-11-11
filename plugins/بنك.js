import * as pkg from '@whiskeysockets/baileys';
const { generateWAMessageFromContent, prepareWAMessageMedia } = pkg;

const handler = async (m, { conn, usedPrefix }) => {
    let user = global.db.data.users[m.sender];
    let name = await conn.getName(m.sender);

    let { bank = 0, exp = 0, health = 100 } = user;

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

    // تجهيز الصورة
    const media = await prepareWAMessageMedia(
        { image: { url: imageUrl } },
        { upload: conn.waUploadToServer }
    );

    await conn.relayMessage(m.chat, {
        viewOnceMessage: {
            message: {
                interactiveMessage: {
                    header: {
                        hasMediaAttachment: true,
                        ...media
                    },
                    body: {
                        text: response
                    },
                    nativeFlowMessage: {
                        buttons: [
                            {
                                name: "quick_reply",
                                buttonParamsJson: JSON.stringify({
                                    display_text: "💰 الـبـنـك",
                                    id: `${usedPrefix}بنك`
                                })
                            },
                            {
                                name: "quick_reply",
                                buttonParamsJson: JSON.stringify({
                                    display_text: "🏆 الـمـسـتـوى",
                                    id: `${usedPrefix}لفل`
                                })
                            },
                            {
                                name: "quick_reply",
                                buttonParamsJson: JSON.stringify({
                                    display_text: "💳 مـحـفـظـتـي",
                                    id: `${usedPrefix}محفظة`
                                })
                            }
                        ]
                    }
                }
            }
        }
    }, { quoted: m });
};

handler.help = ['البنك', 'بنك'];
handler.tags = ['economy'];
handler.command = /^(البنك|بنك)$/i;

export default handler;