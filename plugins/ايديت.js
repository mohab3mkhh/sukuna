/**
 * plugins/edit.js
 * ⛩️ SUKUNA BOT - .ايديت <اسم الشخصية>
 * تيك توك (كاروسيل فيديوهات) + يوتيوب (قائمة + اختيار جودة)
 * مبني على الملفين الشغالين: بحث تيك + يوتيوب
 */

import axios from 'axios'
import nodeFetch from 'node-fetch'
import fs from 'fs'
import path from 'path'
import os from 'os'
import * as _baileys from '@whiskeysockets/baileys'
import { sendButtons, btn, getButtonId } from '../lib/buttons.js'

const B = _baileys.generateWAMessageFromContent ? _baileys : (_baileys.default || _baileys)
const { proto, generateWAMessageFromContent, generateWAMessageContent } = B

const TMP = os.tmpdir()
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36'
const HEADERS = {
    'User-Agent': UA,
    'Origin': 'https://iframe.y2meta-uk.com',
    'Referer': 'https://iframe.y2meta-uk.com/'
}

const CARD_COUNT = 6
const SEARCH_COUNT = 15
const CONCURRENCY = 3
const YT_MAX = 10
const CACHE_TTL = 30 * 60 * 1000
const PREFIX = 'editdl_'

const VIDEO_QUALITIES = [
    { label: '360p', value: '360', emoji: '📱' },
    { label: '480p', value: '480', emoji: '📺' },
    { label: '720p HD', value: '720', emoji: '🎬' },
    { label: '1080p Full HD', value: '1080', emoji: '🎥' }
]
const AUDIO_QUALITIES = [
    { label: 'MP3 128kbps', value: '128', emoji: '🎵' },
    { label: 'MP3 256kbps', value: '256', emoji: '🎧' },
    { label: 'MP3 320kbps', value: '320', emoji: '🎼' }
]

if (!global.editBtnCache) global.editBtnCache = new Map()
const TT_CACHE = new Map()
const YT_CACHE = new Map()

const sleep = ms => new Promise(r => setTimeout(r, ms))
const genId = () => Math.random().toString(36).slice(2, 10)
const isMp4 = buf => buf && buf.length > 12 && buf.subarray(4, 8).toString('latin1') === 'ftyp'

function formatNum(n) {
    if (!n) return '0'
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
    if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
    return n.toString()
}

function formatSize(bytes) {
    if (!bytes || bytes < 1024) return bytes + ' B'
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'
    if (bytes < 1073741824) return (bytes / 1048576).toFixed(2) + ' MB'
    return (bytes / 1073741824).toFixed(2) + ' GB'
}

function durationToSec(str) {
    if (!str) return 0
    return str.split(':').reverse().reduce((s, p, i) => s + (parseInt(p) || 0) * 60 ** i, 0)
}

// ════════════════════════════════════════════
//                 تيك توك
// ════════════════════════════════════════════

async function searchTikTok(query, count = SEARCH_COUNT) {
    const cached = TT_CACHE.get(query)
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

    TT_CACHE.set(query, { results: videos, time: Date.now() })
    return videos.slice(0, count)
}

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

