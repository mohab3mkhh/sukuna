// plugins/stickersong.js
// أمر: رد على ستيكر + اكتب اسم الاغنية  =>  البوت يبعت نفس الستيكر ومعاه مقطع الاغنية (10 ثواني)
// المتطلبات: ffmpeg + yt-search (npm i yt-search) | اختياري: yt-dlp (أضمن مصدر تحميل)

import * as baileys from '@whiskeysockets/baileys'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { randomBytes } from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const { proto } = baileys
const run = promisify(execFile)

const CLIP_SECONDS = 10
const MUSIC_EMOJI = '🎵'
const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg'
const FFPROBE = process.env.FFPROBE_PATH || 'ffprobe'
const YTDLP = process.env.YTDLP_PATH || 'yt-dlp'

// مصادر احتياطية لو yt-dlp مش موجود (مجانية وممكن تقع، زوّد/بدّل براحتك)
const AUDIO_APIS = [
  u => `https://api.siputzx.my.id/api/d/ytmp3?url=${encodeURIComponent(u)}`,
  u => `https://api.ryzendesu.vip/api/downloader/ytmp3?url=${encodeURIComponent(u)}`,
  u => `https://api.nekolabs.web.id/downloader/youtube/v1?url=${encodeURIComponent(u)}&format=mp3`,
]

/* ───────────── protobuf الخام (حقل 134 مش موجود في proto بتاع baileys) ───────────── */

const varint = (n) => {
  const o = []
  while (n > 127) { o.push((n % 128) | 128); n = Math.floor(n / 128) }
  o.push(n)
  return Buffer.from(o)
}
const lenField = (num, buf) => Buffer.concat([varint(num * 8 + 2), varint(buf.length), buf])

// أي رسالة عليها __stkSong بنزوّد عليها حقل 134 وقت التشفير
if (!globalThis.__stkSongEncHook) {
  globalThis.__stkSongEncHook = true
  const origEncode = proto.Message.encode
  proto.Message.encode = function (msg, writer) {
    const w = origEncode.call(this, msg, writer)
    if (msg && msg.__stkSong) w.uint32(134 * 8 + 2).bytes(msg.__stkSong)
    return w
  }
}

// 134 { 1 { 26 { stickerMessage + 24:0 + 25:"🎵" + 26:audioMessage } } }
function buildSongStickerPayload(stickerMsg, audioMsg) {
  const stk = Buffer.from(proto.Message.StickerMessage.encode(stickerMsg).finish())
  const aud = Buffer.from(proto.Message.AudioMessage.encode(audioMsg).finish())
  const stkFull = Buffer.concat([
    stk,
    Buffer.from([0xc0, 0x01, 0x00]),            // 24:0
    lenField(25, Buffer.from(MUSIC_EMOJI)),      // 25:"🎵"
    lenField(26, aud),                           // 26: الصوت
  ])
  return lenField(1, lenField(26, stkFull))
}

/* ───────────── أدوات ───────────── */

const parseTime = (s) => {
  if (!s) return 0
  const p = s.split(':').map(Number)
  return p.some(Number.isNaN) ? 0 : p.reduce((a, b) => a * 60 + b, 0)
}

const isAnimatedWebp = (b) =>
  b.length > 21 && b.toString('latin1', 12, 16) === 'VP8X' && (b[20] & 0x02) !== 0

async function getStickerBuffer(q) {
  if (typeof q.download === 'function') {
    try {
      const b = await q.download()
      if (Buffer.isBuffer(b) && b.length) return b
    } catch {}
  }
  const content = q.msg || q.message?.stickerMessage || q.fakeObj?.message?.stickerMessage
  const stream = await baileys.downloadContentFromMessage(content, 'sticker')
  const chunks = []
  for await (const c of stream) chunks.push(c)
  return Buffer.concat(chunks)
}

async function findVideo(query) {
  let yts
  try { yts = (await import('yt-search')).default }
  catch { throw new Error('مكتبة yt-search مش متسطبة. نفّذ: npm i yt-search') }

  const id = query.match(/(?:v=|youtu\.be\/|shorts\/)([\w-]{11})/)?.[1]
  if (id) return yts({ videoId: id })

  const r = await yts(query)
  const vids = r.videos || []
  return vids.find(v => v.seconds > 20) || vids[0] || null
}

function pickUrl(o, depth = 0) {
  if (!o || depth > 4) return null
  const ok = (s) => typeof s === 'string' && /^https?:\/\//.test(s) &&
    !/youtu\.?be|\.(jpe?g|png|webp)(\?|$)/i.test(s)
  if (ok(o)) return o
  if (typeof o !== 'object') return null
  for (const k of ['dl', 'download', 'downloadUrl', 'download_url', 'url', 'link', 'audio']) {
    const v = o[k]
    const hit = ok(v) ? v : (v && typeof v === 'object' ? pickUrl(v, depth + 1) : null)
    if (hit) return hit
  }
  for (const v of Object.values(o)) {
    if (v && typeof v === 'object') {
      const hit = pickUrl(v, depth + 1)
      if (hit) return hit
    }
  }
  return null
}

async function probeSeconds(file) {
  try {
    const { stdout } = await run(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file])
    const s = Math.round(parseFloat(stdout))
    if (s > 0) return Math.min(s, CLIP_SECONDS)
  } catch {}
  return CLIP_SECONDS
}

