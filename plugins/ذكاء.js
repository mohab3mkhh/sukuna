/**
 * plugins/aiapk.js
 * محادثة AI عبر /ai/aiapk + ترجمة أي لغة للإنجليزية تلقائياً وتوليد صور عبر /ai/aiappgen و /ai/aimelody مع بديل تلقائي
 */

import axios from 'axios'

const CHAT_ENDPOINT = 'https://prexzyapis.com/ai/aiapk'
const IMG_ENDPOINTS = [
  'https://prexzyapis.com/ai/aiappgen',
  'https://prexzyapis.com/ai/aimelody'
]
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

const react = async (conn, m, emoji) => {
  try { await conn.sendMessage(m.chat, { react: { text: emoji, key: m.key } }) } catch {}
}

function isAlreadyEnglish(str = '') {
  const s = String(str).trim()
  if (!s) return true
  const hasNonLatin = /[^\u0000-\u007F]/.test(s)
  return !hasNonLatin
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
        console.log('[aiapk] 🌐 translated via', name, '->', translated)
        return translated
      }
    } catch (e) {
      console.error('[aiapk] ❌ translate', name, e.message)
    }
  }

  return prompt
}

function isBase64Image(str = '') {
  return /^data:image\/[a-zA-Z0-9+.-]+;base64,/i.test(str.trim()) || /^[A-Za-z0-9+/=]{200,}$/.test(str.trim())
}

function base64ToBuffer(str = '') {
  const clean = str.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/i, '').trim()
  const buf = Buffer.from(clean, 'base64')
  return buf.length > 2000 ? buf : null
}

function extractImageSource(payload) {
  if (!payload) return ''
  if (typeof payload === 'string') {
    const s = payload.trim()
    if (/^https?:\/\//i.test(s) || isBase64Image(s)) return s
    return ''
  }
  if (typeof payload !== 'object') return ''

  const candidates = [
    payload.image,
    payload.imageUrl,
    payload.image_url,
    payload.url,
    payload.output,
    payload.result?.image,
    payload.result?.imageUrl,
    payload.result?.url,
    payload.data?.image,
    payload.data?.imageUrl,
    payload.data?.url,
    Array.isArray(payload.images) ? payload.images[0] : '',
    Array.isArray(payload.data?.images) ? payload.data.images[0] : '',
    Array.isArray(payload.result?.images) ? payload.result.images[0] : ''
  ]

  for (const c of candidates) {
    if (typeof c === 'string' && (/^https?:\/\//i.test(c.trim()) || isBase64Image(c))) {
      return c.trim()
    }
  }
  return ''
}

function extractReplyText(payload) {
  if (!payload) return ''
  if (typeof payload === 'string') return payload.trim()

  const candidates = [
    payload.response,
    payload.reply,
    payload.answer,
    payload.text,
    payload.message,
    payload.result?.response,
    payload.result?.reply,
    payload.result?.text,
    payload.data?.response,
    payload.data?.reply,
    payload.data?.text,
    payload.data?.message
  ]

  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim()
  }
  return ''
}

async function resolveImageBufferFromSource(src) {
  if (!src) return null
  if (isBase64Image(src)) return base64ToBuffer(src)

  try {
    const r = await axios.get(src, {
      responseType: 'arraybuffer',
      timeout: 35000,
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

async function tryImageEndpoint(endpoint, prompt) {
  const paramVariants = [
    { prompt },
    { q: prompt },
    { text: prompt }
  ]

  for (const params of paramVariants) {
    try {
      const res = await axios.get(endpoint, {
        params,
        timeout: 60000,
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
          const src = extractImageSource(json)
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

async function generateImageBuffer(enPrompt, rawPrompt) {
  const promptsToTry = enPrompt !== rawPrompt ? [enPrompt, rawPrompt] : [enPrompt]

  for (const p of promptsToTry) {
    for (const ep of IMG_ENDPOINTS) {
      const buf = await tryImageEndpoint(ep, p)
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

async function requestChat(prompt) {
  const res = await axios.get(CHAT_ENDPOINT, {
    params: { prompt },
    timeout: 60000,
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    validateStatus: () => true
  })

  if (res.status >= 400) {
    throw new Error(`HTTP ${res.status}`)
  }

  const data = res.data
  if (data && data.status === false) {
    throw new Error(data.error || data.message || 'فشل طلب الذكاء الاصطناعي')
  }

  return {
    imageSrc: extractImageSource(data),
    textReply: extractReplyText(data)
  }
}

let handler = async (m, { conn, text, usedPrefix, command }) => {
  const prompt = (text || '').trim()
  const isImageCmd = /^(تخيل|ارسم|صورة_ai|aiimg|imgai)$/i.test(command)

  if (!prompt) {
    return m.reply(
      `🤖 *الذكاء الاصطناعي*\n\n• للمحادثة: *${usedPrefix}ai* سؤالك\n• لتوليد صورة: *${usedPrefix}تخيل* وصف الصورة`
    )
  }

  await react(conn, m, '⏳')
  const wait = await m.reply(isImageCmd ? '🎨 *جاري ترجمة الوصف وتوليد الصورة...*' : '🤖 *جاري التفكير...*')

  try {
    if (isImageCmd) {
      const enPrompt = await translateToEnglish(prompt)
      const imgBuf = await generateImageBuffer(enPrompt, prompt)
      try { await conn.sendMessage(m.chat, { delete: wait.key }) } catch {}

      if (!imgBuf) {
        await react(conn, m, '❌')
        return m.reply('❌ تعذر توليد الصورة حالياً، جرّب وصفاً آخر.')
      }

      const caption = enPrompt !== prompt
        ? `🎨 *النتيجة:* ${prompt}\n🌐 *بالإنجليزية:* ${enPrompt}`
        : `🎨 *النتيجة:* ${prompt}`

      await conn.sendMessage(
        m.chat,
        { image: imgBuf, caption },
        { quoted: m }
      )
      await react(conn, m, '✅')
      return
    }

    const { imageSrc, textReply } = await requestChat(prompt)
    try { await conn.sendMessage(m.chat, { delete: wait.key }) } catch {}

    if (imageSrc) {
      const imgBuf = await resolveImageBufferFromSource(imageSrc)
      if (imgBuf) {
        await conn.sendMessage(
          m.chat,
          { image: imgBuf, caption: textReply || `🎨 *النتيجة:* ${prompt}` },
          { quoted: m }
        )
        await react(conn, m, '✅')
        return
      }
    }

    if (textReply) {
      await conn.sendMessage(m.chat, { text: textReply }, { quoted: m })
      await react(conn, m, '✅')
      return
    }

    await m.reply('❌ لم يرجع الـ API رداً نصياً أو صورة.')
    await react(conn, m, '❌')
  } catch (e) {
    console.error('[aiapk]', e.message)
    try { await conn.sendMessage(m.chat, { delete: wait.key }) } catch {}
    await react(conn, m, '❌')
    await m.reply(`❌ *خطأ:* ${e.message}`)
  }
}

handler.help = ['ai <سؤال>', 'تخيل <وصف صورة>']
handler.tags = ['ai']
handler.command = /^(ذكاء|تخيل|aiapk)$/i

export default handler