/**
 * plugins/ستيكر_صوت.js
 * الرد على ستيكر + اسم الأغنية لإرسال ستيكر مدمج معه صوت عبر Baileys (ESM)
 * الشكل: audioStickerMessage.message.stickerMessage.audioMessage
 * المصدر: يوتيوب أولاً، ولو مفيش نتيجة (أو فشل التحميل) يجيب من تيك توك
 */

import axios from 'axios'
import { execFile, spawn } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { delay, prepareWAMessageMedia, proto } from '@whiskeysockets/baileys'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
const MAX_MB = 60

const YTDLP = fs.existsSync('/root/.nix-profile/bin/yt-dlp') ? '/root/.nix-profile/bin/yt-dlp' : 'yt-dlp'
const FFMPEG = fs.existsSync('/root/.nix-profile/bin/ffmpeg') ? '/root/.nix-profile/bin/ffmpeg' : 'ffmpeg'
const COOKIES = '/app/cookies.txt'

const TIK_KEY = process.env.TIKWMAPI_KEY || '34ce144ad4984df4fbbc79480a131395'
const TIK_API = 'https://api.tikwmapi.com'

const CNV_HEADERS = {
  'User-Agent': UA,
  Origin: 'https://iframe.y2meta-uk.com',
  Referer: 'https://iframe.y2meta-uk.com/'
}

const log = (...a) => console.log('[ستيكر_صوت]', ...a)
const errLog = (msg) => console.error('[ستيكر_صوت:ERR]', String(msg || '').slice(0, 240))

/* ---------- protobuf helpers (لو نسخة Baileys مش بتدعم audioStickerMessage) ---------- */
const varint = (n) => {
  const b = []
  while (n > 127) { b.push((n & 127) | 128); n >>>= 7 }
  b.push(n)
  return Buffer.from(b)
}
const field = (num, buf) => Buffer.concat([varint((num << 3) | 2), varint(buf.length), buf])

if (!proto.Message.__audioPatched) {
  const _enc = proto.Message.encode
  proto.Message.encode = function (msg, w) {
    const writer = _enc.call(this, msg, w)
    if (msg && msg.__rawAudioSticker) writer.uint32((134 << 3) | 2).bytes(msg.__rawAudioSticker)
    return writer
  }
  proto.Message.__audioPatched = true
}

function buildAudioStickerPayload(stickerMsg, audioMsg) {
  const native = proto.Message.fromObject({ audioStickerMessage: {} }).audioStickerMessage
  if (native) {
    return { audioStickerMessage: { message: { stickerMessage: { ...stickerMsg, audioMessage: audioMsg } } } }
  }
  const stickerBytes = proto.Message.StickerMessage.encode(stickerMsg).finish()
  const audioBytes = proto.Message.AudioMessage.encode(audioMsg).finish()
  const stickerWithAudio = Buffer.concat([stickerBytes, field(26, audioBytes)])
  const inner = field(26, stickerWithAudio) // Message{ stickerMessage }
  const future = field(1, inner)            // FutureProof{ message }
  return { __rawAudioSticker: future }
}

/* ---------- helpers ---------- */
function getQuotedSticker(m) {
  const q = m?.quoted
  if (!q) return null
  const mime = String(q.mimetype || q.msg?.mimetype || '').toLowerCase()
  return (
    q.mtype === 'stickerMessage' ||
    Boolean(q.msg?.stickerMessage) ||
    Boolean(q.message?.stickerMessage) ||
    mime.includes('webp')
  ) ? q : null
}

function isSocketReady(conn) {
  if (!conn || !conn.user) return false
  const ws = conn.ws
  if (!ws) return true
  if (typeof ws.isOpen === 'boolean') return ws.isOpen
  if (typeof ws.readyState === 'number') return ws.readyState === 1
  return true
}

async function waitForSocket(conn, maxWaitMs = 6000) {
  const start = Date.now()
  while (!isSocketReady(conn)) {
    if (Date.now() - start > maxWaitMs) throw new Error('الاتصال مغلق حالياً')
    await delay(300)
  }
}

async function runWithSocket(conn, fn) {
  for (let i = 0; i < 2; i++) {
    try {
      await waitForSocket(conn)
      return await fn()
    } catch (e) {
      const msg = String(e?.message || e || '')
      if (i === 1 || !/connection closed|timed out|socket|مغلق/i.test(msg)) throw e
      await delay(1200)
    }
  }
}