async function makeClip(input, dir, start) {
  const out = path.join(dir, 'clip.ogg')
  for (const ss of start > 0 ? [start, 0] : [0]) {
    await fs.rm(out, { force: true })
    try {
      await run(FFMPEG, [
        '-y', '-v', 'error', '-ss', String(ss), '-i', input, '-t', String(CLIP_SECONDS),
        '-vn', '-map_metadata', '-1', '-ac', '1', '-ar', '48000',
        '-c:a', 'libopus', '-b:a', '48k',
        '-af', `afade=t=in:d=0.1,afade=t=out:st=${CLIP_SECONDS - 0.6}:d=0.6`,
        out,
      ], { timeout: 60000 })
      const st = await fs.stat(out)
      if (st.size > 2000) return { file: out, seconds: await probeSeconds(out) }
    } catch (e) {
      if (e.code === 'ENOENT') throw new Error('ffmpeg مش متسطب على السيرفر')
    }
  }
  throw new Error('فشل تحويل الصوت')
}

// بيجرب المصادر واحد ورا التاني لحد ما واحد يطلع مقطع سليم
async function getClip(url, dir, start) {
  const sources = [
    async () => {
      await run(YTDLP, ['-f', 'bestaudio/best', '--no-playlist', '--no-warnings',
        '-o', path.join(dir, 'src.%(ext)s'), url], { timeout: 120000, maxBuffer: 1 << 26 })
      const f = (await fs.readdir(dir)).find(n => n.startsWith('src.') && !n.endsWith('.part'))
      if (!f) throw new Error('yt-dlp: no file')
      return path.join(dir, f)
    },
    ...AUDIO_APIS.map(build => async () => {
      const res = await fetch(build(url), { signal: AbortSignal.timeout(25000) })
      const link = pickUrl(await res.json())
      if (!link) throw new Error('no link')
      const dl = await fetch(link, { signal: AbortSignal.timeout(60000) })
      if (!dl.ok) throw new Error('HTTP ' + dl.status)
      const buf = Buffer.from(await dl.arrayBuffer())
      if (buf.length < 10000) throw new Error('file too small')
      const file = path.join(dir, 'src_api.bin')
      await fs.writeFile(file, buf)
      return file
    }),
  ]
  for (const src of sources) {
    try {
      const raw = await src()
      return await makeClip(raw, dir, start)
    } catch (e) {
      if (/ffmpeg مش متسطب/.test(e.message)) throw e
    }
  }
  throw new Error('مقدرتش أحمّل الصوت من أي مصدر. ثبّت yt-dlp على السيرفر أو غيّر AUDIO_APIS')
}

/* ───────────── الأمر ───────────── */

const handler = async (m, { conn, text, usedPrefix = '.', command = 'stksong' }) => {
  const say = (t) => conn.sendMessage(m.chat, { text: t }, { quoted: m })
  const react = (e) => conn.sendMessage(m.chat, { react: { text: e, key: m.key } }).catch(() => {})

  const q = m.quoted
  const raw = (typeof text === 'string' ? text : (m.text || '').split(/\s+/).slice(1).join(' ')).trim()
  const isSticker = q && (/sticker/i.test(q.mtype || q.type || '') || /webp/i.test(q.mimetype || q.msg?.mimetype || ''))

  if (!isSticker || !raw) {
    return say(
      `رد على ستيكر واكتب اسم الاغنية:\n${usedPrefix}${command} funk da montanha\n\n` +
      `عشان تبدأ من ثانية معينة:\n${usedPrefix}${command} funk da montanha | 45`
    )
  }

  const [name, startPart] = raw.split('|').map(s => s.trim())
  const start = parseTime(startPart)
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'stksong-'))

  try {
    await react('⏳')

    const stickerBuf = await getStickerBuffer(q)
    const video = await findVideo(name)
    if (!video) { await react('❌'); return say('ملقتش الاغنية دي 😕') }

    const { file, seconds } = await getClip(video.url, tmp, start)
    const oggBuf = await fs.readFile(file)

    const opts = { upload: conn.waUploadToServer, logger: conn.logger }
    const upSticker = await baileys.prepareWAMessageMedia({ sticker: stickerBuf }, opts)
    const upAudio = await baileys.prepareWAMessageMedia(
      { audio: oggBuf, mimetype: 'audio/ogg; codecs=opus', seconds }, opts
    )

    const sm = upSticker.stickerMessage
    sm.mimetype = 'image/webp'
    sm.width = 512
    sm.height = 512
    sm.isAnimated = isAnimatedWebp(stickerBuf)
    sm.stickerSentTs = Date.now()
    sm.isAvatar = false
    sm.isAiSticker = false
    sm.isLottie = false
    if (m.key?.id && m.message) {
      sm.contextInfo = { stanzaId: m.key.id, participant: m.sender || m.key.participant, quotedMessage: m.message }
    }

    const msg = proto.Message.create({ messageContextInfo: { messageSecret: randomBytes(32) } })
    msg.__stkSong = buildSongStickerPayload(sm, upAudio.audioMessage)

    const messageId = baileys.generateMessageIDV2?.(conn.user?.id) || baileys.generateMessageID()
    await conn.relayMessage(m.chat, msg, { messageId })

    await react('✅')
    await say(`🎵 ${video.title}\n⏱ ${start}s ← ${start + seconds}s`)
  } catch (e) {
    console.error('[stickersong]', e)
    await react('❌')
    await say(`❌ ${e.message || 'حصل خطأ'}`)
  } finally {
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => {})
  }
}

handler.help = ['stksong']
handler.tags = ['sticker']
handler.command = /^(ستيكر_اغنية|ستيكر_اغنيه|stksong|stickersong)$/i
export default handler