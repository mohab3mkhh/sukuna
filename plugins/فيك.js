// plugins/fakemsg.js
import { delay, prepareWAMessageMedia } from '@whiskeysockets/baileys';

const extractMsgId = (sent) => {
    if (!sent) return null;
    if (typeof sent === 'string') return sent;
    return sent?.key?.id || sent?.id || null;
};

const safeDelete = async (conn, chat, id) => {
    if (!id) return;
    try {
        await conn.sendMessage(chat, {
            delete: { remoteJid: chat, id, fromMe: true }
        });
    } catch {}
};

const handler = async (m, { conn, text }) => {
    if (!m.quoted) return m.reply('📌 رد على رسالة');

    const stanzaId = m.quoted.key?.id || m.quoted.id;
    const participant = m.quoted.key?.participant || m.quoted.sender;

    try {
        // ✅ لو انت باعت صورة مع الأمر
        if (m.mtype === 'imageMessage' || m.mediaType === 'image') {
            const imageBuffer = await m.download();
            const caption = text || m.msg?.caption || '';

            const prepared = await prepareWAMessageMedia(
                { image: imageBuffer },
                { upload: conn.waUploadToServer }
            );

            const sentTemp = await conn.relayMessage(
                m.chat,
                {
                    extendedTextMessage: {
                        text: '⏳',
                        contextInfo: {
                            stanzaId,
                            participant,
                            quotedMessage: m.quoted.message
                        }
                    }
                },
                {}
            );

            const tempId = extractMsgId(sentTemp);

            if (tempId) {
                await conn.relayMessage(
                    m.chat,
                    {
                        protocolMessage: {
                            key: { remoteJid: m.chat, fromMe: true, id: tempId },
                            type: 14,
                            editedMessage: {
                                imageMessage: {
                                    ...prepared.imageMessage,
                                    caption,
                                    contextInfo: {
                                        stanzaId,
                                        participant,
                                        quotedMessage: m.quoted.message
                                    }
                                }
                            }
                        }
                    },
                    {}
                );

                await delay(350);
                await safeDelete(conn, m.chat, tempId);
            } else {
                await conn.sendMessage(
                    m.chat,
                    { image: imageBuffer, caption },
                    { quoted: m.quoted }
                );
            }

            await m.react('✅');
            return;
        }

        // ✅ نص فقط
        if (!text) return m.reply('📌 اكتب النص البديل أو ابعت صورة مع الأمر');

        const sentTemp = await conn.relayMessage(
            m.chat,
            {
                extendedTextMessage: {
                    text: '⏳',
                    contextInfo: {
                        stanzaId,
                        participant,
                        quotedMessage: m.quoted.message
                    }
                }
            },
            {}
        );

        const tempId = extractMsgId(sentTemp);

        if (tempId) {
            await conn.relayMessage(
                m.chat,
                {
                    protocolMessage: {
                        key: { remoteJid: m.chat, fromMe: true, id: tempId },
                        type: 14,
                        editedMessage: {
                            extendedTextMessage: {
                                text,
                                contextInfo: {
                                    stanzaId,
                                    participant,
                                    quotedMessage: m.quoted.message
                                }
                            }
                        }
                    }
                },
                {}
            );

            await delay(350);
            await safeDelete(conn, m.chat, tempId);
        } else {
            await conn.sendMessage(m.chat, { text }, { quoted: m.quoted });
        }

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