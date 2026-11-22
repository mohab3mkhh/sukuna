/**
 * plugins/suggest_test.js
 * أمر سيرش تجريبي على /suggest لتعلم قراءة suggestions.items - للمطور فقط
 */

import axios from 'axios'
import { sendButtons, btn, getButtonId } from '../lib/buttons.js'

const ENDPOINT = 'https://prexzyapis.com/suggest'
const MAX_ITEMS = 10
const TTL_MS = 30 * 60 * 1000

if (!global.suggestCache) global.suggestCache = new Map()

function genId() {
    return Math.random().toString(36).slice(2, 10)
}

function extractSuggestions(data) {
    if (!data || typeof data !== 'object') return []
    if (Array.isArray(data?.suggestions?.items)) return data.suggestions.items
    if (Array.isArray(data?.raw?.data?.items)) return data.raw.data.items
    if (Array.isArray(data?.items)) return data.items
    return []
}

async function fetchSuggestions(query) {
    // في العادة الـ endpoint ده بيستخدم q أو query — بنجرب q ولو مفيش نتائج نجرب query
    for (const paramName of ['q', 'query']) {
        const res = await axios.get(ENDPOINT, {
            params: { [paramName]: query },
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
        const items = extractSuggestions(rawData)

        if (items.length) {
            return {
                query: rawData?.suggestions?.keyword || rawData?.query || query,
                items: items.slice(0, MAX_ITEMS)
            }
        }
    }

    return { query, items: [] }
}

async function sendSuggestionsMenu(conn, m, result) {
    const { query, items } = result

    const rows = items.map((item, idx) => {
        const key = genId()
        const word = String(item?.word || item?.title || item?.name || `اقتراح ${idx + 1}`).trim()
        const subject = item?.subject ? String(item.subject) : 'بدون تصنيف فرعي'

        global.suggestCache.set(key, {
            word,
            subject,
            type: item?.type ?? 0,
            query,
            createdAt: Date.now()
        })

        return {
            title: `${idx + 1}. ${word.slice(0, 50)}`,
            description: `💡 ${subject}`,
            id: `sug_${key}`
        }
    })

    await sendButtons(conn, m.chat, {
        title: '💡 اقتراحات البحث',
        subtitle: query,
        text: `🔍 *الكلمة:* ${query}\n📊 *عدد الاقتراحات:* ${items.length}\n\n👇 اختر اقتراحاً من القائمة:`,
        footer: '🧪 تجربة مطور • Suggest API',
        buttons: [
            btn.list('📋 عرض الاقتراحات', [
                {
                    title: 'الاقتراحات',
                    rows
                }
            ])
        ]
    }, m)
}

let before = async (m, { conn }) => {
    try {
        const buttonId = getButtonId(m)
        if (!buttonId || !buttonId.startsWith('sug_')) return false

        const key = buttonId.replace('sug_', '')
        const cached = global.suggestCache.get(key)
        if (!cached) return false

        global.suggestCache.delete(key)

        const msg = [
            `💡 *الاقتراح المختار:* ${cached.word}`,
            `🔎 *بحثت عن:* ${cached.query}`,
            `🏷️ *Subject:* ${cached.subject}`
        ].join('\n')

        await conn.sendMessage(m.chat, { text: msg }, { quoted: m })
        await m.react('✅').catch(() => {})
        return true
    } catch (e) {
        console.error('[suggest_test before]', e.message)
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
            `💡 اكتب كلمة للحصول على اقتراحات:\n*مثال:* ${usedPrefix + command} The Godfather`,
            m
        )
    }

    await m.react('⏳')
    const wait = await m.reply(`💡 *جاري جلب اقتراحات لـ:* ${query}`)

    try {
        const result = await fetchSuggestions(query)
        if (!result.items.length) {
            await m.react('❌')
            return conn.sendMessage(m.chat, { text: '❌ مفيش اقتراحات.', edit: wait.key })
        }

        try { await conn.sendMessage(m.chat, { delete: wait.key }) } catch {}
        await sendSuggestionsMenu(conn, m, result)
        await m.react('✅')
    } catch (e) {
        console.error('[suggest_test handler]', e.message)
        await m.react('❌')
        await conn.sendMessage(m.chat, { text: `❌ ${e.message}`, edit: wait.key })
    }
}

setInterval(() => {
    const now = Date.now()
    for (const [k, v] of global.suggestCache.entries()) {
        if (now - v.createdAt > TTL_MS) {
            global.suggestCache.delete(k)
        }
    }
}, 5 * 60 * 1000)

handler.before = before
handler.help = ['suggest <كلمة>']
handler.tags = ['owner']
handler.command = /^(suggest|اقتراح)$/i
handler.owner = true

export default handler