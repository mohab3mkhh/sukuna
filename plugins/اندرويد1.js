/**
 * plugins/testan1.js
 * أمر سيرش تجريبي لألعاب/تطبيقات AN1 عبر /search/android1 - للمطور فقط
 */

import axios from 'axios'
import { sendButtons, btn, getButtonId } from '../lib/buttons.js'

const ENDPOINT = 'https://prexzyapis.com/search/android1'
const MAX_ITEMS = 10
const TTL_MS = 30 * 60 * 1000

if (!global.an1SearchCache) global.an1SearchCache = new Map()

function genId() {
    return Math.random().toString(36).slice(2, 10)
}

async function searchAn1(query) {
    const res = await axios.get(ENDPOINT, {
        params: { q: query },
        timeout: 20000,
        headers: {
            'User-Agent': 'Mozilla/5.0',
            'Accept': 'application/json'
        },
        validateStatus: () => true
    })

    if (res.status >= 400) {
        throw new Error(`HTTP ${res.status}`)
    }

    const data = res.data
    const list = Array.isArray(data?.result) ? data.result : []

    if (!data?.status || !list.length) {
        return []
    }

    return list.slice(0, MAX_ITEMS).map((item, i) => ({
        index: i + 1,
        name: String(item?.name || item?.title || `نتيجة ${i + 1}`).trim(),
        developer: String(item?.developer || 'غير معروف').trim(),
        rating: item?.rating !== undefined && item?.rating !== null ? String(item.rating) : 'غير محدد',
        imageUrl: String(item?.imageUrl || item?.image || '').trim(),
        link: String(item?.link || item?.url || '').trim()
    }))
}

async function sendAn1Menu(conn, m, query, items) {
    const rows = items.map((item) => {
        const key = genId()
        global.an1SearchCache.set(key, {
            item,
            query,
            createdAt: Date.now()
        })

        return {
            title: `${item.index}. ${item.name.slice(0, 50)}`,
            description: `👨‍💻 ${item.developer} | ⭐ ${item.rating}`,
            id: `an1_${key}`
        }
    })

    const coverImage = items.find(i => /^https?:\/\//i.test(i.imageUrl))?.imageUrl

    await sendButtons(conn, m.chat, {
        title: '🎮 AN1 Search',
        subtitle: query,
        text: `🔍 *بحث عن:* ${query}\n📊 *النتائج:* ${items.length}\n\n👇 اختر نتيجة لعرض التفاصيل والرابط:`,
        footer: '🧪 تجربة مطور • Android1',
        ...(coverImage ? { image: coverImage } : {}),
        buttons: [
            btn.list('📋 اختر لعبة/تطبيق', [
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
        if (!buttonId || !buttonId.startsWith('an1_')) return false

        const key = buttonId.replace('an1_', '')
        const cached = global.an1SearchCache.get(key)
        if (!cached) return false

        global.an1SearchCache.delete(key)

        const { item } = cached
        const caption = [
            `🎮 *الاسم:* ${item.name}`,
            `👨‍💻 *المطور:* ${item.developer}`,
            `⭐ *التقييم:* ${item.rating}`,
            item.link ? `🔗 *الرابط:* ${item.link}` : ''
        ]
            .filter(Boolean)
            .join('\n')

        if (item.imageUrl && /^https?:\/\//i.test(item.imageUrl)) {
            try {
                await conn.sendMessage(
                    m.chat,
                    {
                        image: { url: item.imageUrl },
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
        console.error('[testan1 before]', e.message)
        return false
    }
}

let handler = async (m, { conn, text, usedPrefix, command, isROwner, isOwner }) => {
    if (!isROwner && !isOwner) {
        return conn.reply(m.chat, '❌ هذا الأمر للمطور فقط.', m)
    }

    const query = (text || '').trim()
    if (!query) {
        return conn.reply(
            m.chat,
            `🎮 اكتب اسم لعبة أو تطبيق للبحث:\n*مثال:* ${usedPrefix + command} Efootball`,
            m
        )
    }

    await m.react('🔍')
    const wait = await m.reply(`🔍 *جاري البحث في AN1 عن:* ${query}`)

    try {
        const items = await searchAn1(query)
        if (!items.length) {
            await m.react('❌')
            return conn.sendMessage(m.chat, { text: '❌ مفيش نتائج.', edit: wait.key })
        }

        try { await conn.sendMessage(m.chat, { delete: wait.key }) } catch {}
        await sendAn1Menu(conn, m, query, items)
        await m.react('✅')
    } catch (e) {
        console.error('[testan1 handler]', e.message)
        await m.react('❌')
        await conn.sendMessage(m.chat, { text: `❌ ${e.message}`, edit: wait.key })
    }
}

setInterval(() => {
    const now = Date.now()
    for (const [k, v] of global.an1SearchCache.entries()) {
        if (now - v.createdAt > TTL_MS) {
            global.an1SearchCache.delete(k)
        }
    }
}, 5 * 60 * 1000)

handler.before = before
handler.help = ['an1 <اسم اللعبة أو التطبيق>']
handler.tags = ['owner']
handler.command = /^(an1|اندرويد1)$/i
handler.owner = true

export default handler