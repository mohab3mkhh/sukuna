/**
 * plugins/تخيل.js
 * توليد صور بـ 3 اختيارات عبر أزرار القائمة:
 * 1) التوليد الأساسي (aiappgen / aimelody + Pollinations fallback)
 * 2) ChatPro Image (/ai/chatpro-image)
 * 3) GenImage (/ai/genimage)
 */

import axios from 'axios'
import { sendButtons, btn, getButtonId } from '../lib/buttons.js'

const PRIMARY_IMG_ENDPOINTS = [
  'https://prexzyapis.com/ai/aiappgen',
  'https://prexzyapis.com/ai/aimelody'
]
const CHATPRO_ENDPOINT = 'https://prexzyapis.com/ai/chatpro-image'
const GENIMAGE_ENDPOINT = 'https://prexzyapis.com/ai/genimage'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const PREFIX = 'imgpick_'
const CACHE_TTL = 30 * 60 * 1000

if (!global.takhayyalCache) global.takhayyalCache = new Map()

const genId = () => Math.random().toString(36).slice(2, 10)
const react = async (conn, m, emoji) => {
  try { await conn.sendMessage(m.chat, { react: { text: emoji, key: m.key } }) } catch {}
}

function isAlreadyEnglish(str = '') {
  const s = String(str).trim()
  if (!s) return true
  return !/[^\u0000-\u007F]/.test(s)
}

async function getJson(url) {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), 12000)
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': UA },
      signal: ctl.signal
    })
    const body = await r.text()
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    try { return JSON.parse(body) } catch { throw new Error('الرد مش JSON') }
  } finally {
    clearTimeout(t)
  }
}

const TRANSLATE_PROVIDERS = [
  ['google-gtx', async (q, tl = 'en') => {
    const d = await getJson(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${tl}&dt=t&q=${encodeURIComponent(q)}`)
    const text = (d?.[0] || []).map(x => x?.[0]).filter(Boolean).join('')
    if (!text) throw new Error('رد فاضي')
    return text.trim()
  }],
  ['google-chrome', async (q, tl = 'en') => {
    const d = await getJson(`https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=auto&tl=${tl}&q=${encodeURIComponent(q)}`)
    const text = d?.sentences
      ? d.sentences.map(s => s.trans).filter(Boolean).join('')
      : (Array.isArray(d) ? (Array.isArray(d[0]) ? d[0][0] : d[0]) : '')
    if (!text) throw new Error('رد فاضي')
    return String(text).trim()
  }],
  ['google-package', async (q, tl = 'en') => {
    const mod = await import('@vitalets/google-translate-api')
    const fn = mod.translate || mod.default?.translate || mod.default
    const r = await fn(q, { to: tl })
    if (!r?.text) throw new Error('رد فاضي')
    return String(r.text).trim()
  }],
  ['lingva', async (q, tl = 'en') => {
    if (q.length > 1500) throw new Error('النص طويل')
    const d = await getJson(`https://lingva.ml/api/v1/auto/${tl}/${encodeURIComponent(q)}`)
    if (!d?.translation) throw new Error('رد فاضي')
    return String(d.translation).trim()
  }]
]

async function translateToEnglish(prompt) {
  if (isAlreadyEnglish(prompt)) return prompt

  for (const [name, fn] of TRANSLATE_PROVIDERS) {
    try {
      const translated = await fn(prompt, 'en')
      if (translated) {
        console.log('[تخيل] 🌐 translated via', name, '->', translated)
        return translated
      }
    } catch (e) {
      console.error('[تخيل] ❌ translate', name, e.message)
    }
  }
  return prompt
}

function isBase64Image(str = '') {
  const s = String(str).trim()
  return /^data:image\/[a-zA-Z0-9+.-]+;base64,/i.test(s) || /^[A-Za-z0-9+/=]{250,}$/.test(s)
}

function decodeBase64Image(str = '') {
  const clean = String(str).replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/i, '').trim()
  const buf = Buffer.from(clean, 'base64')
  return buf.length > 2000 ? buf : null
}

function extractImageSourceDeep(obj, depth = 0) {
  if (!obj || depth > 5) return ''
  if (typeof obj === 'string') {
    const s = obj.trim()
    if (/^https?:\/\//i.test(s) && !s.includes(' ')) return s
    if (isBase64Image(s)) return s
    return ''
  }
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = extractImageSourceDeep(item, depth + 1)
      if (found) return found
    }
    return ''
  }
  if (typeof obj === 'object') {
    const priorityKeys = [
      'image', 'imageUrl', 'image_url', 'output', 'result_url',
      'url', 'link', 'download', 'img', 'images'
    ]
    for (const k of priorityKeys) {
      if (k in obj) {
        const found = extractImageSourceDeep(obj[k], depth + 1)
        if (found) return found
      }
    }
    for (const v of Object.values(obj)) {
      const found = extractImageSourceDeep(v, depth + 1)
      if (found) return found
    }
  }
  return ''
}

