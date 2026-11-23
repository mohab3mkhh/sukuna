// plugins/لوج.js — للمطور فقط
// .لوج <كلمة>            ← يدوّر في اللوج (الكونسول) على أي سطر فيه الكلمة، ويجيبلك السطر + اللي فوقه واللي تحته
// .لوج <كلمة> <رقم>      ← نفس الحاجة بعدد سطور سياق مختلف (الافتراضي 5 فوق و5 تحت)
// .لوج 40                ← آخر 40 سطر في اللوج
// .لوج                   ← آخر 25 سطر
//
// ملحوظة: البوت بيسجّل بنفسه كل اللي بيتطبع في الكونسول من وقت ما البلجن ده يتحمّل (يعني من أول تشغيل)،
// والتسجيل في الذاكرة (آخر 5000 سطر)، فلو البوت اتعمله Restart بيتمسح. اللوج القديم قبل كده موجود في Railway بس.

const MAX_LINES = 5000
const DEFAULT_CONTEXT = 5
const MAX_MATCHES = 5          // أقصى عدد نتايج (الأحدث)
const CHUNK = 3300             // طول الرسالة الواحدة

// ─── تسجيل الكونسول (مرة واحدة حتى مع الـ hot reload) ───
if (!global.__logCap) {
    const buf = []
    const state = { out: '', err: '' }
    const ANSI = /\x1B\[[0-9;?]*[ -/]*[@-~]/g
    const push = (kind, chunk) => {
        state[kind] += String(chunk)
        let i
        while ((i = state[kind].indexOf('\n')) >= 0) {
            const line = state[kind].slice(0, i).replace(ANSI, '').replace(/\r/g, '')
            state[kind] = state[kind].slice(i + 1)
            buf.push({ t: Date.now(), line })
            if (buf.length > MAX_LINES) buf.splice(0, buf.length - MAX_LINES)
        }
        if (state[kind].length > 20000) state[kind] = ''
    }
    for (const [kind, stream] of [['out', process.stdout], ['err', process.stderr]]) {
        const orig = stream.write.bind(stream)
        stream.write = (chunk, ...rest) => {
            try { push(kind, typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8')) } catch {}
            return orig(chunk, ...rest)
        }
    }
    global.__logCap = { buf }
}

const fmtTime = t => new Date(t).toLocaleTimeString('en-GB', { timeZone: 'Africa/Cairo', hour12: false })

function pack(lines) {
    // نقطّع النص لرسائل بحجم مناسب
    const chunks = []
    let cur = ''
    for (const l of lines) {
        const line = l.length > 400 ? l.slice(0, 400) + '…' : l
        if ((cur + line).length > CHUNK) { chunks.push(cur); cur = '' }
        cur += line + '\n'
    }
    if (cur) chunks.push(cur)
    return chunks
}

let handler = async (m, { conn, args, text, isROwner, isOwner }) => {
    const reply = t => conn.sendMessage(m.chat, { text: t }, { quoted: m })
    if (!isROwner && !isOwner) return reply('❌ الأمر ده للمطور فقط.')

    const buf = global.__logCap?.buf || []
    if (!buf.length) return reply('⚠️ مفيش لوج متسجل لسه.')

    // نستثني الأسطر اللي سببها الأمر نفسه (طباعة الرسالة اللي فيها .لوج ...)
    const raw = (text || '').trim()
    const toks = raw.split(/\s+/).filter(Boolean)
    let context = DEFAULT_CONTEXT
    let query = raw

    // .لوج  أو  .لوج 40  → آخر N سطر
    if (!toks.length || (toks.length === 1 && /^\d+$/.test(toks[0]))) {
        const n = Math.min(Math.max(parseInt(toks[0]) || 25, 1), 300)
        const lines = buf.slice(-n - 3).filter(e => !/لوج/.test(e.line)).slice(-n)
        return send(conn, m, lines.map(e => `${fmtTime(e.t)} ${e.line}`), `📜 آخر ${lines.length} سطر في اللوج`)
    }

    // آخر توكن رقم → عدد سطور السياق
    if (toks.length > 1 && /^\d{1,2}$/.test(toks[toks.length - 1])) {
        context = Math.min(parseInt(toks.pop()), 30)
        query = toks.join(' ')
    }

    const q = query.toLowerCase()
    const own = new RegExp(`لوج\\s+${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i')
    const hits = []
    for (let i = 0; i < buf.length; i++) {
        const l = buf[i].line
        if (l.toLowerCase().includes(q) && !own.test(l)) hits.push(i)
    }
    if (!hits.length) return reply(`🔎 مفيش أي سطر في اللوج فيه: *${query}*\n(اللوج المتسجل: ${buf.length} سطر من أول تشغيل البوت)`)

    const used = hits.slice(-MAX_MATCHES)
    // ندمج النطاقات المتداخلة
    const ranges = []
    for (const h of used) {
        const a = Math.max(0, h - context), b = Math.min(buf.length - 1, h + context)
        const last = ranges[ranges.length - 1]
        if (last && a <= last.b + 1) last.b = Math.max(last.b, b)
        else ranges.push({ a, b })
    }

    const hitSet = new Set(hits)
    const lines = []
    ranges.forEach((r, idx) => {
        if (idx) lines.push('──────────────────────────')
        for (let i = r.a; i <= r.b; i++) {
            lines.push(`${hitSet.has(i) && buf[i].line.toLowerCase().includes(q) ? '▶' : ' '} ${fmtTime(buf[i].t)} ${buf[i].line}`)
        }
    })

    const title = `🔎 *${query}* — ${hits.length} نتيجة${hits.length > used.length ? ` (بعرض آخر ${used.length})` : ''} | سياق ${context} سطر`
    return send(conn, m, lines, title)
}

async function send(conn, m, lines, title) {
    const chunks = pack(lines)
    if (!chunks.length) return conn.sendMessage(m.chat, { text: 'فاضي.' }, { quoted: m })
    // لو كبير جدًا نبعته كملف نصي
    if (chunks.length > 4) {
        return conn.sendMessage(m.chat, {
            document: Buffer.from(lines.join('\n'), 'utf8'),
            mimetype: 'text/plain',
            fileName: 'log.txt',
            caption: title,
        }, { quoted: m })
    }
    for (let i = 0; i < chunks.length; i++) {
        await conn.sendMessage(m.chat, { text: (i === 0 ? title + '\n\n' : '') + '```\n' + chunks[i] + '```' }, { quoted: m })
    }
}

handler.help = ['لوج <كلمة>']
handler.tags = ['owner']
handler.command = /^(لوج|log|logs)$/i
handler.owner = true

export default handler