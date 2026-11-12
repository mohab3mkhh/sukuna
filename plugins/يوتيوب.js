/**
 * plugins/يوتيوب.js
 * يوتيوب بحث وتحميل
 */

import axios from 'axios'
import fetch from 'node-fetch'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { generateWAMessageContent } from '@whiskeysockets/baileys'

// ✅ استخدام ملف الأزرار
import { sendButtons, btn, getButtonId } from '../lib/buttons.js'

const TMP = os.tmpdir()
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36'

const HEADERS = {
    'User-Agent': UA,
    'Origin': 'https://iframe.y2meta-uk.com',
    'Referer': 'https://iframe.y2meta-uk.com/'
}

const VIDEO_QUALITIES = [
    { label: '360p', value: '360', emoji: '📱' },
    { label: '480p', value: '480', emoji: '📺' },
    { label: '720p HD', value: '720', emoji: '🎬' },
    { label: '1080p Full HD', value: '1080', emoji: '🎥' },
    { label: '1440p 2K', value: '1440', emoji: '💎' },
    { label: '2160p 4K', value: '2160', emoji: '🌟' }
]

const AUDIO_QUALITIES = [
    { label: 'MP3 128kbps', value: '128', emoji: '🎵' },
    { label: 'MP3 256kbps', value: '256', emoji: '🎧' },
    { label: 'MP3 320kbps', value: '320', emoji: '🎼' }
]

const MAX_VIDEOS = 10

if (!global.ytCache) global.ytCache = new Map()
if (!global.ytSearchCache) global.ytSearchCache = new Map()

function extractVideoId(url) {
    const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
        /^([a-zA-Z0-9_-]{11})$/
    ]
    for (const p of patterns) {
        const m = url.match(p)
        if (m) return m[1]
    }
    return null
}

function genId() {
    return Math.random().toString(36).slice(2, 10)
}

async function searchYouTube(query, limit = 10) {
    const cacheKey = query.toLowerCase().trim()
    const cached = global.ytSearchCache.get(cacheKey)
    if (cached && Date.now() - cached.time < 30 * 60 * 1000) {
        return cached.results.slice(0, limit)
    }

    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`
    const res = await fetch(url, {
        headers: {
            'User-Agent': UA,
            'Accept-Language': 'en-US,en;q=0.9',
            'Cookie': 'SOCS=CAI'
        },
        timeout: 20000
    })

    if (!res.ok) throw new Error('HTTP ' + res.status)
    const html = await res.text()

    const match = html.match(/var ytInitialData = ({.+?});<\/script>/)
    if (!match) throw new Error('ما لقيناش بيانات البحث')

    const data = JSON.parse(match[1])
    const contents = data.contents?.twoColumnSearchResultsRenderer?.primaryContents
        ?.sectionListRenderer?.contents || []

    const videos = []
    for (const section of contents) {
        const items = section.itemSectionRenderer?.contents || []
        for (const item of items) {
            const v = item.videoRenderer
            if (!v) continue
            const thumbs = v.thumbnail?.thumbnails || []
            videos.push({
                id: v.videoId,
                title: v.title?.runs?.[0]?.text || '',
                author: v.ownerText?.runs?.[0]?.text || '',
                duration: v.lengthText?.simpleText || '',
                views: v.viewCountText?.simpleText || '',
                published: v.publishedTimeText?.simpleText || '',
                thumbnail: thumbs[thumbs.length - 1]?.url || `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`
            })
            if (videos.length >= limit) break
        }
        if (videos.length >= limit) break
    }

    global.ytSearchCache.set(cacheKey, { results: videos, time: Date.now() })
    if (global.ytSearchCache.size > 50) {
        const firstKey = global.ytSearchCache.keys().next().value
        global.ytSearchCache.delete(firstKey)
    }

    return videos
}

async function getVideoInfo(videoId) {
    const r = await axios.get(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`, {
        headers: { 'User-Agent': UA },
        timeout: 20000
    })
    return {
        title: r.data?.title || 'YouTube Video',
        author: r.data?.author_name || 'Unknown',
        thumbnail: `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
        thumbnailFallback: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
    }
}

async function getDownloadKey(videoId) {
    const r = await axios.get(`https://cnv.cx/v2/sanity/key?id=${videoId}`, {
        headers: HEADERS,
        timeout: 20000
    })
    if (!r.data?.key) throw new Error('فشل جلب المفتاح')
    return r.data.key
}

