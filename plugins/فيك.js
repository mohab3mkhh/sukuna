// plugins/فيك.js
import { delay, prepareWAMessageMedia } from '@whiskeysockets/baileys';

const getMsgId = (sent) => {
    if (!sent) return null;
    if (typeof sent === 'string') return sent;
    return sent?.key?.id || sent?.id || null;
};

const handler = async (m, { conn, text }) => {
    if (!m.quoted) return m.reply('📌 رد على رسالة');

    const stanzaId = m.quoted.id;

    try {
        // ✅ لو انت باعت صورة مع الأمر - عدل رسالة اللي رديت عليه بصورتك انت
        if (m.mtype === 'imageMessage' || m.mediaType === 'image') {
            const imageBuffer = await m.download();
            const caption = text || m.msg?.caption || '';

            const prepared = await prepareWAMessageMedia(
                { image: imageBuffer },
                { upload: conn.waUploadToServer }
            );

            const sentTemp = await conn.relayMessage(m.chat, {
                extendedTextMessage: {
                    text: '',
                    contextInfo: { isGroupStatus: true }
                }
            }, {});

            const tempId = getMsgId(sentTemp);

            if (tempId) {
                await conn.relayMessage(m.chat, {
                    protocolMessage: {
                        key: { remoteJid: m.chat, fromMe: true, id: tempId },
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

                await delay(400);

                await Promise.allSettled([
                    conn.sendMessage(m.chat, { delete: { remoteJid: m.chat, id: tempId, fromMe: true } })
                ]);
            }

            return;
        }

        // ✅ نص فقط
        if (!text) return m.reply('📌 اكتب النص البديل أو ابعت صورة مع الأمر');

        const sentTemp = await conn.relayMessage(m.chat, {
            extendedTextMessage: {
                text: '',
                contextInfo: { isGroupStatus: true }
            }
        }, {});

        const tempId = getMsgId(sentTemp);

        if (tempId) {
            await conn.relayMessage(m.chat, {
                protocolMessage: {
                    key: { remoteJid: m.chat, fromMe: true, id: tempId },
                    type: 14,
                    editedMessage: {
                        extendedTextMessage: {
                            text,
                            contextInfo: { isGroupStatus: false }
                        }
                    }
                }
            }, { messageId: stanzaId });

            await delay(400);

            await Promise.allSettled([
                conn.sendMessage(m.chat, { delete: { remoteJid: m.chat, id: tempId, fromMe: true } })
            ]);
        }
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