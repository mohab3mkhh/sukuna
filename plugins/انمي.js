// plugins/انمي.js — بحث الأنمي
// الاستخدام: .انمي <الاسم>   أو   .anime <name>
// المصدر: prexzyapis.com/anime/animekill-search

import axios from 'axios'
import { sendButtons, btn } from '../lib/buttons.js'

const API   = 'https://prexzyapis.com/anime/animekill-search'
const UA    = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36'
const FOOTER = '⛩️ SUKUNA BOT ⛩️'
const MAX_RESULTS = 10
const TTL = 30 * 60 * 1000     // نتائج البحث تفضل متاحة 30 دقيقة

// ───────────── كاش نتائج البحث (عشان الضغط على الاختيار ما يحتاجش طلب تاني) ─────────────
const CACHE = new Map()

function putCache(query, items) {
    const now = Date.now()
    for (const [k, v] of CACHE) if (now - v.at > TTL) CACHE.delete(k)
    if (CACHE.size >= 100) CACHE.delete(CACHE.keys().next().value)
    const token = Math.random().toString(36).slice(2, 7)
    CACHE.set(token, { query, items, at: now })
    return token
}

// ───────────── أدوات ─────────────
const clip = (s, n) => {
    const t = String(s ?? '').replace(/\s+/g, ' ').trim()
    return t.length > n ? t.slice(0, n - 1) + '…' : t
}

