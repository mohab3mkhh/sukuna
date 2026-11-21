// plugins/dmsg.js
import { delay } from '@whiskeysockets/baileys';

const handler = async (m, { conn }) => {
    if (!m.quoted) return m.reply('📌 رد على رسالة');

    try {
        const chatId = m.chat;
        const stanzaId = m.quoted.id;

        const tempId = await conn.relayMessage(chatId, {
            groupStatusMessageV2: {
                message: {
                    extendedTextMessage: {
                        text: '',
                        contextInfo: { isGroupStatus: true }
                    }
                }
            }
        }, {});

        await conn.relayMessage(chatId, {
            protocolMessage: {
                key: { jid: chatId, fromMe: true, id: tempId },
                type: 14,
                editedMessage: {
                    extendedTextMessage: {
                        text: '\0',
                        contextInfo: { isGroupStatus: false }
                    }
                }
            }
        }, { messageId: stanzaId });

        await delay(100);

        await Promise.allSettled([
            conn.sendMessage(chatId, { delete: { remoteJid: chatId, id: tempId, fromMe: true } }),
            conn.sendMessage(chatId, { delete: { remoteJid: chatId, id: stanzaId, fromMe: false } })
        ]);
    } catch (e) {
        console.error('[dmsg]', e);
        m.reply('❌ ' + (e?.message || e));
    }
};

handler.command = /^(dm)$/i;
handler.tags = ['owner'];
handler.owner = true;
handler.group = true;
export default handler;