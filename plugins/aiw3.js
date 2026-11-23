/**
 * plugins/aiw3.js
 * تجربة واستخدام endpoint: https://prexzyapis.com/ai/aiw3
 * يدعم إرجاع (نص / صورة / صوت / JSON خام كاحتياط)
 */

import axios from 'axios'

const ENDPOINT = 'https://prexzyapis.com/ai/aiw3'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

const react = async (conn, m, emoji) => {
  try { await conn.sendMessage(m.chat, { react: { text: emoji, key: m.key } }) } catch {}
}

function isBase64Media(str = '') {
  const s = String(str).trim()
  return /^data:(image|audio|video)\/[a-zA-Z0-9+.-]+;base64,/i.test(s) || /^[A-Za-z0-9+/=]{250,}$/.test(s)
}

function decodeBase64(str = '') {
  const clean = String(str).replace(/^data:[^;]+;base64,/i, '').trim()
  const buf = Buffer.from(clean, 'base64')
  return buf.length > 500 ? buf : null
}

function findMediaUrl(obj, depth = 0) {
  if (!obj || depth > 5) return ''
  if (typeof obj === 'string') {
    const s = obj.trim()
    if (/^https?:\/\//i.test(s) && /\.(png|jpe?g|webp|gif|mp3|wav|ogg|m4a|mp4)(\?|#|$)/i.test(s)) {
      return s
    }
    return ''
  }
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = findMediaUrl(item, depth + 1)
      if (found) return found
    }
    return ''
  }
  if (typeof obj === 'object') {
    const priorityKeys = [
      'image', 'imageUrl', 'image_url',
      'audio', 'audioUrl', 'audio_url',
      'url', 'link', 'output', 'result_url', 'download'
    ]
    for (const k of priorityKeys) {
      if (k in obj) {
        const found = findMediaUrl(obj[k], depth + 1)
        if (found) return found
      }
    }
    for (const v of Object.values(obj)) {
      const found = findMediaUrl(v, depth + 1)
      if (found) return found
    }
  }
  return ''
}

function findTextDeep(obj, depth = 0) {
  if (!obj || depth > 5) return ''
  if (typeof obj === 'string') {
    const s = obj.trim()
    if (!s || /^https?:\/\//i.test(s) || isBase64Media(s)) return ''
    return s
  }
  if (Array.isArray(obj)) {
    const parts = obj.map(x => findTextDeep(x, depth + 1)).filter(Boolean)
    return parts.join('\n').trim()
  }
  if (typeof obj === 'object') {
    const textKeys = [
      'response', 'reply', 'answer', 'text', 'message',
      'output', 'content', 'result', 'data'
    ]
    for (const k of textKeys) {
      if (k in obj) {
        const found = findTextDeep(obj[k], depth + 1)
        if (found) return found
      }
    }
    for (const [k, v] of Object.entries(obj)) {
      if (['status', 'statusCode', 'creator', 'success', 'code'].includes(k)) continue
      const found = findTextDeep(v, depth + 1)
      if (found) return found
    }
  }
  return ''
}

async function fetchBufferByUrl(url) {
  try {
    const res = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 45000,
      headers: { 'User-Agent': UA },
      validateStatus: () => true
    })
    if (res.status < 400 && res.data && res.data.length > 500) {
      const ct = String(res.headers['content-type'] || '').toLowerCase()
      return { buf: Buffer.from(res.data), contentType: ct }
    }
  } catch {}
  return null
}

