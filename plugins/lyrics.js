/**
 * plugins/lyrics.js
 * أمر بحث عن كلمات الأغاني عبر /search/lyrics - متاح للجميع
 */

import axios from 'axios'
import { sendButtons, btn, getButtonId } from '../lib/buttons.js'

const ENDPOINT = 'https://prexzyapis.com/search/lyrics'
const MAX_ITEMS = 10
const TTL_MS = 30 * 60 * 1000
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

if (!global.lyricsSearchCache) global.lyricsSearchCache = new Map()

function genId() {
    return Math.random().toString(36).slice(2, 10)
}

function normalizeLyricsItem(raw, index) {
    const title = String(
        raw?.title ||
        raw?.name ||
        raw?.song ||
        raw?.trackName ||
        `نتيجة ${index + 1}`
    ).trim()

    const artist = String(
        raw?.artist ||
        raw?.singer ||
        raw?.artistName ||
        raw?.author ||
        'غير معروف'
    ).trim()

    const lyrics = String(
        raw?.lyrics ||
        raw?.lyric ||
        raw?.text ||
        raw?.content ||
        raw?.body ||
        ''
    ).trim()

    const url = String(
        raw?.url ||
        raw?.link ||
        ''
    ).trim()

    return {
        index: index + 1,
        title,
        artist,
        lyrics,
        url
    }
}

function extractLyricsItems(payload) {
    if (!payload || typeof payload !== 'object') return []

    const directItem =
        payload.lyrics || payload.lyric || payload.text
            ? [payload]
            : (payload.result && (payload.result.lyrics || payload.result.lyric || payload.result.text))
                ? [payload.result]
                : (payload.data && (payload.data.lyrics || payload.data.lyric || payload.data.text))
                    ? [payload.data]
                    : []

    if (directItem.length) {
        return directItem.map((item, i) => normalizeLyricsItem(item, i))
    }

    const list =
        (Array.isArray(payload.result) && payload.result) ||
        (Array.isArray(payload.results) && payload.results) ||
        (Array.isArray(payload.data) && payload.data) ||
        (Array.isArray(payload.data?.result) && payload.data.result) ||
        []

    return list.slice(0, MAX_ITEMS).map((item, i) => normalizeLyricsItem(item, i))
}

async function searchLyrics(query) {
    const res = await axios.get(ENDPOINT, {
        params: { title: query },
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

    const items = extractLyricsItems(res.data)
    if (!items.length) return []
    return items.filter(i => i.lyrics || i.title || i.url)
}

function formatLyricsMessage(item) {
    const header = [
        `🎤 *الأغنية:* ${item.title}`,
        `🎶 *الفنان:* ${item.artist}`,
        item.url ? `🔗 *الرابط:* ${item.url}` : ''
    ].filter(Boolean).join('\n')

    if (!item.lyrics) {
        return `${header}\n\n⚠️ لم يتم العثور على نص الكلمات في هذه النتيجة.`
    }

    const trimmedLyrics = item.lyrics.length > 3500
        ? `${item.lyrics.slice(0, 3500)}\n...`
        : item.lyrics

    return `${header}\n\n📜 *الكلمات:*\n${trimmedLyrics}`
}

async function sendLyricsMenu(conn, m, query, items) {
    const rows = items.map((item) => {
        const key = genId()
        global.lyricsSearchCache.set(key, {
            item,
            query,
            createdAt: Date.now()
        })

        return {
            title: `${item.index}. ${item.title.slice(0, 50)}`,
            description: `🎤 ${item.artist.slice(0, 60)}`,
            id: `lyr_${key}`
        }
    })

    await sendButtons(conn, m.chat, {
        title: '📜 Lyrics Search',
        subtitle: query,
        text: `🔍 *بحث عن:* ${query}\n🎶 *النتائج:* ${items.length}\n\n👇 اختر أغنية لعرض الكلمات:`,
        footer: '📜 Lyrics',
        buttons: [
            btn.list('📜 اختر أغنية', [
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
        if (!buttonId || !buttonId.startsWith('lyr_')) return false

        const key = buttonId.replace('lyr_', '')
        const cached = global.lyricsSearchCache.get(key)
        if (!cached) return false

        global.lyricsSearchCache.delete(key)

        const msg = formatLyricsMessage(cached.item)
        await conn.sendMessage(m.chat, { text: msg }, { quoted: m })
        await m.react('✅').catch(() => {})
        return true
    } catch (e) {
        console.error('[lyrics before]', e.message)
        return false
    }
}

let handler = async (m, { conn, text, usedPrefix, command }) => {
    const query = (text || '').trim()
    if (!query) {
        return conn.reply(
            m.chat,
            `📜 اكتب اسم الأغنية للبحث عن كلماتها:\n*مثال:* ${usedPrefix + command} انا مين`,
            m
        )
    }

    await m.react('🔍')
    const wait = await m.reply(`🔍 *جاري البحث عن كلمات:* ${query}`)

    try {
        const items = await searchLyrics(query)
        if (!items.length) {
            await m.react('❌')
            return conn.sendMessage(m.chat, { text: '❌ لم يتم العثور على كلمات.', edit: wait.key })
        }

        try { await conn.sendMessage(m.chat, { delete: wait.key }) } catch {}

        if (items.length === 1 && items[0].lyrics) {
            await conn.sendMessage(m.chat, { text: formatLyricsMessage(items[0]) }, { quoted: m })
            await m.react('✅')
            return
        }

        await sendLyricsMenu(conn, m, query, items)
        await m.react('✅')
    } catch (e) {
        console.error('[lyrics handler]', e.message)
        await m.react('❌')
        await conn.sendMessage(m.chat, { text: `❌ ${e.message}`, edit: wait.key })
    }
}

setInterval(() => {
    const now = Date.now()
    for (const [k, v] of global.lyricsSearchCache.entries()) {
        if (now - v.createdAt > TTL_MS) {
            global.lyricsSearchCache.delete(k)
        }
    }
}, 5 * 60 * 1000)

handler.before = before
handler.help = ['lyrics <اسم الأغنية>']
handler.tags = ['search']
handler.command = /^(lyrics|كلمات|كلام_اغنية)$/i

export default handler