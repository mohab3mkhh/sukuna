/**
 * plugins/unblur.js
 * إزالة التغبش وتحسين جودة الصورة المردود عليها عبر https://prexzyapis.com/ai/unblur
 */

import axios from 'axios'
import FormData from 'form-data'

const ENDPOINT = 'https://prexzyapis.com/ai/unblur'
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

  return isImage ? q : null
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
      'image_url', 'imageUrl', 'image', 'output', 'result_url',
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

function extractErrorMessage(payload) {
  if (!payload || typeof payload !== 'object') return ''
  if (payload.status === false) {
    return String(payload.error || payload.message || payload.data?.message || 'فشل تحسين الصورة من السيرفر').trim()
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
  if (!res?.data) {
    return { buffer: null, meta: {}, error: `HTTP ${res?.status || 500}` }
  }

  const rawBuf = Buffer.from(res.data)
  const ct = String(res.headers['content-type'] || '').toLowerCase()

  if (res.status >= 400) {
    let msg = `HTTP ${res.status}`
    try {
      const j = JSON.parse(rawBuf.toString('utf8'))
      msg = extractErrorMessage(j) || j?.message || j?.error || msg
    } catch {}
    return { buffer: null, meta: {}, error: msg }
  }

  if (ct.includes('image/') && rawBuf.length > 1500) {
    return { buffer: rawBuf, meta: {}, error: '' }
  }

  const str = rawBuf.toString('utf8').trim()
  if (!str) {
    return { buffer: null, meta: {}, error: 'رد فارغ من السيرفر' }
  }

  if (isBase64Image(str)) {
    const dec = decodeBase64Image(str)
    if (dec) return { buffer: dec, meta: {}, error: '' }
  }

  if (/^https?:\/\//i.test(str) && !str.includes('\n')) {
    const fetched = await fetchBufferFromUrl(str)
    if (fetched) return { buffer: fetched, meta: {}, error: '' }
  }

  let parsed = null
  try {
    parsed = JSON.parse(str)
  } catch {
    return { buffer: null, meta: {}, error: str.slice(0, 200) }
  }

  const apiErr = extractErrorMessage(parsed)
  if (apiErr) {
    return { buffer: null, meta: {}, error: apiErr }
  }

  const meta = {
    resolution: parsed?.resolution || parsed?.data?.resolution || '',
    processingTime: parsed?.processing_time || parsed?.data?.processing_time || ''
  }

  const src = extractImageSourceDeep(parsed)
  if (src) {
    if (isBase64Image(src)) {
      const dec = decodeBase64Image(src)
      if (dec) return { buffer: dec, meta, error: '' }
    }
    const fetched = await fetchBufferFromUrl(src)
    if (fetched) return { buffer: fetched, meta, error: '' }
  }

  return { buffer: null, meta, error: 'لم يرجع السيرفر صورة محسّنة في النتيجة' }
}

async function enhanceImageUnblur(imgBuffer) {
  const base64Data = imgBuffer.toString('base64')
  const dataUri = `data:image/jpeg;base64,${base64Data}`
  let lastErr = ''

  // 1) POST multipart/form-data
  for (const fieldName of ['image', 'file']) {
    try {
      const form = new FormData()
      form.append(fieldName, imgBuffer, {
        filename: 'input.jpg',
        contentType: 'image/jpeg'
      })

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
      if (parsed.buffer) return { buffer: parsed.buffer, meta: parsed.meta }
      if (parsed.error) lastErr = parsed.error
    } catch (e) {
      lastErr = e.message
    }
  }

  // 2) POST JSON
  try {
    const res = await axios.post(
      ENDPOINT,
      { image: dataUri, base64: base64Data },
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
    if (parsed.buffer) return { buffer: parsed.buffer, meta: parsed.meta }
    if (parsed.error) lastErr = parsed.error
  } catch (e) {
    lastErr = e.message
  }

  // 3) GET كاحتياط
  try {
    const res = await axios.get(ENDPOINT, {
      params: { image: dataUri },
      headers: { 'User-Agent': UA, Accept: 'image/*, application/json, */*' },
      responseType: 'arraybuffer',
      timeout: 90000,
      validateStatus: () => true
    })
    const parsed = await parseApiResponse(res)
    if (parsed.buffer) return { buffer: parsed.buffer, meta: parsed.meta }
    if (parsed.error) lastErr = parsed.error
  } catch (e) {
    lastErr = e.message
  }

  throw new Error(lastErr || 'تعذر تحسين الصورة وإزالة التغبش')
}

let handler = async (m, { conn, usedPrefix, command }) => {
  const quotedImg = getQuotedImageMsg(m)
  if (!quotedImg) {
    return m.reply(
      `✨ *تحسين وإزالة تغبش الصور*\n\nرد على صورة واكتب:\n💡 *مثال:* ${usedPrefix + command}`
    )
  }

  await react(conn, m, '⏳')
  const wait = await m.reply('✨ *جاري تحسين الصورة وإزالة التغبش...*')

  try {
    const imgBuffer = await quotedImg.download()
    if (!imgBuffer || !Buffer.isBuffer(imgBuffer) || imgBuffer.length < 1500) {
      throw new Error('تعذر قراءة الصورة المردود عليها')
    }

    const { buffer: enhancedBuffer, meta } = await enhanceImageUnblur(imgBuffer)
    try { await conn.sendMessage(m.chat, { delete: wait.key }) } catch {}

    const captionLines = ['✨ *تم تحسين الصورة بنجاح*']
    if (meta.resolution) captionLines.push(`📐 *الجودة:* ${meta.resolution}`)
    if (meta.processingTime) captionLines.push(`⏱️ *الوقت:* ${meta.processingTime}`)

    await conn.sendMessage(
      m.chat,
      {
        image: enhancedBuffer,
        caption: captionLines.join('\n')
      },
      { quoted: m }
    )
    await react(conn, m, '✅')
  } catch (e) {
    console.error('[unblur]', e.message)
    try { await conn.sendMessage(m.chat, { delete: wait.key }) } catch {}
    await react(conn, m, '❌')
    await m.reply(`❌ *فشل تحسين الصورة:*\n${e.message}`)
  }
}

handler.help = ['unblur']
handler.tags = ['ai', 'tools']
handler.command = /^unblur$/i

export default handler