/**
 * plugins/applemusic.js
 * بحث Apple Music + إصلاح إرسال صورة الغلاف + محاولة تحميل الصوت عبر /download/soundcloud
 */

import axios from 'axios'
import { sendButtons, btn, getButtonId } from '../lib/buttons.js'

const SEARCH_ENDPOINT = 'https://prexzyapis.com/search/applemusic'
const SC_DL_ENDPOINT = 'https://prexzyapis.com/download/soundcloud'
const MAX_ITEMS = 10
const TTL_MS = 30 * 60 * 1000
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

if (!global.appleMusicCache) global.appleMusicCache = new Map()

function genId() {
    return Math.random().toString(36).slice(2, 10)
}

// تنظيف اسم الفنان من أي نص زائد ملتصق به مثل "Lyrics: ..."
function cleanArtist(rawArtist) {
    let s = String(rawArtist || 'غير معروف').trim()
    s = s.replace(/Lyrics\s*:.*$/i, '').trim()
    return s || 'غير معروف'
}

// تحسين رابط صورة Apple Music (مثلاً تكبير المقاس أو تجربة jpg)
function buildImageCandidates(rawUrl) {
    const u = String(rawUrl || '').trim()
    if (!/^https?:\/\//i.test(u)) return []

    const list = [u]
    // أحياناً تغيير 110x110bb.webp إلى 600x600bb.jpg يعطي صورة أوضح وأسهل في الإرسال
    const upscaledJpg = u.replace(/\/\d+x\d+([a-z]{2})\.webp$/i, '/600x600$1.jpg')
    if (upscaledJpg !== u) list.unshift(upscaledJpg)

    const upscaledWebp = u.replace(/\/\d+x\d+([a-z]{2})\.webp$/i, '/600x600$1.webp')
    if (upscaledWebp !== u && !list.includes(upscaledWebp)) list.unshift(upscaledWebp)

    return list
}

function normalizeTrack(raw, index) {
    const title = String(raw?.title || raw?.name || `نتيجة ${index + 1}`).trim()
    const artist = cleanArtist(raw?.artist || raw?.singer || raw?.author)
    const link = String(raw?.link || raw?.url || '').trim()
    const image = String(raw?.image || raw?.cover || raw?.thumbnail || '').trim()

    return {
        index: index + 1,
        title,
        artist,
        link,
        image
    }
}

async function searchAppleMusic(query) {
    const res = await axios.get(SEARCH_ENDPOINT, {
        params: { q: query },
        timeout: 20000,
        headers: {
            'User-Agent': UA,
            'Accept': 'application/json'
        },
        validateStatus: () => true
    })

    if (res.status >= 400) {
        throw new Error(`HTTP ${res.status}`)
    }

    const d = res.data
    const list =
        (Array.isArray(d?.data) && d.data) ||
        (Array.isArray(d?.result) && d.result) ||
        (Array.isArray(d?.results) && d.results) ||
        []

    if (!list.length) return []
    return list.slice(0, MAX_ITEMS).map((item, i) => normalizeTrack(item, i))
}

// استخراج رابط صوتي مباشر أو Buffer من /download/soundcloud
function extractAudioUrlFromJson(payload) {
    if (!payload || typeof payload !== 'object') return null

    const candidates = [
        payload.url,
        payload.download,
        payload.downloadUrl,
        payload.audio,
        payload.audioUrl,
        payload.stream,
        payload.result?.url,
        payload.result?.download,
        payload.result?.downloadUrl,
        payload.result?.audio,
        payload.data?.url,
        payload.data?.download,
        payload.data?.downloadUrl,
        payload.data?.audio
    ]

    for (const c of candidates) {
        if (typeof c === 'string' && /^https?:\/\//i.test(c.trim())) {
            return c.trim()
        }
    }
    return null
}

async function fetchSoundCloudAudio(track) {
    const cleanTitle = track.title
        .replace(/\(.*?\)/g, '')
        .replace(/-\s*Single$/i, '')
        .trim()
    const cleanArtistName = track.artist
        .replace(/^(Song|Artist|Album|Playlist)\s*[·•\-–]?\s*/i, '')
        .trim()

    const searchTerm = [cleanTitle, cleanArtistName].filter(Boolean).join(' ')
    if (!searchTerm) return null

    // نجرب تمرير q أولاً (لأن /download/soundcloud في هذا الـ API قد يقبل q أو url)
    const paramVariants = [
        { q: searchTerm },
        ...(track.link ? [{ url: track.link }] : [])
    ]

    for (const params of paramVariants) {
        try {
            const res = await axios.get(SC_DL_ENDPOINT, {
                params,
                timeout: 30000,
                responseType: 'arraybuffer',
                headers: {
                    'User-Agent': UA,
                    'Accept': 'audio/*, application/json, */*'
                },
                validateStatus: () => true
            })

            if (res.status >= 400 || !res.data) continue

            const buf = Buffer.from(res.data)
            const contentType = String(res.headers['content-type'] || '').toLowerCase()

            // لو الـ API رجّع ملف صوتي مباشرة
            if (contentType.includes('audio/') || (buf.length > 50000 && !contentType.includes('application/json'))) {
                return {
                    buffer: buf,
                    mimetype: contentType.includes('audio/') ? contentType.split(';')[0] : 'audio/mpeg'
                }
            }

            // لو الـ API رجّع JSON يحتوي على رابط تحميل صوتي
            if (contentType.includes('application/json') || buf[0] === 0x7b) {
                try {
                    const json = JSON.parse(buf.toString('utf8'))
                    const audioUrl = extractAudioUrlFromJson(json)
                    if (audioUrl) {
                        const audioRes = await axios.get(audioUrl, {
                            responseType: 'arraybuffer',
                            timeout: 60000,
                            headers: { 'User-Agent': UA },
                            validateStatus: () => true
                        })
                        if (audioRes.status < 400 && audioRes.data) {
                            const audioBuf = Buffer.from(audioRes.data)
                            const aType = String(audioRes.headers['content-type'] || 'audio/mpeg').split(';')[0]
                            if (audioBuf.length > 10000) {
                                return {
                                    buffer: audioBuf,
                                    mimetype: aType.includes('audio/') ? aType : 'audio/mpeg'
                                }
                            }
                        }
                    }
                } catch {}
            }
        } catch {}
    }

    return null
}

// إرسال صورة بأمان مع معالجة webp وتحميلها كـ Buffer لتفادي فشل رابط الصورة في واتساب
async function sendTrackImageSafely(conn, m, rawImageUrl, caption) {
    const candidates = buildImageCandidates(rawImageUrl)

    for (const imgUrl of candidates) {
        try {
            const imgRes = await axios.get(imgUrl, {
                responseType: 'arraybuffer',
                timeout: 20000,
                headers: {
                    'User-Agent': UA,
                    'Accept': 'image/*,*/*;q=0.8'
                },
                validateStatus: () => true
            })

            if (imgRes.status >= 400 || !imgRes.data) continue

            const buf = Buffer.from(imgRes.data)
            if (buf.length < 500) continue

            const mime = String(imgRes.headers['content-type'] || '').toLowerCase()
            const mimetype = mime.includes('png')
                ? 'image/png'
                : mime.includes('webp')
                    ? 'image/webp'
                    : 'image/jpeg'

            await conn.sendMessage(
                m.chat,
                {
                    image: buf,
                    mimetype,
                    caption
                },
                { quoted: m }
            )
            return true
        } catch {}
    }

    return false
}

async function sendTracksMenu(conn, m, query, tracks) {
    const rows = tracks.map((track) => {
        const key = genId()
        global.appleMusicCache.set(key, {
            track,
            query,
            createdAt: Date.now()
        })

        return {
            title: `${track.index}. ${track.title.slice(0, 50)}`,
            description: `🎤 ${track.artist.slice(0, 60)}`,
            id: `am_${key}`
        }
    })

    const coverCandidates = tracks
        .map(t => buildImageCandidates(t.image)[0])
        .find(Boolean)

    await sendButtons(conn, m.chat, {
        title: '🎵 Apple Music Search',
        subtitle: query,
        text: `🔍 *بحث عن:* ${query}\n🎶 *النتائج:* ${tracks.length}\n\n👇 اختر أغنية لعرض التفاصيل ومحاولة تحميل الصوت:`,
        footer: '🎵 Apple Music + SoundCloud',
        ...(coverCandidates ? { image: coverCandidates } : {}),
        buttons: [
            btn.list('🎧 اختر نتيجة', [
                {
                    title: 'نتائج البحث',
                    rows
                }
            ])
        ]
    }, m)
}

let before = async (m, { conn }) => {
    try {
        const buttonId = getButtonId(m)
        if (!buttonId || !buttonId.startsWith('am_')) return false

        const key = buttonId.replace('am_', '')
        const cached = global.appleMusicCache.get(key)
        if (!cached) return false

        global.appleMusicCache.delete(key)

        const { track } = cached
        await m.react('⏳').catch(() => {})
        const waitMsg = await m.reply(`🎵 *جاري تجهيز التفاصيل ومحاولة تحميل الصوت لـ:* ${track.title}...`)

        const audioResult = await fetchSoundCloudAudio(track)

        const captionLines = [
            `🎵 *العنوان:* ${track.title}`,
            `🎤 *الفنان/النوع:* ${track.artist}`,
            track.link ? `🔗 *الرابط:* ${track.link}` : '',
            audioResult
                ? `🎧 *الصوت:* تم التحميل من SoundCloud`
                : `⚠️ *الصوت:* لم يتوفر مقطع مباشر على SoundCloud`
        ].filter(Boolean)

        const caption = captionLines.join('\n')

        try { await conn.sendMessage(m.chat, { delete: waitMsg.key }) } catch {}

        const imageSent = await sendTrackImageSafely(conn, m, track.image, caption)
        if (!imageSent) {
            await conn.sendMessage(m.chat, { text: caption }, { quoted: m })
        }

        if (audioResult?.buffer) {
            try {
                await conn.sendMessage(
                    m.chat,
                    {
                        audio: audioResult.buffer,
                        mimetype: audioResult.mimetype || 'audio/mpeg',
                        ptt: false
                    },
                    { quoted: m }
                )
            } catch (audioErr) {
                console.log('[applemusic send audio err]:', audioErr.message)
            }
        }

        await m.react('✅').catch(() => {})
        return true
    } catch (e) {
        console.error('[applemusic before]', e.message)
        return false
    }
}

let handler = async (m, { conn, text, usedPrefix, command }) => {
    const query = (text || '').trim()
    if (!query) {
        return conn.reply(
            m.chat,
            `🎵 اكتب اسم أغنية للبحث:\n*مثال:* ${usedPrefix + command} انا مين`,
            m
        )
    }

    await m.react('🔍')
    const wait = await m.reply(`🔍 *جاري البحث في Apple Music عن:* ${query}`)

    try {
        const tracks = await searchAppleMusic(query)
        if (!tracks.length) {
            await m.react('❌')
            return conn.sendMessage(m.chat, { text: '❌ مفيش نتائج.', edit: wait.key })
        }

        try { await conn.sendMessage(m.chat, { delete: wait.key }) } catch {}
        await sendTracksMenu(conn, m, query, tracks)
        await m.react('✅')
    } catch (e) {
        console.error('[applemusic handler]', e.message)
        await m.react('❌')
        await conn.sendMessage(m.chat, { text: `❌ ${e.message}`, edit: wait.key })
    }
}

setInterval(() => {
    const now = Date.now()
    for (const [k, v] of global.appleMusicCache.entries()) {
        if (now - v.createdAt > TTL_MS) {
            global.appleMusicCache.delete(k)
        }
    }
}, 5 * 60 * 1000)

handler.before = before
handler.help = ['applemusic <اسم الأغنية>']
handler.tags = ['search']
handler.command = /^(applemusic|am|اغنية|أغنية)$/i

export default handler