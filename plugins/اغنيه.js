/**
 * plugins/applemusic.js
 * بحث Apple Music + عرض التفاصيل ورابط الاستماع الرسمي
 */

import axios from 'axios'
import { sendButtons, btn, getButtonId } from '../lib/buttons.js'

const SEARCH_ENDPOINT = 'https://prexzyapis.com/search/applemusic'
const MAX_ITEMS = 10
const TTL_MS = 30 * 60 * 1000
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

if (!global.appleMusicCache) global.appleMusicCache = new Map()

function genId() {
    return Math.random().toString(36).slice(2, 10)
}

function cleanArtist(rawArtist) {
    let s = String(rawArtist || 'غير معروف').trim()
    s = s.replace(/Lyrics\s*:.*$/i, '').trim()
    return s || 'غير معروف'
}

function normalizeTrack(raw, index) {
    const title = String(raw?.title || raw?.name || `نتيجة ${index + 1}`).trim()
    const artist = cleanArtist(raw?.artist || raw?.singer || raw?.author)
    const link = String(raw?.link || raw?.url || '').trim()

    return {
        index: index + 1,
        title,
        artist,
        link
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

    await sendButtons(conn, m.chat, {
        title: '🎵 Apple Music Search',
        subtitle: query,
        text: `🔍 *بحث عن:* ${query}\n🎶 *النتائج:* ${tracks.length}\n\n👇 اختر نتيجة لعرض التفاصيل والرابط:`,
        footer: '🎵 Apple Music',
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
        const caption = [
            `🎵 *العنوان:* ${track.title}`,
            `🎤 *الفنان/النوع:* ${track.artist}`,
            track.link ? `🔗 *الرابط:* ${track.link}` : ''
        ].filter(Boolean).join('\n')

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