const posterOf = (a) =>
    [a?.large_poster, a?.orginal_poster, a?.small_poster].find(u => typeof u === 'string' && /^https?:\/\//i.test(u)) || null

const statusLabel = (s) => ({ complete: 'مكتمل ✅', completed: 'مكتمل ✅', ongoing: 'مستمر 🔄' }[String(s || '').toLowerCase()] || (s ? String(s).toUpperCase() : '—'))

const scoreLabel = (s) => (s && String(s) !== '5' ? `⭐ ${s}` : '—')   // "5" قيمة افتراضية في الـ API

const dateLabel = (d) => {
    try { return new Date(d).toLocaleDateString('ar-EG', { timeZone: 'Africa/Cairo', dateStyle: 'medium' }) } catch { return '—' }
}

async function searchAnime(query) {
    const r = await axios.get(`${API}?query=${encodeURIComponent(query)}`, {
        timeout: 20000,
        headers: { 'User-Agent': UA, Accept: 'application/json' }
    })
    const d = r.data
    if (d?.status === false) throw new Error(String(d?.message || 'الـ API رجّع خطأ').slice(0, 100))
    const list = d?.data?.data?.animelist
    if (!Array.isArray(list)) throw new Error('شكل رد الـ API غير متوقع')
    return list.filter(a => a?.name)
}

// ───────────── العرض ─────────────
async function sendResults(conn, m, entry, token) {
    const items = entry.items.slice(0, MAX_RESULTS)

    const rows = items.map((a, i) => ({
        title: clip(a.name, 24),
        description: clip(`${a.genre || '—'} • ${scoreLabel(a.score)} • ${statusLabel(a.airing_status)}`, 72),
        id: `anime:${token}:${i}`
    }))

    const text =
        `╭┈➤🔎 *نتائج البحث عن:* ${entry.query}\n` +
        `╰──────────── ೄྀ࿐ ˊˎ-\n\n` +
        `📊 عدد النتائج: *${entry.items.length}*${entry.items.length > MAX_RESULTS ? ` (عرض أول ${MAX_RESULTS})` : ''}\n\n` +
        `اختر الأنمي من القائمة 👇`

    const fallback = text + '\n\n' + items.map((a, i) => `*${i + 1}.* ${a.name}`).join('\n')

    try {
        await sendButtons(conn, m.chat, {
            title: '🎌 بحث الأنمي',
            text,
            footer: FOOTER,
            image: posterOf(items[0]) || undefined,
            buttons: [btn.list('📜 اختر أنمي', [{ title: 'النتائج', rows }])]
        }, m)
    } catch (e) {
        console.error('[انمي] buttons failed:', e?.message || e)
        await conn.sendMessage(m.chat, { text: fallback }, { quoted: m })
    }
}

async function sendCard(conn, m, entry, token, a) {
    const views = Number(a.total_watch)
    const mal = typeof a.synonyms_collection_source === 'string' && /^https?:\/\//i.test(a.synonyms_collection_source)
        ? a.synonyms_collection_source : null

    const text =
        `🎬 *${a.name}*\n` +
        `━━━━━━━━━━━━━━━\n` +
        `🎭 *النوع:* ${a.genre ? a.genre.split(',').join(' • ') : '—'}\n` +
        `📺 *التصنيف:* ${a.anime_type || '—'}\n` +
        `📡 *الحالة:* ${statusLabel(a.airing_status)}\n` +
        `⭐ *التقييم:* ${scoreLabel(a.score)}\n` +
        `👁️ *المشاهدات:* ${Number.isFinite(views) ? views.toLocaleString('en-US') : '—'}\n` +
        `🌏 *المنشأ:* ${a.anime_origin || '—'}\n` +
        `🕒 *آخر تحديث:* ${dateLabel(a.last_update)}\n` +
        (a.synonyms ? `🔤 *أسماء أخرى:* ${clip(a.synonyms, 160)}\n` : '')

    const buttons = [btn.reply('🔙 رجوع للنتائج', `anime:${token}:back`)]
    if (mal) buttons.push(btn.url('🔗 MyAnimeList', mal))

    try {
        await sendButtons(conn, m.chat, {
            title: '🎌 تفاصيل الأنمي',
            text,
            footer: FOOTER,
            image: posterOf(a) || undefined,
            buttons
        }, m)
    } catch (e) {
        console.error('[انمي] card failed:', e?.message || e)
        await conn.sendMessage(m.chat, { text }, { quoted: m })
    }
}

// ───────────── الأمر ─────────────
const handler = async (m, { conn, text, usedPrefix, command }) => {
    const query = String(text || '').trim()
    if (!query) {
        return m.reply(`╭┈➤🎌 *بحث الأنمي*\n╰──────────── ೄྀ࿐ ˊˎ-\n\nاكتب اسم الأنمي:\n• ${usedPrefix}${command} One Piece\n• ${usedPrefix}${command} ناروتو`)
    }

    await m.react('🔎')
    try {
        const items = await searchAnime(query)
        if (!items.length) {
            await m.react('❌')
            return m.reply(`❌ ما لقيتش نتايج لـ *${query}*\nجرّب تكتب الاسم بالإنجليزي أو بشكل تاني`)
        }
        const token = putCache(query, items)
        await sendResults(conn, m, CACHE.get(token), token)
        await m.react('✅')
    } catch (e) {
        console.error('[انمي]', e?.response?.status ? `HTTP ${e.response.status}` : (e?.message || e))
        await m.react('❌')
        await m.reply('❌ حصل خطأ في البحث، حاول مرة أخرى')
    }
}

// ───────────── اختيار من القائمة / زراير الرجوع ─────────────
handler.before = async function (m, { conn } = {}) {
    conn = conn || this
    if (!m || typeof m.text !== 'string' || !m.chat || m.fromMe) return false

    const t = m.text.trim()
    if (!t.startsWith('anime:')) return false

    const [, token, arg] = t.split(':')
    const entry = CACHE.get(token)
    if (!entry || Date.now() - entry.at > TTL) {
        await conn.sendMessage(m.chat, { react: { text: '⌛', key: m.key } }).catch(() => {})
        await conn.sendMessage(m.chat, { text: '⌛ انتهت صلاحية نتائج البحث، ابحث من جديد' }, { quoted: m })
        return true
    }

    if (arg === 'back') {
        await sendResults(conn, m, entry, token)
        return true
    }

    const item = entry.items[Number(arg)]
    if (item) await sendCard(conn, m, entry, token, item)
    return true
}

handler.help = ['انمي <الاسم>', 'anime <name>']
handler.tags = ['anime']
handler.command = /^(انمي|anime)$/i

export default handler