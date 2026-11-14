// plugins/_quote-fix.js
// ✧ إصلاح الرد (Reply/Quote) اللي مش بيظهر على واتساب العادي
//   الأوامر (للمالك):
//     .تجربة_الرد      → يبعت 4 ردود بطرق مختلفة، وانت تقولي أرقام اللي ظهر فيها "الاقتباس" على واتساب العادي
//     .وضع_الرد 1..4   → يغيّر الطريقة فورًا (لحد ما البوت يتعمله Restart)
//   وللتثبيت: غيّر DEFAULT_MODE تحت للرقم الشغال.

const DEFAULT_MODE = 5
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

// 5 = من غير خيار quoted خالص: بنبني الـ contextInfo بإيدينا
export function manual(q) {
    const k = q.key
    const phone = [k.participantAlt, k.participant, k.remoteJidAlt].find(isPhone)
    const kind = Object.keys(q.message || {})[0] || ''
    const label = { imageMessage: '📷 صورة', videoMessage: '🎥 فيديو', audioMessage: '🎵 صوت', stickerMessage: '🏷️ ملصق', documentMessage: '📄 ملف' }[kind]
    const text = q.text || q.msg?.text || q.msg?.caption || label || ''
    return { stanzaId: k.id, participant: phone || k.participant || k.remoteJid, quotedMessage: { conversation: String(text || ' ') } }
}

function patch(conn) {
    if (!conn || conn.__quotePatched) return
    const orig = conn.sendMessage.bind(conn)
    conn.__origSend = orig
    conn.sendMessage = (jid, content, opts) => {
        try {
            if (opts?.quoted?.key) {
                // رسالة "محوّلة" ما بيظهرش عليها اقتباس في واتساب العادي، فبنشيل علامة التحويل لما يكون فيه رد
                if (global.quoteStripForward !== false && content?.contextInfo) {
                    const { isForwarded, forwardingScore, forwardedNewsletterMessageInfo, ...ci } = content.contextInfo
                    content = { ...content, contextInfo: ci }
                }
                if (global.quoteMode === 5 && content && typeof content === 'object') {
                    const { quoted, ...rest } = opts
                    content = { ...content, contextInfo: { ...(content.contextInfo || {}), ...manual(quoted) } }
                    opts = rest
                } else if (global.quoteMode !== 1) {
                    opts = { ...opts, quoted: rebuild(opts.quoted, global.quoteMode) }
                }
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

    if (/^فحص_الرد$/i.test(command)) {
        const info = { chat: m.chat, key: m.key, sender: m.sender, mtype: m.mtype, isGroup: m.isGroup, mode: global.quoteMode, patched: !!conn.__quotePatched, bot: conn.user?.id }
        return raw(m.chat, { text: '```' + JSON.stringify(info, null, 1) + '```' })
    }

    if (/^وضع_الرد$/i.test(command)) {
        const n = parseInt(text)
        if (![1, 2, 3, 4, 5].includes(n)) return raw(m.chat, { text: `الوضع الحالي: ${global.quoteMode}\nاكتب: .وضع_الرد 1 (من 1 لـ 5)` }, { quoted: rebuild(m, global.quoteMode) })
        global.quoteMode = n
        return raw(m.chat, { text: `✅ وضع الرد بقى ${n}` }, { quoted: rebuild(m, n) })
    }

    await raw(m.chat, { text: '🧪 هبعت 5 ردود. قولي أرقام اللي ظهر فوقها *اقتباس* لرسالتك على واتساب العادي.' })
    for (const n of [1, 2, 3, 4, 5]) {
        try {
            if (n === 5) await raw(m.chat, { text: `رد رقم 5`, contextInfo: manual(m) })
            else await raw(m.chat, { text: `رد رقم ${n}` }, { quoted: rebuild(m, n) })
        } catch (e) { console.error('[quote-fix test]', n, e.message) }
        await wait(1200)
    }
    await raw(m.chat, { text: '✅ خلصت. اكتب لي الأرقام اللي ظهر فيها الاقتباس.' })
}

handler.all = async function () { patch(this) }

handler.help = ['تجربة_الرد', 'وضع_الرد', 'فحص_الرد']
handler.tags = ['owner']
handler.command = /^(تجربة_الرد|وضع_الرد|فحص_الرد)$/i
handler.owner = true

export default handler