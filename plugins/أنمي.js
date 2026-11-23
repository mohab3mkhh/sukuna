/**
 * plugins/animekill.js
 * تحويل الصورة المردود عليها إلى أنمي عبر https://prexzyapis.com/ai/animekill
 */

import axios from 'axios'
import FormData from 'form-data'

const ENDPOINT = 'https://prexzyapis.com/ai/animekill'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

const react = async (conn, m, emoji) => {
  try { await conn.sendMessage(m.chat, { react: { text: emoji, key: m.key } }) } catch {}
}

function getQuotedImageMsg(m) {
  const q = m?.quoted
  if (!q) return null

  const mime = String(q.mimetype || q.msg?.mimetype || '').toLowerCase()
  const isImage =
    mime.startsWith('image/') ||
    Boolean(q.msg?.imageMessage) ||
    Boolean(q.message?.imageMessage) ||
    q.mtype === 'imageMessage'

  if (!isImage) return null
  return q
}

function isBase64Image(str = '') {
  const s = String(str).trim()
  return /^data:image\/[a-zA-Z0-9+.-]+;base64,/i.test(s) || /^[A-Za-z0-9+/=]{250,}$/.test(s)
}

function decodeBase64Image(str = '') {
  const clean = String(str).replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/i, '').trim()
  const buf = Buffer.from(clean, 'base64')
  return buf.length > 1500 ? buf : null
}

function findImageUrlDeep(obj, depth = 0) {
  if (!obj || depth > 5) return ''
  if (typeof obj === 'string') {
    const s = obj.trim()
    if (/^https?:\/\//i.test(s) && !s.includes(' ')) return s
    if (isBase64Image(s)) return s
    return ''
  }
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = findImageUrlDeep(item, depth + 1)
      if (found) return found
    }
    return ''
  }
  if (typeof obj === 'object') {
    const keys = [
      'image', 'imageUrl', 'image_url', 'output', 'result_url',
      'url', 'link', 'download', 'img', 'anime'
    ]
    for (const k of keys) {
      if (k in obj) {
        const found = findImageUrlDeep(obj[k], depth + 1)
        if (found) return found
      }
    }
    for (const v of Object.values(obj)) {
      const found = findImageUrlDeep(v, depth + 1)
      if (found) return found
    }
  }
  return ''
}

function extractErrorMessage(payload) {
  if (!payload || typeof payload !== 'object') return ''
  if (payload.status === false) {
    return String(payload.error || payload.message || payload.data?.message || 'فشل التحويل من السيرفر').trim()
  }
  if (payload.data?.name === 'AxiosError' && payload.data?.message) {
    return String(payload.data.message).trim()
  }
  return ''
}

async function fetchBufferFromUrl(url) {
  try {
    const r = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 60000,
      headers: { 'User-Agent': UA },
      validateStatus: () => true
    })
    if (r.status < 400 && r.data && r.data.length > 1500) {
      const ct = String(r.headers['content-type'] || '').toLowerCase()
      if (!ct.includes('text/html') && !ct.includes('application/json')) {
        return Buffer.from(r.data)
      }
    }
  } catch {}
  return null
}

async function parseApiResponse(res) {
  if (!res?.data) return { buffer: null, error: `HTTP ${res?.status || 500}` }

  const rawBuf = Buffer.from(res.data)
  const ct = String(res.headers['content-type'] || '').toLowerCase()

  if (res.status >= 400) {
    let msg = `HTTP ${res.status}`
    try {
      const j = JSON.parse(rawBuf.toString('utf8'))
      msg = extractErrorMessage(j) || j?.message || j?.error || msg
    } catch {}
    return { buffer: null, error: msg }
  }

  if (ct.includes('image/') && rawBuf.length > 1500) {
    return { buffer: rawBuf, error: '' }
  }

  const str = rawBuf.toString('utf8').trim()
  if (!str) return { buffer: null, error: 'رد فارغ من السيرفر' }

  if (isBase64Image(str)) {
    const dec = decodeBase64Image(str)
    if (dec) return { buffer: dec, error: '' }
  }

  if (/^https?:\/\//i.test(str) && !str.includes('\n')) {
    const fetched = await fetchBufferFromUrl(str)
    if (fetched) return { buffer: fetched, error: '' }
  }

  let parsed = null
  try {
    parsed = JSON.parse(str)
  } catch {
    return { buffer: null, error: str.slice(0, 200) }
  }

  const apiErr = extractErrorMessage(parsed)
  if (apiErr) {
    return { buffer: null, error: apiErr }
  }

  const src = findImageUrlDeep(parsed)
  if (src) {
    if (isBase64Image(src)) {
      const dec = decodeBase64Image(src)
      if (dec) return { buffer: dec, error: '' }
    }
    const fetched = await fetchBufferFromUrl(src)
    if (fetched) return { buffer: fetched, error: '' }
  }

  return { buffer: null, error: 'لم يرجع السيرفر صورة في النتيجة' }
}

