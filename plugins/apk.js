/**
 * plugins/apk.js
 * أمر .apk: بحث في AN1 + محاولة تنزيل وإرسال ملف APK - للمطور فقط
 */

import axios from 'axios'
import { sendButtons, btn, getButtonId } from '../lib/buttons.js'

const SEARCH_ENDPOINT = 'https://prexzyapis.com/search/android1'
const MAX_ITEMS = 10
const TTL_MS = 30 * 60 * 1000
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

if (!global.apkSearchCache) global.apkSearchCache = new Map()

function genId() {
    return Math.random().toString(36).slice(2, 10)
}

function sanitizeFileName(name) {
    return String(name || 'app')
        .replace(/[\\/:*?"<>|]+/g, '_')
        .replace(/\s+/g, '_')
        .slice(0, 60)
}

function resolveUrl(base, href) {
    try {
        return new URL(href, base).toString()
    } catch {
        return null
    }
}

async function searchApps(query) {
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

    const data = res.data
    const list = Array.isArray(data?.result) ? data.result : []
    if (!data?.status || !list.length) return []

    return list.slice(0, MAX_ITEMS).map((item, i) => ({
        index: i + 1,
        name: String(item?.name || item?.title || `تطبيق ${i + 1}`).trim(),
        developer: String(item?.developer || 'غير معروف').trim(),
        rating: item?.rating !== undefined && item?.rating !== null ? String(item.rating) : 'غير محدد',
        imageUrl: String(item?.imageUrl || item?.image || '').trim(),
        link: String(item?.link || item?.url || '').trim()
    }))
}

// محاولة استخراج رابط ملف .apk مباشر من صفحة التطبيق أو صفحة التحميل التابعة لها
async function findDirectApkUrl(pageUrl) {
    if (!pageUrl || !/^https?:\/\//i.test(pageUrl)) return null

    const pageRes = await axios.get(pageUrl, {
        timeout: 20000,
        maxRedirects: 5,
        headers: {
            'User-Agent': UA,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Referer': 'https://an1.com/'
        },
        validateStatus: () => true
    })

    if (pageRes.status >= 400 || !pageRes.data) return null

    const html = typeof pageRes.data === 'string' ? pageRes.data : String(pageRes.data)

    // 1. البحث المباشر عن أي رابط ينتهي بـ .apk داخل الـ HTML
    const directMatches = html.match(/https?:\/\/[^\s"'<>]+\.apk(?:\?[^\s"'<>]*)?/gi) || []
    if (directMatches.length) {
        return directMatches[0].replace(/&amp;/g, '&')
    }

    const relApkMatches = html.match(/\/[^\s"'<>]+\.apk(?:\?[^\s"'<>]*)?/gi) || []
    for (const rel of relApkMatches) {
        const full = resolveUrl(pageUrl, rel.replace(/&amp;/g, '&'))
        if (full) return full
    }

    // 2. البحث عن رابط صفحة التحميل (مثل /download/ أو يحتوي على download) والدخول عليه للبحث عن .apk
    const hrefMatches = [...html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)].map(m => m[1])
    const dlPageCandidates = hrefMatches
        .filter(h => /download|dl\.php|get-apk|apk-download/i.test(h) && !/\.(jpg|jpeg|png|webp|css|js)$/i.test(h))
        .map(h => resolveUrl(pageUrl, h.replace(/&amp;/g, '&')))
        .filter(Boolean)

    for (const dlUrl of dlPageCandidates.slice(0, 3)) {
        try {
            const dlRes = await axios.get(dlUrl, {
                timeout: 20000,
                maxRedirects: 5,
                headers: {
                    'User-Agent': UA,
                    'Referer': pageUrl
                },
                validateStatus: () => true
            })

            if (dlRes.status >= 400 || !dlRes.data) continue
            const dlHtml = typeof dlRes.data === 'string' ? dlRes.data : String(dlRes.data)
            const apkInDl = dlHtml.match(/https?:\/\/[^\s"'<>]+\.apk(?:\?[^\s"'<>]*)?/gi)
            if (apkInDl?.length) {
                return apkInDl[0].replace(/&amp;/g, '&')
            }
        } catch {}
    }

    return null
}

async function downloadApkBuffer(apkUrl, referer) {
    const res = await axios.get(apkUrl, {
        responseType: 'arraybuffer',
        timeout: 180000,
        maxRedirects: 5,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        headers: {
            'User-Agent': UA,
            'Referer': referer || 'https://an1.com/'
        },
        validateStatus: () => true
    })

    if (res.status >= 400 || !res.data) {
        throw new Error(`فشل تنزيل ملف APK (HTTP ${res.status})`)
    }

    const buf = Buffer.from(res.data)
    // ملفات APK الحقيقية عادة أكبر من بضعة كيلوبايت وتبدأ بتوقيع ZIP/APK (PK)
    if (buf.length < 10000) {
        throw new Error('الملف المحمل صغير جداً أو ليس ملف APK صالح')
    }

    return buf
}

async function sendApkMenu(conn, m, query, items) {
    const rows = items.map((item) => {
        const key = genId()
        global.apkSearchCache.set(key, {
            item,
            query,
            createdAt: Date.now()
        })

        return {
            title: `${item.index}. ${item.name.slice(0, 50)}`,
            description: `👨‍💻 ${item.developer} | ⭐ ${item.rating}`,
            id: `apk_${key}`
        }
    })

    const coverImage = items.find(i => /^https?:\/\//i.test(i.imageUrl))?.imageUrl

    await sendButtons(conn, m.chat, {
        title: '📦 APK Downloader & Search',
        subtitle: query,
        text: `🔍 *بحث عن:* ${query}\n📊 *النتائج:* ${items.length}\n\n👇 اختر تطبيقاً أو لعبة لمحاولة تنزيل ملف APK:`,
        footer: '🧪 تجربة مطور • APK',
        ...(coverImage ? { image: coverImage } : {}),
        buttons: [
            btn.list('📋 اختر تطبيقاً', [
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
        if (!buttonId || !buttonId.startsWith('apk_')) return false

        const key = buttonId.replace('apk_', '')
        const cached = global.apkSearchCache.get(key)
        if (!cached) return false

        global.apkSearchCache.delete(key)

        const { item } = cached
        const infoLines = [
            `📦 *الاسم:* ${item.name}`,
            `👨‍💻 *المطور:* ${item.developer}`,
            `⭐ *التقييم:* ${item.rating}`,
            item.link ? `🔗 *الرابط:* ${item.link}` : ''
        ].filter(Boolean)

        await m.react('⏳').catch(() => {})
        const statusMsg = await m.reply(`⬇️ *جاري محاولة تنزيل ملف APK لـ:* ${item.name}...`)

        try {
            const directApkUrl = await findDirectApkUrl(item.link)
            if (!directApkUrl) {
                throw new Error('الموقع لم يعطِ رابط .apk مباشر (قد يتطلب تحقق/تايمر في المتصفح)')
            }

            const apkBuffer = await downloadApkBuffer(directApkUrl, item.link)
            const fileName = `${sanitizeFileName(item.name)}.apk`

            try { await conn.sendMessage(m.chat, { delete: statusMsg.key }) } catch {}

            await conn.sendMessage(
                m.chat,
                {
                    document: apkBuffer,
                    mimetype: 'application/vnd.android.package-archive',
                    fileName,
                    caption: `${infoLines.join('\n')}\n\n✅ *تم التنزيل بنجاح*`
                },
                { quoted: m }
            )

            await m.react('✅').catch(() => {})
            return true
        } catch (dlErr) {
            console.log('[apk download fallback]:', dlErr.message)
            try { await conn.sendMessage(m.chat, { delete: statusMsg.key }) } catch {}

            const fallbackCaption = [
                ...infoLines,
                ``,
                `⚠️ *تعذر التنزيل المباشر للملف:* ${dlErr.message}`
            ].join('\n')

            if (item.imageUrl && /^https?:\/\//i.test(item.imageUrl)) {
                try {
                    await conn.sendMessage(
                        m.chat,
                        {
                            image: { url: item.imageUrl },
                            caption: fallbackCaption
                        },
                        { quoted: m }
                    )
                    await m.react('⚠️').catch(() => {})
                    return true
                } catch {}
            }

            await conn.sendMessage(m.chat, { text: fallbackCaption }, { quoted: m })
            await m.react('⚠️').catch(() => {})
            return true
        }
    } catch (e) {
        console.error('[apk before]', e.message)
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
            `📦 اكتب اسم لعبة أو تطبيق:\n*مثال:* ${usedPrefix + command} Efootball`,
            m
        )
    }

    await m.react('🔍')
    const wait = await m.reply(`🔍 *جاري البحث عن:* ${query}`)

    try {
        const items = await searchApps(query)
        if (!items.length) {
            await m.react('❌')
            return conn.sendMessage(m.chat, { text: '❌ مفيش نتائج.', edit: wait.key })
        }

        try { await conn.sendMessage(m.chat, { delete: wait.key }) } catch {}
        await sendApkMenu(conn, m, query, items)
        await m.react('✅')
    } catch (e) {
        console.error('[apk handler]', e.message)
        await m.react('❌')
        await conn.sendMessage(m.chat, { text: `❌ ${e.message}`, edit: wait.key })
    }
}

setInterval(() => {
    const now = Date.now()
    for (const [k, v] of global.apkSearchCache.entries()) {
        if (now - v.createdAt > TTL_MS) {
            global.apkSearchCache.delete(k)
        }
    }
}, 5 * 60 * 1000)

handler.before = before
handler.help = ['apk <اسم اللعبة أو التطبيق>']
handler.tags = ['owner']
handler.command = /^apk$/i
handler.owner = true

export default handler