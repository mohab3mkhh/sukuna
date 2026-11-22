/**
 * plugins/applemusic.js
 * أمر بحث عن الأغاني عبر Apple Music (/search/applemusic) - متاح للجميع
 */

import axios from 'axios'
import { sendButtons, btn, getButtonId } from '../lib/buttons.js'

const ENDPOINT = 'https://prexzyapis.com/search/applemusic'
const MAX_ITEMS = 10
const TTL_MS = 30 * 60 * 1000
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

if (!global.appleMusicCache) global.appleMusicCache = new Map()

function genId() {
    return Math.random().toString(36).slice(2, 10)
}

function formatDuration(val) {
    if (!val && val !== 0) return ''
    if (typeof val === 'number') {
        const totalSec = val > 10000 ? Math.floor(val / 1000) : Math.floor(val)
        const mins = Math.floor(totalSec / 60)
        const secs = totalSec % 60
        return `${mins}:${String(secs).padStart(2, '0')}`
    }
    return String(val).trim()
}

function normalizeTrack(raw, index) {
    const title = String(
        raw?.title ||
        raw?.name ||
        raw?.trackName ||
        raw?.song ||
        `أغنية ${index + 1}`
    ).trim()

    const artist = String(
        raw?.artist ||
        raw?.artistName ||
        raw?.singer ||
        raw?.author ||
        'غير معروف'
    ).trim()

    const album = String(
        raw?.album ||
        raw?.collectionName ||
        raw?.albumName ||
        ''
    ).trim()

    const duration = formatDuration(
        raw?.duration ||
        raw?.length ||
        raw?.trackTimeMillis ||
        raw?.time ||
        ''
    )

    const releaseDate = String(
        raw?.releaseDate ||
        raw?.year ||
        raw?.date ||
        ''
    ).trim()

    const genre = Array.isArray(raw?.genre)
        ? raw.genre.join(', ')
        : String(raw?.genre || raw?.primaryGenreName || '').trim()

    const cover = String(
        raw?.cover ||
        raw?.image ||
        raw?.imageUrl ||
        raw?.artworkUrl100 ||
        raw?.artwork ||
        raw?.thumbnail ||
        ''
    ).trim()

    const url = String(
        raw?.url ||
        raw?.link ||
        raw?.trackViewUrl ||
        raw?.appleMusicUrl ||
        ''
    ).trim()

    const previewUrl = String(
        raw?.preview ||
        raw?.previewUrl ||
        raw?.audio ||
        raw?.stream ||
        ''
    ).trim()

    return {
        index: index + 1,
        title,
        artist,
        album,
        duration,
        releaseDate,
        genre,
        cover,
        url,
        previewUrl
    }
}

async function searchAppleMusic(query) {
    const res = await axios.get(ENDPOINT, {
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

    const data = res.data
    if (data && typeof data === 'object') {
        const list =
            (Array.isArray(data.result) && data.result) ||
            (Array.isArray(data.results) && data.results) ||
            (Array.isArray(data.data) && data.data) ||
            (Array.isArray(data.tracks) && data.tracks) ||
            (Array.isArray(data.data?.result) && data.data.result) ||
            []

        if (list.length) {
            return list.slice(0, MAX_ITEMS).map((item, idx) => normalizeTrack(item, idx))
        }
    }

    return []
}

async function sendTracksMenu(conn, m, query, tracks) {
    const rows = tracks.map((track) => {
        const key = genId()
        global.appleMusicCache.set(key, {
            track,
            query,
            createdAt: Date.now()
        })

        const descParts = [
            `🎤 ${track.artist}`,
            track.duration ? `⏱️ ${track.duration}` : '',
            track.album ? `💿 ${track.album}` : ''
        ].filter(Boolean)

        return {
            title: `${track.index}. ${track.title.slice(0, 50)}`,
            description: descParts.join(' | ').slice(0, 70),
            id: `am_${key}`
        }
    })

    const coverImage = tracks.find(t => /^https?:\/\//i.test(t.cover))?.cover

    await sendButtons(conn, m.chat, {
        title: '🎵 Apple Music Search',
        subtitle: query,
        text: `🔍 *بحث عن:* ${query}\n🎶 *النتائج:* ${tracks.length}\n\n👇 اختر أغنية لعرض التفاصيل والرابط:`,
        footer: '🎵 Apple Music',
        ...(coverImage ? { image: coverImage } : {}),
        buttons: [
            btn.list('🎧 اختر أغنية', [
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
        const caption = [
            `🎵 *الأغنية:* ${track.title}`,
            `🎤 *الفنان:* ${track.artist}`,
            track.album ? `💿 *الألبوم:* ${track.album}` : '',
            track.duration ? `⏱️ *المدة:* ${track.duration}` : '',
            track.genre ? `🎼 *النوع:* ${track.genre}` : '',
            track.releaseDate ? `📅 *الإصدار:* ${track.releaseDate}` : '',
            track.url ? `🔗 *الرابط:* ${track.url}` : '',
            track.previewUrl ? `🎧 *معاينة:* ${track.previewUrl}` : ''
        ]
            .filter(Boolean)
            .join('\n')

        // لو في رابط معاينة صوتية مباشر نحاول إرساله كملف صوتي أو مقطع
        if (track.previewUrl && /^https?:\/\//i.test(track.previewUrl)) {
            try {
                await conn.sendMessage(
                    m.chat,
                    {
                        audio: { url: track.previewUrl },
                        mimetype: 'audio/mpeg',
                        ptt: false
                    },
                    { quoted: m }
                )
            } catch {}
        }

        if (track.cover && /^https?:\/\//i.test(track.cover)) {
            try {
                await conn.sendMessage(
                    m.chat,
                    {
                        image: { url: track.cover },
                        caption
                    },
                    { quoted: m }
                )
                await m.react('✅').catch(() => {})
                return true
            } catch {}
        }

        await conn.sendMessage(m.chat, { text: caption }, { quoted: m })
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
            `🎵 اكتب اسم أغنية أو مطرب للبحث في Apple Music:\n*مثال:* ${usedPrefix + command} انا مين`,
            m
        )
    }

    await m.react('🔍')
    const wait = await m.reply(`🔍 *جاري البحث في Apple Music عن:* ${query}`)

    try {
        const tracks = await searchAppleMusic(query)
        if (!tracks.length) {
            await m.react('❌')
            return conn.sendMessage(m.chat, { text: '❌ لم يتم العثور على نتائج.', edit: wait.key })
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