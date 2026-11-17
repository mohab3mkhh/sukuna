// plugins/رسم.js — توليد صور بالذكاء الاصطناعي (.رسم / .تخيل / .imagine)
// المزوّد القديم (image-generator-xvi.vercel.app) واقع (HTTP 500)، فبقينا على Pollinations (من غير مفتاح).
// ملاحظة: النسخة المجانية من غير تسجيل = طلب واحد كل ~15 ثانية، فلو اتزحمت الطلبات بيستنى ويعيد.

import axios from 'axios'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36'
const sleep = ms => new Promise(r => setTimeout(r, ms))

// الوصف بالإنجليزي بيطلع صور أحسن بكتير، فبنترجمه لو الحزمة موجودة (ولو فشلت بنكمّل بالأصلي)
async function toEnglish(text) {
    if (!/[؀-ۿ]/.test(text)) return text
    try {
        const { translate } = await import('@vitalets/google-translate-api')
        const r = await Promise.race([translate(text, { to: 'en' }), sleep(8000).then(() => null)])
        return r?.text?.trim() || text
    } catch { return text }
}

// المزوّدين — لو واحد مات امسحه أو ضيف غيره (كل واحد بيرجّع رابط الصورة)
const PROVIDERS = [
    { name: 'pollinations-flux', url: (p, seed) => `https://image.pollinations.ai/prompt/${encodeURIComponent(p)}?width=1024&height=1024&nologo=true&model=flux&seed=${seed}` },
    { name: 'pollinations-turbo', url: (p, seed) => `https://image.pollinations.ai/prompt/${encodeURIComponent(p)}?width=1024&height=1024&nologo=true&model=turbo&seed=${seed}` },
]

const shortErr = e => e?.response?.status ? `HTTP ${e.response.status}` : String(e?.code || e?.message || e).slice(0, 80)

async function fetchImage(url) {
    const r = await axios.get(url, { responseType: 'arraybuffer', timeout: 90000, headers: { 'User-Agent': UA }, validateStatus: () => true })
    if (r.status === 429) { const e = new Error('429'); e.response = { status: 429 }; throw e }
    if (r.status !== 200) { const e = new Error(`HTTP ${r.status}`); e.response = { status: r.status }; throw e }
    const type = String(r.headers['content-type'] || '')
    const buf = Buffer.from(r.data)
    if (!type.startsWith('image') || buf.length < 1000) throw new Error('الرد مش صورة')
    return buf
}

let handler = async (m, { conn, text, usedPrefix = '.', command }) => {
    const say = t => conn.sendMessage(m.chat, { text: t }, { quoted: m })
    const react = e => conn.sendMessage(m.chat, { react: { text: e, key: m.key } }).catch(() => {})
    text = (text || '').trim()
    if (!text) return say(`🚀 *أدخل وصفًا للصورة التي تريد تخيلها.*\n\nمثال:\n${usedPrefix}${command} قطة ترتدي بدلة فضاء`)

    await react('🎨')
    await say('🎨 *يتم معالجة طلبك... لا تطلب الأمر مرة أخرى حتى يكتمل التنفيذ!*')

    const prompt = await toEnglish(text)
    const seed = Math.floor(Math.random() * 1e9)
    const errors = []
    let image = null

    for (const p of PROVIDERS) {
        for (let attempt = 0; attempt < 2 && !image; attempt++) {
            try {
                image = await fetchImage(p.url(prompt, seed))
                console.log(`[رسم] ✅ ${p.name}`)
            } catch (e) {
                const msg = shortErr(e)
                console.error(`[رسم] ❌ ${p.name}: ${msg}`)
                // 429 = الحد المجاني (طلب كل 15 ثانية): نستنى ونعيد مرة
                if (e?.response?.status === 429 && attempt === 0) { await sleep(16000); continue }
                errors.push(`${p.name}: ${msg}`)
                break
            }
        }
        if (image) break
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