async function resolveImageBufferFromSource(src) {
  if (!src) return null
  if (isBase64Image(src)) return decodeBase64Image(src)

  try {
    const r = await axios.get(src, {
      responseType: 'arraybuffer',
      timeout: 40000,
      headers: { 'User-Agent': UA },
      validateStatus: () => true
    })
    if (r.status < 400 && r.data && r.data.length > 2000) {
      const ct = String(r.headers['content-type'] || '').toLowerCase()
      if (!ct.includes('text/html') && !ct.includes('application/json')) {
        return Buffer.from(r.data)
      }
    }
  } catch {}
  return null
}

async function trySingleEndpoint(endpoint, prompt) {
  const paramVariants = [
    { prompt },
    { q: prompt },
    { text: prompt }
  ]

  for (const params of paramVariants) {
    try {
      const res = await axios.get(endpoint, {
        params,
        timeout: 65000,
        responseType: 'arraybuffer',
        headers: { 'User-Agent': UA, Accept: 'image/*, application/json, */*' },
        validateStatus: () => true
      })

      if (res.status >= 400 || !res.data) continue
      const buf = Buffer.from(res.data)
      if (buf.length < 2000) continue

      const ct = String(res.headers['content-type'] || '').toLowerCase()
      if (ct.includes('image/')) return buf

      if (ct.includes('application/json') || buf[0] === 0x7b) {
        try {
          const json = JSON.parse(buf.toString('utf8'))
          if (json && json.status === false) continue
          const src = extractImageSourceDeep(json)
          if (src) {
            const imgBuf = await resolveImageBufferFromSource(src)
            if (imgBuf) return imgBuf
          }
        } catch {}
      } else {
        const str = buf.toString('utf8').trim()
        if (/^https?:\/\//i.test(str) || isBase64Image(str)) {
          const imgBuf = await resolveImageBufferFromSource(str)
          if (imgBuf) return imgBuf
        }
      }
    } catch {}
  }

  return null
}

async function generateByChoice(choiceKey, enPrompt, rawPrompt) {
  const prompts = enPrompt !== rawPrompt ? [enPrompt, rawPrompt] : [enPrompt]

  if (choiceKey === 'chatpro') {
    for (const p of prompts) {
      const buf = await trySingleEndpoint(CHATPRO_ENDPOINT, p)
      if (buf) return buf
    }
    return null
  }

  if (choiceKey === 'genimage') {
    for (const p of prompts) {
      const buf = await trySingleEndpoint(GENIMAGE_ENDPOINT, p)
      if (buf) return buf
    }
    return null
  }

  // الاختيار الأول: التوليد الأساسي (aiappgen / aimelody + Pollinations fallback)
  for (const p of prompts) {
    for (const ep of PRIMARY_IMG_ENDPOINTS) {
      const buf = await trySingleEndpoint(ep, p)
      if (buf) return buf
    }
  }

  const seed = Math.floor(Math.random() * 1000000)
  const fallbackUrls = [
    `https://image.pollinations.ai/prompt/${encodeURIComponent(enPrompt)}?seed=${seed}&width=1024&height=1024&nologo=true`,
    `https://image.pollinations.ai/prompt/${encodeURIComponent(enPrompt)}?seed=${seed}`
  ]

  for (const u of fallbackUrls) {
    const buf = await resolveImageBufferFromSource(u)
    if (buf) return buf
  }

  return null
}

const CHOICE_META = {
  primary: { label: 'الاختيار 1 • توليد سريع (AI Studio)', short: '1️⃣ توليد سريع' },
  chatpro: { label: 'الاختيار 2 • ChatPro Image', short: '2️⃣ ChatPro Image' },
  genimage: { label: 'الاختيار 3 • GenImage', short: '3️⃣ GenImage' }
}

