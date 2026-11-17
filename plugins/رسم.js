// plugins/رسم.js — توليد صور بالذكاء الاصطناعي (.رسم / .تخيل / .imagine)
// المزوّد القديم (image-generator-xvi.vercel.app) واقع. الحالي:
//   1) Pollinations (مجاني من غير مفتاح، سريع، لكن بيحدّ طلب كل ~45 ثانية لكل IP، والزيادة بترجّع HTTP 402)
//   2) AI Horde (مجاني ومجهول، أبطأ: بيستنى في طابور، لكن مفيش حد على الطلبات)
// اختياري: حط مفتاح AI Horde مجاني في متغير بيئة HORDE_KEY (من aihorde.net) عشان تاخد أولوية في الطابور.

import axios from 'axios'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const POLL_MS = Number(process.env.HORDE_POLL_MS) || 5000
const HORDE = 'https://aihorde.net/api/v2'

// الوصف بالإنجليزي بيطلع صور أحسن بكتير، فبنترجمه لو الحزمة موجودة (ولو فشلت بنكمّل بالأصلي)
async function toEnglish(text) {
    if (!/[؀-ۿ]/.test(text)) return text
    try {
        const { translate } = await import('@vitalets/google-translate-api')
        const r = await Promise.race([translate(text, { to: 'en' }), sleep(8000).then(() => null)])
        return r?.text?.trim() || text
    } catch { return text }
}

const httpErr = (status, headers = {}) => Object.assign(new Error(`HTTP ${status}`), { response: { status, headers } })
const shortErr = e => e?.response?.status ? `HTTP ${e.response.status}` : String(e?.code || e?.message || e).slice(0, 90)

async function fetchImage(url) {
    const r = await axios.get(url, { responseType: 'arraybuffer', timeout: 90000, headers: { 'User-Agent': UA }, validateStatus: () => true })
    if (r.status !== 200) throw httpErr(r.status, r.headers)
    const buf = Buffer.from(r.data)
    if (!String(r.headers['content-type'] || '').startsWith('image') || buf.length < 1000) throw new Error('الرد مش صورة')
    return buf
}

// ───────── 1) Pollinations ─────────
async function pollinations(prompt, seed) {
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=768&height=768&nologo=true&seed=${seed}`
    try { return await fetchImage(url) }
    catch (e) {
        // 402/429 = وصلنا للحد: لو الانتظار قصير نستنى ونعيد مرة، غير كده ننتقل للمزوّد التاني
        const st = e?.response?.status
        const wait = Number(e?.response?.headers?.['retry-after'])
        if ((st === 402 || st === 429) && wait > 0 && wait <= 25) { await sleep(wait * 1000 + 500); return await fetchImage(url) }
        throw e
    }
}

// ───────── 2) AI Horde ─────────
async function horde(prompt) {
    const H = { apikey: process.env.HORDE_KEY || '0000000000', 'Client-Agent': 'sukuna-bot:1.0:anonymous', 'Content-Type': 'application/json', 'User-Agent': UA }
    const sub = await axios.post(`${HORDE}/generate/async`, { prompt, params: { width: 512, height: 512, steps: 25, n: 1 }, nsfw: false, censor_nsfw: true }, { headers: H, timeout: 30000 })
    const id = sub.data?.id
    if (!id) throw new Error('مفيش id: ' + JSON.stringify(sub.data).slice(0, 80))

    const t0 = Date.now()
    let done = false
    while (Date.now() - t0 < 180000) {
        await sleep(POLL_MS)
        const c = await axios.get(`${HORDE}/generate/check/${id}`, { headers: H, timeout: 20000 })
        if (c.data?.faulted) throw new Error('المهمة فشلت')
        if (c.data?.done) { done = true; break }
    }
    if (!done) throw new Error('الطابور طويل (انتهى الوقت)')

    const s = await axios.get(`${HORDE}/generate/status/${id}`, { headers: H, timeout: 30000 })
    const g = s.data?.generations?.[0]
    if (!g?.img) throw new Error('مفيش صورة في الرد')
    if (g.censored) throw new Error('الصورة اتحجبت (محتوى غير مناسب)')
    return /^https?:/.test(g.img) ? await fetchImage(g.img) : Buffer.from(g.img, 'base64')
}

const PROVIDERS = [
    { name: 'pollinations', run: pollinations },
    { name: 'ai-horde', run: horde },
]

let handler = async (m, { conn, text, usedPrefix = '.', command }) => {
    const say = t => conn.sendMessage(m.chat, { text: t }, { quoted: m })
    const react = e => conn.sendMessage(m.chat, { react: { text: e, key: m.key } }).catch(() => {})
    text = (text || '').trim()
    if (!text) return say(`🚀 *أدخل وصفًا للصورة التي تريد تخيلها.*\n\nمثال:\n${usedPrefix}${command} قطة ترتدي بدلة فضاء`)

    await react('🎨')
    await say('🎨 *يتم معالجة طلبك... لا تطلب الأمر مرة أخرى حتى يكتمل التنفيذ!*\n⏳ ممكن ياخد لحد دقيقتين لو الخدمة زحمة.')

    const prompt = await toEnglish(text)
    const seed = Math.floor(Math.random() * 1e9)
    const errors = []
    let image = null

    for (const p of PROVIDERS) {
        try {
            image = await p.run(prompt, seed)
            console.log(`[رسم] ✅ ${p.name}`)
            break
        } catch (e) {
            errors.push(`${p.name}: ${shortErr(e)}`)
            console.error(`[رسم] ❌ ${p.name}: ${shortErr(e)}`)
        }
    }

    if (!image) {
        await react('❌')
        return say(`❌ *مقدرتش أولّد الصورة.* جرب كمان شوية.\n\n🔧 السبب:\n${errors.map(e => `• ${e}`).join('\n')}`)
    }

    await react('✅')
    return conn.sendMessage(m.chat, { image, caption: `✨ *تم إنشاء الصورة بنجاح!*\n\n📝 ${text}` }, { quoted: m })
}

handler.tags = ['X V I I T A C H I']
handler.help = ['تخيل']
handler.command = ['تخيل', 'imagine', 'رسم']

export default handler