async function callAiW3(prompt) {
  const paramVariants = [
    { prompt },
    { q: prompt },
    { text: prompt },
    { message: prompt }
  ]

  let lastError = ''

  for (const params of paramVariants) {
    try {
      const res = await axios.get(ENDPOINT, {
        params,
        timeout: 60000,
        responseType: 'arraybuffer',
        headers: { 'User-Agent': UA, Accept: '*/*' },
        validateStatus: () => true
      })

      if (!res.data) {
        lastError = `HTTP ${res.status}`
        continue
      }

      const rawBuf = Buffer.from(res.data)
      if (res.status >= 400) {
        lastError = `HTTP ${res.status}: ${rawBuf.toString('utf8').slice(0, 180)}`
        continue
      }

      const ct = String(res.headers['content-type'] || '').toLowerCase()

      // لو رجّع صورة مباشرة
      if (ct.includes('image/')) {
        return { kind: 'image', buffer: rawBuf, text: '' }
      }

      // لو رجّع صوت مباشرة
      if (ct.includes('audio/')) {
        return { kind: 'audio', buffer: rawBuf, mimetype: ct.split(';')[0] || 'audio/mpeg', text: '' }
      }

      const bodyStr = rawBuf.toString('utf8').trim()
      if (!bodyStr) {
        lastError = 'رد فارغ من السيرفر'
        continue
      }

      // لو رجّع Base64 مباشرة
      if (isBase64Media(bodyStr)) {
        const dec = decodeBase64(bodyStr)
        if (dec) {
          const isAudio = /^data:audio\//i.test(bodyStr)
          return {
            kind: isAudio ? 'audio' : 'image',
            buffer: dec,
            mimetype: 'audio/mpeg',
            text: ''
          }
        }
      }

      // لو رجّع رابط مباشر
      if (/^https?:\/\//i.test(bodyStr) && !bodyStr.includes('\n') && !bodyStr.includes(' ')) {
        const fetched = await fetchBufferByUrl(bodyStr)
        if (fetched) {
          if (fetched.contentType.includes('image/')) {
            return { kind: 'image', buffer: fetched.buf, text: '' }
          }
          if (fetched.contentType.includes('audio/')) {
            return { kind: 'audio', buffer: fetched.buf, mimetype: fetched.contentType.split(';')[0], text: '' }
          }
        }
        return { kind: 'text', text: bodyStr }
      }

      // محاولة قراءة JSON
      let parsed = null
      try {
        parsed = JSON.parse(bodyStr)
      } catch {
        return { kind: 'text', text: bodyStr }
      }

      if (parsed && parsed.status === false) {
        lastError = parsed.error || parsed.message || 'الـ API رجّع status: false'
        continue
      }

      const mediaUrl = findMediaUrl(parsed)
      const extractedText = findTextDeep(parsed)

      if (mediaUrl) {
        const fetched = await fetchBufferByUrl(mediaUrl)
        if (fetched) {
          if (fetched.contentType.includes('image/') || /\.(png|jpe?g|webp|gif)(\?|#|$)/i.test(mediaUrl)) {
            return { kind: 'image', buffer: fetched.buf, text: extractedText }
          }
          if (fetched.contentType.includes('audio/') || /\.(mp3|wav|ogg|m4a)(\?|#|$)/i.test(mediaUrl)) {
            return {
              kind: 'audio',
              buffer: fetched.buf,
              mimetype: fetched.contentType.includes('audio/') ? fetched.contentType.split(';')[0] : 'audio/mpeg',
              text: extractedText
            }
          }
        }
      }

      if (extractedText) {
        return { kind: 'text', text: extractedText }
      }

      // لو الـ JSON فيه بيانات بس مفاتيحها مختلفة، نعرض ملخصه بدل الفشل الصامت
      return {
        kind: 'text',
        text: `📦 *رد غير متوقع من /ai/aiw3:*\n\`\`\`json\n${JSON.stringify(parsed, null, 2).slice(0, 1800)}\n\`\`\``
      }
    } catch (err) {
      lastError = err.message
    }
  }

  throw new Error(lastError || 'تعذر الاتصال بـ /ai/aiw3')
}

let handler = async (m, { conn, text, usedPrefix, command }) => {
  const prompt = (text || '').trim()
  if (!prompt) {
    return m.reply(
      `🧪 *اختبار واستخدام AIW3*\n\nاكتب البرومبت أو الرسالة:\n*مثال:* ${usedPrefix + command} اهلاً بك أو وصف لصورة`
    )
  }

  await react(conn, m, '⏳')
  const wait = await m.reply('🔄 *جاري إرسال الطلب إلى /ai/aiw3...*')

  try {
    const result = await callAiW3(prompt)
    try { await conn.sendMessage(m.chat, { delete: wait.key }) } catch {}

    if (result.kind === 'image') {
      await conn.sendMessage(
        m.chat,
        {
          image: result.buffer,
          caption: result.text || `🖼️ *نتيجة /ai/aiw3:* ${prompt}`
        },
        { quoted: m }
      )
      await react(conn, m, '✅')
      return
    }

    if (result.kind === 'audio') {
      await conn.sendMessage(
        m.chat,
        {
          audio: result.buffer,
          mimetype: result.mimetype || 'audio/mpeg',
          ptt: false
        },
        { quoted: m }
      )
      await react(conn, m, '✅')
      return
    }

    await conn.sendMessage(
      m.chat,
      { text: result.text || '⚠️ لم يظهر محتوى واضح في الرد.' },
      { quoted: m }
    )
    await react(conn, m, '✅')
  } catch (e) {
    console.error('[aiw3]', e.message)
    try { await conn.sendMessage(m.chat, { delete: wait.key }) } catch {}
    await react(conn, m, '❌')
    await m.reply(`❌ *خطأ في /ai/aiw3:*\n${e.message}`)
  }
}

handler.help = ['aiw3 <رسالة أو برومبت>']
handler.tags = ['ai']
handler.command = /^(aiw3|w3)$/i

export default handler