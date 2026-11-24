/**
 * plugins/ستيكر_صوت.js
 * الرد على ستيكر + اسم الأغنية لإرسال ستيكر مدمج معه صوت عبر Baileys (ESM)
 */

import axios from 'axios'
import { execFile, spawn } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { prepareWAMessageMedia, proto } from '@whiskeysockets/baileys'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
const MAX_MB = 60

const YTDLP = fs.existsSync('/root/.nix-profile/bin/yt-dlp') ? '/root/.nix-profile/bin/yt-dlp' : 'yt-dlp'
const FFMPEG = fs.existsSync('/root/.nix-profile/bin/ffmpeg') ? '/root/.nix-profile/bin/ffmpeg' : 'ffmpeg'
const COOKIES = '/app/cookies.txt'

const CNV_HEADERS = {
  'User-Agent': UA,
  Origin: 'https://iframe.y2meta-uk.com',
  Referer: 'https://iframe.y2meta-uk.com/'
}

const log = (...a) => console.log('[ستيكر_صوت]', ...a)
const logErr = (...a) => console.error('[ستيكر_صوت:ERR]', ...a)

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
  try {
    const mod = await import('yt-search')
    const yts = mod.default || mod
    const res = await yts(query)
    let vids = (res?.videos || []).filter(v => v.seconds > 0 && v.seconds < 1800)
    if (!vids.length) vids = res?.videos || []
    if (vids.length) {
      return {
        id: vids[0].videoId,
        title: vids[0].title || query
      }
    }
  } catch (e) {
    logErr('yt-search:', e?.message || e)
  }

  const r = await axios.get(
    `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
    {
      headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9', Cookie: 'SOCS=CAI' },
      timeout: 15000
    }
  )
  const match = String(r.data).match(/var ytInitialData = ({.+?});<\/script>/)
  if (!match) throw new Error('تعذر قراءة بيانات البحث من يوتيوب')

  const data = JSON.parse(match[1])
  const sections = data.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || []
  for (const s of sections) {
    for (const item of s.itemSectionRenderer?.contents || []) {
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

function runYtDlp(args) {
  return new Promise((resolve, reject) => {
    execFile(YTDLP, args, { timeout: 180000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        return reject(
          new Error((stderr || err.message).toString().trim().split('\n').slice(-2).join(' ').slice(0, 300))
        )
      }
      resolve(stdout)
    })
  })
}

async function ytdlpAudio(videoId) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stk-audio-'))
  const out = path.join(dir, `${videoId}.%(ext)s`)
  const url = `https://www.youtube.com/watch?v=${videoId}`

  const base = [
    '-x', '--audio-format', 'mp3', '--audio-quality', '5',
    '--no-playlist', '--no-warnings',
    '--max-filesize', `${MAX_MB}M`,
    '--ffmpeg-location', FFMPEG,
    '-o', out
  ]
  if (fs.existsSync(COOKIES)) base.push('--cookies', COOKIES)

  const attempts = [
    [...base, url],
    [...base, '--extractor-args', 'youtube:player_client=android,web', url]
  ]

  try {
    let lastErr
    for (let idx = 0; idx < attempts.length; idx++) {
      try {
        await runYtDlp(attempts[idx])
        const file = fs.readdirSync(dir).find(f => f.endsWith('.mp3'))
        if (!file) throw new Error('لم يتم إنتاج ملف mp3')
        const buffer = fs.readFileSync(path.join(dir, file))
        if (buffer.length < 20 * 1024) throw new Error('ملف الصوت صغير جداً')
        return buffer
      } catch (e) {
        lastErr = e
        logErr(`yt-dlp attempt ${idx + 1}:`, e?.message || e)
      }
    }
    throw lastErr || new Error('فشل التحميل عبر yt-dlp')
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }) } catch {}
  }
}

async function cnvAudio(videoId) {
  const k = await axios.get(`https://cnv.cx/v2/sanity/key?id=${videoId}`, {
    headers: CNV_HEADERS,
    timeout: 20000
  })
  if (!k.data?.key) throw new Error('cnv: تعذر جلب المفتاح')
  await new Promise(r => setTimeout(r, 1500))

  const params = new URLSearchParams({
    link: `https://youtu.be/${videoId}`,
    format: 'mp3',
    audioBitrate: '128',
    videoQuality: '720',
    filenameStyle: 'pretty',
    vCodec: 'h264'
  })

  const r = await axios.post('https://cnv.cx/v2/converter', params.toString(), {
    headers: {
      ...CNV_HEADERS,
      'Content-Type': 'application/x-www-form-urlencoded',
      accept: '*/*',
      key: k.data.key
    },
    timeout: 120000,
    validateStatus: () => true
  })
  if (!(r.status === 200 && r.data?.url)) {
    throw new Error(r.data?.errorMsg || `cnv: حالة ${r.status}`)
  }

  for (let i = 0; i < 3; i++) {
    try {
      const d = await axios.get(r.data.url, {
        headers: { 'User-Agent': UA, Referer: 'https://cnv.cx/', Origin: 'https://cnv.cx' },
        responseType: 'arraybuffer',
        timeout: 180000,
        maxContentLength: MAX_MB * 1024 * 1024,
        validateStatus: () => true
      })
      if (d.status === 200 && d.data?.length > 20 * 1024) return Buffer.from(d.data)
    } catch (e) {
      logErr(`cnv dl attempt ${i + 1}:`, e?.message || e)
    }
    await new Promise(r => setTimeout(r, 2000))
  }
  throw new Error('cnv: ملف التحميل فارغ')
}

async function downloadAudio(videoId) {
  let lastErr = ''

  try {
    const b = await ytdlpAudio(videoId)
    log('✅ yt-dlp')
    return b
  } catch (e) {
    lastErr = e?.message || 'فشل yt-dlp'
    logErr('yt-dlp failed:', lastErr)
  }

  try {
    const b = await cnvAudio(videoId)
    log('✅ cnv.cx')
    return b
  } catch (e) {
    lastErr = `${lastErr} | ${e?.message || 'فشل cnv.cx'}`
    logErr('cnv.cx failed:', e?.message || e)
  }

  throw new Error(lastErr || 'تعذر تحميل الصوت')
}

function toOpusOggBuffer(inputBuffer) {
  return new Promise((resolve, reject) => {
    const tmpDir = os.tmpdir()
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const inPath = path.join(tmpDir, `${id}_in`)
    const outPath = path.join(tmpDir, `${id}_out.ogg`)

    fs.writeFileSync(inPath, inputBuffer)

    const ff = spawn(FFMPEG, [
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
  return downloadAudio(video.id)
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
    log('✅ تم إرسال الستيكر المدمج معه الصوت بنجاح')
  } catch (err) {
    logErr('handler error:', err?.stack || err?.message || err)
    await m.reply(`❌ *خطأ:* ${err?.message || err}`)
  }
}

handler.help = ['ستيكر_صوت <اسم الأغنية>']
handler.tags = ['sticker']
handler.command = /^(ستيكر_صوت|ستيكر_اغنية|songsticker)$/i

export default handler