async function downloadTikVideo(url) {
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

async function getTikBuffer(video) {
    try {
        return await downloadTikVideo(await getVideoNoWatermark(video.url))
    } catch (e) {
        console.log('[edit] tikwm فشل:', e.message)
    }
    if (video.videoUrl) return await downloadTikVideo(video.videoUrl)
    throw new Error('مفيش مصدر')
}

async function processTikItem(video, conn) {
    const buffer = await getTikBuffer(video)
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

async function buildCards(videos, conn) {
    const results = []
    let idx = 0
    const workers = Array.from({ length: CONCURRENCY }, async () => {
        while (results.length < CARD_COUNT) {
            const i = idx++
            if (i >= videos.length) break
            try {
                const item = await processTikItem(videos[i], conn)
                if (results.length < CARD_COUNT) results.push(item)
            } catch (e) {
                console.log(`[edit] كارت ${i} فشل:`, e.message)
            }
        }
    })
    await Promise.all(workers)
    return results
}

async function sendTikTokCarousel(conn, m, name) {
    const videos = await searchTikTok(`${name} edit`)
    if (!videos.length) throw new Error('تيك توك: مفيش نتايج')

    const items = await buildCards(videos, conn)
    if (!items.length) throw new Error('تيك توك: فشل تحميل الفيديوهات')
    const cards = items.map(i => i.card)

    try {
        const msg = generateWAMessageFromContent(m.chat, {
            viewOnceMessage: {
                message: {
                    messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
                    interactiveMessage: proto.Message.InteractiveMessage.fromObject({
                        body: proto.Message.InteractiveMessage.Body.create({ text: `🎬 *اديتات تيك توك: ${name}*\n${cards.length} فيديو` }),
                        footer: proto.Message.InteractiveMessage.Footer.create({ text: 'SukunaBot' }),
                        header: proto.Message.InteractiveMessage.Header.create({ hasMediaAttachment: false }),
                        carouselMessage: proto.Message.InteractiveMessage.CarouselMessage.fromObject({ cards })
                    })
                }
            }
        }, { quoted: m })
        await conn.relayMessage(m.chat, msg.message, { messageId: msg.key.id })
    } catch (err) {
        console.error('[edit] الكاروسيل فشل:', err?.message)
        for (const it of items.slice(0, 3)) {
            await conn.sendMessage(m.chat, {
                video: it.buffer,
                mimetype: 'video/mp4',
                caption: `🎬 *${it.info.desc.slice(0, 80)}*\n👤 ${it.info.author}\n\n⛩️ SUKUNA BOT ⛩️`
            }, { quoted: m })
        }
    }
}

// ════════════════════════════════════════════
//                  يوتيوب
// ════════════════════════════════════════════

async function searchYouTube(query, limit = YT_MAX) {
    const key = query.toLowerCase().trim()
    const cached = YT_CACHE.get(key)
    if (cached && Date.now() - cached.time < CACHE_TTL) return cached.results.slice(0, limit)

    const res = await nodeFetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, {
        headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9', 'Cookie': 'SOCS=CAI' },
        timeout: 20000
    })
    if (!res.ok) throw new Error('HTTP ' + res.status)
    const html = await res.text()

    const match = html.match(/var ytInitialData = ({.+?});<\/script>/)
    if (!match) throw new Error('يوتيوب: ما لقيناش بيانات البحث')

    const data = JSON.parse(match[1])
    const contents = data.contents?.twoColumnSearchResultsRenderer?.primaryContents
        ?.sectionListRenderer?.contents || []

    const all = []
    for (const section of contents) {
        for (const item of section.itemSectionRenderer?.contents || []) {
            const v = item.videoRenderer
            if (!v) continue
            const thumbs = v.thumbnail?.thumbnails || []
            all.push({
                id: v.videoId,
                title: v.title?.runs?.[0]?.text || '',
                author: v.ownerText?.runs?.[0]?.text || '',
                duration: v.lengthText?.simpleText || '',
                views: v.viewCountText?.simpleText || '',
                thumbnail: thumbs[thumbs.length - 1]?.url || `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`
            })
        }
    }

    // الايديتات غالباً قصيرة: نفضّل أقل من 4 دقايق
    const short = all.filter(v => {
        const s = durationToSec(v.duration)
        return s > 0 && s <= 240
    })
    const videos = (short.length >= 3 ? short : all).slice(0, limit)

    YT_CACHE.set(key, { results: videos, time: Date.now() })
    if (YT_CACHE.size > 50) YT_CACHE.delete(YT_CACHE.keys().next().value)
    return videos
}

async function getThumbBuffer(url, fallback) {
    for (const u of [url, fallback].filter(Boolean)) {
        try {
            const r = await axios.get(u, { headers: { 'User-Agent': UA }, responseType: 'arraybuffer', timeout: 15000 })
            if (r.data?.length > 1000) return Buffer.from(r.data)
        } catch {}
    }
    return null
}

async function getDownloadKey(videoId) {
    const r = await axios.get(`https://cnv.cx/v2/sanity/key?id=${videoId}`, { headers: HEADERS, timeout: 20000 })
    if (!r.data?.key) throw new Error('فشل جلب المفتاح')
    return r.data.key
}

async function convertVideo(videoId, options) {
    const key = await getDownloadKey(videoId)
    await sleep(1500)

    const params = new URLSearchParams({
        link: `https://youtu.be/${videoId}`,
        format: options.format,
        videoQuality: options.videoQuality,
        filenameStyle: 'pretty',
        vCodec: 'h264'
    })
    if (options.format === 'mp3' && options.audioBitrate) params.set('audioBitrate', options.audioBitrate)

    const r = await axios.post('https://cnv.cx/v2/converter', params.toString(), {
        headers: { ...HEADERS, 'Content-Type': 'application/x-www-form-urlencoded', 'accept': '*/*', 'key': key },
        timeout: 120000,
        validateStatus: () => true
    })

    if (r.status === 200 && r.data?.url) return r.data
    if (r.data?.errorMsg) throw new Error(r.data.errorMsg)
    throw new Error('فشل التحويل: ' + r.status)
}

async function downloadBuffer(url, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            const r = await axios.get(url, {
                headers: { 'User-Agent': UA, 'Referer': 'https://cnv.cx/', 'Origin': 'https://cnv.cx' },
                timeout: 600000,
                responseType: 'arraybuffer',
                maxRedirects: 5,
                maxContentLength: Infinity,
                maxBodyLength: Infinity,
                validateStatus: () => true
            })
            if (r.status === 200 && r.data?.length > 10000) return Buffer.from(r.data)
        } catch (e) {
            console.log(`[edit DL] Attempt ${i + 1} failed: ${e.message}`)
        }
        if (i < retries - 1) await sleep(2000)
    }
    throw new Error('الملف فاضي بعد 3 محاولات')
}

