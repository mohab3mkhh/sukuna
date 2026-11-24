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
          title: v.title?.runs?.[0]?.text || query
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
  if (!r.data?.key) throw new Error('فشل جلب مفتاح التحويل')
  return r.data.key
}

async function convertSongToMp3Url(videoId, audioBitrate = '128') {
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
  throw new Error('فشل تحويل الأغنية: ' + r.status)
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
  throw new Error('فشل تحميل ملف الصوت بعد عدة محاولات')
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
  const mp3Url = await convertSongToMp3Url(video.id, '128')
  return downloadAudioBuffer(mp3Url)
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