async function convertImageToAnime(imgBuffer, prompt) {
  const base64Data = imgBuffer.toString('base64')
  const dataUri = `data:image/jpeg;base64,${base64Data}`
  let lastErr = ''

  // 1) POST multipart/form-data (الأكثر شيوعاً مع رفع الصور)
  for (const fieldName of ['image', 'file']) {
    try {
      const form = new FormData()
      form.append(fieldName, imgBuffer, {
        filename: 'input.jpg',
        contentType: 'image/jpeg'
      })
      form.append('prompt', prompt)

      const res = await axios.post(ENDPOINT, form, {
        headers: {
          ...form.getHeaders(),
          'User-Agent': UA,
          Accept: 'image/*, application/json, */*'
        },
        responseType: 'arraybuffer',
        timeout: 90000,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        validateStatus: () => true
      })

      const parsed = await parseApiResponse(res)
      if (parsed.buffer) return parsed.buffer
      if (parsed.error) lastErr = parsed.error
    } catch (e) {
      lastErr = e.message
    }
  }

  // 2) POST JSON (في حال كان السيرفر يتوقع base64 أو image في JSON)
  try {
    const res = await axios.post(
      ENDPOINT,
      { prompt, image: dataUri, base64: base64Data },
      {
        headers: {
          'User-Agent': UA,
          'Content-Type': 'application/json',
          Accept: 'image/*, application/json, */*'
        },
        responseType: 'arraybuffer',
        timeout: 90000,
        validateStatus: () => true
      }
    )
    const parsed = await parseApiResponse(res)
    if (parsed.buffer) return parsed.buffer
    if (parsed.error) lastErr = parsed.error
  } catch (e) {
    lastErr = e.message
  }

  // 3) GET بالـ prompt والـ image كاحتياط
  try {
    const res = await axios.get(ENDPOINT, {
      params: { prompt, image: dataUri },
      headers: { 'User-Agent': UA, Accept: 'image/*, application/json, */*' },
      responseType: 'arraybuffer',
      timeout: 90000,
      validateStatus: () => true
    })
    const parsed = await parseApiResponse(res)
    if (parsed.buffer) return parsed.buffer
    if (parsed.error) lastErr = parsed.error
  } catch (e) {
    lastErr = e.message
  }

  throw new Error(lastErr || 'تعذر تحويل الصورة إلى أنمي')
}

let handler = async (m, { conn, text, usedPrefix, command }) => {
  const quotedImg = getQuotedImageMsg(m)
  if (!quotedImg) {
    return m.reply(
      `⛩️ *تحويل الصورة إلى أنمي*\n\nرد على صورة واكتب الوصف:\n💡 *مثال:* ${usedPrefix + command} بأسلوب أنمي ياباني فخم`
    )
  }

  const userPrompt = (text || '').trim()
  const finalPrompt = userPrompt || 'anime style, high quality anime illustration, detailed characters'

  await react(conn, m, '⏳')
  const wait = await m.reply('🎨 *جاري تحويل الصورة إلى أنمي...*')

  try {
    const imgBuffer = await quotedImg.download()
    if (!imgBuffer || !Buffer.isBuffer(imgBuffer) || imgBuffer.length < 1500) {
      throw new Error('تعذر قراءة الصورة المردود عليها')
    }

    const animeBuffer = await convertImageToAnime(imgBuffer, finalPrompt)
    try { await conn.sendMessage(m.chat, { delete: wait.key }) } catch {}

    await conn.sendMessage(
      m.chat,
      {
        image: animeBuffer,
        caption: userPrompt
          ? `⛩️ *تم التحويل إلى أنمي*\n📝 *الوصف:* ${userPrompt}`
          : '⛩️ *تم التحويل إلى أنمي*'
      },
      { quoted: m }
    )
    await react(conn, m, '✅')
  } catch (e) {
    console.error('[animekill]', e.message)
    try { await conn.sendMessage(m.chat, { delete: wait.key }) } catch {}
    await react(conn, m, '❌')
    await m.reply(`❌ *فشل تحويل الصورة:*\n${e.message}`)
  }
}

handler.help = ['anime <وصف>', 'انمي <وصف>']
handler.tags = ['ai']
handler.command = /^(anime|انمي|أنمي|animekill)$/i

export default handler