function cacheBtn(data) {
    const id = genId()
    global.editBtnCache.set(id, { ...data, createdAt: Date.now() })
    return PREFIX + id
}

async function sendYouTubeList(conn, m, name) {
    const videos = await searchYouTube(`${name} edit`)
    if (!videos.length) throw new Error('يوتيوب: مفيش نتايج')

    const rows = videos.map((v, i) => ({
        title: `${i + 1}. ${v.title.slice(0, 50)}`,
        description: `👤 ${v.author} | ⏱️ ${v.duration} | 👁️ ${(v.views || '').replace(/\s*views?/i, '').trim()}`,
        id: cacheBtn({ type: 'quality_menu', videoId: v.id, title: v.title, author: v.author })
    }))

    const thumb = await getThumbBuffer(videos[0].thumbnail, `https://i.ytimg.com/vi/${videos[0].id}/hqdefault.jpg`)

    await sendButtons(conn, m.chat, {
        title: '📺 اديتات يوتيوب',
        subtitle: name,
        text: `📺 *اديتات يوتيوب:* ${name}\n📊 *النتائج:* ${videos.length}`,
        footer: '⛩️ SUKUNA BOT',
        image: thumb || `https://i.ytimg.com/vi/${videos[0].id}/hqdefault.jpg`,
        buttons: [btn.list('🎞️ اختر ايديت', [{ title: 'النتائج', rows }])]
    }, m)
}

async function showQualityMenu(conn, m, videoId, title, author) {
    const videoRows = VIDEO_QUALITIES.map(q => ({
        title: `${q.emoji} ${q.label}`,
        description: 'فيديو MP4',
        id: cacheBtn({ type: 'video', videoId, quality: q.value, title })
    }))
    const audioRows = AUDIO_QUALITIES.map(q => ({
        title: `${q.emoji} ${q.label}`,
        description: 'صوت MP3',
        id: cacheBtn({ type: 'audio', videoId, quality: q.value, title })
    }))

    const thumb = await getThumbBuffer(`https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`, `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`)

    await sendButtons(conn, m.chat, {
        title: '🎬 اختر الجودة',
        subtitle: title.slice(0, 60),
        text: `🎬 *${title.slice(0, 80)}*\n\n👤 *القناة:* ${author}\n\n🎚️ *اختر الجودة:*`,
        footer: '⛩️ SUKUNA BOT',
        image: thumb || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        buttons: [
            btn.list('🎬 جودات الفيديو', [{ title: 'MP4', rows: videoRows }]),
            btn.list('🎵 جودات الصوت', [{ title: 'MP3', rows: audioRows }])
        ]
    }, m)
}

