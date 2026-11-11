import axios from 'axios';
import baileys from '@whiskeysockets/baileys';

const { generateWAMessageContent, generateWAMessageFromContent, proto } = baileys;

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
            const res = await axios.get(`https://api.siputzx.my.id/api/s/pinterest?query=${encodeURIComponent(text)}`, { timeout: 10000 });
            if (!res.data?.data?.length) throw new Error('no data');
            return res.data.data.slice(0, 6).map(result => result.images_url || result.url || result.image);
        },
        async () => {
            const res = await axios.get(`https://api.dorratz.com/v2/pinterest?q=${encodeURIComponent(text)}`, { timeout: 10000 });
            if (!res.data?.length) throw new Error('no data');
            return res.data.slice(0, 6).map(result => result.image || result.url);
        },
        async () => {
            const res = await axios.get(`https://api.lolhuman.xyz/api/pinterest?apikey=lolhuman&query=${encodeURIComponent(text)}`, { timeout: 10000 });
            if (!res.data?.result?.length) throw new Error('no data');
            return res.data.result.slice(0, 6);
        }
    ];

    let images = [];
    for (const source of sources) {
        try {
            const result = await source();
            const filtered = result.filter(url => url && typeof url === 'string' && url.startsWith('http'));
            if (filtered.length > 0) {
                images = filtered;
                break;
            }
        } catch (e) {
            console.error(`[Pinterest] source failed: ${e.message}`);
        }
    }

    if (images.length === 0) {
        await m.react("❌");
        return conn.sendMessage(m.chat, { text: `❌ لم يتم العثور على نتائج لـ *"${text}"*.\nجرب باللغة الإنجليزية.` }, { quoted: m });
    }

    let imagesList = [];
    let counter = 1;

    for (let imageUrl of images) {
        try {
            const imgMsg = await createImageMessage(imageUrl);
            imagesList.push({
                body: proto.Message.InteractiveMessage.Body.fromObject({
                    text: `🔎 *نتيجة البحث عن:* ${text}\n📸 𝐏𝐇𝐎𝐓𝐎 ${counter++}`
                }),
                header: proto.Message.InteractiveMessage.Header.fromObject({
                    hasMediaAttachment: true,
                    imageMessage: imgMsg
                }),
                nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({
                    buttons: [{
                        name: "cta_url",
                        buttonParamsJson: JSON.stringify({
                            display_text: "🔗 فتح في Pinterest",
                            url: `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(text)}`
                        })
                    }]
                })
            });
        } catch (e) {
            console.error(`[Pinterest] failed to create image message: ${e.message}`);
        }
    }

    if (imagesList.length === 0) {
        await m.react("❌");
        return conn.sendMessage(m.chat, { text: `❌ تعذّر تحميل الصور، حاول مرة أخرى.` }, { quoted: m });
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