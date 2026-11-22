/**
 * plugins/testhome.js
 * أمر تجريبي لاستكشاف أقسام /home والوصول لمعلومات الأفلام - للمطور فقط
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
        obj.movies,
        obj.films,
        obj.videos,
        obj.items,
        obj.list,
        obj.results,
        obj.data,
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

    if (Array.isArray(root)) {
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
        if (root.length && typeof root[0] === 'object') {
            return [{ title: 'الرئيسية', items: root }]
        }
        return []
    }

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

    const ignoreKeys = new Set(['status', 'statusCode', 'creator', 'timestamp', 'message', 'code', 'ops', 'keyword'])
    for (const [key, val] of Object.entries(root)) {
        if (ignoreKeys.has(key)) continue
        if (Array.isArray(val) && val.length && typeof val[0] === 'object') {
            sections.push({
                title: key,
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

function normalizeMovieOrItem(raw, index) {
    const title = String(
        raw?.title ||
        raw?.name ||
        raw?.movieTitle ||
        raw?.original_title ||
        raw?.word ||
        `عنصر ${index + 1}`
    ).trim()

    const year = raw?.year || raw?.releaseYear || raw?.release_date || ''
    const rating = raw?.rating || raw?.score || raw?.imdb || ''
    const genre = Array.isArray(raw?.genre)
        ? raw.genre.join(', ')
        : Array.isArray(raw?.genres)
            ? raw.genres.join(', ')
            : (raw?.genre || raw?.category || raw?.type || '')

    const description = String(
        raw?.description ||
        raw?.overview ||
        raw?.plot ||
        raw?.synopsis ||
        raw?.desc ||
        ''
    ).trim()

    const link = raw?.link || raw?.url || raw?.href || raw?.page || raw?.trailer || ''
    const poster = raw?.poster || raw?.image || raw?.thumbnail || raw?.cover || raw?.backdrop || ''
    const uploader = raw?.uploader || raw?.author || raw?.channel || raw?.director || ''
    const duration = raw?.duration || raw?.runtime || raw?.time || ''
    const views = raw?.views || raw?.view || ''

    return {
        index: index + 1,
        title,
        year: year ? String(year) : '',
        rating: rating ? String(rating) : '',
        genre: genre ? String(genre) : '',
        description,
        link: link ? String(link) : '',
        poster: poster ? String(poster) : '',
        uploader: uploader ? String(uploader) : '',
        duration: duration ? String(duration) : '',
        views: views ? String(views) : '',
        rawKeys: raw && typeof raw === 'object' ? Object.keys(raw) : []
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
    const sections = parseHomeSections(rawData)

    // نطبع ملخص بالأقسام وعدد عناصرها في الكونسول عشان نعرف مكان الأفلام بسهولة
    console.log(
        '[testhome] sections:',
        sections.map(s => `${s.title} (${s.items.length})`).join(' | ')
    )

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
            title: `${idx + 1}. ${String(sec.title).slice(0, 45)}`,
            description: `📦 عدد العناصر: ${sec.items.length}`,
            id: `hmt_${key}`
        }
    })

    const sectionsListText = pickedSections
        .map((s, i) => `• *${i + 1}.* ${s.title} (${s.items.length})`)
        .join('\n')

    await sendButtons(conn, m.chat, {
        title: '🏠 الصفحة الرئيسية (/home)',
        subtitle: `${sections.length} قسم متاح`,
        text: `📊 *الأقسام المستخرجة:*\n${sectionsListText}\n\n👇 اختر قسماً من القائمة:`,
        footer: '🧪 تجربة مطور • Home Explorer',
        buttons: [
            btn.list('📂 اختر قسماً', [
                {
                    title: 'الأقسام',
                    rows
                }
            ])
        ]
    }, m)
}

async function sendSectionItemsMenu(conn, m, sectionTitle, rawItems) {
    const items = rawItems.map((it, i) => normalizeMovieOrItem(it, i))

    if (items[0]?.rawKeys?.length) {
        console.log(`[testhome:${sectionTitle}] first item keys:`, items[0].rawKeys)
    }

    const rows = items.map((item) => {
        const key = genId()
        global.homeTestCache.set(key, {
            step: 'item',
            sectionTitle,
            item,
            createdAt: Date.now()
        })

        const subInfo = [
            item.year ? `📅 ${item.year}` : '',
            item.rating ? `⭐ ${item.rating}` : '',
            item.genre ? `🎭 ${item.genre}` : '',
            item.duration ? `⏱️ ${item.duration}` : '',
            item.uploader ? `👤 ${item.uploader}` : ''
        ].filter(Boolean)

        return {
            title: `${item.index}. ${item.title.slice(0, 50)}`,
            description: subInfo.length ? subInfo.join(' | ').slice(0, 70) : `📂 ${sectionTitle}`,
            id: `hmt_${key}`
        }
    })

    await sendButtons(conn, m.chat, {
        title: `📂 ${String(sectionTitle).slice(0, 30)}`,
        subtitle: `${items.length} عناصر`,
        text: `📂 *القسم:* ${sectionTitle}\n\n👇 اختر عنصراً لعرض كافة معلوماته:`,
        footer: '🧪 تجربة مطور',
        buttons: [
            btn.list('📋 اختر عنصراً', [
                {
                    title: String(sectionTitle).slice(0, 24),
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
            const lines = [
                `📂 *القسم:* ${sectionTitle}`,
                `🎬 *العنوان:* ${item.title}`,
                item.year ? `📅 *السنة/التاريخ:* ${item.year}` : '',
                item.rating ? `⭐ *التقييم:* ${item.rating}` : '',
                item.genre ? `🎭 *التصنيف:* ${item.genre}` : '',
                item.duration ? `⏱️ *المدة:* ${item.duration}` : '',
                item.views ? `👁️ *المشاهدات:* ${item.views}` : '',
                item.uploader ? `👤 *الناشر/المخرج:* ${item.uploader}` : '',
                item.description ? `📝 *الوصف:* ${item.description.slice(0, 400)}` : '',
                item.link ? `🔗 *الرابط:* ${item.link}` : ''
            ].filter(Boolean)

            // لو في صورة/بوستر صالح نبعته مع التفاصيل، وإلا نبعت نص فقط
            if (item.poster && /^https?:\/\//i.test(item.poster)) {
                try {
                    await conn.sendMessage(
                        m.chat,
                        {
                            image: { url: item.poster },
                            caption: lines.join('\n')
                        },
                        { quoted: m }
                    )
                    await m.react('✅').catch(() => {})
                    return true
                } catch {}
            }

            await conn.sendMessage(m.chat, { text: lines.join('\n') }, { quoted: m })
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
    const wait = await m.reply('⏳ *جاري جلب أقسام /home...*')

    try {
        const { sections } = await fetchHomeData()

        if (!sections.length) {
            await m.react('⚠️')
            return conn.sendMessage(m.chat, { text: '⚠️ لم يتم العثور على أقسام.', edit: wait.key })
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