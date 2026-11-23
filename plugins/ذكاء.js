/**
 * plugins/aiapk.js
 * محادثة AI + توليد صور عبر /ai/aiapk مع معالجة HTTP 500 في توليد الصور
 */

import axios from 'axios'

const ENDPOINT = 'https://prexzyapis.com/ai/aiapk'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

const react = async (conn, m, emoji) => {
  try { await conn.sendMessage(m.chat, { react: { text: emoji, key: m.key } }) } catch {}
}

function extractImageUrl(payload) {
  if (!payload || typeof payload !== 'object') return ''

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
    if (typeof c === 'string' && /^https?:\/\//i.test(c.trim())) {
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

async function requestAiApk(params) {
  const res = await axios.get(ENDPOINT, {
    params,
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
    imageUrl: extractImageUrl(data),
    textReply: extractReplyText(data),
    raw: data
  }
}

async function generateImageWithFallback(prompt) {
  const attempts = [
    { prompt: `generate image: ${prompt}`, mode: 'image' },
    { prompt: `draw an image of: ${prompt}`, mode: 'image' },
    { prompt: `generate image: ${prompt}` }
  ]

  let lastErr = null
  for (const params of attempts) {
    try {
      const res = await requestAiApk(params)
      if (res.imageUrl || res.textReply) return res
    } catch (e) {
      lastErr = e
    }
  }
  throw lastErr || new Error('فشل توليد الصورة من السيرفر')
}

async function downloadImageBuffer(url) {
  try {
    const r = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 30000,
      headers: { 'User-Agent': UA },
      validateStatus: () => true
    })
    if (r.status < 400 && r.data && r.data.length > 1000) {
      return Buffer.from(r.data)
    }
  } catch {}
  return null
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
  const wait = await m.reply(isImageCmd ? '🎨 *جاري توليد الصورة...*' : '🤖 *جاري التفكير...*')

  try {
    const { imageUrl, textReply } = isImageCmd
      ? await generateImageWithFallback(prompt)
      : await requestAiApk({ prompt })

    try { await conn.sendMessage(m.chat, { delete: wait.key }) } catch {}

    if (imageUrl) {
      const imgBuf = await downloadImageBuffer(imageUrl)
      await conn.sendMessage(
        m.chat,
        {
          image: imgBuf || { url: imageUrl },
          caption: textReply || `🎨 *النتيجة:* ${prompt}`
        },
        { quoted: m }
      )
      await react(conn, m, '✅')
      return
    }

    if (textReply) {
      await conn.sendMessage(m.chat, { text: textReply }, { quoted: m })
      await react(conn, m, '✅')
      return
    }

    await m.reply(
      isImageCmd
        ? '⚠️ سيرفر `/ai/aiapk` لم يرجع صورة (قد يكون توليد الصور معطلاً أو يحتاج model/modelId معين في السيرفر).'
        : '❌ لم يرجع الـ API رداً نصياً أو صورة.'
    )
    await react(conn, m, '⚠️')
  } catch (e) {
    console.error('[aiapk]', e.message)
    try { await conn.sendMessage(m.chat, { delete: wait.key }) } catch {}
    await react(conn, m, '❌')
    await m.reply(
      isImageCmd
        ? `❌ *فشل توليد الصورة:* ${e.message}\n💡 غالباً قسم الصور في /ai/aiapk بيرجع خطأ 500 من السيرفر نفسه.`
        : `❌ *خطأ:* ${e.message}`
    )
  }
}

handler.help = ['ai <سؤال>', 'تخيل <وصف صورة>']
handler.tags = ['ai']
handler.command = /^(ai|ذكاء|تخيل|ارسم|aiapk)$/i

export default handler