async function convertVideo(videoId, options) {
    const key = await getDownloadKey(videoId)
    await new Promise(r => setTimeout(r, 1500))

    const params = new URLSearchParams({
        link: `https://youtu.be/${videoId}`,
        format: options.format,
        videoQuality: options.videoQuality,
        filenameStyle: 'pretty',
        vCodec: 'h264'
    })

    if (options.format === 'mp3' && options.audioBitrate) {
        params.set('audioBitrate', options.audioBitrate)
    }

    const r = await axios.post('https://cnv.cx/v2/converter', params.toString(), {
        headers: {
            ...HEADERS,
            'Content-Type': 'application/x-www-form-urlencoded',
            'accept': '*/*',
            'key': key
        },
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
                headers: {
                    'User-Agent': UA,
                    'Referer': 'https://cnv.cx/',
                    'Origin': 'https://cnv.cx'
                },
                timeout: 600000,
                responseType: 'arraybuffer',
                maxRedirects: 5,
                maxContentLength: Infinity,
                maxBodyLength: Infinity,
                validateStatus: () => true
            })
            if (r.status === 200 && r.data?.length > 10000) {
                return Buffer.from(r.data)
            }
        } catch (e) {
            console.log(`[DL] Attempt ${i + 1} failed: ${e.message}`)
        }
        if (i < retries - 1) await new Promise(r => setTimeout(r, 2000))
    }
    throw new Error('الملف فاضي بعد 3 محاولات')
}

async function getThumbBuffer(url, fallback) {
    const urls = [url, fallback].filter(Boolean)
    for (const u of urls) {
        try {
            const r = await axios.get(u, {
                headers: { 'User-Agent': UA },
                responseType: 'arraybuffer',
                timeout: 15000
            })
            if (r.data?.length > 1000) return Buffer.from(r.data)
        } catch {}
    }
    return null
}

function formatSize(bytes) {
    if (!bytes || bytes < 1024) return bytes + ' B'
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'
    if (bytes < 1073741824) return (bytes / 1048576).toFixed(2) + ' MB'
    return (bytes / 1073741824).toFixed(2) + ' GB'
}

function cleanViews(str) {
    return str.replace(/\s*views?/i, '').trim()
}

// ✅ إرسال نتيجة البحث باستخدام sendButtons
async function sendSearchResults(conn, m, query, videos) {
    const selected = videos.slice(0, MAX_VIDEOS)

    // بناء أزرار القائمة
    const rows = selected.map((v, i) => {
        const btnId = genId()
        global.ytCache.set(btnId, {
            videoId: v.id,
            type: 'quality_menu',
            title: v.title,
            author: v.author,
            createdAt: Date.now()
        })
        return {
            title: `${i + 1}. ${v.title.slice(0, 50)}`,
            description: `👤 ${v.author} | ⏱️ ${v.duration} | 👁️ ${cleanViews(v.views)}`,
            id: `ytdl_${btnId}`
        }
    })

    // صورة الغلاف لأول فيديو
    const thumb = await getThumbBuffer(selected[0]?.thumbnail, `https://i.ytimg.com/vi/${selected[0]?.id}/hqdefault.jpg`)

    await sendButtons(conn, m.chat, {
        title: '🎬 YouTube',
        subtitle: query,
        text: `🔍 *بحث يوتيوب:* ${query}\n📊 *النتائج:* ${selected.length}`,
        footer: '⛩️ SUKUNA BOT',
        image: thumb || 'https://i.ytimg.com/vi/' + (selected[0]?.id || 'dQw4w9WgXcQ') + '/hqdefault.jpg',
        buttons: [btn.list('🎬 اختر فيديو', [{
            title: 'النتائج',
            rows
        }])]
    }, m)
}

