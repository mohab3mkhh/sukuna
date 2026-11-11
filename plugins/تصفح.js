import axios from 'axios';
import { pinterest } from '../lib/scraper.js';
import pkg from '@whiskeysockets/baileys';

const { generateWAMessageContent, generateWAMessageFromContent, proto } = pkg;

let handler = async (m, { conn, usedPrefix, command, text }) => {
    if (!text) throw `⚠️ أدخل مصطلح البحث.\n\nمثال: *${usedPrefix + command} nayeon*`;

    await m.react("⌛");
    await conn.sendMessage(m.chat, { text: '> ⏳ جاري البحث عن الصور...' }, { quoted: m });

    async function createImageMessage(url) {
        const { imageMessage } = await generateWAMessageContent(
            { image: { url } },
            { upload: conn.waUploadToServer }
        );
        return imageMessage;
    }

    const sources = [
        async () => {
            const response = await pinterest.search(text, 6);
            return response.result.pins.slice(0, 6).map(pin => pin.media.images.orig.url);
        },
        async () => {
            const res = await axios.get(`https://api.siputzx.my.id/api/s/pinterest?query=${encodeURIComponent(text)}`);
            return res.data.data.slice(0, 6).map(result => result.images_url);
        },
        async () => {
            const res = await axios.get(`https://api.dorratz.com/v2/pinterest?q=${encodeURIComponent(text)}`);
            return res.data.slice(0, 6).map(result => result.image);
        }
    ];

    let images = [];
    for (const source of sources) {
        try {
            images = await source();
            if (images.length > 0) break;
        } catch (e) {
            console.error(`⚠️ خطأ أثناء البحث: ${e.message}`);
        }
    }

    if (images.length === 0) {
        await m.react("❌");
        return conn.sendMessage(m.chat, { text: `❌ لم يتم العثور على نتائج لـ *"${text}"*.` }, { quoted: m });
    }

    let imagesList = [];
    let counter = 1;

    for (let imageUrl of images) {
        imagesList.push({
            body: proto.Message.InteractiveMessage.Body.fromObject({
                text: `🔎 *نتيجة البحث عن:* ${text}\n📸 𝐏𝐇𝐎𝐓𝐎 ${counter++}`
            }),
            header: proto.Message.InteractiveMessage.Header.fromObject({
                hasMediaAttachment: true,
                imageMessage: await createImageMessage(imageUrl)
            }),
            nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({
                buttons: [{
                    name: "cta_url",
                    buttonParamsJson: JSON.stringify({
                        "display_text": "🔗 فتح في Pinterest",
                        "Url": `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(text)}`
                    })
                }]
            })
        });
    }

    const finalMessage = generateWAMessageFromContent(m.chat, {
        viewOnceMessage: {
            message: {
                interactiveMessage: proto.Message.InteractiveMessage.fromObject({
                    body: proto.Message.InteractiveMessage.Body.create({
                        text: "> 🔍 *للحصول على نتائج أفضل، ابحث باللغة الإنجليزية مع وصف للصورة.*"
                    }),
                    carouselMessage: proto.Message.InteractiveMessage.CarouselMessage.fromObject({
                        cards: imagesList
                    })
                })
            }
        }
    }, { quoted: m });

    await m.react("✅");
    await conn.relayMessage(m.chat, finalMessage.message, { messageId: finalMessage.key.id });
};

handler.help = ['pinterest <keyword>'];
handler.tags = ['بحث'];
handler.command = /^(pin|تصفح)$/i;
handler.register = true;
handler.limit = 1;

export default handler;