async function searchFirstYouTubeVideo(query) {
  try {
    const mod = await import('yt-search')
    const yts = mod.default || mod
    const res = await yts(query)
    const vids = (res?.videos || []).filter(v => v.seconds > 0 && v.seconds < 1800)
    const pick = vids[0] || res?.videos?.[0]
    if (pick?.videoId) return { id: pick.videoId, title: pick.title || query }
  } catch (e) {
    errLog('search:', e?.message || e)
  }

  const r = await axios.get(
    `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
    {
      headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9', Cookie: 'SOCS=CAI' },
      timeout: 15000
    }
  )
  const match = String(r.data).match(/var ytInitialData = ({.+?});<\/script>/)
  if (!match) throw new Error('تعذر قراءة نتائج البحث')
  const data = JSON.parse(match[1])
  const sections = data.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || []
  for (const s of sections) {
    for (const item of s.itemSectionRenderer?.contents || []) {
      const v = item.videoRenderer
      if (v?.videoId) return { id: v.videoId, title: v.title?.runs?.[0]?.text || query }
    }
  }
  return null
}

async function cnvAudio(videoId) {
  const k = await axios.get(`https://cnv.cx/v2/sanity/key?id=${videoId}`, {
    headers: CNV_HEADERS,
    timeout: 15000
  })
  if (!k.data?.key) throw new Error('cnv: لا يوجد مفتاح')
  await delay(1000)

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
    timeout: 90000,
    validateStatus: () => true
  })
  if (!(r.status === 200 && r.data?.url)) {
    throw new Error(r.data?.errorMsg || `cnv: ${r.status}`)
  }

  for (let i = 0; i < 2; i++) {
    try {
      const d = await axios.get(r.data.url, {
        headers: { 'User-Agent': UA, Referer: 'https://cnv.cx/', Origin: 'https://cnv.cx' },
        responseType: 'arraybuffer',
        timeout: 120000,
        maxContentLength: MAX_MB * 1024 * 1024,
        validateStatus: () => true
      })
      if (d.status === 200 && d.data?.length > 20 * 1024) return Buffer.from(d.data)
    } catch {}
    await delay(1500)
  }
  throw new Error('cnv: ملف التحميل فارغ')
}

function runYtDlp(args) {
  return new Promise((resolve, reject) => {
    execFile(YTDLP, args, { timeout: 90000, maxBuffer: 4 * 1024 * 1024 }, (err, _out, stderr) => {
      if (err) {
        const line = String(stderr || err.message || '').trim().split('\n').pop() || 'yt-dlp error'
        return reject(new Error(line.slice(0, 180)))
      }
      resolve()
    })
  })
}

async function ytdlpAudio(videoId) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stk-a-'))
  const out = path.join(dir, `${videoId}.%(ext)s`)
  const url = `https://www.youtube.com/watch?v=${videoId}`

  const args = [
    '-x', '--audio-format', 'mp3', '--audio-quality', '5',
    '--no-playlist', '--no-warnings',
    '--max-filesize', `${MAX_MB}M`,
    '--ffmpeg-location', FFMPEG,
    '-o', out
  ]
  if (fs.existsSync(COOKIES)) args.push('--cookies', COOKIES)
  args.push(url)

  try {
    await runYtDlp(args)
    const file = fs.readdirSync(dir).find(f => f.endsWith('.mp3'))
    if (!file) throw new Error('لم ينتج ملف mp3')
    const buf = fs.readFileSync(path.join(dir, file))
    if (buf.length < 20 * 1024) throw new Error('الملف صغير جداً')
    return buf
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }) } catch {}
  }
}

// جلب الساوند من تيك توك (بحث بالكلمات → أول نتيجة فيها صوت)
async function tiktokAudio(query) {
  const r = await axios.get(`${TIK_API}/feed/search`, {
    params: { keywords: query, count: 10, cursor: 0 },
    headers: { 'x-tikwmapi-key': TIK_KEY, 'User-Agent': UA },
    timeout: 25000
  })
  if (r.data?.code !== undefined && r.data.code !== 0) {
    throw new Error(r.data?.msg || 'tikwmapi error')
  }
  const v = (r.data?.data?.videos || []).find(x => x?.music_info?.play || x?.music)
  if (!v) throw new Error('لا توجد نتائج في تيك توك')

  const url = v.music_info?.play || v.music
  const d = await axios.get(url, {
    headers: { 'User-Agent': UA, Referer: 'https://www.tiktok.com/' },
    responseType: 'arraybuffer',
    timeout: 60000,
    maxContentLength: MAX_MB * 1024 * 1024
  })
  if (d.data?.length > 5 * 1024) return Buffer.from(d.data)
  throw new Error('ملف تيك توك فارغ')
}