// ✅ عرض قائمة الجودات
async function showQualityMenu(conn, m, videoId, title, author) {
    // جودات الفيديو
    const videoRows = VIDEO_QUALITIES.map(q => {
        const btnId = genId()
        global.ytCache.set(btnId, {
            videoId,
            type: 'video',
            quality: q.value,
            title,
            createdAt: Date.now()
        })
        return {
            title: `${q.emoji} ${q.label}`,
            description: 'فيديو MP4',
            id: `ytdl_${btnId}`
        }
    })

    // جودات الصوت
    const audioRows = AUDIO_QUALITIES.map(q => {
        const btnId = genId()
        global.ytCache.set(btnId, {
            videoId,
            type: 'audio',
            quality: q.value,
            title,
            createdAt: Date.now()
        })
        return {
            title: `${q.emoji} ${q.label}`,
            description: 'صوت MP3',
            id: `ytdl_${btnId}`
        }
    })

    const thumb = await getThumbBuffer(`https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`, `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`)

    await sendButtons(conn, m.chat, {
        title: '🎬 اختر الجودة',
        subtitle: title.slice(0, 60),
        text: `🎬 *${title.slice(0, 80)}*\n\n👤 *القناة:* ${author}\n\n🎚️ *اختر الجودة:*`,
        footer: '⛩️ SUKUNA BOT',
        image: thumb || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        buttons: [
            btn.list('🎬 جودات الفيديو', [{
                title: 'MP4',
                rows: videoRows
            }]),
            btn.list('🎵 جودات الصوت', [{
                title: 'MP3',
                rows: audioRows
            }])
        ]
    }, m)
}

// ✅ معالج التحميل بعد اختيار الجودة
async function handleQualitySelect(m, conn, data) {
    const isVideo = data.type === 'video'
    const quality = isVideo
        ? VIDEO_QUALITIES.find(q => q.value === data.quality)
        : AUDIO_QUALITIES.find(q => q.value === data.quality)

    if (!quality) return m.reply('❌ جودة غير معروفة')

    const emoji = quality.emoji
    const label = quality.label

    await conn.sendMessage(m.chat, { react: { text: '⏳', key: m.key } })
    const statusMsg = await m.reply(`⏳ *جاري تحضير ${emoji} ${label}...*`)

    try {
        const options = isVideo
            ? { format: 'mp4', videoQuality: quality.value }
            : { format: 'mp3', audioBitrate: quality.value, videoQuality: '720' }

        const result = await convertVideo(data.videoId, options)

        await conn.sendMessage(m.chat, {
            text: `⬇️ *جاري تحميل ${emoji} ${label}...*`,
            edit: statusMsg.key
        })

        const buffer = await downloadBuffer(result.url)

        if (!buffer || buffer.length < 10000) {
            throw new Error('الملف صغير جداً')
        }

        const sizeStr = formatSize(buffer.length)

        try { await conn.sendMessage(m.chat, { delete: statusMsg.key }) } catch {}

        if (isVideo) {
            const outFile = path.join(TMP, `cnv_${Date.now()}.mp4`)
            fs.writeFileSync(outFile, buffer)
            try {
                await conn.sendMessage(m.chat, {
                    video: { url: outFile },
                    mimetype: 'video/mp4',
                    fileName: result.filename || `${data.title}.mp4`,
                    caption: `🎬 *${data.title.slice(0, 80)}*\n\n${emoji} *الجودة:* ${label}\n📦 *الحجم:* ${sizeStr}`
                }, { quoted: m })
                await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } })
            } finally {
                setTimeout(() => { try { fs.unlinkSync(outFile) } catch {} }, 180000)
            }
        } else {
            const outFile = path.join(TMP, `cnv_${Date.now()}.mp3`)
            fs.writeFileSync(outFile, buffer)
            try {
                await conn.sendMessage(m.chat, {
                    audio: { url: outFile },
                    mimetype: 'audio/mpeg',
                    fileName: result.filename || `${data.title}.mp3`,
                    ptt: false
                }, { quoted: m })
                await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } })
            } finally {
                setTimeout(() => { try { fs.unlinkSync(outFile) } catch {} }, 180000)
            }
        }
    } catch (e) {
        console.error('[yt dl]', e.message)
        try { await conn.sendMessage(m.chat, { delete: statusMsg.key }) } catch {}
        await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } })
        m.reply(`❌ فشل التحميل\n\n${e.message}\n\n💡 جرب جودة أقل`)
    }
}

