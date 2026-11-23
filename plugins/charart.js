/**
 * plugins/charart.js
 * محادثة AI وتحليل/رؤية الصور عبر https://prexzyapis.com/ai/charart
 */

import axios from 'axios'

const ENDPOINT = 'https://prexzyapis.com/ai/charart'
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
    payload.output,
    payload.content,
    payload.result?.response,
    payload.result?.reply,
    payload.result?.answer,
    payload.result?.text,
    payload.result?.message,
    payload.data?.response,
    payload.data?.reply,
    payload.data?.answer,
    payload.data?.text,
    payload.data?.message
  ]

  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim()
  }
  return ''
}

async function resolveImageBuffer(src) {
  if (!src) return null
  if (isBase64Image(src)) return decodeBase64Image(src)

  try {
    const r = await axios.get(src, {
      responseType: 'arraybuffer',
      timeout: 35000,
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

async function callCharArt({ prompt, imageBuffer = null, imageName = 'image.jpg' }) {
  const hasImage = Boolean(imageBuffer && Buffer.isBuffer(imageBuffer) && imageBuffer.length > 0)
  const dataUri = hasImage ? `data:image/jpeg;base64,${imageBuffer.toString('base64')}` : ''

  const attempts = hasImage
    ? [
        { prompt, mode: 'vision', image: dataUri, imageName },
        { prompt, image: dataUri, imageName },
        { prompt, mode: 'vision', image: dataUri }
      ]
    : [
        { prompt, mode: 'v6' },
        { prompt }
      ]

  let lastErr = ''

  for (const params of attempts) {
    try {
      const res = await axios.get(ENDPOINT, {
        params,
        timeout: 60000,
        headers: { 'User-Agent': UA, Accept: 'application/json, */*' },
        validateStatus: () => true
      })

      if (res.status >= 400) {
        lastErr = `HTTP ${res.status}`
        continue
      }

      const data = res.data
      if (data && data.status === false) {
        lastErr = data.error || data.message || 'فشل طلب ChatArt'
        continue
      }

      const imageSrc = extractImageSource(data)
      const textReply = extractReplyText(data)

      if (imageSrc || textReply) {
        return { imageSrc, textReply }
      }
    } catch (e) {
      lastErr = e.message
    }
  }

  throw new Error(lastErr || 'تعذر الحصول على رد من /ai/charart')
}

let handler = async (m, { conn, text, usedPrefix, command }) => {
  const quotedImg = getQuotedImageMsg(m)
  const prompt = (text || '').trim() || (quotedImg ? 'Describe this image in detail' : '')

  if (!prompt && !quotedImg) {
    return m.reply(
      `🎨 *ChatArt AI*\n\n• محادثة: *${usedPrefix + command}* سؤالك\n• تحليل صورة: رد على صورة واكتب *${usedPrefix + command}* سؤالك أو وصفك`
    )
  }

  await react(conn, m, '⏳')
  const wait = await m.reply(quotedImg ? '👁️ *جاري تحليل الصورة...*' : '🤖 *جاري التفكير...*')

  try {
    let imageBuffer = null
    let imageName = 'photo.jpg'

    if (quotedImg) {
      imageBuffer = await quotedImg.download()
      if (!imageBuffer || !Buffer.isBuffer(imageBuffer) || imageBuffer.length < 1000) {
        throw new Error('تعذر تحميل الصورة المردود عليها')
      }
      const ext = String(quotedImg.mimetype || '').split('/')[1]?.split(';')[0] || 'jpg'
      imageName = `input.${ext}`
    }

    const { imageSrc, textReply } = await callCharArt({
      prompt,
      imageBuffer,
      imageName
    })

    try { await conn.sendMessage(m.chat, { delete: wait.key }) } catch {}

    if (imageSrc) {
      const imgBuf = await resolveImageBuffer(imageSrc)
      if (imgBuf) {
        await conn.sendMessage(
          m.chat,
          {
            image: imgBuf,
            caption: textReply || `🎨 *النتيجة:* ${prompt}`
          },
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

    await m.reply('❌ لم يرجع السيرفر رداً واضحاً.')
    await react(conn, m, '❌')
  } catch (e) {
    console.error('[charart]', e.message)
    try { await conn.sendMessage(m.chat, { delete: wait.key }) } catch {}
    await react(conn, m, '❌')
    await m.reply(`❌ *خطأ:* ${e.message}`)
  }
}

handler.help = ['charart <سؤال أو وصف>', 'رؤية <سؤال عن الصورة>']
handler.tags = ['ai']
handler.command = /^(charart|رؤية|vision)$/i

export default handler