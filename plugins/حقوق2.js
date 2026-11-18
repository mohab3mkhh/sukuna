// plugins/حقوق.js
// بيحط حقوقك تلقائياً في آخر كل رد نصي/كابشن يبعته البوت (لو مش موجودة)، من غير ما تعدّل أي أمر.
// الحقوق: ⛩️ SUKUNA BOT ⛩️  (غيّرها من متغير CREDIT_TEXT على Railway لو عايز)
//
// - مابيضيفش لو الرسالة فيها "SUKUNA BOT" أصلاً (مفيش تكرار)
// - مابيلمسش الريأكشن/الحذف/التعديل/الاستطلاعات/الملصقات/الصوتيات
// - لو عايز رد معيّن من غير حقوق: sendMessage(jid, content, { noCredit: true })

const CREDIT = process.env.CREDIT_TEXT || '> ⛩️ SUKUNA BOT ⛩️'
const SIGN = (process.env.ANTIBOT_SIGN || 'SUKUNA BOT').toLowerCase()
const has = t => String(t).toLowerCase().includes(SIGN) || String(t).includes('mohab') || String(t).includes('MOHAB')
const add = t => `${String(t).replace(/\s+$/, '')}\n\n${CREDIT}`

function wrap(conn) {
    if (!conn || conn._creditsWrapped || typeof conn.sendMessage !== 'function') return
    const orig = conn.sendMessage.bind(conn)
    conn.sendMessage = async (jid, content, options, ...rest) => {
        try {
            if (content && typeof content === 'object' && !options?.noCredit && !content.react && !content.delete && !content.edit && !content.poll) {
                if (typeof content.text === 'string' && content.text.trim() && !has(content.text)) {
                    content = { ...content, text: add(content.text) }
                } else if (typeof content.caption === 'string' && content.caption.trim() && !has(content.caption)) {
                    content = { ...content, caption: add(content.caption) }
                } else if (content.caption === undefined && (content.image || content.video) && !content.text) {
                    // صورة/فيديو من غير كابشن: نحط الحقوق كابشن
                    content = { ...content, caption: CREDIT }
                }
            }
        } catch (e) { console.error('[حقوق]', e?.message) }
        return orig(jid, content, options, ...rest)
    }
    conn._creditsWrapped = true
    console.log('[حقوق] اتفعّلت على الاتصال')
}

if (global.conn) wrap(global.conn)

let handler = m => m
handler.before = async function (m, extra = {}) {
    wrap(extra.conn || this)   // بيتفعّل مع أول رسالة، وبعد أي إعادة اتصال
    return false
}
export default handler