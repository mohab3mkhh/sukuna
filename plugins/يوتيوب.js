// plugins/يوتيوب.js
/**
 * YouTube search + downloader
 * - قائمة نتائج البحث (list message)
 * - مصدر التحميل: VidsSave (parse → download → SSE)
 * - Debug log داخل الشات عند فشل الاختيار أو التحميل
 *
 * المتطلبات: axios, yt-search, @whiskeysockets/baileys
 */

import yts from 'yt-search'
import axios from 'axios'
import pkg from '@whiskeysockets/baileys'

const { generateWAMessageFromContent, proto, prepareWAMessageMedia } = pkg

const SEND_LIMIT_MB = 100
const DEBUG_MAX_CHARS = 3200

const VIDSSAVE = {
  AUTH_KEY: '20250901majwlqo',
  DOMAIN: 'api-ak.vidssave.com',
  ORIGIN: 'https://vidssave.com',
  UA: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36',
  UA_SEC_CH: '"Chromium";v="139", "Not;A=Brand";v="99"'
}

function vidsSaveHeaders(extra = {}) {
  return {
    accept: '*/*',
    'user-agent': VIDSSAVE.UA,
    origin: VIDSSAVE.ORIGIN,
    referer: `${VIDSSAVE.ORIGIN}/`,
    'accept-language': 'ar,en-GB;q=0.9,en-US;q=0.8,en;q=0.7',
    'sec-ch-ua': VIDSSAVE.UA_SEC_CH,
    'sec-ch-ua-mobile': '?1',
    'sec-ch-ua-platform': '"Android"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-site',
    ...extra
  }
}

