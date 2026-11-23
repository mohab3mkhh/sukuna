/**
 * plugins/visual-search.js
 * البحث البصري العكسي عبر https://prexzyapis.com/ai/visual-search
 */

import axios from 'axios'
import FormData from 'form-data'

const ENDPOINT = 'https://prexzyapis.com/ai/visual-search'
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

function extractDirectUrl(str = '') {
  const match = String(str).match(/https?:\/\/[^\s"'<>]+/i)
  return match ? match[0].trim() : ''
}

async function uploadToCatbox(buffer) {
  const form = new FormData()
  form.append('reqtype', 'fileupload')
  form.append('fileToUpload', buffer, {
    filename: 'search.jpg',
    contentType: 'image/jpeg'
  })

  const res = await axios.post('https://catbox.moe/user/api.php', form, {
    headers: { ...form.getHeaders(), 'User-Agent': UA },
    timeout: 45000,
    validateStatus: () => true
  })

  const out = String(res?.data || '').trim()
  if (res.status < 400 && /^https?:\/\//i.test(out)) return out
  throw new Error('فشل الرفع على catbox')
}

async function uploadToTmpFiles(buffer) {
  const form = new FormData()
  form.append('file', buffer, {
    filename: 'search.jpg',
    contentType: 'image/jpeg'
  })

  const res = await axios.post('https://tmpfiles.org/api/v1/upload', form, {
    headers: { ...form.getHeaders(), 'User-Agent': UA },
    timeout: 45000,
    validateStatus: () => true
  })

  let rawUrl = res?.data?.data?.url || ''
  if (rawUrl && rawUrl.includes('tmpfiles.org/') && !rawUrl.includes('/dl/')) {
    rawUrl = rawUrl.replace('tmpfiles.org/', 'tmpfiles.org/dl/')
  }
  if (res.status < 400 && /^https?:\/\//i.test(rawUrl)) return rawUrl
  throw new Error('فشل الرفع على tmpfiles')
}

async function uploadTo0x0(buffer) {
  const form = new FormData()
  form.append('file', buffer, {
    filename: 'search.jpg',
    contentType: 'image/jpeg'
  })

  const res = await axios.post('https://0x0.st', form, {
    headers: { ...form.getHeaders(), 'User-Agent': UA },
    timeout: 45000,
    validateStatus: () => true
  })

  const out = String(res?.data || '').trim()
  if (res.status < 400 && /^https?:\/\//i.test(out)) return out
  throw new Error('فشل الرفع على 0x0.st')
}

async function getPublicImageUrl(m, text) {
  const directFromText = extractDirectUrl(text)
  if (directFromText) return directFromText

  const quotedImg = getQuotedImageMsg(m)
  if (quotedImg) {
    const buf = await quotedImg.download()
    if (!buf || !Buffer.isBuffer(buf) || buf.length < 1000) {
      throw new Error('تعذر تحميل الصورة المردود عليها')
    }

    const uploaders = [uploadToCatbox, uploadToTmpFiles, uploadTo0x0]
    let lastErr = ''
    for (const fn of uploaders) {
      try {
        const url = await fn(buf)
        if (url) return url
      } catch (e) {
        lastErr = e.message
      }
    }
    throw new Error(lastErr || 'تعذر تجهيز رابط مؤقت للصورة')
  }

  return ''
}

async function searchVisual(imageUrl) {
  const res = await axios.get(ENDPOINT, {
    params: { image: imageUrl },
    timeout: 60000,
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    validateStatus: () => true
  })

  if (res.status >= 400) {
    throw new Error(`HTTP ${res.status}`)
  }

  const data = res.data
  if (!data || data.status === false) {
    throw new Error(data?.error || data?.message || 'فشل البحث البصري')
  }

  const matches = Array.isArray(data.matches) ? data.matches : []
  return {
    count: data.count ?? matches.length,
    total: data.total ?? matches.length,
    matches
  }
}

async function tryFetchPreviewBuffer(url) {
  if (!url || !/^https?:\/\//i.test(url)) return null
  try {
    const res = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 15000,
      headers: { 'User-Agent': UA },
      validateStatus: () => true
    })
    if (res.status < 400 && res.data && res.data.length > 1500) {
      const ct = String(res.headers['content-type'] || '').toLowerCase()
      if (!ct.includes('text/html') && !ct.includes('application/json')) {
        return Buffer.from(res.data)
      }
    }
  } catch {}
  return null
}

let handler = async (m, { conn, text, usedPrefix, command }) => {
  const hasQuoted = Boolean(getQuotedImageMsg(m))
  const hasUrl = Boolean(extractDirectUrl(text))

  if (!hasQuoted && !hasUrl) {
    return m.reply(
      `🔍 *البحث البصري العكسي*\n\nرد على صورة واكتب *${usedPrefix + command}* أو ابعت رابط صورة:\n💡 *مثال:* ${usedPrefix + command} https://example.com/photo.jpg`
    )
  }

  await react(conn, m, '⏳')
  const wait = await m.reply('🔍 *جاري البحث عن صور ومنتجات مشابهة...*')

  try {
    const imageUrl = await getPublicImageUrl(m, text)
    const { count, total, matches } = await searchVisual(imageUrl)

    try { await conn.sendMessage(m.chat, { delete: wait.key }) } catch {}

    if (!matches.length) {
      await react(conn, m, '❌')
      return m.reply('⚠️ لم يتم العثور على نتائج مشابهة لهذه الصورة.')
    }

    const topMatches = matches.slice(0, 8)
    const lines = [
      `🔍 *نتائج البحث البصري*`,
      `📊 *المعروض:* ${count} | *الإجمالي:* ${total}`,
      ''
    ]

    topMatches.forEach((item, idx) => {
      const title = item.title || 'بدون عنوان'
      const site = item.site || 'غير محدد'
      const price = item.price ? `💰 *السعر:* ${item.price}\n` : ''
      const link = item.link ? `🔗 ${item.link}` : ''

      lines.push(`*${idx + 1}. ${title}*`)
      lines.push(`🌐 *المصدر:* ${site}`)
      if (price) lines.push(price.trim())
      if (link) lines.push(link)
      lines.push('')
    })

    const messageText = lines.join('\n').trim()
    const firstImgBuf = await tryFetchPreviewBuffer(matches[0]?.image)

    if (firstImgBuf) {
      await conn.sendMessage(
        m.chat,
        {
          image: firstImgBuf,
          caption: messageText.slice(0, 1024)
        },
        { quoted: m }
      )
      if (messageText.length > 1024) {
        await conn.sendMessage(m.chat, { text: messageText.slice(1024) }, { quoted: m })
      }
    } else {
      await conn.sendMessage(m.chat, { text: messageText }, { quoted: m })
    }

    await react(conn, m, '✅')
  } catch (e) {
    console.error('[visual-search]', e.message)
    try { await conn.sendMessage(m.chat, { delete: wait.key }) } catch {}
    await react(conn, m, '❌')
    await m.reply(`❌ *فشل البحث البصري:*\n${e.message}`)
  }
}

handler.help = ['بحث_بصري <رابط أو رد على صورة>', 'vsearch <رابط أو رد على صورة>']
handler.tags = ['tools', 'ai']
handler.command = /^(بحث_بصري|vsearch|visualsearch)$/i

export default handler