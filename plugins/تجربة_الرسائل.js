// plugins/تجربة-الرسائل.js
// ✧ تجربة لمعرفة أنهي نوع رسالة بيختفي على واتساب العادي.
//   الأمر:  .تجربة_الرسائل   (اكتبه من واتساب العادي مش أعمال)
//   بيبعت 8 رسائل مرقمة، وإنت تقولي أرقام اللي ظهرت عندك.

const wait = ms => new Promise(r => setTimeout(r, ms))
const last = {}

let handler = async (m, { conn }) => {
    if (Date.now() - (last[m.chat] || 0) < 30000) {
        return conn.sendMessage(m.chat, { text: 'استنى 30 ثانية وجرّب تاني' }, { quoted: m })
    }
    last[m.chat] = Date.now()

    const ad = global.adReply?.contextInfo || {}
    const ext = ad.externalAdReply
    const fwd = ad.forwardedNewsletterMessageInfo
    const num = m.sender.split('@')[0]
    const T = (n, d) => `اختبار ${n}: ${d}`
    const send = (text, extra = {}, opts) => conn.sendMessage(m.chat, { text, ...extra }, opts)

    const tests = [
        [1, 'نص عادي بدون أي حاجة', () => send(T(1, 'نص عادي بدون أي حاجة'))],
        [2, 'نص عادي + رد على رسالتك', () => send(T(2, 'نص عادي + رد على رسالتك'), {}, { quoted: m })],
        [3, 'الرد الأصلي بتاع البوت', () => m.reply(T(3, 'الرد الأصلي بتاع البوت'))],
        [4, 'بطاقة إعلان مع صورة', () => ext && send(T(4, 'بطاقة إعلان مع صورة'), { contextInfo: { externalAdReply: ext } })],
        [5, 'بطاقة إعلان بدون صورة', () => ext && send(T(5, 'بطاقة إعلان بدون صورة'), { contextInfo: { externalAdReply: { title: ext.title, body: ext.body, sourceUrl: ext.sourceUrl, mediaType: 1 } } })],
        [6, 'محوّلة من قناة', () => fwd && send(T(6, 'محوّلة من قناة'), { contextInfo: { isForwarded: true, forwardedNewsletterMessageInfo: fwd } })],
        [7, 'محوّلة كتير (forwardingScore)', () => send(T(7, 'محوّلة كتير'), { contextInfo: { isForwarded: true, forwardingScore: 999 } })],
        [8, 'منشن ليك', () => send(`${T(8, 'منشن ليك')} @${num}`, { mentions: [m.sender] })],
    ]

    await conn.sendMessage(m.chat, { text: '🧪 هبعت 8 رسائل مرقمة، بعدها قولي أرقام اللي *ظهرت* عندك على واتساب العادي.' }, { quoted: m })
    const skipped = []

    for (const [n, , run] of tests) {
        try {
            const r = await run()
            if (r === undefined || r === null || r === false) skipped.push(n)
        } catch (e) {
            console.error(`[تجربة] ${n}:`, e.message)
            skipped.push(n)
        }
        await wait(1200)
    }

    await conn.sendMessage(m.chat, {
        text: `✅ خلصت.\nاكتبلي أرقام الاختبارات اللي ظهرت عندك (أو اللي اختفت).` +
            (skipped.length ? `\n\n(الاختبارات ${skipped.join('، ')} اتخطّيت بسبب نقص في الإعدادات، عادي)` : '')
    })
}

handler.help = ['تجربة_الرسائل']
handler.tags = ['owner']
handler.command = /^تجربة_الرسائل$/i

export default handler