function sanitizeFileName(title) {
  const cleaned = (title || 'video')
    .replace(/[\\/:*?"<>|]/g, '')
    .trim()
    .slice(0, 60)
    .trim()
  return cleaned || 'video'
}

function extractVideoId(url) {
  if (!url) return null
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([^&\s]+)/,
    /youtube\.com\/embed\/([^&\s]+)/,
    /youtube\.com\/v\/([^&\s]+)/,
    /youtube\.com\/.*[?&]v=([^&\s]+)/
  ]
  for (const p of patterns) {
    const m = url.match(p)
    if (m?.[1]) return m[1]
  }
  return null
}

function truncateText(text, max = DEBUG_MAX_CHARS) {
  const s = String(text || '')
  return s.length > max ? `${s.slice(0, max)}\n... [truncated]` : s
}

function safeJsonParse(value) {
  if (typeof value !== 'string') return null
  const s = value.trim()
  if (!s.startsWith('{') && !s.startsWith('[')) return null
  try {
    return JSON.parse(s)
  } catch {
    return null
  }
}

function isUrlString(value) {
  if (typeof value !== 'string') return false
  return /^https?:\/\/\S+/i.test(value.trim())
}

function collectDeepNodes(input, out = [], seen = new WeakSet()) {
  if (input == null) return out

  if (Array.isArray(input)) {
    for (const item of input) collectDeepNodes(item, out, seen)
    return out
  }

  if (typeof input === 'string') {
    const parsed = safeJsonParse(input)
    if (parsed) {
      collectDeepNodes(parsed, out, seen)
      return out
    }

    const text = input.trim()
    if (text) out.push({ raw: input, value: text })
    return out
  }

  if (typeof input !== 'object') return out
  if (seen.has(input)) return out
  seen.add(input)

  out.push(input)

  for (const key of Object.keys(input)) {
    const value = input[key]
    if (value == null) continue

    if (Array.isArray(value) || typeof value === 'object') {
      collectDeepNodes(value, out, seen)
      continue
    }

    if (typeof value === 'string') {
      const parsed = safeJsonParse(value)
      if (parsed) collectDeepNodes(parsed, out, seen)
      else if (isUrlString(value)) out.push({ url: value, raw: value })
    }
  }

  return out
}

function normalizeMediaList(data) {
  const nodes = collectDeepNodes(data, [])
  const cleaned = []

  for (const node of nodes) {
    if (!node) continue

    if (typeof node === 'object') {
      cleaned.push(node)
      continue
    }

    if (typeof node === 'string') {
      cleaned.push({ url: node, raw: node })
    }
  }

  return cleaned
}

function getRequestToken(item) {
  return item?.request || item?.token || item?.download_request || item?.req || null
}

function getCandidateUrl(item) {
  return item?.url || item?.d_url || item?.download_url || item?.file || item?.link || item?.href || item?.uri || item?.src || item?.stream_url || null
}

function qualityRankFromText(text) {
  if (!text) return 0
  const s = String(text).toLowerCase()

  const pMatch = s.match(/(\d{3,4})p/)
  if (pMatch) return Number(pMatch[1])

  const kMatch = s.match(/(\d{2,3})k(?:bps)?/)
  if (kMatch) return Number(kMatch[1])

  return 0
}

function hasUsefulMediaSignature(obj, type) {
  const s = JSON.stringify(obj || {}).toLowerCase()
  if (type === 'audio') {
    return s.includes('audio') || s.includes('mp3') || s.includes('m4a') || s.includes('aac')
  }
  return s.includes('video') || s.includes('mp4') || s.includes('webm') || s.includes('m3u8') || s.includes('mov')
}

function collectDownloadEntries(input, type, quality, out = [], seen = new WeakSet()) {
  if (input == null) return out

  if (Array.isArray(input)) {
    for (const item of input) collectDownloadEntries(item, type, quality, out, seen)
    return out
  }

  if (typeof input === 'string') {
    const parsed = safeJsonParse(input)
    if (parsed) {
      collectDownloadEntries(parsed, type, quality, out, seen)
      return out
    }

    const text = input.trim()
    if (isUrlString(text)) {
      out.push({
        url: text,
        direct: true,
        scoreBoost: 30,
        raw: input
      })
    }
    return out
  }

  if (typeof input !== 'object') return out
  if (seen.has(input)) return out
  seen.add(input)

  const request = getRequestToken(input)
  const url = getCandidateUrl(input)
  const s = JSON.stringify(input).toLowerCase()

  if (request || url) {
    out.push({
      ...input,
      __request: request,
      __url: url,
      __scoreBoost: 0
    })
  }

  if (hasUsefulMediaSignature(input, type)) {
    out.push({
      ...input,
      __request: request,
      __url: url,
      __scoreBoost: 15
    })
  }

  const keys = Object.keys(input)
  for (const key of keys) {
    const value = input[key]
    if (value == null) continue

    // مسارات متوقعة جدًا
    if (key === 'media' || key === 'resources' || key === 'formats' || key === 'sources' || key === 'items' || key === 'data' || key === 'result' || key === 'results' || key === 'videos' || key === 'audio' || key === 'audios' || key === 'video') {
      collectDownloadEntries(value, type, quality, out, seen)
      continue
    }

    if (Array.isArray(value) || typeof value === 'object') {
      collectDownloadEntries(value, type, quality, out, seen)
      continue
    }

    if (typeof value === 'string') {
      const parsed = safeJsonParse(value)
      if (parsed) {
        collectDownloadEntries(parsed, type, quality, out, seen)
      } else if (isUrlString(value)) {
        out.push({
          url: value,
          direct: true,
          scoreBoost: 25,
          raw: value
        })
      }
    }
  }

  return out
}

function buildEntryScore(entry, type, quality) {
  const s = JSON.stringify(entry || {}).toLowerCase()
  let score = 0

  if (entry?.__request) score += 120
  if (entry?.__url) score += 100
  if (entry?.direct) score += 80
  if (entry?.__scoreBoost) score += Number(entry.__scoreBoost) || 0

  if (hasUsefulMediaSignature(entry, type)) score += 80
  if (quality && s.includes(String(quality).toLowerCase())) score += 150

  const qr = qualityRankFromText(s)
  score += Math.min(qr, 4000)

  if (type === 'audio') {
    if (s.includes('audio')) score += 30
    if (s.includes('mp3')) score += 25
    if (s.includes('m4a')) score += 20
  } else {
    if (s.includes('video')) score += 30
    if (s.includes('mp4')) score += 25
    if (s.includes('webm')) score += 20
  }

  return score
}

function pickBestDownloadEntry(items, type, quality) {
  let best = null
  let bestScore = -1

  for (const item of items) {
    const request = getRequestToken(item)
    const url = getCandidateUrl(item) || item?.__url || item?.url
    const direct = !!(item?.direct || url)

    if (!request && !url) continue

    const score = buildEntryScore(item, type, quality) + (direct ? 25 : 0)
    if (score > bestScore) {
      bestScore = score
      best = item
    }
  }

  return best
}

function formatCandidateSummary(items, type, quality, stage = 'unknown') {
  const list = Array.isArray(items) ? items : []
  const lines = []

  lines.push(`stage: ${stage}`)
  lines.push(`requested_type: ${type}`)
  lines.push(`requested_quality: ${quality || 'auto'}`)
  lines.push(`items_count: ${list.length}`)

  const summary = list.slice(0, 8).map((item, i) => {
    const obj = item || {}
    const keys = Object.keys(obj).slice(0, 14).join(', ')
    const text = JSON.stringify(obj).toLowerCase()

    return [
      `#${i + 1}`,
      `keys: ${keys || 'none'}`,
      `has_request: ${!!(obj.request || obj.token || obj.download_request || obj.__request)}`,
      `has_direct_url: ${!!(getCandidateUrl(obj) || obj.__url)}`,
      `has_video_word: ${text.includes('video')}`,
      `has_audio_word: ${text.includes('audio')}`,
      `has_mp4: ${text.includes('mp4')}`,
      `has_webm: ${text.includes('webm')}`,
      `has_mp3: ${text.includes('mp3')}`,
      `raw_quality: ${obj.quality || obj.label || obj.resolution || obj.format || 'unknown'}`
    ].join(' | ')
  })

  if (summary.length) {
    lines.push('')
    lines.push('candidates:')
    lines.push(...summary)
  }

  return truncateText(lines.join('\n'))
}

async function parseWithOrigin(url, origin) {
  const body = new URLSearchParams({
    auth: VIDSSAVE.AUTH_KEY,
    domain: VIDSSAVE.DOMAIN,
    origin,
    link: url
  }).toString()

  const res = await axios.post(
    'https://api.vidssave.com/api/contentsite_api/media/parse',
    body,
    {
      headers: vidsSaveHeaders({
        'content-type': 'application/x-www-form-urlencoded'
      }),
      timeout: 20000
    }
  )

  return res.data
}

async function vidsSaveDownload(url, type = 'video', quality = null) {
  let data = null
  let mediaItems = []

  for (const origin of ['cache', 'source']) {
    try {
      data = await parseWithOrigin(url, origin)
      mediaItems = normalizeMediaList(data)
      if (mediaItems.length) break
    } catch (e) {
      console.warn(`VidsSave parse failed for origin=${origin}:`, e?.message || e)
    }
  }

  if (!mediaItems.length) {
    const err = new Error('VidsSave: لم أجد أي خيارات تحميل من parse')
    err.debugText = formatCandidateSummary(mediaItems, type, quality, 'parse-empty')
    err.raw = data
    throw err
  }

  // 1) ابحث في جميع العقد المتداخلة عن روابط/طلبات تحميل
  const downloadEntries = []
  for (const item of mediaItems) {
    collectDownloadEntries(item, type, quality, downloadEntries)
  }

  // 2) اختَر أفضل entry
  let selectedEntry = pickBestDownloadEntry(downloadEntries, type, quality)

  // 3) لو لسه مصوت، جرّب العناصر نفسها كفولباك
  if (!selectedEntry) {
    selectedEntry = pickBestDownloadEntry(mediaItems, type, quality)
  }

  // 4) فولباك نهائي: أي object فيه request/url
  if (!selectedEntry) {
    selectedEntry = [...downloadEntries, ...mediaItems].find((x) => getRequestToken(x) || getCandidateUrl(x) || x?.__request || x?.__url) || null
  }

  if (!selectedEntry) {
    const err = new Error('VidsSave: الصيغة المطلوبة غير متوفرة لهذا الفيديو')
    err.debugText = formatCandidateSummary(mediaItems, type, quality, 'no-match')
    err.raw = mediaItems
    throw err
  }

  const requestToken = getRequestToken(selectedEntry) || selectedEntry?.__request || null
  const directUrl = getCandidateUrl(selectedEntry) || selectedEntry?.__url || null

  // لو فيه رابط مباشر، نرجعه مباشرة
  if (directUrl) {
    return {
      url: directUrl,
      quality: quality || selectedEntry.quality || selectedEntry.label || selectedEntry.resolution || null,
      size: selectedEntry.size || null,
      source: 'vidssave-direct'
    }
  }

  // لو مصوت request ولا directUrl، ندي Debug واضح
  if (!requestToken) {
    const err = new Error('VidsSave: لا يوجد request token ولا رابط مباشر')
    err.debugText = formatCandidateSummary([...downloadEntries, ...mediaItems], type, quality, 'missing-request')
    err.raw = selectedEntry
    throw err
  }

  const dlRes = await axios.post(
    'https://api.vidssave.com/api/contentsite_api/media/download',
    new URLSearchParams({
      auth: VIDSSAVE.AUTH_KEY,
      domain: VIDSSAVE.DOMAIN,
      request: requestToken,
      no_encrypt: '1'
    }).toString(),
    {
      headers: vidsSaveHeaders({
        'content-type': 'application/x-www-form-urlencoded'
      }),
      timeout: 20000
    }
  )

  const taskId = dlRes.data?.data?.task_id || dlRes.data?.task_id || dlRes.data?.data?.taskId
  if (!taskId) {
    const err = new Error('VidsSave: لم يستجب السيرفر لطلب التحميل')
    err.raw = dlRes.data
    throw err
  }

  const controller = new AbortController()
  const sseTimeout = setTimeout(() => controller.abort(), 60000)

  let downloadUrl = null
  let sseStream = null

  try {
    const sseRes = await axios.get(
      `https://api.vidssave.com/sse/contentsite_api/media/download_query?auth=${encodeURIComponent(VIDSSAVE.AUTH_KEY)}&domain=${encodeURIComponent(VIDSSAVE.DOMAIN)}&task_id=${encodeURIComponent(taskId)}&download_domain=vidssave.com&origin=content_site`,
      {
        headers: vidsSaveHeaders({
          accept: 'text/event-stream',
          'cache-control': 'no-cache'
        }),
        responseType: 'stream',
        signal: controller.signal,
        timeout: 60000
      }
    )

    sseStream = sseRes.data

    let buf = ''
    for await (const chunk of sseStream) {
      buf += chunk.toString('utf8')
      const parts = buf.split('\n\n')
      buf = parts.pop() || ''

      for (const part of parts) {
        const lines = part.split('\n')
        for (const line of lines) {
          if (!line.startsWith('data:')) continue
          const raw = line.replace(/^data:\s*/, '').trim()
          if (!raw) continue

          try {
            const evt = JSON.parse(raw)
            downloadUrl = evt.url || evt.d_url || evt.download_url || evt.data?.url || evt.data?.download_url || null
          } catch {}
        }
      }

      if (downloadUrl) break
    }
  } catch (err) {
    if (controller.signal.aborted) {
      throw new Error('VidsSave: انتهت مهلة انتظار رابط التحميل')
    }
    throw err
  } finally {
    clearTimeout(sseTimeout)
    if (sseStream && typeof sseStream.destroy === 'function') {
      sseStream.destroy()
    }
  }

  if (!downloadUrl) {
    const err = new Error('VidsSave: فشل الحصول على رابط التحميل النهائي')
    err.raw = { taskId }
    throw err
  }

  return {
    url: downloadUrl,
    quality: quality || null,
    size: null,
    source: 'vidsSave'
  }
}

function isValidMediaBuffer(buffer, type) {
  if (!buffer || buffer.length < 12) return false

  const head = buffer.slice(0, 20).toString('utf8').trim().toLowerCase()
  if (head.startsWith('<') || head.startsWith('{') || head.startsWith('<!doctype')) return false

  if (type === 'audio') {
    const isId3 = buffer.slice(0, 3).toString('ascii') === 'ID3'
    const isFrameSync = buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0
    return isId3 || isFrameSync
  }

  const ftyp = buffer.slice(4, 8).toString('ascii')
  const isMp4 = ftyp === 'ftyp'
  const isWebm = buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3
  return isMp4 || isWebm
}

async function fetchBuffer(url) {
  const res = await axios.get(url, {
    headers: vidsSaveHeaders({
      accept: '*/*',
      referer: `${VIDSSAVE.ORIGIN}/`
    }),
    responseType: 'arraybuffer',
    maxRedirects: 5,
    timeout: 120000,
    validateStatus: (s) => s >= 200 && s < 400
  })

  const contentType = String(res.headers?.['content-type'] || '').toLowerCase()
  if (contentType.includes('text/html') || contentType.includes('application/json')) {
    throw new Error('الموقع رجّع صفحة بدل الملف الحقيقي')
  }

  return Buffer.from(res.data)
}

let handler = async (m, { conn, text, command }) => {
  // SEARCH
  if (/^(يوتيوب|youtube|yt)$/i.test(command)) {
    if (!text) {
      return conn.sendMessage(
        m.chat,
        { text: '❌ اكتب كلمة للبحث عن فيديوهات يوتيوب.\nمثال:\n.يوتيوب اغاني حماس' },
        { quoted: m }
      )
    }

    try {
      const search = await yts(text)
      if (!search?.videos?.length) {
        return conn.sendMessage(m.chat, { text: '❌ لم أجد أي نتائج.' }, { quoted: m })
      }

      const results = search.videos.slice(0, 10)
      global.youtubeSearchResults = global.youtubeSearchResults || {}
      global.youtubeSearchResults[m.chat] = results

      const rows = results.map((v, i) => ({
        header: `🎬 ${i + 1}`,
        title: `${v.title?.substring(0, 60) || 'Video'}`,
        description: `👤 ${v.author?.name || 'Unknown'} | ⏱ ${v.timestamp || '??:??'} | 👁 ${Number(v.views || 0).toLocaleString()}`,
        id: `.تفاصيل ${i + 1}`
      }))

      const media = await prepareWAMessageMedia(
        { image: { url: results[0]?.thumbnail } },
        { upload: conn.waUploadToServer }
      )

      const msg = generateWAMessageFromContent(
        m.chat,
        {
          viewOnceMessage: {
            message: {
              interactiveMessage: proto.Message.InteractiveMessage.create({
                body: proto.Message.InteractiveMessage.Body.create({
                  text: `🔍 *نتائج البحث عن:* ${text}\n\nاختر فيديو من القائمة للتحميل 👇`
                }),
                footer: proto.Message.InteractiveMessage.Footer.create({
                  text: '🎬 YouTube Search & Download'
                }),
                header: proto.Message.InteractiveMessage.Header.create({
                  title: '🎥 نتائج البحث',
                  hasMediaAttachment: true,
                  ...(media.imageMessage ? { imageMessage: media.imageMessage } : {})
                }),
                nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
                  buttons: [
                    {
                      name: 'single_select',
                      buttonParamsJson: JSON.stringify({
                        title: '「 قائمة الفيديوهات 」',
                        sections: [
                          {
                            title: '🎬 نتائج البحث',
                            highlight_label: 'YouTube Bot',
                            rows
                          }
                        ]
                      })
                    }
                  ]
                })
              })
            }
          }
        },
        { userJid: m.sender }
      )

      await conn.relayMessage(m.chat, msg.message, { messageId: msg.key.id })
    } catch (e) {
      console.error(e)
      await conn.sendMessage(m.chat, { text: '❌ حصل خطأ أثناء البحث.' }, { quoted: m })
    }
    return
  }

  // DETAILS / DOWNLOAD
  if (/^تفاصيل$/i.test(command)) {
    if (!text) return m.reply('⚠️ الرجاء إدخال رقم الفيديو من قائمة البحث.')

    const choice = parseInt(text, 10)
    if (Number.isNaN(choice)) return m.reply('❌ الرجاء إدخال رقم صحيح.')

    const chatResults = global.youtubeSearchResults?.[m.chat]
    if (!chatResults || choice < 1 || choice > chatResults.length) {
      return m.reply('❌ لم يتم العثور على الفيديو المحدد. قم بإجراء بحث جديد أولاً.')
    }

    const selected = chatResults[choice - 1]

    try {
      const waitMsg = await conn.sendMessage(
        m.chat,
        {
          text: `🎬 *جاري التحضير للتحميل...*\n\n📌 *العنوان:* ${selected.title}\n👤 *القناة:* ${selected.author?.name || 'Unknown'}\n⏱ *المدة:* ${selected.timestamp || 'Unknown'}\n\n🔄 جاري التحميل من VidsSave...`
        },
        { quoted: m }
      )

      const best = await vidsSaveDownload(selected.url, 'video', '1080')
      if (!best?.url) throw new Error('لم يتم الحصول على رابط تحميل صالح')

      let buffer = null
      let sizeBytes = best.size || null

      try {
        buffer = await fetchBuffer(best.url)
        if (!isValidMediaBuffer(buffer, 'video')) {
          throw new Error('الملف المستلم تالف أو غير صالح')
        }
        sizeBytes = buffer.length
      } catch (e) {
        consol