// يحوّل لـ OGG/Opus ويقص أول 10 ثواني
function toOpusOggBuffer(inputBuffer, maxSeconds = 10) {
  return new Promise((resolve, reject) => {
    const tmpDir = os.tmpdir()
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    const inPath = path.join(tmpDir, `${id}_in`)
    const outPath = path.join(tmpDir, `${id}_out.ogg`)
    fs.writeFileSync(inPath, inputBuffer)

    const ff = spawn(FFMPEG, [
      '-y', '-i', inPath, '-vn', '-t', String(maxSeconds),
      '-c:a', 'libopus', '-b:a', '64k', '-ar', '48000', '-ac', '1',
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
        return reject(new Error('فشل تحويل الصوت إلى OGG/Opus'))
      }
      const outBuf = fs.readFileSync(outPath)
      try { fs.unlinkSync(outPath) } catch {}
      resolve(outBuf)
    })
  })
}

async function fetchSongAudioBuffer(query) {
  const video = await searchFirstYouTubeVideo(query).catch(() => null)

  // يوتيوب مالقاش نتيجة → تيك توك
  if (!video) {
    log('يوتيوب: لا نتائج، جاري البحث في تيك توك')
    try {
      return await tiktokAudio(query)
    } catch (e) {
      throw new Error(`لم يتم العثور على أغنية (يوتيوب + تيك توك): ${e?.message || ''}`)
    }
  }

  try {
    return await cnvAudio(video.id)
  } catch (e1) {
    try {
      return await ytdlpAudio(video.id)
    } catch (e2) {
      // يوتيوب لاقى الأغنية بس التحميل فشل → جرب تيك توك قبل ما ترمي الخطأ
      try {
        log('فشل تحميل يوتيوب، جاري المحاولة من تيك توك')
        return await tiktokAudio(query)
      } catch (e3) {
        throw new Error(`${e1?.message || 'فشل التحميل'} | ${e2?.message || 'فشل yt-dlp'} | ${e3?.message || 'فشل تيك توك'}`)
      }
    }
  }
}

/* ---------- handler ---------- */
const handler = async (m, { conn, text, usedPrefix, command }) => {
  const quotedSticker = getQuotedSticker(m)
  const songName = (text || '').trim()

  if (!quotedSticker || !songName) {
    return m.reply(
      `🎵 *ستيكر بصوت*\n\nرد على ستيكر واكتب اسم الأغنية:\n*مثال:* ${usedPrefix + command} Funk Da Montanha`
    )
  }

  try {
    const stickerBuf = await runWithSocket(conn, () => quotedSticker.download())
    if (!stickerBuf || !Buffer.isBuffer(stickerBuf) || stickerBuf.length < 500) {
      return m.reply('❌ تعذر تحميل الستيكر')
    }

    const rawAudio = await fetchSongAudioBuffer(songName)
    const opusBuf = await toOpusOggBuffer(rawAudio, 10)

    const stickerMedia = await runWithSocket(conn, () =>
      prepareWAMessageMedia({ sticker: stickerBuf }, { upload: conn.waUploadToServer })
    )

    const audioMedia = await runWithSocket(conn, () =>
      prepareWAMessageMedia(
        { audio: opusBuf, mimetype: 'audio/ogg; codecs=opus', ptt: false },
        { upload: conn.waUploadToServer }
      )
    )

    const sm = { ...stickerMedia.stickerMessage }
    const am = { ...audioMedia.audioMessage, seconds: audioMedia.audioMessage.seconds || 10 }
    const payload = buildAudioStickerPayload(sm, am)

    await runWithSocket(conn, () => conn.relayMessage(m.chat, payload, { quoted: m }))
    log('✅ تم الإرسال')
  } catch (err) {
    errLog(err?.message || err)
    try {
      if (isSocketReady(conn)) {
        await m.reply(`❌ *خطأ:* ${String(err?.message || err).slice(0, 180)}`)
      }
    } catch {}
  }
}

handler.help = ['ستيكر_صوت <اسم الأغنية>']
handler.tags = ['sticker']
handler.command = /^(ستيكر_صوت|ستيكر_اغنية|songsticker)$/i

export default handler