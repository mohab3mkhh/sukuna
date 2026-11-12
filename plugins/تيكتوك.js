// plugins/edit-search.js
// ⛩️ SUKUNA BOT - بحث إيديتات تيك توك 🎬

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
const SEND_COUNT = 5 // عدد الفيديوهات اللي بتتبعت فعليًا
const LIST_COUNT = 10 // عدد الباقي اللي بيظهر كقائمة

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

const isMp4 = buf => buf && buf.length > 12 && buf.subarray(4, 8).toString('latin1') === 'ftyp'

// بيجيب Buffer سليم للفيديو (من الرابط المباشر، وإلا من tikwm)
async function getVideoBuffer(video) {
    if (video.videoUrl) {
        try {
            const buf = await downloadVideo(video.videoUrl)
            if (buf.length >= 10000 && isMp4(buf)) return buf
        } catch (e) {
            console.log('[edit-search] الرابط المباشر فشل:', e.message)
        }
    }
    const nw = await getVideoNoWatermark(video.url)
    const buf = await downloadVideo(nw.url)
    if (buf.length < 10000 || !isMp4(buf)) throw new Error('فيديو غير سليم')
    return buf
}

// بنبعت الفيديوهات واحد واحد (أضمن من الكاروسيل اللي مش بيظهر عند كل الناس)
async function sendResults(conn, chat, characterName, videos) {
    const batchId = Date.now().toString(36)
    let sent = 0
    const rest = []

    for (let i = 0; i < videos.length; i++) {
        const video = videos[i]
        if (sent >= SEND_COUNT) { rest.push({ video, i }); continue }
        try {
            console.log(`[edit-search] تجهيز فيديو ${i + 1}/${videos.length}`)
            const buffer = await getVideoBuffer(video)
            const caption =
                `🎬 *${video.desc.slice(0, 80)}*\n` +
                `👤 ${video.author} | ⏱️ ${video.duration}s\n` +
                `❤️ ${formatNum(video.likes)} | 💬 ${formatNum(video.comments)} | 👁️ ${formatNum(video.plays)}\n\n` +
                `⛩️ SUKUNA BOT ⛩️`
            await conn.sendMessage(chat, { video: buffer, mimetype: 'video/mp4', caption })
            sent++
        } catch (err) {
            console.log('[edit-search] فيديو فشل:', err.message)
        }
    }

    if (!sent) throw new Error('معرفتش أجهز أي فيديو، جرب اسم تاني')

    // الباقي كقائمة بأوامر تحميل (بدون علامة مائية)
    const listItems = rest.slice(0, LIST_COUNT)
    if (listItems.length) {
        const lines = listItems.map(({ video, i }) => {
            const key = `nw_${batchId}_${i}`
            VIDEO_CACHE.set(key, { tiktokUrl: video.url, title: video.desc, author: video.author, duration: video.duration, timestamp: Date.now() })
            return `• ${video.desc.slice(0, 45)}\n  👤 ${video.author} | ⏱️ ${video.duration}s\n  ↬ .dlnowm ${key}`
        })
        await conn.sendMessage(chat, {
            text: `> ${theme.smallDivider}\n> 🜲⃝☠️ *المزيد من الاديتات: ${characterName}*\n> ${theme.smallDivider}\n\n${lines.join('\n\n')}\n\n⛩️ SUKUNA BOT ⛩️`
        })
        setTimeout(() => {
            for (const key of VIDEO_CACHE.keys()) {
                if (key.startsWith(`nw_${batchId}_`)) VIDEO_CACHE.delete(key)
            }
        }, 30 * 60 * 1000)
    }
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
        await send(`⏳ لقيت ${videos.length} نتيجة، جاري تجهيز أفضل ${SEND_COUNT} فيديوهات...`)
        await sendResults(conn, chat, characterName, videos)
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