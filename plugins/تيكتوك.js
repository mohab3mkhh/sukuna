// plugins/edit-search.js
// ⛩️ SUKUNA BOT - بحث إيديتات تيك توك (كاروسيل) 🎬

import * as _baileys from '@whiskeysockets/baileys'

const B = _baileys.generateWAMessageFromContent ? _baileys : (_baileys.default || _baileys)
const { proto, generateWAMessageFromContent, generateWAMessageContent } = B

// ━━━ بديل لـ theme (مفيش اعتماد على core/theme.js) ━━━
const theme = {
    divider: '━━━━━━━━━━━━━━━━',
    smallDivider: '────────────',
    endDivider: '━━━━━━━━━━━━━━━━'
}

const CACHE = new Map()
const CACHE_TTL = 30 * 60 * 1000
const VIDEO_CACHE = new Map()

// 🎯 العدد المطلوب
const MAX_VIDEOS = 20
const PARALLEL = 4 // عدد الفيديوهات اللي بتتجهز مع بعض

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36'

async function searchTikTok(query, count = 20) {
    const cached = CACHE.get(query)
    if (cached && Date.now() - cached.time < CACHE_TTL) {
        return cached.results.slice(0, count)
    }

    const now = Math.floor(Date.now() / 1000)
    const oneYearAgo = now - 365 * 24 * 60 * 60

    const body = JSON.stringify({
        keywords: query,
        filtersFast: [
            'nbChar > 10',
            "lang = 'en'",
            `createTime >= ${oneYearAgo} AND createTime <= ${now}`
        ],
        extraParams: { sort: '' }
    })

    const res = await fetch('https://www.revid.ai/api/tiktok-search', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'User-Agent': UA,
            'Referer': 'https://www.revid.ai/tiktok-video-finder',
            'Accept': 'application/json'
        },
        body,
        signal: AbortSignal.timeout(30000)
    })

    if (!res.ok) throw new Error('HTTP ' + res.status)

    const data = await res.json()
    const videos = (data.videos || []).map(v => ({
        id: v.id,
        desc: v.desc || 'TikTok Video',
        url: v.url,
        videoUrl: v.urlUploaded,
        cover: v.imagePreview,
        duration: v.durationInSeconds || 0,
        author: v.userNickname || 'Unknown',
        username: v.username || '',
        likes: v.diggCount || 0,
        comments: v.commentCount || 0,
        shares: v.shareCount || 0,
        plays: v.playCount || 0
    }))

    CACHE.set(query, { results: videos, time: Date.now() })
    return videos.slice(0, count)
}

async function getVideoNoWatermark(tiktokUrl) {
    const r = await fetch('https://www.tikwm.com/api/?url=' + encodeURIComponent(tiktokUrl), {
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(30000)
    })
    if (!r.ok) throw new Error('HTTP ' + r.status)
    const j = await r.json()
    if (j.code !== 0) throw new Error(j.msg || 'Failed')
    const url = j.data.hdplay || j.data.play
    if (!url) throw new Error('No video URL')
    return { url, title: j.data.title || '', author: j.data.author?.nickname || '', duration: j.data.duration || 0 }
}

async function downloadVideo(url) {
    const r = await fetch(url, {
        headers: { 'User-Agent': UA, 'Referer': 'https://www.tiktok.com/' },
        signal: AbortSignal.timeout(60000)
    })
    if (!r.ok) throw new Error('HTTP ' + r.status)
    const buf = Buffer.from(await r.arrayBuffer())
    if (!buf.length) throw new Error('Empty video')
    return buf
}

function formatNum(n) {
    if (!n) return '0'
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
    if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
    return n.toString()
}