async function handleQualitySelect(m, conn, data) {
    const isVideo = data.type === 'video'
    const quality = (isVideo ? VIDEO_QUALITIES : AUDIO_QUALITIES).find(q => q.value === data.quality)
    if (!quality) return m.reply('❌ جودة غير معروفة')

    const { emoji, label } = quality

    await conn.sendMessage(m.chat, { react: { text: '⏳', key: m.key } })
    const statusMsg = await m.reply(`⏳ *جاري تحضير ${emoji} ${label}...*`)

    try {
        const options = isVideo
            ? { format: 'mp4', videoQuality: quality.value }
            : { format: 'mp3', audioBitrate: quality.value, videoQuality: '720' }

        const result = await convertVideo(data.videoId, options)

        await conn.sendMessage(m.chat, { text: `⬇️ *جاري تحميل ${emoji} ${label}...*`, edit: statusMsg.key })

        const buffer = await downloadBuffer(result.url)
        if (!buffer || buffer.length < 10000) throw new Error('الملف صغير جداً')

        const sizeStr = formatSize(buffer.length)
        try { await conn.sendMessage(m.chat, { delete: statusMsg.key }) } catch {}

        const ext = isVideo ? 'mp4' : 'mp3'
        const outFile = path.join(TMP, `edit_${Date.now()}.${ext}`)
        fs.writeFileSync(outFile, buffer)
        try {
            if (isVideo) {
                await conn.sendMessage(m.chat, {
                    video: { url: outFile },
                    mimetype: 'video/mp4',
                    fileName: result.filename || `${data.title}.mp4`,
                    caption: `🎬 *${data.title.slice(0, 80)}*\n\n${emoji} *الجودة:* ${label}\n📦 *الحجم:* ${sizeStr}`
                }, { quoted: m })
            } else {
                await conn.sendMessage(m.chat, {
                    audio: { url: outFile },
                    mimetype: 'audio/mpeg',
                    fileName: result.filename || `${data.title}.mp3`,
                    ptt: false
                }, { quoted: m })
            }
            await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } })
        } finally {
            setTimeout(() => { try { fs.unlinkSync(outFile) } catch {} }, 180000)
        }
    } catch (e) {
        console.error('[edit dl]', e.message)
        try { await conn.sendMessage(m.chat, { delete: statusMsg.key }) } catch {}
        await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } })
        m.reply(`❌ فشل التحميل\n\n${e.message}\n\n💡 جرب جودة أقل`)
    }
}

// ════════════════════════════════════════════
//                 بينترست
// ════════════════════════════════════════════

async function sendPinterestList(conn, m, name) {
    const q = `${name} edit`

    let pinterest = null
    try {
        const scraper = await import('../lib/scraper.js')
        pinterest = scraper.pinterest
    } catch {}

    const sources = []
    if (pinterest?.search) {
        sources.push(async () => {
            const response = await pinterest.search(q, 6)
            return response.result.pins.slice(0, 6).map(pin => pin.media.images.orig.url)
        })
    }
    sources.push(
        async () => {
            const res = await axios.get(`https://api.siputzx.my.id/api/s/pinterest?query=${encodeURIComponent(q)}`, { timeout: 20000 })
            return res.data.data.slice(0, 6).map(r => r.images_url)
        },
        async () => {
            const res = await axios.get(`https://api.dorratz.com/v2/pinterest?q=${encodeURIComponent(q)}`, { timeout: 20000 })
            return res.data.slice(0, 6).map(r => r.image)
        },
        async () => {
            const res = await axios.get(`https://pinterest-api-one.vercel.app/?q=${encodeURIComponent(q)}`, { timeout: 20000 })
            return res.data.images?.slice(0, 6) || []
        }
    )

    let images = []
    for (const source of sources) {
        try {
            images = (await source()).filter(Boolean)
            if (images.length) break
        } catch (e) {
            console.error('[edit pinterest]', e.message)
        }
    }
    if (!images.length) throw new Error('بينترست: مفيش نتايج')

    const rows = images.map((img, i) => ({
        title: `📸 صورة ${i + 1}`,
        description: `نتيجة البحث رقم ${i + 1}`,
        id: cacheBtn({ type: 'pin', url: img, index: i })
    }))

    await sendButtons(conn, m.chat, {
        title: '📌 Pinterest',
        subtitle: name,
        text: `📌 *بينترست:* ${name}\n📊 *عدد الصور:* ${images.length}`,
        footer: '⛩️ SUKUNA BOT',
        image: images[0],
        buttons: [
            btn.list('📸 اختر صورة', [{ title: `🔍 ${name}`.slice(0, 24), rows }]),
            btn.url('🔗 فتح في Pinterest', `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(q)}`)
        ]
    }, m)
}

