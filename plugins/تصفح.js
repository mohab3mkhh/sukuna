/**
 * plugins/تصفح.js
 * بحث وجلب صور من Pinterest
 */

import axios from 'axios';
import pkg from '@whiskeysockets/baileys';
const { generateWAMessageContent, generateWAMessageFromContent, proto } = pkg;

// ✅ محاولة استيراد pinterest من scraper
let pinterest = null;
try {
  const scraper = await import('../lib/scraper.js');
  pinterest = scraper.pinterest;
} catch (e) {
  console.log('[تصفح] ملف scraper.js مش موجود، هستخدم APIs بس');
}

let handler = async (m, { conn, usedPrefix, command, text }) => {
    if (!text) throw `⚠️ أدخل مصطلح البحث.\n\nمثال: *${usedPrefix + command} cats*`;

    await m.react("⌛");
    conn.reply(m.chat, '> ⏳ جاري البحث عن الصور...', m);

    async function createImageMessage(url) {
        const { imageMessage } = await generateWAMessageContent(
            { image: { url } },
            { upload: conn.waUploadToServer }
        );
        return imageMessage;
    }

    const sources = [];

    // ✅ لو pinterest موجودة، استخدمها
    if (pinterest?.search) {
        sources.push(async () => {
            const response = await pinterest.search(text, 6);
            return response.result.pins.slice(0, 6).map(pin => pin.media.images.orig.url);
        });
    }

    // ✅ APIs بديلة
    sources.push(
        async () => {
            const res = await axios.get(`https://api.siputzx.my.id/api/s/pinterest?query=${encodeURIComponent(text)}`);
            return res.data.data.slice(0, 6).map(result => result.images_url);
        },
        async () => {
            const res = await axios.get(`https://api.dorratz.com/v2/pinterest?q=${encodeURIComponent(text)}`);
            return res.data.slice(0, 6).map(result => result.image);
        },
        async () => {
            const res = await axios.get(`https://pinterest-api-one.vercel.app/?q=${encodeURIComponent(text)}`);
            return res.data.images?.slice(0, 6) || [];
        }
    );

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
        return m.reply(`❌ لم يتم العثور على نتائج لـ *"${text}"*.`);
    }

    let imagesList = [];
    let counter = 1;

    for (let imageUrl of images) {
        try {
            imagesList.push({
                body: proto.Message.InteractiveMessage.Body.fromObject({
                    text: `🔎 *نتيجة البحث عن:* ${text}\n📸 صورة ${counter++}`
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
        } catch (e) {
            console.error(`⚠️ فشل تجهيز صورة: ${e.message}`);
        }
    }

    if (imagesList.length === 0) {
        await m.react("❌");
        return m.reply(`❌ فشل تجهيز الصور. حاول مرة أخرى.`);
    }

    const finalMessage = generateWAMessageFromContent(m.chat, {
        viewOnceMessage: {
            message: {
                interactiveMessage: proto.Message.InteractiveMessage.fromObject({
                    body: proto.Message.InteractiveMessage.Body.create({
                        text: "> 🔍 *للحصول على نتائج أفضل، ابحث باللغة الإنجليزية مع وصف للصورة.*"
                    }),
                    footer: proto.Message.InteractiveMessage.Footer.create({
                        text: "Pinterest Image Search"
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

handler.help = ['تصفح <كلمة>'];
handler.tags = ['tools'];
handler.command = /^(pin|تصفح|pinterest)$/i;

export default handler;