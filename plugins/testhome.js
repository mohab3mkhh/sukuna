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

function pickItemsArray(obj) {
    if (!obj || typeof obj !== 'object') return null
    if (Array.isArray(obj)) return obj

    const candidates = [
        obj.videos,
        obj.items,
        obj.list,
        obj.results,
        obj.data,
        obj.movies,
        obj.posts,
        obj.cards
    ]
    for (const c of candidates) {
        if (Array.isArray(c) && c.length) return c
    }
    return null
}

function parseHomeSections(data) {
    const root = data?.home ?? data?.raw ?? data
    if (!root || typeof root !== 'object') return []

    const sections = []

    // الحالة 1: لو root عبارة عن مصفوفة مباشرة
    if (Array.isArray(root)) {
        // لو عناصرها نفسها أقسام (كل عنصر فيه مصفوفة فرعية)
        const subSections = root
            .map((sec, idx) => {
                const items = pickItemsArray(sec)
                if (!items) return null
                return {
                    title: String(sec?.title || sec?.name || sec?.category || sec?.label || `قسم ${idx + 1}`).trim(),
                    items
                }
            })
            .filter(Boolean)

        if (subSections.length) return subSections

        // لو root مصفوفة عناصر مباشرة من غير أقسام فرعية
        if (root.length && typeof root[0] === 'object') {
            return [{ title: 'الرئيسية', items: root }]
        }
        return []
    }

    // الحالة 2: لو root كائن (Object) يحتوي على مفاتيح
    // أولاً: هل جواه مصفوفة أقسام معروفة؟
    const knownSectionArrays = [root.sections, root.categories, root.blocks, root.rows, root.groups].find(Array.isArray)
    if (knownSectionArrays) {
        knownSectionArrays.forEach((sec, idx) => {
            const items = pickItemsArray(sec) || (Array.isArray(sec) ? sec : null)
            if (Array.isArray(items) && items.length) {
                sections.push({
                    title: String(sec?.title || sec?.name || sec?.category || `قسم ${idx + 1}`).trim(),
                    items
                })
            }
        })
        if (sections.length) return sections
    }

    // ثانياً: كل مفتاح جوه root قيمته مصفوفة كائنات نعتبره قسماً
    const ignoreKeys = new Set(['status', 'statusCode', 'creator', 'timestamp', 'message', 'code', 'ops', 'keyword'])
    for (const [key, val] of Object.entries(root)) {
        if (ignoreKeys.has(key)) continue
        if (Array.isArray(val) && val.length && typeof val[0] === 'object') {
            sections.push({
                title: key.replace(/[_-]+/g, ' ').toUpperCase(),
                items: val
            })
        } else if (val && typeof val === 'object') {
            const nestedItems = pickItemsArray(val)
            if (nestedItems) {
                sections.push({
                    title: String(val.title || val.name || key).trim(),
                    items: nestedItems
                })
            }
        }
    }

    return sections
}

function normalizeItem(raw, index) {
    return {
        index: index + 1,
        title: String(raw?.title || raw?.name || raw?.word || raw?.label || `عنصر ${index + 1}`).trim(),
        link: raw?.link || raw?.url || raw?.href || raw?.page || 'لا يوجد رابط',
        uploader: raw?.uploader || raw?.author || raw?.channel || raw?.creator || 'غير معروف',
        duration: raw?.duration || raw?.time || raw?.length || 'غير محدد',
        views: raw?.views || raw?.view || raw?.watched || 'غير محدد'
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
    const homeObj = rawData?.home

    if (homeObj && typeof homeObj === 'object') {
        console.log('[testhome] home type:', Array.isArray(homeObj) ? 'array' : 'object')
        console.log('[testhome] home keys:', Object.keys(homeObj))
        const sample = Array.isArray(homeObj) ? homeObj[0] : homeObj[Object.keys(homeObj)[0]]
        if (sample && typeof sample === 'object') {
            console.log('[testhome] sample keys:', Object.keys(sample))
        }
    }

    const sections = parseHomeSections(rawData)
    return { rawData, sections }
}

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
        text: `📊 تم استخراج *${pickedSections.length}* أقسام من \`home\`.\n\n👇 اختر قسماً لعرض محتواه:`,
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

        if (cached.step === 'section') {
            await sendSectionItemsMenu(conn, m, cached.sectionTitle, cached.items)
            return true
        }

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
            const homeKeys = rawData?.home && typeof rawData.home === 'object'
                ? Object.keys(rawData.home).join(', ')
                : 'غير معروف'
            await m.react('⚠️')
            return conn.sendMessage(
                m.chat,
                {
                    text: `⚠️ شكل \`home\` مختلف شوية.\n🔑 *مفاتيح home:* \`${homeKeys}\`\n\nشوف الكونسول وابعـتلي السطرين بتوع \`home keys\` و \`sample keys\`.`,
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