let before = async (m, { conn }) => {
  try {
    const buttonId = getButtonId(m)
    if (!buttonId || !buttonId.startsWith(PREFIX)) return false

    const payloadRaw = buttonId.slice(PREFIX.length)
    const sepIdx = payloadRaw.indexOf('_')
    if (sepIdx === -1) return false

    const choiceKey = payloadRaw.slice(0, sepIdx)
    const jobId = payloadRaw.slice(sepIdx + 1)

    if (!CHOICE_META[choiceKey]) return false

    const job = global.takhayyalCache.get(jobId)
    if (!job) {
      await m.reply('⚠️ انتهت صلاحية الاختيارات، اكتب *.تخيل <الوصف>* من جديد.')
      return true
    }

    await react(conn, m, '⏳')
    const wait = await m.reply(`🎨 *جاري الرسم عبر (${CHOICE_META[choiceKey].short})...*`)

    try {
      const imgBuf = await generateByChoice(choiceKey, job.enPrompt, job.rawPrompt)
      try { await conn.sendMessage(m.chat, { delete: wait.key }) } catch {}

      if (!imgBuf) {
        await react(conn, m, '❌')
        await m.reply(`❌ تعذر توليد الصورة من *${CHOICE_META[choiceKey].short}*، جرّب اختياراً آخر من القائمة أو أعد المحاولة.`)
        return true
      }

      const captionLines = [
        `🎨 *النتيجة:* ${job.rawPrompt}`,
        `⚡ *النمط:* ${CHOICE_META[choiceKey].short}`
      ]
      if (job.enPrompt !== job.rawPrompt) {
        captionLines.push(`🌐 *الوصف:* ${job.enPrompt}`)
      }

      await conn.sendMessage(
        m.chat,
        {
          image: imgBuf,
          caption: captionLines.join('\n')
        },
        { quoted: m }
      )
      await react(conn, m, '✅')
    } catch (e) {
      console.error('[تخيل] before:', e.message)
      try { await conn.sendMessage(m.chat, { delete: wait.key }) } catch {}
      await react(conn, m, '❌')
      await m.reply(`❌ *خطأ أثناء التوليد:* ${e.message}`)
    }

    return true
  } catch (e) {
    console.error('[تخيل] before outer:', e.message)
    return false
  }
}

let handler = async (m, { conn, text, usedPrefix, command }) => {
  const rawPrompt = (text || '').trim()
  if (!rawPrompt) {
    return m.reply(
      `🎨 *توليد الصور*\n\nاكتب وصف الصورة:\n💡 *مثال:* ${usedPrefix + command} فتاة أنمي تحت المطر بألوان نيون`
    )
  }

  await react(conn, m, '⏳')
  const wait = await m.reply('🌐 *جاري تجهيز الوصف وعرض الاختيارات...*')

  try {
    const enPrompt = await translateToEnglish(rawPrompt)
    const jobId = genId()

    global.takhayyalCache.set(jobId, {
      rawPrompt,
      enPrompt,
      createdAt: Date.now()
    })

    const rows = [
      {
        title: '1️⃣ الاختيار الأول (توليد سريع)',
        description: 'المسار الأساسي السريع مع بديل تلقائي',
        id: `${PREFIX}primary_${jobId}`
      },
      {
        title: '2️⃣ الاختيار الثاني (ChatPro Image)',
        description: 'توليد الصور عبر /ai/chatpro-image',
        id: `${PREFIX}chatpro_${jobId}`
      },
      {
        title: '3️⃣ الاختيار الثالث (GenImage)',
        description: 'توليد الصور عبر /ai/genimage',
        id: `${PREFIX}genimage_${jobId}`
      }
    ]

    try { await conn.sendMessage(m.chat, { delete: wait.key }) } catch {}

    await sendButtons(
      conn,
      m.chat,
      {
        title: '🎨 SUKUNA IMAGINE',
        subtitle: rawPrompt.slice(0, 50),
        text:
          `✅ *تم تجهيز الوصف*\n\n` +
          `📝 *الوصف:* ${rawPrompt}\n` +
          (enPrompt !== rawPrompt ? `🌐 *بالإنجليزية:* ${enPrompt}\n` : '') +
          `\n👇 اضغط على الزرار واختر واحد من الـ 3 اختيارات للرسم:`,
        footer: '⛩️ SUKUNA BOT',
        buttons: [btn.list('🖼️ اختر نمط التوليد (3 اختيارات)', [{ title: 'خيارات توليد الصور', rows }])]
      },
      m
    )

    await react(conn, m, '✅')
  } catch (e) {
    console.error('[تخيل] handler:', e.message)
    try { await conn.sendMessage(m.chat, { delete: wait.key }) } catch {}
    await react(conn, m, '❌')
    await m.reply(`❌ *خطأ:* ${e.message}`)
  }
}

if (global.takhayyalCleanup) clearInterval(global.takhayyalCleanup)
global.takhayyalCleanup = setInterval(() => {
  const now = Date.now()
  for (const [k, v] of global.takhayyalCache.entries()) {
    if (now - v.createdAt > CACHE_TTL) global.takhayyalCache.delete(k)
  }
}, 5 * 60 * 1000)

handler.before = before
handler.help = ['تخيل <وصف الصورة>']
handler.tags = ['ai']
handler.command = /^(تخيل|ارسم)$/i

export default handler