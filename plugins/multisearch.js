/**
 * plugins/multisearch.js
 * أمر سيرش تجريبي يدعم أكتر من Endpoint لتعلم توحيد شكل الـ JSON - للمطور فقط
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

const DEFAULT_SOURCE = 'xvideos'
const MAX_ITEMS = 10
const TTL_MS = 30 * 60 * 1000

if (!global.multiSearchCache) global.multiSearchCache = new Map()

function genId() {
    return Math.random().toString(36).slice(2, 10)
}

// استخراج مصفوفة النتائج أياً كان اسمها في الـ JSON
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

// توحيد شكل كل عنصر مهما اختلفت أسماء المفاتيح في الـ API
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
    const src = SOURCES[sourceKey] || SOURCES[DEFAULT_SOURCE]

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

    // لو الـ API رجّع شكل جديد مش متوقع، نطبع مفاتيح الكائن في الكونسول عشان تتعلم منها
    if (!rawList.length && rawData && typeof rawData === 'object') {
        console.log(`[multisearch:${sourceKey}] unexpected keys:`, Object.keys(rawData))
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
    const { sourceKey, sourceLabel, query, total, items } = searchResult

    const rows = items.map((item) => {
        const key = genId()
        global.multiSearchCache.set(key, {
            item,
            sourceLabel,
            createdAt: Date.now()
        })

        return {
            title: `${item.index}. ${item.title.slice(0, 50)}`,
            description: `👤 ${item.uploader} | ⏱️ ${item.duration} | 👁️ ${item.views}`,
            id: `msrc_${key}`
        }
    })

    await sendButtons(conn, m.chat, {
        title: `🔎 بحث (${sourceLabel})`,
        subtitle: query,
        text: `🌐 *المصدر:* ${sourceLabel}\n🔍 *الكلمة:* ${query}\n📊 *المعروض:* ${items.length} من أصل ${total}\n\n👇 اختر نتيجة لعرض الرابط:`,
        footer: '🧪 تجربة مطور • Multi-Source',
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
        if (!buttonId || !buttonId.startsWith('msrc_')) return false

        const key = buttonId.replace('msrc_', '')
        const cached = global.multiSearchCache.get(key)
        if (!cached) return false

        global.multiSearchCache.delete(key)

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
        console.error('[multisearch before]', e.message)
        return false
    }
}

// يقرأ البادئة لو كتبت مثلاً: xnxx: كلمة أو xvideos: كلمة، وإلا يستخدم الافتراضي
function parseInput(rawText) {
    const trimmed = (rawText || '').trim()
    const match = trimmed.match(/^(xnxx|xvideos)\s*:\s*(.+)$/i)
    if (match) {
        return {
            sourceKey: match[1].toLowerCase(),
            query: match[2].trim()
        }
    }
    return {
        sourceKey: DEFAULT_SOURCE,
        query: trimmed
    }
}

let handler = async (m, { conn, text, usedPrefix, command, isROwner, isOwner }) => {
    if (!isROwner && !isOwner) {
        return conn.reply(m.chat, '❌ هذا الأمر للمطور فقط.', m)
    }

    const { sourceKey, query } = parseInput(text)

    if (!query) {
        return conn.reply(
            m.chat,
            [
                `🔍 *طريقة الاستخدام التجريبية:*`,
                `• ${usedPrefix + command} <كلمة> *(يستخدم ${SOURCES[DEFAULT_SOURCE].label})*`,
                `• ${usedPrefix + command} xnxx: <كلمة>`,
                `• ${usedPrefix + command} xvideos: <كلمة>`
            ].join('\n'),
            m
        )
    }

    await m.react('🔍')
    const wait = await m.reply(`🔍 *جاري البحث في (${SOURCES[sourceKey].label}) عن:* ${query}`)

    try {
        const result = await fetchFromSource(sourceKey, query)
        if (!result.items.length) {
            await m.react('❌')
            return conn.sendMessage(m.chat, { text: '❌ مفيش نتائج.', edit: wait.key })
        }

        try { await conn.sendMessage(m.chat, { delete: wait.key }) } catch {}
        await sendSearchMenu(conn, m, result)
        await m.react('✅')
    } catch (e) {
        console.error('[multisearch handler]', e.message)
        await m.react('❌')
        await conn.sendMessage(m.chat, { text: `❌ ${e.message}`, edit: wait.key })
    }
}

setInterval(() => {
    const now = Date.now()
    for (const [k, v] of global.multiSearchCache.entries()) {
        if (now - v.createdAt > TTL_MS) {
            global.multiSearchCache.delete(k)
        }
    }
}, 5 * 60 * 1000)

handler.before = before
handler.help = ['multisearch [xnxx:|xvideos:] <كلمة>']
handler.tags = ['owner']
handler.command = /^multisearch$/i
handler.owner = true

export default handler