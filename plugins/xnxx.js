/**
 * plugins/search_cmds.js
 * أوامر بحث تجريبية: .xnxx و .xvideos (للمطور فقط)
 */

import axios from 'axios'
import { sendButtons, btn, getButtonId } from '../lib/buttons.js'

const SOURCES = {
    xnxx: {
        label: 'XNXX',
        url: 'https://prexzyapis.com/nsfw/xnxx-search',
        paramKey: 'query'
    },
    xvideos: {
        label: 'XVideos',
        url: 'https://prexzyapis.com/nsfw/xvideos-search',
        paramKey: 'query'
    }
}

const MAX_ITEMS = 10
const TTL_MS = 30 * 60 * 1000

if (!global.cmdSearchCache) global.cmdSearchCache = new Map()

function genId() {
    return Math.random().toString(36).slice(2, 10)
}

function extractArray(data) {
    if (!data || typeof data !== 'object') return []
    if (Array.isArray(data.videos)) return data.videos
    if (Array.isArray(data.results)) return data.results
    if (Array.isArray(data.result)) return data.result
    if (Array.isArray(data.data)) return data.data
    if (Array.isArray(data.items)) return data.items
    if (data.result && Array.isArray(data.result.videos)) return data.result.videos
    return []
}

function normalizeItem(raw, index) {
    return {
        index: index + 1,
        title: String(raw?.title || raw?.name || `نتيجة ${index + 1}`).trim(),
        link: raw?.link || raw?.url || raw?.href || 'لا يوجد رابط',
        uploader: raw?.uploader || raw?.author || raw?.channel || raw?.profile || 'غير معروف',
        duration: raw?.duration || raw?.time || raw?.length || 'غير محدد',
        views: raw?.views || raw?.view || raw?.watched || 'غير محدد'
    }
}

async function fetchFromSource(sourceKey, query) {
    const src = SOURCES[sourceKey]

    const res = await axios.get(src.url, {
        params: { [src.paramKey]: query },
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

    const rawData = res.data
    const rawList = extractArray(rawData)

    if (!rawList.length && rawData && typeof rawData === 'object') {
        console.log(`[${sourceKey}] unexpected keys:`, Object.keys(rawData))
    }

    const items = rawList.slice(0, MAX_ITEMS).map((item, i) => normalizeItem(item, i))

    return {
        sourceKey,
        sourceLabel: src.label,
        query: rawData?.query || query,
        total: rawData?.totalVideos ?? rawData?.total ?? rawList.length,
        items
    }
}

async function sendSearchMenu(conn, m, searchResult) {
    const { sourceLabel, query, total, items } = searchResult

    const rows = items.map((item) => {
        const key = genId()
        global.cmdSearchCache.set(key, {
            item,
            sourceLabel,
            createdAt: Date.now()
        })

        return {
            title: `${item.index}. ${item.title.slice(0, 50)}`,
            description: `👤 ${item.uploader} | ⏱️ ${item.duration} | 👁️ ${item.views}`,
            id: `csrc_${key}`
        }
    })

    await sendButtons(conn, m.chat, {
        title: `🔎 بحث ${sourceLabel}`,
        subtitle: query,
        text: `🌐 *المصدر:* ${sourceLabel}\n🔍 *الكلمة:* ${query}\n📊 *المعروض:* ${items.length} من أصل ${total}\n\n👇 اختر نتيجة لعرض الرابط:`,
        footer: '🧪 تجربة مطور',
        buttons: [
            btn.list('📋 اختر نتيجة', [
                {
                    title: `نتائج ${sourceLabel}`,
                    rows
                }
            ])
        ]
    }, m)
}

let before = async (m, { conn }) => {
    try {
        const buttonId = getButtonId(m)
        if (!buttonId || !buttonId.startsWith('csrc_')) return false

        const key = buttonId.replace('csrc_', '')
        const cached = global.cmdSearchCache.get(key)
        if (!cached) return false

        global.cmdSearchCache.delete(key)

        const { item, sourceLabel } = cached
        const details = [
            `🌐 *المصدر:* ${sourceLabel}`,
            `📌 *العنوان:* ${item.title}`,
            `👤 *الناشر:* ${item.uploader}`,
            `⏱️ *المدة:* ${item.duration}`,
            `👁️ *المشاهدات:* ${item.views}`,
            `🔗 *الرابط:* ${item.link}`
        ].join('\n')

        await conn.sendMessage(m.chat, { text: details }, { quoted: m })
        await m.react('✅').catch(() => {})
        return true
    } catch (e) {
        console.error('[search_cmds before]', e.message)
        return false
    }
}

let handler = async (m, { conn, text, usedPrefix, command, isROwner, isOwner }) => {
    if (!isROwner && !isOwner) {
        return conn.reply(m.chat, '❌ هذا الأمر للمطور فقط.', m)
    }

    const cmdKey = (command || '').toLowerCase()
    const src = SOURCES[cmdKey]
    if (!src) return

    const query = (text || '').trim()
    if (!query) {
        return conn.reply(
            m.chat,
            `🔍 اكتب كلمة للبحث:\n*مثال:* ${usedPrefix + cmdKey} test`,
            m
        )
    }

    await m.react('🔍')
    const wait = await m.reply(`🔍 *جاري البحث في (${src.label}) عن:* ${query}`)

    try {
        const result = await fetchFromSource(cmdKey, query)
        if (!result.items.length) {
            await m.react('❌')
            return conn.sendMessage(m.chat, { text: '❌ مفيش نتائج.', edit: wait.key })
        }

        try { await conn.sendMessage(m.chat, { delete: wait.key }) } catch {}
        await sendSearchMenu(conn, m, result)
        await m.react('✅')
    } catch (e) {
        console.error(`[${cmdKey} handler]`, e.message)
        await m.react('❌')
        await conn.sendMessage(m.chat, { text: `❌ ${e.message}`, edit: wait.key })
    }
}

setInterval(() => {
    const now = Date.now()
    for (const [k, v] of global.cmdSearchCache.entries()) {
        if (now - v.createdAt > TTL_MS) {
            global.cmdSearchCache.delete(k)
        }
    }
}, 5 * 60 * 1000)

handler.before = before
handler.help = ['xnxx <كلمة>', 'xvideos <كلمة>']
handler.tags = ['owner']
handler.command = /^(xnxx|xvideos)$/i
handler.owner = true

export default handler