// plugins/ستيكر_صوت.js — ربط ستيكر بصوت/أغنية
// لما أي حد يبعت الستيكر المربوط، البوت يرد عليه بالصوت المخصص.
//
// الأوامر (للأدمن في الجروب أو المطور):
//   رد على ستيكر + .ربط_صوت   ← بعدها ابعت/رد بالصوت (خلال 90 ثانية)
//   رد على صوت   + .ربط_صوت   ← بعدها ابعت الستيكر المطلوب (خلال 90 ثانية)
//   رد على ستيكر + .فك_ربط    ← يشيل الربط
//   .اصوات_الستيكر            ← عرض عدد الاستيكرات المربوطة

import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

const DIR        = path.join(process.cwd(), 'Sessions', 'sticker_sounds')
const INDEX_FILE = path.join(process.cwd(), 'Sessions', 'sticker_sounds.json')
const MAX_BYTES  = 2 * 1024 * 1024     // أكبر حجم للصوت
const MAX_SECONDS = 60
const MAX_ITEMS  = 200
const PENDING_MS = 90 * 1000
const COOLDOWN_MS = 4000

// ───────────── التخزين ─────────────
let INDEX = null

function loadIndex() {
    if (INDEX) return INDEX
    try { INDEX = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8')) } catch { INDEX = {} }
    if (!INDEX || typeof INDEX !== 'object') INDEX = {}
    return INDEX
}

function saveIndex() {
    try {
        fs.mkdirSync(path.dirname(INDEX_FILE), { recursive: true })
        fs.writeFileSync(INDEX_FILE, JSON.stringify(INDEX, null, 2))
    } catch (e) { console.error('[ستيكر_صوت] save index fail:', e.message) }
}

const fileNameFor = (hash, ext) => crypto.createHash('sha1').update(hash).digest('hex').slice(0, 12) + '.' + ext

const extFor = (mime = '') =>
    /ogg|opus/i.test(mime) ? 'ogg' : /mpeg|mp3/i.test(mime) ? 'mp3' : /mp4|m4a|aac/i.test(mime) ? 'm4a' : /wav/i.test(mime) ? 'wav' : 'bin'

function saveMapping(hash, buffer, { mimetype, ptt, by }) {
    const idx = loadIndex()
    if (!idx[hash] && Object.keys(idx).length >= MAX_ITEMS) throw new Error(`وصلت للحد الأقصى (${MAX_ITEMS} ستيكر)`)

    fs.mkdirSync(DIR, { recursive: true })
    const old = idx[hash]
    const file = fileNameFor(hash, extFor(mimetype))
    fs.writeFileSync(path.join(DIR, file), buffer)
    if (old && old.file !== file) { try { fs.unlinkSync(path.join(DIR, old.file)) } catch {} }

    idx[hash] = { file, mimetype: mimetype || 'audio/mpeg', ptt: !!ptt, by, at: Date.now() }
    saveIndex()
}

function removeMapping(hash) {
    const idx = loadIndex()
    const item = idx[hash]
    if (!item) return false
    try { fs.unlinkSync(path.join(DIR, item.file)) } catch {}
    delete idx[hash]
    saveIndex()
    return true
}

// ───────────── أدوات ─────────────
const toB64 = (v) => {
    if (!v) return null
    if (typeof v === 'string') return v
    try { return Buffer.from(v).toString('base64') } catch { return null }
}

const stickerHash = (m) =>
    toB64(m?.msg?.fileSha256 || m?.fakeObj?.message?.stickerMessage?.fileSha256 || m?.message?.stickerMessage?.fileSha256)

const sendMime = (mime = '') =>
    /ogg|opus/i.test(mime) ? 'audio/ogg; codecs=opus' : /mp4|m4a|aac/i.test(mime) ? 'audio/mp4' : /wav/i.test(mime) ? 'audio/wav' : 'audio/mpeg'

const pendingOf = (conn) => (conn.stickerSoundPending ||= {})
const lastPlay = new Map()

async function readAudio(msg) {
    const seconds = Number(msg?.msg?.seconds || 0)
    if (seconds && seconds > MAX_SECONDS) throw new Error(`الصوت أطول من ${MAX_SECONDS} ثانية`)
    const buffer = await msg.download()
    if (!buffer?.length) throw new Error('ما قدرتش أحمّل الصوت')
    if (buffer.length > MAX_BYTES) throw new Error(`الصوت أكبر من ${(MAX_BYTES / 1048576).toFixed(0)} MB`)
    return {
        buffer: Buffer.from(buffer),
        mimetype: msg?.msg?.mimetype || 'audio/mpeg',
        ptt: !!msg?.msg?.ptt
    }
}

// ───────────── الأوامر ─────────────
const handler = async (m, { conn, command, isAdmin, isROwner, usedPrefix }) => {
    const idx = loadIndex()

    if (/^اصوات_الستيكر$/i.test(command)) {
        const n = Object.keys(idx).length
        return m.reply(`🎵 *استيكرات الصوت*\n\nعدد الاستيكرات المربوطة: *${n}* / ${MAX_ITEMS}`)
    }

    if (!isROwner && !(m.isGroup && isAdmin)) return m.reply('❌ الأمر ده للأدمن (في الجروب) أو المطور بس')

    const q = m.quoted

    // فك الربط
    if (/^(فك_ربط|حذف_ربط)$/i.test(command)) {
        if (q?.mtype !== 'stickerMessage') return m.reply(`📌 رد على الستيكر بـ *${usedPrefix}${command}*`)
        const hash = stickerHash(q)
        if (!hash) return m.reply('❌ ما قدرتش أقرا الستيكر')
        return m.reply(removeMapping(hash) ? '✅ تم فك ربط الصوت من الستيكر' : '⚠️ الستيكر ده مش مربوط بصوت')
    }

    // الربط
    const key = `${m.chat}|${m.sender}`
    const pending = pendingOf(conn)

    if (q?.mtype === 'stickerMessage') {
        const hash = stickerHash(q)
        if (!hash) return m.reply('❌ ما قدرتش أقرا الستيكر')
        pending[key] = { type: 'wait-audio', hash, exp: Date.now() + PENDING_MS }
        return m.reply('🎵 تمام! ابعت *الصوت أو الأغنية* دلوقتي (أو رد على صوت) خلال 90 ثانية.\nللإلغاء اكتب: *الغاء*')
    }

    if (q?.mtype === 'audioMessage') {
        try {
            const audio = await readAudio(q)
            pending[key] = { type: 'wait-sticker', audio, exp: Date.now() + PENDING_MS }
            return m.reply('🎴 تمام! ابعت *الستيكر* اللي عايز تربطه بالصوت ده خلال 90 ثانية.\nللإلغاء اكتب: *الغاء*')
        } catch (e) {
            return m.reply(`❌ ${e.message}`)
        }
    }

    return m.reply(`📌 *طريقة الاستخدام:*\n• رد على ستيكر بـ ${usedPrefix}${command} وبعدها ابعت الصوت\n• أو رد على صوت بـ ${usedPrefix}${command} وبعدها ابعت الستيكر`)
}

// ───────────── الرسائل العادية: إكمال الربط + تشغيل الصوت ─────────────
handler.before = async function (m, { conn } = {}) {
    conn = conn || this
    if (!m || !m.chat || m.fromMe || typeof m.mtype !== 'string') return false

    const key = `${m.chat}|${m.sender}`
    const pending = pendingOf(conn)
    const p = pending[key]

    // 1) إكمال ربط جارٍ
    if (p) {
        if (Date.now() > p.exp) {
            delete pending[key]
        } else if (typeof m.text === 'string' && /^(الغاء|إلغاء|cancel)$/i.test(m.text.trim())) {
            delete pending[key]
            await conn.sendMessage(m.chat, { text: '🚫 تم إلغاء الربط' }, { quoted: m })
            return true
        } else if (p.type === 'wait-audio' && m.mtype === 'audioMessage') {
            try {
                const audio = await readAudio(m)
                saveMapping(p.hash, audio.buffer, { mimetype: audio.mimetype, ptt: audio.ptt, by: m.sender })
                delete pending[key]
                await conn.sendMessage(m.chat, { text: '✅ تم! الستيكر ده دلوقتي بيشغّل الصوت لما حد يبعته 🎵' }, { quoted: m })
            } catch (e) {
                await conn.sendMessage(m.chat, { text: `❌ ${e.message}` }, { quoted: m })
            }
            return true
        } else if (p.type === 'wait-sticker' && m.mtype === 'stickerMessage') {
            try {
                const hash = stickerHash(m)
                if (!hash) throw new Error('ما قدرتش أقرا الستيكر')
                saveMapping(hash, p.audio.buffer, { mimetype: p.audio.mimetype, ptt: p.audio.ptt, by: m.sender })
                delete pending[key]
                await conn.sendMessage(m.chat, { text: '✅ تم! الستيكر ده دلوقتي بيشغّل الصوت لما حد يبعته 🎵' }, { quoted: m })
            } catch (e) {
                await conn.sendMessage(m.chat, { text: `❌ ${e.message}` }, { quoted: m })
            }
            return true
        }
    }

    // 2) تشغيل الصوت لو الستيكر مربوط
    if (m.mtype === 'stickerMessage') {
        const hash = stickerHash(m)
        const item = hash ? loadIndex()[hash] : null
        if (!item) return false

        const now = Date.now()
        if (now - (lastPlay.get(m.chat) || 0) < COOLDOWN_MS) return false
        lastPlay.set(m.chat, now)

        try {
            const buffer = fs.readFileSync(path.join(DIR, item.file))
            await conn.sendMessage(m.chat, {
                audio: buffer,
                mimetype: sendMime(item.mimetype),
                ptt: item.ptt
            }, { quoted: m })
        } catch (e) {
            console.error('[ستيكر_صوت] play fail:', e?.message || e)
        }
    }

    return false
}

handler.help = ['ربط_صوت', 'فك_ربط', 'اصوات_الستيكر']
handler.tags = ['tools']
handler.command = /^(ربط_صوت|ستيكر_صوت|فك_ربط|حذف_ربط|اصوات_الستيكر)$/i

export default handler