// ════════════════════════════════════════════
//             معالج الأزرار + الأمر
// ════════════════════════════════════════════

let before = async (m, { conn }) => {
    try {
        const buttonId = getButtonId(m)
        if (!buttonId || !buttonId.startsWith(PREFIX)) return false

        const data = global.editBtnCache.get(buttonId.slice(PREFIX.length))
        if (!data) return false
        global.editBtnCache.delete(buttonId.slice(PREFIX.length))

        if (data.type === 'quality_menu') {
            await showQualityMenu(conn, m, data.videoId, data.title, data.author)
            return true
        }
        if (data.type === 'video' || data.type === 'audio') {
            await handleQualitySelect(m, conn, data)
            return true
        }
        if (data.type === 'pin') {
            await conn.sendMessage(m.chat, {
                image: { url: data.url },
                caption: `📌 *الصورة رقم ${data.index + 1}*\n\n⛩️ SUKUNA BOT`
            }, { quoted: m })
            return true
        }
        return false
    } catch (e) {
        console.error('[edit before]', e.message)
        return false
    }
}

let handler = async (m, { conn, args, usedPrefix, command }) => {
    const chat = m.chat
    const react = async emoji => { try { await conn.sendMessage(chat, { react: { text: emoji, key: m.key } }) } catch {} }

    if (!args[0]) {
        await react('❌')
        return conn.sendMessage(chat, {
            text: `🎞️ *ايديت*\n\n${usedPrefix}${command} <اسم الشخصية>\n\n💡 مثال:\n${usedPrefix}${command} زورو\n${usedPrefix}${command} ناروتو\n\n⛩️ SUKUNA BOT ⛩️`
        }, { quoted: m })
    }

    const name = args.join(' ').trim()
    await react('🔍')
    await conn.sendMessage(chat, { text: `🔍 *جاري البحث عن اديتات:* ${name}\n📡 تيك توك + يوتيوب + بينترست` }, { quoted: m })

    const results = await Promise.allSettled([
        sendTikTokCarousel(conn, m, name),
        sendYouTubeList(conn, m, name),
        sendPinterestList(conn, m, name)
    ])

    results.forEach((r, i) => {
        if (r.status === 'rejected') console.error(`[edit ${['tiktok', 'youtube', 'pinterest'][i]}]`, r.reason?.message)
    })

    if (results.every(r => r.status === 'rejected')) {
        await react('❌')
        return conn.sendMessage(chat, {
            text: `❌ ما لقيت اديتات لـ *${name}*\n\n💡 جرب اسم تاني أو بالإنجليزي\n\n⛩️ SUKUNA BOT ⛩️`
        }, { quoted: m })
    }

    await react('✅')
}

setInterval(() => {
    const now = Date.now()
    for (const [k, v] of global.editBtnCache.entries()) {
        if (now - v.createdAt > CACHE_TTL) global.editBtnCache.delete(k)
    }
}, 5 * 60 * 1000)

handler.before = before
handler.help = ['ايديت <اسم الشخصية>']
handler.tags = ['downloader']
handler.command = /^(ايديت|edit)$/i

export default handler