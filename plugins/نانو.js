// plugins/نانو.js — تعديل الصور / توليدها بالذكاء الاصطناعي (.تعديل / .نانو)
// كل المصادر القديمة (photoeditorai / aienhancer / imgeditor / ghibli-proxy) ماتت (Captcha / 400 / 401)،
// فالنسخة دي بتستخدم مصادر مجانية ومستقرة أكتر:
//   • تعديل صورة:  AI Horde (img2img) — بيعيد رسم الصورة بالأسلوب اللي تطلبه (مش تعديل دقيق زي nano banana الأصلي)
//   • توليد من نص:  Pollinations ثم AI Horde
// اختياري: HORDE_KEY (مفتاح مجاني من aihorde.net) لأولوية أعلى في الطابور.

import axios from 'axios'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const POLL_MS = Number(process.env.HORDE_POLL_MS) || 5000
const HORDE = 'https://aihorde.net/api/v2'
const HORDE_HEADERS = () => ({ apikey: process.env.HORDE_KEY || '0000000000', 'Client-Agent': 'sukuna-bot:1.0:anonymous', 'Content-Type': 'application/json', 'User-Agent': UA })

const httpErr = (status, headers = {}) => Object.assign(new Error(`HTTP ${status}`), { response: { status, headers } })
const shortErr = e => e?.response?.status ? `HTTP ${e.response.status}${e.response.data?.message ? ' - ' + String(e.response.data.message).slice(0, 70) : ''}` : String(e?.code || e?.message || e).slice(0, 100)

async function toEnglish(text) {
    if (!/[؀-ۿ]/.test(text)) return text
    try {
        const { translate } = await import('@vitalets/google-translate-api')
        const r = await Promise.race([translate(text, { to: 'en' }), sleep(8000).then(() => null)])
        return r?.text?.trim() || text
    } catch { return text }
}

async function fetchImage(url) {
    const r = await axios.get(url, { responseType: 'arraybuffer', timeout: 90000, headers: { 'User-Agent': UA }, validateStatus: () => true })
    if (r.status !== 200) throw httpErr(r.status, r.headers)
    const buf = Buffer.from(r.data)
    if (!String(r.headers['content-type'] || '').startsWith('image') || buf.length < 1000) throw new Error('الرد مش صورة')
    return buf
}

// يحوّل أي صورة (webp وغيره) لـ JPEG عشان واتساب يعرضها صح
async function toJpeg(buf) {
    try { const sharp = (await import('sharp')).default; return await sharp(buf).jpeg({ quality: 92 }).toBuffer() } catch { return buf }
}

// ───────── AI Horde (توليد وتعديل) ─────────
async function hordeRun(body) {
    const H = HORDE_HEADERS()
    const sub = await axios.post(`${HORDE}/generate/async`, body, { headers: H, timeout: 45000 })
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

async function hordeText(prompt) {
    return hordeRun({ prompt, params: { width: 512, height: 512, steps: 25, n: 1 }, nsfw: false, censor_nsfw: true })
}

async function hordeEdit(buffer, prompt) {
    const sharp = (await import('sharp')).default
    const meta = await sharp(buffer).metadata()
    const k = Math.min(1, 512 / Math.max(meta.width, meta.height))
    const r64 = v => Math.max(64, Math.round((v * k) / 64) * 64)
    const w = r64(meta.width), h = r64(meta.height)
    const jpg = await sharp(buffer).resize(w, h, { fit: 'cover' }).jpeg({ quality: 90 }).toBuffer()
    return hordeRun({
        prompt: `${prompt}, high quality, detailed`,
        params: { sampler_name: 'k_euler_a', cfg_scale: 7.5, denoising_strength: 0.62, width: w, height: h, steps: 30, n: 1 },
        source_image: jpg.toString('base64'),
        source_processing: 'img2img',
        nsfw: false, censor_nsfw: true,
    })
}

// ───────── Pollinations (توليد من نص) ─────────
async function pollinations(prompt) {
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=768&height=768&nologo=true&seed=${Math.floor(Math.random() * 1e9)}`
    try { return await fetchImage(url) }
    catch (e) {
        const st = e?.response?.status, wait = Number(e?.response?.headers?.['retry-after'])
        if ((st === 402 || st === 429) && wait > 0 && wait <= 25) { await sleep(wait * 1000 + 500); return await fetchImage(url) }
        throw e
    }
}

async function runChain(chain) {
    const errors = []
    for (const [name, fn] of chain) {
        try { const img = await fn(); console.log(`[نانو] ✅ ${name}`); return { img } }
        catch (e) { errors.push(`${name}: ${shortErr(e)}`); console.error(`[نانو] ❌ ${name}: ${shortErr(e)}`) }
    }
    return { errors }
}

let handler = async (m, { conn, text }) => {
    const say = t => conn.sendMessage(m.chat, { text: t }, { quoted: m })
    const quoted = m.quoted ? m.quoted : m
    const quotedMsg = quoted?.msg || quoted
    const mime = quotedMsg?.mimetype || m.message?.imageMessage?.mimetype || ''
    const hasImage = /image\/(jpeg|png|webp)/.test(mime)

    if (!hasImage && !text) {
        return say(
            `🎨 *نانو بنانا - تعديل الصور بالذكاء الاصطناعي*\n\n` +
            `*مع صورة:*\nارسل صورة مع الأمر كـ caption أو رد على صورة:\n\`.تعديل <الوصف>\`\n\n` +
            `*بدون صورة:*\nتوليد صورة من نص فقط:\n\`.نانو <الوصف>\`\n\n` +
            `*أمثلة:*\n▸ \`.تعديل حولها لأنمي\`\n▸ \`.تعديل أضف ثلج\`\n▸ \`.نانو قطة نائمة على القمر\``
        )
    }
    if (!text) return say('⚠️ أين الوصف؟\nمثال: .تعديل حولها لأنمي')

    const raw = text.trim()
    await say('⏳ جاري المعالجة... ممكن ياخد لحد دقيقتين.')
    const prompt = await toEnglish(raw)

    let result
    if (hasImage) {
        let buffer
        try {
            buffer = await (m.message?.imageMessage ? m.download() : quoted.download())
            if (!buffer) throw new Error('فارغ')
        } catch { return say('❌ فشل تحميل الصورة!') }
        result = await runChain([['ai-horde-img2img', () => hordeEdit(buffer, prompt)]])
    } else {
        result = await runChain([['pollinations', () => pollinations(prompt)], ['ai-horde', () => hordeText(prompt)]])
    }

    if (!result.img) return say(`❌ فشل التنفيذ!\n\n🔧 السبب:\n${result.errors.map(e => `• ${e}`).join('\n')}`)
    const image = await toJpeg(result.img)
    return conn.sendMessage(m.chat, { image, caption: `✅ تم!\n📝 الوصف: ${raw}` }, { quoted: m })
}

handler.help = ['تعديل <الوصف>', 'نانو <الوصف>']
handler.tags = ['ai']
handler.command = /^(نانو|نانوبنانا|نانو-بنانا|تعديل|فوتوشوب|nb|nano|nanobanana)$/i

export default handler