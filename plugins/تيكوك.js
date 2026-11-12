// plugins/edit-search.js
// ⛩️ SUKUNA BOT - بحث إيديتات تيك توك (كاروسيل) 🎬
// نفس أسلوب أمر ريلز: كروت فيديو بدون أزرار + relayMessage

import * as _baileys from '@whiskeysockets/baileys'

const B = _baileys.generateWAMessageFromContent ? _baileys : (_baileys.default || _baileys)
const { proto, generateWAMessageFromContent, generateWAMessageContent } = B

const CARD_COUNT = 6      // عدد الكروت في الكاروسيل (زي الريلز)
const SEARCH_COUNT = 15   // عدد النتايج اللي بنبحث فيها (احتياطي لو بعضها فشل)
const CONCURRENCY = 3
const CACHE_TTL = 30 * 60 * 1000
const CACHE = new Map()

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36'

const sleep = ms => new Promise(r => setTimeout(r, ms))
const isMp4 = buf => buf && buf.length > 12 && buf.subarray(4, 8).toString('latin1') === 'ftyp'

function formatNum(n) {
    if (!n) return '0'
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
    if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
    return n.toString()
}

// ━━━ البحث ━━━
async function searchTikTok(query, count = SEARCH_COUNT) {
    const cached = CACHE.get(query)
    if (cached && Date.now() - cached.time < CACHE_TTL) return cached.results.slice(0, count)

    const now = Math.floor(Date.now() / 1000)
    const oneYearAgo = now - 365 * 24 * 60 * 60

    const res = await fetch('https://www.revid.ai/api/tiktok-search', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'User-Agent': UA,
            'Referer': 'https://www.revid.ai/tiktok-video-finder',
            'Accept': 'application/json'
        },
        body: JSON.stringify({
            keywords: query,
            filtersFast: ['nbChar > 10', "lang = 'en'", `createTime >= ${oneYearAgo} AND createTime <= ${now}`],
            extraParams: { sort: '' }
        }),
        signal: AbortSignal.timeout(30000)
    })
    if (!res.ok) throw new Error('HTTP ' + res.status)

    const data = await res.json()
    const videos = (data.videos || []).map(v => ({
        id: v.id,
        desc: v.desc || 'TikTok Video',
        url: v.url,
        videoUrl: v.urlUploaded,
        duration: v.durationInSeconds || 0,
        author: v.userNickname || 'Unknown',
        likes: v.diggCount || 0,
        comments: v.commentCount || 0,
        plays: v.playCount || 0
    }))

    CACHE.set(query, { results: videos, time: Date.now() })
    return videos.slice(0, count)
}

// tikwm بيسمح بطلب واحد كل ثانية تقريبًا، فبنرتّب الطلبات
let lastTikwm = 0
async function tikwmGate() {
    const slot = Math.max(Date.now(), lastTikwm + 1100)
    lastTikwm = slot
    const wait = slot - Date.now()
    if (wait > 0) await sleep(wait)
}

async function getVideoNoWatermark(tiktokUrl) {
    await tikwmGate()
    const r = await fetch('https://www.tikwm.com/api/?url=' + encodeURIComponent(tiktokUrl), {
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(30000)
    })
    if (!r.ok) throw new Error('HTTP ' + r.status)
    const j = await r.json()
    if (j.code !== 0) throw new Error(j.msg || 'Failed')
    const url = j.data.hdplay || j.data.play
    if (!url) throw new Error('No video URL')
    return url
}

async function downloadVideo(url) {
    const r = await fetch(url, {
        headers: { 'User-Agent': UA, 'Referer': 'https://www.tiktok.com/' },
        signal: AbortSignal.timeout(90000)
    })
    if (!r.ok) throw new Error('HTTP ' + r.status)
    const buf = Buffer.from(await r.arrayBuffer())
    if (buf.length < 10000) throw new Error('فيديو صغير جدًا')
    if (!isMp4(buf)) throw new Error('فيديو غير سليم')
    return buf
}

// الأفضل: بدون علامة مائية (tikwm)، وإلا الرابط المباشر
async function getVideoBuffer(video) {
    try {
        return await downloadVideo(await getVideoNoWatermark(video.url))
    } catch (e) {
        console.log('[edit-search] tikwm فشل:', e.message)
    }
    if (video.videoUrl) return await downloadVideo(video.videoUrl)
    throw new Error('مفيش مصدر')
}