// بناء كارت واحد
async function buildCard(conn, video, videoKey) {
    if (!video.videoUrl) return null
    const buffer = await downloadVideo(video.videoUrl)
    if (!buffer || buffer.length < 10000) return null

    VIDEO_CACHE.set(videoKey, {
        tiktokUrl: video.url,
        title: video.desc,
        author: video.author,
        duration: video.duration,
        timestamp: Date.now()
    })

    const { videoMessage } = await generateWAMessageContent(
        { video: buffer },
        { upload: conn.waUploadToServer }
    )

    const buttons = [{
        name: 'quick_reply',
        buttonParamsJson: JSON.stringify({
            display_text: '📥 بدون علامة',
            id: `.dlnowm ${videoKey}`
        })
    }]

    return {
        body: proto.Message.InteractiveMessage.Body.fromObject({
            text: `❤️ ${formatNum(video.likes)} | 💬 ${formatNum(video.comments)} | 👁️ ${formatNum(video.plays)}`
        }),
        footer: proto.Message.InteractiveMessage.Footer.fromObject({
            text: `👤 ${video.author} | ⏱️ ${video.duration}s`
        }),
        header: proto.Message.InteractiveMessage.Header.fromObject({
            title: video.desc.length > 50 ? video.desc.substring(0, 47) + '...' : video.desc,
            hasMediaAttachment: true,
            videoMessage
        }),
        nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({ buttons })
    }
}

async function sendCarousel(conn, chat, characterName, videos) {
    const selectedVideos = videos.slice(0, MAX_VIDEOS)
    const batchId = Date.now().toString(36)
    const cards = []
    const entries = [] // للنسخة النصية لو الكاروسيل فشل

    // نجهز الكروت على دفعات (بنفس الترتيب)
    for (let start = 0; start < selectedVideos.length; start += PARALLEL) {
        const chunk = selectedVideos.slice(start, start + PARALLEL)
        const built = await Promise.all(chunk.map(async (video, j) => {
            const i = start + j
            const videoKey = `nw_${batchId}_${i}`
            try {
                const card = await buildCard(conn, video, videoKey)
                return card ? { card, video, videoKey } : null
            } catch (err) {
                console.log('Card error:', err.message)
                return null
            }
        }))
        for (const b of built) {
            if (!b) continue
            cards.push(b.card)
            entries.push({ video: b.video, videoKey: b.videoKey })
        }
    }

    if (!cards.length) throw new Error('No cards')

    try {
        const msg = generateWAMessageFromContent(chat, {
            viewOnceMessage: {
                message: {
                    messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
                    interactiveMessage: proto.Message.InteractiveMessage.fromObject({
                        body: proto.Message.InteractiveMessage.Body.create({
                            text: `> ${theme.smallDivider}\n> 🜲⃝☠️ *اديـتات: ${characterName}*\n> 𖤐⃝🩸 ${cards.length} فيديو\n> ${theme.smallDivider}`
                        }),
                        footer: proto.Message.InteractiveMessage.Footer.create({ text: '⛩️ SUKUNA BOT ⛩️' }),
                        header: proto.Message.InteractiveMessage.Header.create({ hasMediaAttachment: false }),
                        carouselMessage: proto.Message.InteractiveMessage.CarouselMessage.fromObject({ cards })
                    })
                }
            }
        }, { userJid: conn.user?.id || conn.user?.jid })

        const relayOpts = { messageId: msg.key.id }
        if (!chat.endsWith('@g.us')) {
            relayOpts.additionalNodes = [
                { tag: 'biz', attrs: {}, content: [{ tag: 'interactive', attrs: { type: 'native_flow', v: '1' }, content: [{ tag: 'native_flow', attrs: { v: '9', name: 'mixed' } }] }] },
                { tag: 'bot', attrs: { biz_bot: '1' } }
            ]
        }
        await conn.relayMessage(chat, msg.message, relayOpts)
    } catch (err) {
        // نسخة نصية: قائمة + أمر تحميل لكل فيديو
        console.error('[edit-search] الكاروسيل فشل:', err?.message)
        const list = entries.slice(0, 10).map((e, i) =>
            `${i + 1}. ${e.video.desc.slice(0, 50)}\n   👤 ${e.video.author} | ⏱️ ${e.video.duration}s\n   ↬ .dlnowm ${e.videoKey}`
        ).join('\n\n')
        await conn.sendMessage(chat, {
            text: `> ${theme.smallDivider}\n> 🜲⃝☠️ *اديـتات: ${characterName}*\n> ${theme.smallDivider}\n\n${list}\n\n⛩️ SUKUNA BOT ⛩️`
        })
    }

    setTimeout(() => {
        for (const key of VIDEO_CACHE.keys()) {
            if (key.startsWith(`nw_${batchId}_`)) VIDEO_CACHE.delete(key)
        }
    }, 30 * 60 * 1000)
}

