// plugins/نانو.js — تعديل الصور / توليدها بالذكاء الاصطناعي (.تعديل / .نانو)

import axios from 'axios'
import FormData from 'form-data'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36'
const sleep = ms => new Promise(r => setTimeout(r, ms))

const STABILITY_KEY = process.env.STABILITY_API_KEY || 'sk-qbgP49TjQSto5d7uLXHviTW58Ta7OivV4QYNoULcXBPDVsLb'

const shortErr = e => e?.response?.status
    ? `HTTP ${e.response.status} ${String(e?.response?.data?.message || e?.response?.data?.errors?.[0] || e?.message || '').slice(0, 100)}`
    : String(e?.code || e?.message || e).slice(0, 100)

// ترجمة النص للإنجليزي
async function toEnglish(text) {
    if (!/[؀-ۿ]/.test(text)) return text
    try {
        const { translate } = await import('@vitalets/google-translate-api')
        const r = await Promise.race([translate(text, { to: 'en' }), sleep(8000).then(() => null)])
        return r?.text?.trim() || text
    } catch { return text }
}

// تحويل الصورة لـ JPEG
async function toJpeg(buf) {
    try {
        const sharp = (await import('sharp')).default
        return await sharp(buf).jpeg({ quality: 92 }).toBuffer()
    } catch { return buf }
}

// تصغير الصورة لو كبيرة
async function resizeIfNeeded(buf, maxSize = 1024) {
    try {
        const sharp = (await import('sharp')).default
        const meta = await sharp(buf).metadata()
        if (meta.width <= maxSize && meta.height <= maxSize) return buf
        return await sharp(buf)
            .resize(maxSize, maxSize, { fit: 'inside' })
            .jpeg({ quality: 90 })
            .toBuffer()
    } catch { return buf }
}

// ━━━ Stability AI v1 — image-to-image (متاح على الـ free tier) ━━━
async function stabilityImg2Img(buffer, prompt) {
    const resized = await resizeIfNeeded(buffer, 512)
    const form = new FormData()
    form.append('init_image', resized, { filename: 'image.png', contentType: 'image/png' })
    form.append('init_image_mode', 'IMAGE_STRENGTH')
    form.append('image_strength', '0.35')
    form.append('text_prompts[0][text]', prompt)
    form.append('text_prompts[0][weight]', '1')
    form.append('cfg_scale', '7')
    form.append('samples', '1')
    form.append('steps', '30')

    const r = await axios.post(
        'https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/image-to-image',
        form,
        {
            headers: {
                ...form.getHeaders(),
                'Authorization': `Bearer ${STABILITY_KEY}`,
                'Accept': 'application/json'
            },
            timeout: 120000
        }
    )
    const b64 = r.data?.artifacts?.[0]?.base64
    if (!b64) throw new Error('مفيش صورة في الرد')
    return Buffer.from(b64, 'base64')
}

// ━━━ Stability AI v1 — style (SD v1.6) ━━━
async function stabilityStyle(buffer, prompt) {
    const resized = await resizeIfNeeded(buffer, 512)
    const form = new FormData()
    form.append('init_image', resized, { filename: 'image.png', contentType: 'image/png' })
    form.append('init_image_mode', 'IMAGE_STRENGTH')
    form.append('image_strength', '0.5')
    form.append('text_prompts[0][text]', prompt)
    form.append('text_prompts[0][weight]', '1')
    form.append('cfg_scale', '7')
    form.append('samples', '1')
    form.append('steps', '30')

    const r = await axios.post(
        'https://api.stability.ai/v1/generation/stable-diffusion-v1-6/image-to-image',
        form,
        {
            headers: {
                ...form.getHeaders(),
                'Authorization': `Bearer ${STABILITY_KEY}`,
                'Accept': 'application/json'
            },
            timeout: 120000
        }
    )
    const b64 = r.data?.artifacts?.[0]?.base64
    if (!b64) throw new Error('مفيش صورة في الرد')
    return Buffer.from(b64, 'base64')
}

// ━━━ Stability AI v1 — توليد من نص ━━━
async function stabilityGenerate(prompt) {
    const form = new FormData()
    form.append('text_prompts[0][text]', prompt)
    form.append('text_prompts[0][weight]', '1')
    form.append('cfg_scale', '7')
    form.append('width', '512')
    form.append('height', '512')
    form.append('samples', '1')
    form.append('steps', '30')

    const r = await axios.post(
        'https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image',
        form,
        {
            headers: {
                ...form.getHeaders(),
                'Authorization': `Bearer ${STABILITY_KEY}`,
                'Accept': 'application/json'
            },
            timeout: 120000
        }
    )
    const b64 = r.data?.artifacts?.[0]?.base64
    if (!b64) throw new Error('مفيش صورة في الرد')
    return Buffer.from(b64, 'base64')
}

// ━━━ Pollinations (احتياطي مجاني) ━━━
async function pollinations(prompt) {
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=768&height=768&nologo=true&seed=${Math.floor(Math.random() * 1e9)}`
    const r = await axios.get(url, { responseType: 'arraybuffer', timeout: 90000, headers: { 'User-Agent': UA }, validateStatus: () => true })
    if (r.status !== 200) throw new Error(`HTTP ${r.status}`)
    const buf = Buffer.from(r.data)
    if (buf.length < 1000) throw new Error('الرد فارغ')
    return buf
}

async function runChain(chain) {
    const errors = []
    for (const [name, fn] of chain) {
        try {
            const img = await fn()
            console.log(`[نانو] ✅ ${name}`)
            return { img }
        } catch (e) {
            errors.push(`${name}: ${shortErr(e)}`)
            console.error(`[نانو] ❌ ${name}: ${shortErr(e)}`)
        }
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

        result = await runChain([
            ['stability-xl-img2img', () => stabilityImg2Img(buffer, prompt)],
            ['stability-v1-style', () => stabilityStyle(buffer, prompt)],
        ])
    } else {
        result = await runChain([
            ['stability-generate', () => stabilityGenerate(prompt)],
            ['pollinations', () => pollinations(prompt)],
        ])
    }

    if (!result.img) return say(`❌ فشل التنفيذ!\n\n🔧 السبب:\n${result.errors.map(e => `• ${e}`).join('\n')}`)
    const image = await toJpeg(result.img)
    return conn.sendMessage(m.chat, { image, caption: `✅ تم!\n📝 الوصف: ${raw}` }, { quoted: m })
}

handler.help = ['تعديل <الوصف>', 'نانو <الوصف>']
handler.tags = ['ai']
handler.command = /^(نانو|نانوبنانا|نانو-بنانا|تعديل|فوتوشوب|nb|nano|nanobanana)$/i

export default handler