// ━━━ كارت واحد (نفس شكل كارت الريلز) ━━━
async function processItem(video, conn) {
    const buffer = await getVideoBuffer(video)
    const mediaMsg = await generateWAMessageContent(
        { video: buffer, mimetype: 'video/mp4' },
        { upload: conn.waUploadToServer }
    )
    const title = (video.desc || 'TikTok Edit').replace(/\s+/g, ' ').trim()
    return {
        buffer,
        info: video,
        card: {
            body: proto.Message.InteractiveMessage.Body.fromObject({
                text: `❤️ ${formatNum(video.likes)} | 💬 ${formatNum(video.comments)} | 👁️ ${formatNum(video.plays)}\n👤 ${video.author} | ⏱️ ${video.duration}s`
            }),
            footer: proto.Message.InteractiveMessage.Footer.fromObject({ text: '⛩️ SUKUNA BOT ⛩️' }),
            header: proto.Message.InteractiveMessage.Header.fromObject({
                title: title.slice(0, 40),
                hasMediaAttachment: true,
                videoMessage: mediaMsg.videoMessage
            }),
            nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({ buttons: [] })
        }
    }
}

// بيجهز كروت كفاية (CARD_COUNT) من قايمة النتايج، 3 مع بعض
async function buildCards(videos, conn) {
    const results = []
    let idx = 0
    const workers = Array.from({ length: CONCURRENCY }, async () => {
        while (results.length < CARD_COUNT) {
            const i = idx++
            if (i >= videos.length) break
            try {
                const item = await processItem(videos[i], conn)
                if (results.length < CARD_COUNT) results.push(item)
            } catch (e) {
                console.log(`[edit-search] كارت ${i} فشل:`, e.message)
            }
        }
    })
    await Promise.all(workers)
    return results
}

let handler = async (m, { conn, args, usedPrefix, command }) => {
    const chat = m.chat
    const send = t => conn.sendMessage(chat, { text: t })
    const react = async emoji => {
        try { await conn.sendMessage(chat, { react: { text: emoji, key: m.key } }) } catch {}
    }

    if (!args[0]) {
        await react('❌')
        return send(`🔍 *بحث اديتات تيك توك*\n\n${usedPrefix}${command} <اسم الشخصية>\n\n💡 مثال:\n${usedPrefix}${command} زورو\n\n⛩️ SUKUNA BOT ⛩️`)
    }

    const characterName = args.join(' ')
    await react('🔍')
    await send(`🔍 *جاري البحث عن اديتات:* ${characterName}`)

    try {
        const videos = await searchTikTok(`${characterName} edit`)
        if (!videos.length) throw new Error(`ما لقيت اديتات لـ ${characterName}`)

        await send(`⬇️ *لقيت ${videos.length} نتيجة، جاري تجهيز ${Math.min(CARD_COUNT, videos.length)} فيديو...*`)

        const items = await buildCards(videos, conn)
        if (!items.length) throw new Error('فشل تحميل الفيديوهات')
        const cards = items.map(i => i.card)

        try {
            const msg = generateWAMessageFromContent(chat, {
                viewOnceMessage: {
                    message: {
                        messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
                        interactiveMessage: proto.Message.InteractiveMessage.fromObject({
                            body: proto.Message.InteractiveMessage.Body.create({ text: `🎬 *اديتات: ${characterName}*\n${cards.length} فيديو` }),
                            footer: proto.Message.InteractiveMessage.Footer.create({ text: 'SukunaBot' }),
                            header: proto.Message.InteractiveMessage.Header.create({ hasMediaAttachment: false }),
                            carouselMessage: proto.Message.InteractiveMessage.CarouselMessage.fromObject({ cards })
                        })
                    }
                }
            }, { quoted: m })

            await conn.relayMessage(chat, msg.message, { messageId: msg.key.id })
        } catch (err) {
            // لو الكاروسيل فشل: نبعت أول 3 فيديوهات عادي
            console.error('[edit-search] الكاروسيل فشل:', err?.message)
            for (const it of items.slice(0, 3)) {
                await conn.sendMessage(chat, {
                    video: it.buffer,
                    mimetype: 'video/mp4',
                    caption: `🎬 *${it.info.desc.slice(0, 80)}*\n👤 ${it.info.author}\n\n⛩️ SUKUNA BOT ⛩️`
                })
            }
        }

        await react('✅')
    } catch (err) {
        console.error('[edit-search]', err.message)
        await react('❌')
        await send('❌ ' + err.message)
    }
}

handler.help = ['بحثتيك <اسم>']
handler.tags = ['downloader']
// ملحوظة: "ايديت" مش هنا عشان ما يتعارضش مع أمر ايديت التاني
handler.command = /^(بحثتيك|بحثتيكك|بحث_تيك|تيك|تيكتوك)$/i

export default handler