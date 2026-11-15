// plugins/viewonce.js — كشف رسائل "عرض لمرة واحدة"
// الاستخدام: رد على رسالة عرض لمرة واحدة بكلمة  .ع
// بيسجّل الرسائل من أول ما توصل (قبل ما الهاندلر يلمسها)، فمش بيعتمد على شكل m المعالَج.

import { downloadContentFromMessage } from '@whiskeysockets/baileys'

const VER = 3
const MAX_CACHE = 300
const WRAPPERS = ['viewOnceMessage', 'viewOnceMessageV2', 'viewOnceMessageV2Extension', 'ephemeralMessage', 'documentWithCaptionMessage', 'editedMessage']
const MEDIA = { imageMessage: 'image', videoMessage: 'video', audioMessage: 'audio' }

if (!global._voCache) global._voCache = new Map()
if (!global._voSeen) global._voSeen = []
global._voCount = global._voCount || 0

// شكل مختصر للرسالة (المفاتيح بس) لأغراض الفحص
export function shape(o, d = 0) {
    if (!o || typeof o !== 'object') return typeof o === 'boolean' ? o : '·'
    if (d > 3) return '…'
    const out = {}
    for (const k of Object.keys(o).filter(k => !/key$|sha|enc|url|path|thumbnail|signature|hash/i.test(k)).slice(0, 14)) out[k] = shape(o[k], d + 1)
    return out
}

// يفك الأغلفة ويرجّع { inner, wrapped } — wrapped = true لو فيه غلاف viewOnce
export function unwrap(message) {
    let cur = message, wrapped = false
    for (let i = 0; i < 6 && cur; i++) {
        const k = WRAPPERS.find(x => cur[x]?.message)
        if (!k) break
        if (k.startsWith('viewOnce')) wrapped = true
        cur = cur[k].message
    }
    return { inner: cur, wrapped }
}

// لو الرسالة عرض مرة واحدة (بغلاف أو بعلامة viewOnce على الميديا نفسها) يرجّع { type, media }
export function findViewOnce(message) {
    const { inner, wrapped } = unwrap(message)
    if (!inner) return null
    const key = Object.keys(MEDIA).find(k => inner[k])
    if (!key) return null
    if (!wrapped && inner[key].viewOnce !== true) return null
    return { type: MEDIA[key], media: inner[key] }
}

function store(raw) {
    try {
        const id = raw?.key?.id
        if (!id || !raw.message) return
        global._voCount++
        const sh = JSON.stringify(shape(raw.message))
        if (/image|video|audio|iewOnce/i.test(sh)) {
            global._voSeen.push(sh.slice(0, 220))
            if (global._voSeen.length > 4) global._voSeen.shift()
        }
        if (!findViewOnce(raw.message)) return
        global._voCache.set(id, raw)
        if (global._voCache.size > MAX_CACHE) global._voCache.delete(global._voCache.keys().next().value)
        console.log('[عرض] ✅ اتسجلت رسالة عرض مرة واحدة:', id)
    } catch (e) { console.error('[عرض store]', e.message) }
}

// بنربط مستمع مباشر على أحداث الرسائل (مرة واحدة لكل اتصال، ولو الملف اتحدّث بنبدّله)
function attach(conn) {
    if (!conn?.ev || conn.__voAttached === VER) return
    try {
        if (conn.__voListener) conn.ev.off('messages.upsert', conn.__voListener)
        const listener = up => { for (const raw of up?.messages || []) store(raw) }
        conn.ev.on('messages.upsert', listener)
        conn.__voListener = listener
        conn.__voAttached = VER
        console.log('[عرض] ✅ المستمع اشتغل')
    } catch (e) { console.error('[عرض attach]', e.message) }
}

try { attach(global.conn) } catch {}

async function download(media, type) {
    const stream = await downloadContentFromMessage(media, type)
    const chunks = []
    for await (const c of stream) chunks.push(c)
    return Buffer.concat(chunks)
}

const handler = async (m, { conn }) => {
    attach(conn)
    try {
        const { inner } = unwrap(m.message)
        const ctx = Object.values(inner || {}).find(v => v && typeof v === 'object' && v.contextInfo)?.contextInfo
        if (!ctx?.quotedMessage) return m.reply('⚠️ رد على رسالة عرض لمرة واحدة بكتابة .ع')

        // 1) من اللي سجّلناه    2) من نسخة الرسالة المقتبسة نفسها
        const cached = global._voCache.get(ctx.stanzaId)
        const found = (cached && findViewOnce(cached.message)) || findViewOnce(ctx.quotedMessage)
        if (!found || !found.media?.mediaKey) {
            return m.reply(`❌ مقدرتش ألاقي الرسالة دي.\nلازم تكون وصلت للبوت وهو شغال (البوت بيفقد اللي سجّله لما يعمل Restart).\n\n🔧 فحص:\n• المسجّل: ${global._voCache.size}\n• المستمع: ${conn.__voAttached === VER ? 'شغال' : 'مش شغال'}\n• رسائل شافها المستمع: ${global._voCount}\n• شكل الرسالة اللي رديت عليها:\n${JSON.stringify(shape(ctx.quotedMessage)).slice(0, 400)}\n• آخر ميديا شافها:\n${global._voSeen.join('\n') || '(ولا واحدة)'}`)
        }

        await conn.sendMessage(m.chat, { react: { text: '👁️', key: m.key } }).catch(() => {})
        const buffer = await download(found.media, found.type)
        const caption = found.media.caption || '👁️ *تم الكشف*'

        if (found.type === 'image') return conn.sendMessage(m.chat, { image: buffer, caption }, { quoted: m })
        if (found.type === 'video') return conn.sendMessage(m.chat, { video: buffer, caption }, { quoted: m })
        return conn.sendMessage(m.chat, { audio: buffer, mimetype: 'audio/mp4', ptt: !!found.media.ptt }, { quoted: m })
    } catch (err) {
        console.error('[عرض]', err.message)
        m.reply('⚠️ فشل التحميل — ' + err.message)
    }
}

// احتياطي: لو المستمع اتأخر، أول رسالة بتعدّي على الهاندلر بتربطه
handler.all = async function () { attach(this) }

handler.help = ['فضح', 'عرض']
handler.tags = ['ادوات']
handler.command = /^(ع|عرض|view|فضح|vv)$/i

export default handler