// ✅ معالج الأزرار
let before = async (m, { conn }) => {
    try {
        const buttonId = getButtonId(m)
        if (!buttonId || !buttonId.startsWith('ytdl_')) return false

        const btnId = buttonId.replace('ytdl_', '')
        const data = global.ytCache.get(btnId)
        if (!data) return false

        // امسح فوراً — لمنع التكرار
        global.ytCache.delete(btnId)

        if (data.type === 'quality_menu') {
            await showQualityMenu(conn, m, data.videoId, data.title, data.author)
            return true
        }

        if (data.type === 'video' || data.type === 'audio') {
            await handleQualitySelect(m, conn, data)
            return true
        }

        return false
    } catch (e) {
        console.error('[before]', e.message)
        return false
    }
}

let handler = async (m, { conn, text, usedPrefix, command }) => {
    const input = (text || '').trim()

    if (!input) {
        return m.reply(`🎬 *يوتيوب*\n\n🔍 *بحث:*\n${usedPrefix}${command} <كلمة>\n\n📥 *تحميل:*\n${usedPrefix}${command} <رابط>\n\n💡 *مثال:*\n${usedPrefix}${command} cats\n${usedPrefix}${command} https://youtu.be/dQw4w9WgXcQ`)
    }

    const videoId = extractVideoId(input)

    if (videoId) {
        await m.react('⏳')
        try {
            const info = await getVideoInfo(videoId)
            await showQualityMenu(conn, m, videoId, info.title, info.author)
            await m.react('✅')
        } catch (e) {
            await m.react('❌')
            m.reply('❌ ' + e.message)
        }
        return
    }

    await m.react('🔍')
    const wait = await m.reply(`🔍 *جاري البحث عن: ${input}*`)

    try {
        const results = await searchYouTube(input, MAX_VIDEOS)
        if (!results.length) {
            await m.react('❌')
            return conn.sendMessage(m.chat, { text: '❌ مفيش نتايج', edit: wait.key })
        }

        try { await conn.sendMessage(m.chat, { delete: wait.key }) } catch {}
        await sendSearchResults(conn, m, input, results)
        await m.react('✅')
    } catch (e) {
        console.error('[yt search]', e.message)
        await m.react('❌')
        await conn.sendMessage(m.chat, { text: '❌ ' + e.message, edit: wait.key })
    }
}

// كل 5 دقايق: نمسح الزراير القديمة
setInterval(() => {
    const now = Date.now()
    for (const [k, v] of global.ytCache.entries()) {
        if (now - v.createdAt > 30 * 60 * 1000) {
            global.ytCache.delete(k)
        }
    }
}, 5 * 60 * 1000)

handler.before = before
handler.help = ['يوتيوب <كلمة أو رابط>']
handler.tags = ['search', 'downloader']
handler.command = /^(يوتيوب|yt|cnv|cnvdown|يوتيوب_بحث)$/i

export default handler