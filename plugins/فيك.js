// plugins/fakemsg.js
import { delay, prepareWAMessageMedia } from '@whiskeysockets/baileys';

const handler = async (m, { conn, text }) => {
    if (!m.quoted) return m.reply('📌 رد على رسالة');

    const stanzaId = m.quoted.id;

    try {
        // ✅ لو انت باعت صورة مع الأمر - عدل رسالة اللي رديت عليه بصورتك انت
        if (m.mtype === 'imageMessage' || m.mediaType === 'image') {
            let imageBuffer = await m.download();
            let caption = text || m.msg?.caption || '';

            const prepared = await prepareWAMessageMedia(
                { image: imageBuffer },
                { upload: conn.waUploadToServer }
            );

            const tempId = await conn.relayMessage(m.chat, {
                extendedTextMessage: {
                    text: '',
                    contextInfo: { isGroupStatus: true }
                }
            }, {});

            await conn.relayMessage(m.chat, {
                protocolMessage: {
                    key: { jid: m.chat, fromMe: true, id: tempId },
                    type: 14,
                    editedMessage: {
                        imageMessage: {
                            ...prepared.imageMessage,
                            caption,
                            contextInfo: { isGroupStatus: false }
                        }
                    }
                }
            }, { messageId: stanzaId });

            await delay(100);

            await Promise.allSettled([
                conn.sendMessage(m.chat, { delete: { remoteJid: m.chat, id: tempId, fromMe: true } })
            ]);

            await m.react('✅');
            return;
        }

        // ✅ نص فقط
        if (!text) return m.reply('📌 اكتب النص البديل أو ابعت صورة مع .fakemsg');

        const tempId = await conn.relayMessage(m.chat, {
            extendedTextMessage: {
                text: '',
                contextInfo: { isGroupStatus: true }
            }
        }, {});

        const tempId2 = await conn.relayMessage(m.chat, {
            protocolMessage: {
                key: { jid: m.chat, fromMe: true, id: tempId },
                type: 14,
                editedMessage: {
                    extendedTextMessage: {
                        text,
                        contextInfo: { isGroupStatus: false }
                    }
                }
            }
        }, { messageId: stanzaId });

        await delay(100);

        await Promise.allSettled([
            conn.sendMessage(m.chat, { delete: { remoteJid: m.chat, id: tempId, fromMe: true } }),
            conn.sendMessage(m.chat, { delete: { remoteJid: m.chat, id: tempId2, fromMe: true } })
        ]);

        await m.react('✅');
    } catch (e) {
        console.error('[fakemsg]', e);
        m.reply('❌ ' + (e?.message || e));
    }
};

handler.command = /^فيك$/i;
handler.tags = ['owner'];
handler.owner = true;
handler.group = true;

export default handler;