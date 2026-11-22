/**
 * plugins/testhome.js
 * أمر تجريبي للتعامل مع JSON كبير الحجم (/home) وتقسيمه لقوائم زراير - للمطور فقط
 */

import axios from 'axios'
import { sendButtons, btn, getButtonId } from '../lib/buttons.js'

const HOME_ENDPOINT = 'https://prexzyapis.com/home'
const MAX_SECTIONS = 10
const MAX_ITEMS_PER_SECTION = 10
const TTL_MS = 30 * 60 * 1000

if (!global.homeTestCache) global.homeTestCache = new Map()

function genId() {
    return Math.random().toString(36).slice(2, 10)
}

// دالة ذكية تستخرج الأقسام أياً كان شكل الـ JSON الكبير في /home
function parseHomeSections(data) {
    if (!data || typeof data !== 'object') return []

    const sections = []

    // الحالة 1: لو الـ JSON فيه مصفوفة أقسام مباشرة مثل data.sections أو data.categories أو data.result
    const arrayCandidates = [
        data.sections,
        data.categories,
        data.home,
        data.result,
        data.data
    ].find(Array.isArray)

    if (arrayCandidates) {
        arrayCandidates.forEach((sec, idx) => {
            if (!sec || typeof sec !== 'object') return
            const items =
                sec.videos || sec.items || sec.list || sec.results || sec.data ||
                (Array.isArray(sec) ? sec : null)

            if (Array.isArray(items) && items.length) {
                sections.push({
                    title: String(sec.title || sec.name || sec.category || `قسم ${idx + 1}`).trim(),
                    items
                })
            }
        })
        if (sections.length) return sections
    }

    // الحالة 2: لو الـ JSON عبارة عن كائن فيه مفاتيح وكل مفتاح تحته مصفوفة (مثل { trending: [...], latest: [...] })
    const ignoreKeys = new Set(['status', 'statusCode', 'creator', 'timestamp', 'message', 'code'])
    const rootObj = (data.data && typeof data.data === 'object' && !Array.isArray(data.data))
        ? data.data
        : data

    for (const [key, val] of Object.entries(rootObj)) {
        if (ignoreKeys.has(key)) continue
        if (Array.isArray(val) && val.length && typeof val[0] === 'object') {
            sections.push({
                title: key.replace(/[_-]+/g, ' ').toUpperCase(),
                items: val
            })
        }
    }

    return sections
}

function normalizeItem(raw, index) {
    return {
        index: index + 1,
        title: String(raw?.title || raw?.name || raw?.word || `عنصر ${index + 1}`).trim(),
        link: raw?.link || raw?.url || raw?.href || 'لا يوجد رابط',
        uploader: raw?.uploader || raw?.author || raw?.channel || 'غير معروف',
        duration: raw?.duration || raw?.time || 'غير محدد',
        views: raw?.views || raw?.view || 'غير محدد'
    }
}

