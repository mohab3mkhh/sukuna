function clockString(ms) {
    let h = Math.floor(ms / 3600000);
    let m = Math.floor(ms % 3600000 / 60000);
    let s = Math.floor(ms % 60000 / 1000);
    return [h, m, s].map(v => v.toString().padStart(2, '0')).join(':');
}

import pkg from '@whiskeysockets/baileys';
const { generateWAMessageFromContent, proto, prepareWAMessageMedia } = pkg;

const handler = async (m, { conn, usedPrefix }) => {
    let taguser = '@' + m.sender.split('@s.whatsapp.net')[0];
    const imageUrl = 'https://files.catbox.moe/gbt34x.jpg';

    await conn.sendMessage(m.chat, { react: { text: '🩸', key: m.key } });

    const mediaPrepared = await prepareWAMessageMedia(
        { image: { url: imageUrl } },
        { upload: conn.waUploadToServer }
    )

    const bodyText = `
╭──❖ ⛩️ ❖──╮
⛩️⚡️ *يــاهــلا بـيـك، ${taguser}!* ⚡️⛩️
🩸🔐 *سـوكـونـا فـي خـدمـتـك لإدارة الـجـروب!* 🔐🩸
╰──❖ ⛩️ ❖──╯

🌀*『 ☁️ خــيــارات الإدارة ☁️ 』* 🌀
🌀*اخــتــر أحــد الــزراريــن أدنــاه لــفــتــح أو قــفــل الــجــروب!*
⛩️ *سـوكـونـا جـاهـز لأوامـركـ!* ⛩️
    `.trim()

    const msg = generateWAMessageFromContent(m.chat, {
        viewOnceMessage: {
            message: {
                interactiveMessage: proto.Message.InteractiveMessage.create({
                    header: proto.Message.InteractiveMessage.Header.create({
                        hasMediaAttachment: true,
                        ...mediaPrepared
                    }),
                    body: proto.Message.InteractiveMessage.Body.create({
                        text: bodyText
                    }),
                    footer: proto.Message.InteractiveMessage.Footer.create({
                        text: '⛩️ SUKUNA BOT ⛩️'
                    }),
                    nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
                        buttons: [
                            {
                                name: 'quick_reply',
                                buttonParamsJson: JSON.stringify({
                                    display_text: '✨ فــتــح ✨',
                                    id: `${usedPrefix}group فتح`
                                })
                            },
                            {
                                name: 'quick_reply',
                                buttonParamsJson: JSON.stringify({
                                    display_text: '🔒 قــفــل 🔒',
                                    id: `${usedPrefix}group قفل`
                                })
                            }
                        ]
                    })
                })
            }
        }
    }, { userJid: conn.user.jid, quoted: m })

    await conn.relayMessage(m.chat, msg.message, { messageId: msg.key.id })
}

handler.help = ['group *open/close*'];
handler.tags = ['group'];
handler.command = ['جروب', 'روم', 'اعدادات'];
handler.admin = true;
handler.botAdmin = true;

export default handler;