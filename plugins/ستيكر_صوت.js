/**
 * plugins/ستيكر_صوت.js
 * الرد على ستيكر + اسم الأغنية لإرسال ستيكر مدمج معه صوت عبر Baileys (ESM)
 */

import axios from 'axios'
import fetch from 'node-fetch'
import { spawn } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { prepareWAMessageMedia, proto } from '@whiskeysockets/baileys'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36'

const HEADERS = {
  'User-Agent': UA,
  'Origin': 'https://iframe.y2meta-uk.com',
  'Referer': 'https://iframe.y2meta-uk.com/'
}

function getQuotedSticker(m) {
  const q = m?.quoted
  if (!q) return null
  const mime = String(q.mimetype || q.msg?.mimetype || '').toLowerCase()
  const isSticker =
    q.mtype === 'stickerMessage' ||
    Boolean(q.msg?.stickerMessage) ||
    Boolean(q.message?.stickerMessage) ||
    mime.includes('webp')
  return isSticker ? q : null
}

async function searchFirstYouTubeVideo(query) {
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      'Accept-Language': 'en-US,en;q=0.9',
      'Cookie': 'SOCS=CAI'
    },
    timeout: 20000
  })

  if (!res.ok) throw new Error('HTTP ' + res.status)
  const html = await res.text()

  const match = html.match(/var ytInitialData = ({.+?});<\/script>/)
  if (!match) throw new Error('تعذر قراءة بيانات البحث من يوتيوب')

  const data = JSON.parse(match[1])
  const contents = data.contents?.twoColumnSearchResultsRenderer?.primaryContents
    ?.sectionListRenderer?.contents || []

  for (const section of contents) {
    const items = section.itemSectionRenderer?.contents || []
    for (const item of items) {
      const v = item.videoRenderer
      if (v?.videoId) {
        return {
          id: v.videoId,
          title: v.title?.runs?.[0]?.text || query,
          url: `https://youtu.be/${v.videoId}`
        }
      }
    }
  }

  return null
}

async function getDownloadKey(videoId) {
  const r = await axios.get(`https://cnv.cx/v2/sanity/key?id=${videoId}`, {
    headers: HEADERS,
    timeout: 20000
  })
  if (!r.data?.key) throw new Error('فشل جلب مفتاح التحويل من cnv.cx')
  return r.data.key
}

async function convertViaCnv(videoId, audioBitrate = '128') {
  const key = await getDownloadKey(videoId)
  await new Promise(r => setTimeout(r, 1500))

  const params = new URLSearchParams({
    link: `https://youtu.be/${videoId}`,
    format: 'mp3',
    audioBitrate,
    videoQuality: '720',
    filenameStyle: 'pretty',
    vCodec: 'h264'
  })

  const r = await axios.post('https://cnv.cx/v2/converter', params.toString(), {
    headers: {
      ...HEADERS,
      'Content-Type': 'application/x-www-form-urlencoded',
      'accept': '*/*',
      'key': key
    },
    timeout: 120000,
    validateStatus: () => true
  })

  if (r.status === 200 && r.data?.url) return r.data.url
  if (r.data?.errorMsg) throw new Error(r.data.errorMsg)
  throw new Error('فشل تحويل cnv.cx: HTTP ' + r.status)
}

function extractAudioUrlDeep(obj, depth = 0) {
  if (!obj || depth > 5) return ''
  if (typeof obj === 'string') {
    const s = obj.trim()
    if (/^https?:\/\//i.test(s) && !s.includes(' ')) return s
    return ''
  }
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = extractAudioUrlDeep(item, depth + 1)
      if (found) return found
    }
    return ''
  }
  if (typeof obj === 'object') {
    const keys = ['url', 'download', 'download_url', 'audio', 'audio_url', 'mp3', 'link', 'result', 'data']
    for (const k of keys) {
      if (k in obj) {
        const found = extractAudioUrlDeep(obj[k], depth + 1)
        if (found) return found
      }
    }
  }
  return ''
}

async function resolveFallbackAudioUrls(video, query) {
  const candidates = []
  const encodedUrl = encodeURIComponent(video.url)
  const encodedQuery = encodeURIComponent(query)

  const apiEndpoints = [
    `https://prexzyapis.com/download/ytmp3?url=${encodedUrl}`,
    `https://prexzyapis.com/download/ytaudio?url=${encodedUrl}`,
    `https://prexzyapis.com/ai/song?q=${encodedQuery}`
  ]

  for (const ep of apiEndpoints) {
    try {
      const r = await axios.get(ep, {
        timeout: 35000,
        headers: { 'User-Agent': UA, Accept: 'application/json, */*' },
        validateStatus: () => true
      })
      if (r.status < 400 && r.data) {
        const found = extractAudioUrlDeep(r.data)
        if (found) candidates.push(found)
      }
    } catch {}
  }

  return candidates
}