async function fetchHomeData() {
    const res = await axios.get(HOME_ENDPOINT, {
        timeout: 25000,
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

    // نطبع ملخص خفيف في الكونسول بدل ما نطبع الـ JSON الضخم كله
    if (rawData && typeof rawData === 'object') {
        console.log('[testhome] top-level keys:', Object.keys(rawData))
    }

    const sections = parseHomeSections(rawData)
    return { rawData, sections }
}

// المرحلة 1: إرسال قائمة بالأقسام الموجودة في /home
async function sendSectionsMenu(conn, m, sections) {
    const pickedSections = sections.slice(0, MAX_SECTIONS)

    const rows = pickedSections.map((sec, idx) => {
        const key = genId()
        global.homeTestCache.set(key, {
            step: 'section',
            sectionTitle: sec.title,
            items: sec.items.slice(0, MAX_ITEMS_PER_SECTION),
            createdAt: Date.now()
        })

        return {
            title: `${idx + 1}. ${sec.title.slice(0, 45)}`,
            description: `📦 عدد العناصر: ${sec.items.length}`,
            id: `hmt_${key}`
        }
    })

    await sendButtons(conn, m.chat, {
        title: '🏠 الصفحة الرئيسية (/home)',
        subtitle: `تم استخراج ${sections.length} قسم`,
        text: `📊 الرد كبير فتم تقسيمه إلى *${pickedSections.length}* أقسام رئيسية.\n\n👇 اختر قسماً لعرض محتواه:`,
        footer: '🧪 تجربة مطور • Large JSON Handler',
        buttons: [
            btn.list('📂 اختر قسماً', [
                {
                    title: 'الأقسام المتاحة',
                    rows
                }
            ])
        ]
    }, m)
}

// المرحلة 2: إرسال عناصر القسم المختار
async function sendSectionItemsMenu(conn, m, sectionTitle, rawItems) {
    const items = rawItems.map((it, i) => normalizeItem(it, i))

    const rows = items.map((item) => {
        const key = genId()
        global.homeTestCache.set(key, {
            step: 'item',
            sectionTitle,
            item,
            createdAt: Date.now()
        })

        return {
            title: `${item.index}. ${item.title.slice(0, 50)}`,
            description: `👤 ${item.uploader} | ⏱️ ${item.duration} | 👁️ ${item.views}`,
            id: `hmt_${key}`
        }
    })

    await sendButtons(conn, m.chat, {
        title: `📂 قسم: ${sectionTitle.slice(0, 30)}`,
        subtitle: `${items.length} عناصر`,
        text: `📂 *القسم المختار:* ${sectionTitle}\n\n👇 اختر عنصراً لعرض الرابط والتفاصيل:`,
        footer: '🧪 تجربة مطور',
        buttons: [
            btn.list('📋 اختر عنصراً', [
                {
                    title: sectionTitle.slice(0, 24),
                    rows
                }
            ])
        ]
    }, m)
}

let before = async (m, { conn }) => {
    try {
        const buttonId = getButtonId(m)
        if (!buttonId || !buttonId.startsWith('hmt_')) return false

        const key = buttonId.replace('hmt_', '')
        const cached = global.homeTestCache.get(key)
        if (!cached) return false

        global.homeTestCache.delete(key)

        // لو ضغط على قسم -> نعرض عناصر القسم
        if (cached.step === 'section') {
            await sendSectionItemsMenu(conn, m, cached.sectionTitle, cached.items)
            return true
        }

        // لو ضغط على عنصر -> نعرض تفاصيله ورابطه
        if (cached.step === 'item') {
            const { item, sectionTitle } = cached
            const details = [
                `📂 *القسم:* ${sectionTitle}`,
                `📌 *العنوان:* ${item.title}`,
                `👤 *الناشر:* ${item.uploader}`,
                `⏱️ *المدة:* ${item.duration}`,
                `👁️ *المشاهدات:* ${item.views}`,
                `🔗 *الرابط:* ${item.link}`
            ].join('\n')

            await conn.sendMessage(m.chat, { text: details }, { quoted: m })
            await m.react('✅').catch(() => {})
            return true
        }

        return false
    } catch (e) {
        console.error('[testhome before]', e.message)
        return false
    }
}

let handler = async (m, { conn, isROwner, isOwner }) => {
    if (!isROwner && !isOwner) {
        return conn.reply(m.chat, '❌ هذا الأمر للمطور فقط.', m)
    }

    await m.react('⏳')
    const wait = await m.reply('⏳ *جاري جلب وتلخيص بيانات /home...*')

    try {
        const { rawData, sections } = await fetchHomeData()

        if (!sections.length) {
            const topKeys = rawData && typeof rawData === 'object' ? Object.keys(rawData).join(', ') : 'غير معروف'
            await m.react('⚠️')
            return conn.sendMessage(
                m.chat,
                {
                    text: `⚠️ تم استلام الـ JSON بنجاح لكن هيكل الأقسام مختلف.\n🔑 *المفاتيح الرئيسية:* \`${topKeys}\`\n\nشوف الكونسول أو ابعتلي أول 30 سطر من الـ JSON عشان نظبط \`parseHomeSections\`.`,
                    edit: wait.key
                }
            )
        }

        try { await conn.sendMessage(m.chat, { delete: wait.key }) } catch {}
        await sendSectionsMenu(conn, m, sections)
        await m.react('✅')
    } catch (e) {
        console.error('[testhome handler]', e.message)
        await m.react('❌')
        await conn.sendMessage(m.chat, { text: `❌ ${e.message}`, edit: wait.key })
    }
}

setInterval(() => {
    const now = Date.now()
    for (const [k, v] of global.homeTestCache.entries()) {
        if (now - v.createdAt > TTL_MS) {
            global.homeTestCache.delete(k)
        }
    }
}, 5 * 60 * 1000)

handler.before = before
handler.help = ['testhome']
handler.tags = ['owner']
handler.command = /^testhome$/i
handler.owner = true

export default handler