// plugins/حلمي.js — تفسير الأحلام بالذكاء الاصطناعي
// الاستخدام: .حلمي <وصف الحلم>
// المصدر: prexzyapis.com/ai/dream

import axios from 'axios'
import { sendButtons, btn } from '../lib/buttons.js'

const API    = 'https://prexzyapis.com/ai/dream'
const UA     = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36'
const FOOTER = '⛩️ SUKUNA BOT ⛩️'
const TTL    = 30 * 60 * 1000
const MIN_LEN = 3
const MAX_LEN = 400

// ───────────── أدوات تحويل النص ─────────────
const HEAD = {
    'Interpretation': '📖 التفسير',
    'Core Insight': '💡 الخلاصة',
    'Key Themes': '🎯 المحاور الرئيسية',
    'Practical Steps': '✅ خطوات عملية',
    'Symbols': '🔮 الرموز',
    'Dream Emoji Sequence': '🎭 تسلسل الإيموجي'
}

// Markdown → أسطر بتنسيق واتساب
function mdToLines(md) {
    return String(md || '')
        .replace(/\r/g, '')
        .replace(/^#{1,4}\s*(.+)$/gm, (_, h) => `*${HEAD[h.trim()] || h.trim()}*`)
        .replace(/\*\*(.+?)\*\*/g, '*$1*')
        .replace(/^\s*[-•]\s+/gm, '• ')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
        .split('\n')
}

const PREFIX_RE = /^(\s*(?:•|\d+\.)\s*)/
// ───END HELPERS───

// ───────────── كاش ─────────────
const CACHE = new Map()

function putCache(dream, md) {
    const now = Date.now()
    for (const [k, v] of CACHE) if (now - v.at > TTL) CACHE.delete(k)
    if (CACHE.size >= 100) CACHE.delete(CACHE.keys().next().value)
    const token = Math.random().toString(36).slice(2, 7)
    CACHE.set(token, { dream, md, lines: mdToLines(md), ar: null, at: now })
    return token
}

// ───────────── الـ API ─────────────
async function interpret(dream) {
    const r = await axios.get(`${API}?dream=${encodeURIComponent(dream)}`, {
        timeout: 60000,
        headers: { 'User-Agent': UA, Accept: 'application/json' }
    })
    const d = r.data
    if (d?.status === false) throw new Error(String(d?.message || d?.error || 'الـ API رجّع خطأ').slice(0, 100))
    if (typeof d?.result !== 'string' || !d.result.trim()) throw new Error('رد الـ API فاضي')
    return { md: d.result, dream: d.dream || dream }
}

// ───────────── ترجمة للعربي (اختيارية) ─────────────
async function translateLines(lines) {
    const { translate } = await import('@vitalets/google-translate-api')

    const out = [...lines]
    const idx = []
    const src = []
    const prefixes = []

    lines.forEach((l, i) => {
        if (!/[A-Za-z]{3,}/.test(l)) return
        const pre = l.match(PREFIX_RE)?.[1] || ''
        idx.push(i)
        prefixes.push(pre)
        src.push(l.slice(pre.length).replace(/\*/g, '').trim())
    })
    if (!src.length) return lines.join('\n')

    const res = await translate(src.join('\n'), { to: 'ar' })
    const parts = String(res.text).split('\n')

    if (parts.length !== src.length) return String(res.text)   // تنسيق مختلف: نرجّع الترجمة كما هي

    idx.forEach((li, k) => {
        const wasBold = /^\*.*\*$/.test(lines[li].trim())
        const t = parts[k].trim()
        out[li] = prefixes[k] + (wasBold ? `*${t}*` : t)
    })
    return out.join('\n')
}

// ───────────── الإرسال ─────────────
async function sendResult(conn, m, token, entry) {
    const text =
        `╭┈➤🌙 *تفسير حلمك*\n╰──────────── ೄྀ࿐ ˊˎ-\n\n` +
        `💭 *الحلم:* ${entry.dream}\n` +
        `━━━━━━━━━━━━━━━\n\n` +
        entry.lines.join('\n') +
        `\n\n━━━━━━━━━━━━━━━\n_تفسير ترفيهي بالذكاء الاصطناعي وليس حكماً شرعياً_`

    try {
        await sendButtons(conn, m.chat, {
            text,
            footer: FOOTER,
            buttons: [
                btn.reply('🌐 ترجمة للعربي', `dream:${token}:ar`),
                btn.reply('🔁 تفسير جديد', `dream:${token}:again`)
            ]
        }, m)
    } catch (e) {
        console.error('[حلمي] buttons failed:', e?.message || e)
        await conn.sendMessage(m.chat, { text }, { quoted: m })
    }
}

async function run(conn, m, dream) {
    await m.react('🌙')
    try {
        const { md, dream: shown } = await interpret(dream)
        const token = putCache(shown, md)
        await sendResult(conn, m, token, CACHE.get(token))
        await m.react('✅')
    } catch (e) {
        console.error('[حلمي]', e?.response?.status ? `HTTP ${e.response.status}` : (e?.message || e))
        await m.react('❌')
        await m.reply('❌ حصل خطأ أثناء تفسير الحلم، حاول مرة أخرى بعد شوية')
    }
}

// ───────────── الأمر ─────────────
const handler = async (m, { conn, text, usedPrefix, command }) => {
    const dream = String(text || '').trim()

    if (!dream) {
        return m.reply(`╭┈➤🌙 *تفسير الأحلام*\n╰──────────── ೄྀ࿐ ˊˎ-\n\nاكتب حلمك بعد الأمر:\n• ${usedPrefix}${command} شفت إني بطير فوق مدينة\n• ${usedPrefix}${command} I saw a white horse`)
    }
    if (dream.length < MIN_LEN) return m.reply('❌ اوصف الحلم بكلمات أكتر شوية')
    if (dream.length > MAX_LEN) return m.reply(`❌ الوصف طويل، اختصره في ${MAX_LEN} حرف أو أقل`)

    await run(conn, m, dream)
}

// ───────────── الأزرار ─────────────
handler.before = async function (m, { conn } = {}) {
    conn = conn || this
    if (!m || typeof m.text !== 'string' || !m.chat || m.fromMe) return false

    const t = m.text.trim()
    if (!t.startsWith('dream:')) return false

    const [, token, action] = t.split(':')
    const entry = CACHE.get(token)
    if (!entry || Date.now() - entry.at > TTL) {
        await conn.sendMessage(m.chat, { text: '⌛ انتهت صلاحية النتيجة، اكتب حلمك من جديد بالأمر .حلمي' }, { quoted: m })
        return true
    }

    if (action === 'again') {
        await run(conn, m, entry.dream)
        return true
    }

    if (action === 'ar') {
        if (entry.ar) {
            await conn.sendMessage(m.chat, { text: entry.ar }, { quoted: m })
            return true
        }
        await conn.sendMessage(m.chat, { react: { text: '⏳', key: m.key } }).catch(() => {})
        try {
            const ar = await translateLines(entry.lines)
            entry.ar = `🌐 *الترجمة العربية*\n━━━━━━━━━━━━━━━\n\n${ar}`
            await conn.sendMessage(m.chat, { text: entry.ar }, { quoted: m })
            await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } }).catch(() => {})
        } catch (e) {
            console.error('[حلمي] translate:', e?.message || e)
            await conn.sendMessage(m.chat, { text: '❌ الترجمة مش متاحة دلوقتي، جرّب بعد شوية' }, { quoted: m })
        }
        return true
    }

    return true
}

handler.help = ['حلمي <وصف الحلم>']
handler.tags = ['ai']
handler.command = /^(حلمي|dream)$/i

export default handler