async function downloadAudioBuffer(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const r = await axios.get(url, {
        headers: {
          'User-Agent': UA,
          'Referer': 'https://cnv.cx/',
          'Origin': 'https://cnv.cx'
        },
        timeout: 180000,
        responseType: 'arraybuffer',
        maxRedirects: 5,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        validateStatus: () => true
      })
      if (r.status === 200 && r.data?.length > 2000) {
        return Buffer.from(r.data)
      }
    } catch {}
    if (i < retries - 1) await new Promise(r => setTimeout(r, 2000))
  }
  throw new Error('فشل تحميل ملف الصوت من الرابط')
}

function toOpusOggBuffer(inputBuffer) {
  return new Promise((resolve, reject) => {
    const tmpDir = os.tmpdir()
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const inPath = path.join(tmpDir, `${id}_in`)
    const outPath = path.join(tmpDir, `${id}_out.ogg`)

    fs.writeFileSync(inPath, inputBuffer)

    const ff = spawn('ffmpeg', [
      '-y',
      '-i', inPath,
      '-vn',
      '-c:a', 'libopus',
      '-b:a', '64k',
      '-ar', '48000',
      '-ac', '1',
      outPath
    ])

    ff.on('error', (err) => {
      try { fs.unlinkSync(inPath) } catch {}
      try { fs.unlinkSync(outPath) } catch {}
      reject(err)
    })

    ff.on('close', (code) => {
      try { fs.unlinkSync(inPath) } catch {}
      if (code !== 0 || !fs.existsSync(outPath)) {
        try { fs.unlinkSync(outPath) } catch {}
        return reject(new Error('فشل تحويل الصوت إلى OGG/Opus عبر ffmpeg'))
      }
      const outBuf = fs.readFileSync(outPath)
      try { fs.unlinkSync(outPath) } catch {}
      resolve(outBuf)
    })
  })
}

async function fetchSongAudioBuffer(query) {
  const video = await searchFirstYouTubeVideo(query)
  if (!video) {
    throw new Error('لم يتم العثور على أغنية مطابقة للاسم المطلوب')
  }

  let lastErr = ''

  // 1) المحاولة الأساسية عبر cnv.cx
  try {
    const mp3Url = await convertViaCnv(video.id, '128')
    return await downloadAudioBuffer(mp3Url)
  } catch (e) {
    lastErr = e?.message || 'فشل cnv.cx'
  }

  // 2) المحاولات الاحتياطية
  const fallbackUrls = await resolveFallbackAudioUrls(video, query)
  for (const u of fallbackUrls) {
    try {
      const buf = await downloadAudioBuffer(u)
      if (buf) return buf
    } catch (e) {
      lastErr = e?.message || lastErr
    }
  }

  throw new Error(lastErr || 'تعذر تحميل الصوت من جميع المصادر المتاحة')
}

const handler = async (m, { conn, text, usedPrefix, command }) => {
  const quotedSticker = getQuotedSticker(m)
  const songName = (text || '').trim()

  if (!quotedSticker || !songName) {
    return m.reply(
      `🎵 *ستيكر بصوت*\n\nرد على ستيكر واكتب اسم الأغنية:\n*مثال:* ${usedPrefix + command} Funk Da Montanha`
    )
  }

  try {
    const stickerBuf = await quotedSticker.download()
    if (!stickerBuf || !Buffer.isBuffer(stickerBuf) || stickerBuf.length < 500) {
      return m.reply('❌ تعذر تحميل الستيكر المردود عليه.')
    }

    const rawAudioBuf = await fetchSongAudioBuffer(songName)
    const opusBuf = await toOpusOggBuffer(rawAudioBuf)

    const stickerMedia = await prepareWAMessageMedia(
      { sticker: stickerBuf },
      { upload: conn.waUploadToServer }
    )

    const audioMedia = await prepareWAMessageMedia(
      { audio: opusBuf, mimetype: 'audio/ogg; codecs=opus', ptt: false },
      { upload: conn.waUploadToServer }
    )

    const payload = proto.Message.fromObject({
      134: {
        1: {
          26: stickerMedia.stickerMessage,
          26: audioMedia.audioMessage
        }
      }
    })

    await conn.relayMessage(m.chat, payload, { quoted: m })
  } catch (err) {
    console.error('[sticker-audio]', err)
    await m.reply(`❌ *خطأ:* ${err?.message || err}`)
  }
}

handler.help = ['ستيكر_صوت <اسم الأغنية>']
handler.tags = ['sticker']
handler.command = /^(ستيكر_صوت|ستيكر_اغنية|songsticker)$/i

export default handler