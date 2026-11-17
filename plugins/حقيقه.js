// plugins/حقيقه.js — .حقيقه / .اقتباس2 / .مثابره
// سبب العطل: (1) nekos.life API اتقفل، (2) @vitalets/google-translate-api النسخة الجديدة مفيهاش default export
// (الـ import كان بيرجّع undefined) (3) الـ catch كان ساكت فالبوت مكانش بيرد.

const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0 Safari/537.36' }
const NAMES = ['أحمد', 'محمد', 'سارة', 'ياسمين', 'عمر', 'منى', 'كريم', 'نور', 'يوسف', 'هدى', 'علي', 'ليلى']

async function getJson(url) {
    const ctl = new AbortController()
    const t = setTimeout(() => ctl.abort(), 12000)
    try {
        const r = await fetch(url, { headers: UA, signal: ctl.signal })
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return await r.json()
    } finally { clearTimeout(t) }
}

const SOURCES = [
    async () => (await getJson('https://uselessfacts.jsph.pl/api/v2/facts/random?language=en')).text,
    async () => (await getJson('https://meowfacts.herokuapp.com/')).data?.[0],
    async () => (await getJson('https://catfact.ninja/fact')).fact,
    async () => (await getJson('https://api.api-ninjas.com/v1/facts')).at?.(0)?.fact,
]

async function getFact() {
    const errs = []
    for (const src of SOURCES) {
        try { const f = await src(); if (f && String(f).length > 10) return String(f).trim() } catch (e) { errs.push(e.message) }
    }
    throw new Error('كل مصادر الحقائق فشلت: ' + errs.join(' / '))
}

async function toArabic(text) {
    try {
        const mod = await import('@vitalets/google-translate-api')
        const fn = mod.translate || mod.default?.translate || mod.default
        const r = await Promise.race([fn(text, { to: 'ar' }), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 10000))])
        if (r?.text) return r.text
    } catch (e) { console.error('[حقيقه] الترجمة فشلت:', e.message) }
    // احتياطي: ترجمة جوجل المباشرة
    try {
        const j = await getJson(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ar&dt=t&q=${encodeURIComponent(text)}`)
        const out = (j?.[0] || []).map(x => x?.[0]).join('')
        if (out) return out
    } catch (e) { console.error('[حقيقه] الترجمة الاحتياطية فشلت:', e.message) }
    return text
}

let handler = async (m, { conn }) => {
    try {
        const fact = await getFact()
        const ar = await toArabic(fact)
        const name = NAMES[Math.floor(Math.random() * NAMES.length)]
        const msg = `*╮ ── ⋆⋆ ── ⋆⋆ ── ⋆⋆ ── ⋆⋆ ── ⋆⋆ ─ ⋆⋆ ╭*
*┊📖┊↞ حـقيـقه :•⪼ ⌟${ar}⌜*
*┊🖋️┊↞الـكـاتـب:•⪼⌟${name}⌜*
*╯ ── ⋆⋆ ── ⋆⋆ ── ⋆⋆ ── ⋆⋆ ── ⋆⋆ ─ ⋆⋆ ╰*`
        await conn.sendMessage(m.chat, { text: msg }, { quoted: m })
    } catch (e) {
        console.error('[حقيقه]', e)
        await conn.sendMessage(m.chat, { text: '❌ مقدرتش أجيب حقيقة دلوقتي: ' + String(e.message).slice(0, 200) }, { quoted: m })
    }
}

handler.help = ['حقيقه']
handler.tags = ['fun']
handler.command = /^(اقتباس2|حقيقه|حقيقة|مثابره)$/i

export default handler