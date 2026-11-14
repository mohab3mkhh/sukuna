// plugins/_quote-fix.js
// ✧ إصلاح الرد (Reply/Quote) اللي مش بيظهر على واتساب العادي
//   الأوامر (للمالك):
//     .تجربة_الرد      → يبعت 4 ردود بطرق مختلفة، وانت تقولي أرقام اللي ظهر فيها "الاقتباس" على واتساب العادي
//     .وضع_الرد 1..4   → يغيّر الطريقة فورًا (لحد ما البوت يتعمله Restart)
//   وللتثبيت: غيّر DEFAULT_MODE تحت للرقم الشغال.

const DEFAULT_MODE = 1
if (global.quoteMode === undefined) global.quoteMode = DEFAULT_MODE

const isPhone = j => typeof j === 'string' && j.endsWith('@s.whatsapp.net')

// 1 = زي ما هو | 2 = participant برقم الهاتف | 3 = نص الرسالة المقتبسة يتبني من جديد | 4 = الاتنين
export function rebuild(q, mode) {
    if (!q?.key || mode === 1) return q
    const k = q.key
    const key = { ...k }

    if (mode === 2 || mode === 4) {
        const p = [k.participantAlt, k.participant, k.remoteJidAlt].find(isPhone)
        if (p) key.participant = p
    }

    let message = q.message
    if (mode === 3 || mode === 4) {
        const text = q.text ?? q.msg?.text ?? q.msg?.caption ?? ''
        const kind = Object.keys(q.message || {})[0]
        if (text && (kind === 'conversation' || kind === 'extendedTextMessage')) message = { conversation: String(text) }
    }
    return { key, message }
}

function patch(conn) {
    if (!conn || conn.__quotePatched) return
    const orig = conn.sendMessage.bind(conn)
    conn.__origSend = orig
    conn.sendMessage = (jid, content, opts) => {
        try {
            if (opts?.quoted?.key && global.quoteMode !== 1) {
                opts = { ...opts, quoted: rebuild(opts.quoted, global.quoteMode) }
            }
        } catch (e) { console.error('[quote-fix]', e.message) }
        return orig(jid, content, opts)
    }
    conn.__quotePatched = true
    console.log(`[quote-fix] ✅ وضع الرد: ${global.quoteMode}`)
}

const wait = ms => new Promise(r => setTimeout(r, ms))

let handler = async (m, { conn, command, text, isROwner }) => {
    if (!isROwner) return
    const raw = conn.__origSend || conn.sendMessage.bind(conn)

    if (/^وضع_الرد$/i.test(command)) {
        const n = parseInt(text)
        if (![1, 2, 3, 4].includes(n)) return raw(m.chat, { text: `الوضع الحالي: ${global.quoteMode}\nاكتب: .وضع_الرد 1 (أو 2 أو 3 أو 4)` }, { quoted: rebuild(m, global.quoteMode) })
        global.quoteMode = n
        return raw(m.chat, { text: `✅ وضع الرد بقى ${n}` }, { quoted: rebuild(m, n) })
    }

    await raw(m.chat, { text: '🧪 هبعت 4 ردود. قولي أرقام اللي ظهر فوقها *اقتباس* لرسالتك على واتساب العادي.' })
    for (const n of [1, 2, 3, 4]) {
        try { await raw(m.chat, { text: `رد رقم ${n}` }, { quoted: rebuild(m, n) }) } catch (e) { console.error('[quote-fix test]', n, e.message) }
        await wait(1200)
    }
    await raw(m.chat, { text: '✅ خلصت. اكتب لي الأرقام اللي ظهر فيها الاقتباس.' })
}

handler.all = async function () { patch(this) }

handler.help = ['تجربة_الرد', 'وضع_الرد']
handler.tags = ['owner']
handler.command = /^(تجربة_الرد|وضع_الرد)$/i
handler.owner = true

export default handler