// plugins/tiktok.js
// بحث وجلب فيديوهات من تيك توك

import axios from 'axios';
import baileys from '@whiskeysockets/baileys';

const { generateWAMessageContent, generateWAMessageFromContent, proto } = baileys;

let handler = async (m, { conn, usedPrefix, command, text }) => {
    if (!text) throw `⚠️ أدخل مصطلح البحث.\n\nمثال: *${usedPrefix + command} cats*`

    await m.react("⌛");
    await conn.reply(m.chat, '> ⏳ جاري البحث عن فيديوهات تيك توك...', m);

    async function createVideoMessage(url) {
        try {
            const { videoMessage } = await generateWAMessageContent(
                { video: { url } },
                { upload: conn.waUploadToServer }
            );
            return videoMessage;
        } catch (e) {
            console.error('خطأ في معالجة الفيديو:', e.message);
            return null;
        }
    }

    let videos = [];

    // ✅ API 1: TikWM (مجاني، بدون مفتاح)
    try {
        const res = await axios.post('https://www.tikwm.com/api/feed/search', {
            keywords: text,
            count: 6,
            cursor: 0,
            HD: 1
        }, {
            headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
            timeout: 15000
        });
        const items = res.data?.data?.videos || [];
        videos = items.map(v => v.play || v.wmplay).filter(Boolean);
        console.log('[تيك توك] TikWM:', videos.length);
    } catch (e) { console.log('[تيك توك] TikWM fail:', e.message); }

    // ✅ API 2: Tiktok API (بديل)
    if (!videos.length) {
        try {
            const res = await axios.get(`https://tiktok-scraper7.p.rapidapi.com/feed/search?keywords=${encodeURIComponent(text)}&count=6&region=EG&lang=ar`, {
                headers: {
                    'X-RapidAPI-Key': 'f4b7c2e8d3a1f9e0b5c8d2a4f7e3b1c9d6a2f8e5b4c1d7a3f6e2b8c5d9a1f4e7',
                    'X-RapidAPI-Host': 'tiktok-scraper7.p.rapidapi.com'
                },
                timeout: 15000
            });
            const items = res.data?.data?.videos || [];
            videos = items.map(v => v.play).filter(Boolean);
            console.log('[تيك توك] RapidAPI:', videos.length);
        } catch (e) { console.log('[تيك توك] RapidAPI fail:', e.message); }
    }

    // ✅ API 3: Douyin/TikTok search (بديل ثالث)
    if (!videos.length) {
        try {
            const res = await axios.get(`https://api.tikmate.app/api/lookup?url=https://www.tiktok.com/search?q=${encodeURIComponent(text)}`, {
                timeout: 15000,
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            if (res.data?.video) videos = [res.data.video];
        } catch (e) { console.log('[تيك توك] tikmate fail:', e.message); }
    }

    if (!videos.length) {
        await m.react("❌");
        return m.reply(`❌ لم يتم العثور على فيديوهات لـ *"${text}"*.\n\n💡 جرب كلمات مختلفة أو بالإنجليزي.`);
    }

    let cards = [];
    let counter = 1;

    for (const videoUrl of videos.slice(0, 6)) {
        const videoMsg = await createVideoMessage(videoUrl);
        if (!videoMsg) continue;

        cards.push({
            body: proto.Message.InteractiveMessage.Body.fromObject({
                text: `🎬 *بحث عن:* ${text}\n📹 فيديو ${counter++}`
            }),
            header: proto.Message.InteractiveMessage.Header.fromObject({
                hasMediaAttachment: true,
                videoMessage: videoMsg
            }),
            nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({
                buttons: [{
                    name: 'cta_url',
                    buttonParamsJson: JSON.stringify({
                        display_text: '⬇️ تحميل الفيديو',
                        url: videoUrl
                    })
                }]
            })
        });
    }

    if (!cards.length) {
        await m.react("❌");
        return m.reply('❌ فشل تجهيز الفيديوهات، حاول مرة أخرى.');
    }

    const finalMessage = generateWAMessageFromContent(m.chat, {
        viewOnceMessage: {
            message: {
                interactiveMessage: proto.Message.InteractiveMessage.fromObject({
                    body: proto.Message.InteractiveMessage.Body.create({
                        text: `🔍 *نتائج البحث عن: ${text}* (تيك توك)\n🎬 اضغط على الفيديو للتصفح والتحميل`
                    }),
                    footer: proto.Message.InteractiveMessage.Footer.create({
                        text: 'TikTok Video Search'
                    }),
                    carouselMessage: proto.Message.InteractiveMessage.CarouselMessage.fromObject({
                        cards
                    })
                })
            }
        }
    }, { quoted: m });

    await m.react("✅");
    await conn.relayMessage(m.chat, finalMessage.message, { messageId: finalMessage.key.id });
};

handler.help = ['تيكتوك <كلمة>'];
handler.tags = ['downloader'];
handler.command = /^(تيكتوك|tiktok|tt)$/i;

export default handler;