/**
 * plugins/apk.js
 * أمر .apk متاح للجميع: بحث في AN1 + تنزيل وإرسال ملف APK
 */

import axios from 'axios'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { sendButtons, btn, getButtonId } from '../lib/buttons.js'

const SEARCH_ENDPOINT = 'https://prexzyapis.com/search/android1'
const MAX_ITEMS = 10
const TTL_MS = 30 * 60 * 1000
const MAX_APK_MB = 1200
const MAX_APK_BYTES = MAX_APK_MB * 1024 * 1024
const TMP = os.tmpdir()
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

function isStoreOrJunkUrl(url) {
    return /store|an1[-_]?store|market|play\.google|intent:|javascript:|#$/i.test(url)
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

// استخراج رابط ملف .apk مباشر من صفحة اللعبة أو صفحة /file_...
async function findDirectApkUrl(pageUrl) {
    if (!pageUrl || !/^https?:\/\//i.test(pageUrl)) return null

    const pageRes = await axios.get(pageUrl, {
        timeout: 25000,
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
    const isFilePage = /\/file_\d+/i.test(pageUrl)

    const targetPages = []
    if (isFilePage) {
        targetPages.push(pageUrl)
    } else {
        const fileLinks = [...html.matchAll(/href\s*=\s*["']([^"']*\/file_\d+[^"']*)["']/gi)]
            .map(m => resolveUrl(pageUrl, m[1].replace(/&amp;/g, '&')))
            .filter(Boolean)
        targetPages.push(...fileLinks.slice(0, 2), pageUrl)
    }

    for (const target of targetPages) {
        try {
            const res = target === pageUrl
                ? pageRes
                : await axios.get(target, {
                    timeout: 25000,
                    maxRedirects: 5,
                    headers: {
                        'User-Agent': UA,
                        'Referer': pageUrl
                    },
                    validateStatus: () => true
                })

            if (res.status >= 400 || !res.data) continue
            const content = typeof res.data === 'string' ? res.data : String(res.data)

            const apkMatches = (content.match(/https?:\/\/[^\s"'<>\\]+\.apk(?:\?[^\s"'<>\\]*)?/gi) || [])
                .map(u => u.replace(/\\+/g, '').replace(/&amp;/g, '&'))
                .filter(u => !isStoreOrJunkUrl(u))

            if (apkMatches.length) {
                return apkMatches[0]
            }
        } catch {}
    }

    return null
}

// تحميل ملف APK إلى ملف مؤقت على القرص لتخفيف ضغط الـ RAM
async function downloadApkToFile(apkUrl, referer, outFilePath) {
    try {
        const head = await axios.head(apkUrl, {
            timeout: 20000,
            maxRedirects: 5,
            headers: {
                'User-Agent': UA,
                'Referer': referer || 'https://an1.com/'
            },
            validateStatus: () => true
        })

        const len = Number(head.headers['content-length'] || 0)
        if (len > MAX_APK_BYTES) {
            const mb = (len / (1024 * 1024)).toFixed(1)
            throw new Error(`حجم الملف (${mb} MB) أكبر من الحد المسموح (${MAX_APK_MB} MB)`)
        }
    } catch (e) {
        if (e.message.includes('أكبر من الحد المسموح')) throw e
    }

    const res = await axios.get(apkUrl, {
        responseType: 'stream',
        timeout: 300000,
        maxRedirects: 5,
        maxContentLength: MAX_APK_BYTES,
        maxBodyLength: MAX_APK_BYTES,
        headers: {
            'User-Agent': UA,
            'Referer': referer || 'https://an1.com/'
        },
        validateStatus: () => true
    })

    if (res.status >= 400 || !res.data) {
        throw new Error(`فشل تنزيل ملف APK (HTTP ${res.status})`)
    }

    let downloadedBytes = 0
    let firstTwoBytes = null

    await new Promise((resolve, reject) => {
        const writer = fs.createWriteStream(outFilePath)

        res.data.on('data', (chunk) => {
            if (firstTwoBytes === null && chunk.length >= 2) {
                firstTwoBytes = [chunk[0], chunk[1]]
            }
            downloadedBytes += chunk.length
            if (downloadedBytes > MAX_APK_BYTES) {
                writer.destroy()
                res.data.destroy()
                reject(new Error(`حجم الملف تجاوز الحد المسموح (${MAX_APK_MB} MB)`))
            }
        })

        res.data.on('error', (err) => {
            writer.destroy()
            reject(err)
        })

        writer.on('error', (err) => {
            reject(err)
        })

        writer.on('finish', () => {
            resolve()
        })

        res.data.pipe(writer)
    })

    if (
        downloadedBytes < 50000 ||
        !firstTwoBytes ||
        firstTwoBytes[0] !== 0x50 ||
        firstTwoBytes[1] !== 0x4b
    ) {
        try { fs.unlinkSync(outFilePath) } catch {}
        throw new Error('الملف المستلم ليس حزمة APK صالحة أو محمي بصفحة تحميل')
    }

    return downloadedBytes
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
        text: `🔍 *بحث عن:* ${query}\n📊 *النتائج:* ${items.length}\n💾 *الحد الأقصى للتحميل:* ${MAX_APK_MB} MB\n\n👇 اختر تطبيقاً أو لعبة لتنزيل ملف APK:`,
        footer: '📦 APK Downloader',
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
        const statusMsg = await m.reply(`⬇️ *جاري تحضير وتنزيل ملف APK لـ:* ${item.name}...`)
        const tmpFile = path.join(TMP, `apk_${process.pid}_${Date.now()}.apk`)

        try {
            const directApkUrl = await findDirectApkUrl(item.link)
            if (!directApkUrl) {
                throw new Error('لم يتم العثور على رابط .apk مباشر (قد يحتاج عدّاد ثواني أو تحقق في المتصفح)')
            }

            const bytes = await downloadApkToFile(directApkUrl, item.link, tmpFile)
            const sizeMb = (bytes / (1024 * 1024)).toFixed(1)
            const fileName = `${sanitizeFileName(item.name)}.apk`

            try { await conn.sendMessage(m.chat, { delete: statusMsg.key }) } catch {}

            await conn.sendMessage(
                m.chat,
                {
                    document: { url: tmpFile },
                    mimetype: 'application/vnd.android.package-archive',
                    fileName,
                    caption: `${infoLines.join('\n')}\n💾 *الحجم:* ${sizeMb} MB\n\n✅ *تم التنزيل بنجاح*`
                },
                { quoted: m }
            )

            await m.react('✅').catch(() => {})
            return true
        } catch (dlErr) {
            try { fs.unlinkSync(tmpFile) } catch {}
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
        } finally {
            setTimeout(() => {
                try { fs.unlinkSync(tmpFile) } catch {}
            }, 180000)
        }
    } catch (e) {
        console.error('[apk before]', e.message)
        return false
    }
}

let handler = async (m, { conn, text, usedPrefix, command }) => {
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
handler.tags = ['downloader']
handler.command = /^apk$/i

export default handler