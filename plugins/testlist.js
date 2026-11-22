/**
 * plugins/testlist.js
 * أمر سيرش تجريبي بقائمة زراير (للمطور فقط) - يعرض اللينك عند الضغط
 */

import axios from 'axios'
import { sendButtons, btn, getButtonId } from '../lib/buttons.js'

const ENDPOINT = 'https://prexzyapis.com/nsfw/xnxx-search'
const MAX_ITEMS = 10
const TTL_MS = 30 * 60 * 1000

if (!global.testSearchCache) global.testSearchCache = new Map()

function genId() {
    return Math.random().toString(36).slice(2, 10)
}

async function fetchSearch(query) {
    const res = await axios.get(ENDPOINT, {
        params: { query },
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
    const videos = Array.isArray(data?.videos) ? data.videos : []

    if (!data?.status || !videos.length) {
        return { query: data?.query || query, total: data?.totalVideos ?? 0, items: [] }
    }

    return {
        query: data?.query || query,
        total: data?.totalVideos ?? videos.length,
        items: videos.slice(0, MAX_ITEMS)
    }
}

async function sendResultsList(conn, m, searchData) {
    const { query, total, items } = searchData

    const rows = items.map((item, idx) => {
        const key = genId()
        global.testSearchCache.set(key, {
            item,
            query,
            createdAt: Date.now()
        })

        const title = String(item.title || 'بدون عنوان').slice(0, 50)
        const uploader = item.uploader || 'غير معروف'
        const duration = item.duration || 'غير محدد'
        const views = item.views || 'غير محدد'

        return {
            title: `${idx + 1}. ${title}`,
            description: `👤 ${uploader} | ⏱️ ${duration} | 👁️ ${views}`,
            id: `tsrc_${key}`
        }
    })

    await sendButtons(conn, m.chat, {
        title: '🔎 نتائج البحث',
        subtitle: query,
        text: `🔍 *الكلمة:* ${query}\n📊 *المعروض:* ${items.length} من أصل ${total}\n\n👇 اختر نتيجة من القائمة لعرض اللينك:`,
        footer: '🧪 تجربة مطور',
        buttons: [
            btn.list('📋 عرض النتائج', [
                {
                    title: 'النتائج',
                    rows
                }
            ])
        ]
    }, m)
}

let before = async (m, { conn }) => {
    try {
        const buttonId = getButtonId(m)
        if (!buttonId || !buttonId.startsWith('tsrc_')) return false

        const key = buttonId.replace('tsrc_', '')
        const cached = global.testSearchCache.get(key)
        if (!cached) return false

        // منع التكرار
        global.testSearchCache.delete(key)

        const { item } = cached
        const title = item.title || 'بدون عنوان'
        const uploader = item.uploader || 'غير معروف'
        const duration = item.duration || 'غير محدد'
        const views = item.views || 'غير محدد'
        const link = item.link || 'لا يوجد رابط'

        const detailsText = [
            `📌 *العنوان:* ${title}`,
            `👤 *الناشر:* ${uploader}`,
            `⏱️ *المدة:* ${duration}`,
            `👁️ *المشاهدات:* ${views}`,
            `🔗 *الرابط:* ${link}`
        ].join('\n')

        await conn.sendMessage(m.chat, { text: detailsText }, { quoted: m })
        await m.react('✅').catch(() => {})
        return true
    } catch (e) {
        console.error('[testlist before]', e.message)
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
            `🔍 اكتب كلمة للبحث:\n*مثال:* ${usedPrefix + command} test`,
            m
        )
    }

    await m.react('🔍')
    const wait = await m.reply(`🔍 *جاري البحث عن:* ${query}`)

    try {
        const result = await fetchSearch(query)
        if (!result.items.length) {
            await m.react('❌')
            return conn.sendMessage(m.chat, { text: '❌ مفيش نتائج.', edit: wait.key })
        }

        try { await conn.sendMessage(m.chat, { delete: wait.key }) } catch {}
        await sendResultsList(conn, m, result)
        await m.react('✅')
    } catch (e) {
        console.error('[testlist handler]', e.message)
        await m.react('❌')
        await conn.sendMessage(m.chat, { text: `❌ ${e.message}`, edit: wait.key })
    }
}

setInterval(() => {
    const now = Date.now()
    for (const [k, v] of global.testSearchCache.entries()) {
        if (now - v.createdAt > TTL_MS) {
            global.testSearchCache.delete(k)
        }
    }
}, 5 * 60 * 1000)

handler.before = before
handler.help = ['testlist <كلمة>']
handler.tags = ['owner']
handler.command = /^testlist$/i
handler.owner = true

export default handler