async function handleDownloadNoWM(m, conn, videoKey) {
    const send = t => conn.sendMessage(m.chat, { text: t })
    const info = VIDEO_CACHE.get(videoKey)
    if (!info) return send(`> ${theme.divider}\n> ❌ *انتهت صلاحية الزر*\n> 🕐 جرب البحث من جديد\n> ${theme.endDivider}`)

    try { await conn.sendMessage(m.chat, { react: { text: '⏳', key: m.key } }) } catch {}
    try {
        const video = await getVideoNoWatermark(info.tiktokUrl)
        const buffer = await downloadVideo(video.url)
        const caption = `> ${theme.divider}\n> 🎬 *${video.title.slice(0, 100)}*\n> 👤 ${video.author}\n> ⏱️ ${video.duration}s\n> ✅ بدون علامة مائية\n> ${theme.endDivider}`
        await conn.sendMessage(m.chat, { video: buffer, caption, mimetype: 'video/mp4' })
        try { await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } }) } catch {}
    } catch (err) {
        console.error('Download error:', err)
        try { await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } }) } catch {}
        await send(`❌ ${err.message}`)
    }
}

let handler = async (m, { conn, args, usedPrefix, command }) => {
    const chat = m.chat
    const send = t => conn.sendMessage(chat, { text: t })
    const react = async emoji => {
        try { await conn.sendMessage(chat, { react: { text: emoji, key: m.key } }) } catch {}
    }

    // زرار "بدون علامة"
    if (String(command).toLowerCase() === 'dlnowm') {
        const videoKey = (args[0] || '').trim()
        if (!videoKey) return
        return handleDownloadNoWM(m, conn, videoKey)
    }

    if (!args[0]) {
        await react('❌')
        return send(`> ${theme.divider}\n> \n> 🜲⃝☠️ *بـحـث الـاديـتات*\n> 𖤐⃝🩸 *بحث من تيك توك*\n> \n> ${theme.smallDivider}\n> \n> 👁️⃝🩸 الاستخدام:\n> ${usedPrefix}${command} <اسم الشخصية>\n> \n> ${theme.endDivider}`)
    }

    const characterName = args.join(' ')
    const searchQuery = `${characterName} edit`

    await react('🔍')
    await send(`> ${theme.divider}\n> \n> 🜲⃝☠️ *جـاري الـبـحـث*\n> 𖤐⃝🩸 *عن: ${characterName}*\n> \n> ${theme.endDivider}`)

    try {
        const videos = await searchTikTok(searchQuery, MAX_VIDEOS)
        if (!videos || videos.length === 0) {
            await react('❌')
            return send(`> ${theme.divider}\n> \n> 🜲⃝☠️ *خـطـأ*\n> 👁️⃝🩸 *ما لقيت اديتات لـ ${characterName}*\n> \n> ${theme.endDivider}`)
        }
        await sendCarousel(conn, chat, characterName, videos)
        await react('✅')
    } catch (err) {
        console.error('❌ Edit Search Error:', err)
        await react('❌')
        await send(`> ${theme.divider}\n> \n> 🜲⃝☠️ *خـطـأ*\n> 👁️⃝🩸 *${err.message}*\n> \n> ${theme.endDivider}`)
    }
}

handler.help = ['بحثتيك <اسم>']
handler.tags = ['downloader']
// ملحوظة: شلت "ايديت" من هنا عشان ما يتعارضش مع أمر ايديت التاني
handler.command = /^(بحثتيك|بحثتيكك|بحث_تيك|تيك|تيكتوك|dlnowm)$/i

export default handler