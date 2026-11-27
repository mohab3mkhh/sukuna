// plugins/ملصق.js
// 🖼️ تحويل صورة/فيديو لستيكر.
//   - صورة          → ستيكر مباشرة
//   - فيديو (≤10ث) → البوت يسألك: بدون صوت ولا بصوت (صوت الفيديو نفسه بيتحط جوه الستيكر)
//   اختصار من غير سؤال:  .لملصق بصوت   /   .لملصق بدون
import { Sticker, StickerTypes } from 'wa-sticker-formatter'
import ffmpeg from 'fluent-ffmpeg'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import { delay, prepareWAMessageMedia, proto } from '@whiskeysockets/baileys'
import { sendList } from '../lib/buttons.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const tmpDir = path.join(__dirname, '../tmp')
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true })

const FOOTER = '⛩️ SUKUNA BOT ⛩️'
// نفس مسار ffmpeg اللي بيستخدمه أمر ستيكر_صوت الشغال عندك
const FFMPEG = fs.existsSync('/root/.nix-profile/bin/ffmpeg') ? '/root/.nix-profile/bin/ffmpeg' : 'ffmpeg'
const FFPROBE = fs.existsSync('/root/.nix-profile/bin/ffprobe') ? '/root/.nix-profile/bin/ffprobe' : 'ffprobe'
const PENDING_MS = 5 * 60_000
const SOUND_MAX = 480 * 1024   // ستيكر الصوت المتحرك: نحاول نخليه تحت 500KB (حد واتساب للستيكر المتحرك)
const CHOICE_CMD = 'ملصق_خيار'
if (!global.stkPending) global.stkPending = new Map()   // chat:sender → { media, seconds, m, expires }

const box = (title, line) =>
  `*╮═≼『⛩️┃${title}┃⛩️』≽═╭*\n*┇⌗╎${line} ⌗*\n*╯✯≼══━━﹂⛩️﹁━━══≽✯*`

/* ───────── audioStickerMessage (نفس طريقة أمر ستيكر_صوت) ───────── */
const varint = n => { const b = []; while (n > 127) { b.push((n & 127) | 128); n >>>= 7 } b.push(n); return Buffer.from(b) }
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
  if (native) return { audioStickerMessage: { message: { stickerMessage: { ...stickerMsg, audioMessage: audioMsg } } } }
  const stickerBytes = proto.Message.StickerMessage.encode(stickerMsg).finish()
  const audioBytes = proto.Message.AudioMessage.encode(audioMsg).finish()
  const stickerWithAudio = Buffer.concat([stickerBytes, field(26, audioBytes)])
  const inner = field(26, stickerWithAudio)
  const future = field(1, inner)
  return { __rawAudioSticker: future }
}

/* ───────── ffmpeg helpers ───────── */
const runFf = (cmd, ms, outPath) => new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('انتهى الوقت')), ms)
  cmd.on('end', () => { clearTimeout(t); resolve() }).on('error', e => { clearTimeout(t); reject(e) }).save(outPath)
})
const rm = (...ps) => ps.forEach(p => { try { fs.unlinkSync(p) } catch {} })

// معلومات ملف الـ webp (متحرك؟ وأبعاده) — الستيكر المتحرك الحقيقي بيتبعت بـ isAnimated + الأبعاد
function webpInfo(buf) {
  try {
    if (buf.subarray(0, 4).toString('latin1') !== 'RIFF') return {}
    const info = { animated: buf.includes(Buffer.from('ANIM')) }
    if (buf.subarray(12, 16).toString('latin1') === 'VP8X') {
      info.width = 1 + buf.readUIntLE(24, 3)
      info.height = 1 + buf.readUIntLE(27, 3)
    }
    return info
  } catch { return {} }
}

async function videoToWebp(media) {
  const id = Date.now() + '_' + Math.random().toString(36).slice(2, 6)
  const inputPath = path.join(tmpDir, `input_${id}.mp4`)
  const outputPath = path.join(tmpDir, `output_${id}.webp`)
  fs.writeFileSync(inputPath, media)
  try {
    await runFf(ffmpeg(inputPath).outputOptions([
      '-vf', 'scale=256:256:force_original_aspect_ratio=decrease,format=rgba,pad=256:256:(ow-iw)/2:(oh-ih)/2:color=0x00000000',
      '-c:v', 'libwebp', '-q:v', '30', '-loop', '0', '-an', '-vsync', '0', '-fs', '800K'
    ]), 20000, outputPath)
    let buf = fs.readFileSync(outputPath)
    if (buf.length > 900 * 1024) {
      const re = path.join(tmpDir, `re_output_${id}.webp`)
      await runFf(ffmpeg(outputPath).outputOptions(['-c:v', 'libwebp', '-q:v', '20', '-fs', '700K']), 15000, re)
      buf = fs.readFileSync(re); rm(re)
    }
    return buf
  } catch (ffErr) {
    console.error('FFmpeg error:', ffErr.message)
    return await new Sticker(media, { pack: global.stickpack || '⛩️ SUKUNA BOT', author: global.stickauth || 'SUKUNA', type: StickerTypes.CROPPED, quality: 20 }).toBuffer()
  } finally { rm(inputPath, outputPath) }
}

// نفس تحويل الستيكر العادي (256×256) بس بجودة/FPS نتحكم فيهم، ومن غير -fs (القص بيبوّظ الأنيميشن)
async function videoToWebpTuned(media, { q, fps }) {
  const id = Date.now() + '_' + Math.random().toString(36).slice(2, 6)
  const inputPath = path.join(tmpDir, `tune_in_${id}.mp4`)
  const outputPath = path.join(tmpDir, `tune_out_${id}.webp`)
  fs.writeFileSync(inputPath, media)
  try {
    const vf = `fps=${fps},scale=256:256:force_original_aspect_ratio=decrease,format=rgba,pad=256:256:(ow-iw)/2:(oh-ih)/2:color=0x00000000`
    await runFf(ffmpeg(inputPath).outputOptions([
      '-vf', vf, '-c:v', 'libwebp', '-q:v', String(q), '-loop', '0', '-an', '-vsync', '0'
    ]), 25000, outputPath)
    return fs.readFileSync(outputPath)
  } finally { rm(inputPath, outputPath) }
}

async function imageToWebp(media) {
  const id = Date.now() + '_' + Math.random().toString(36).slice(2, 6)
  const inputPath = path.join(tmpDir, `img_input_${id}.jpg`)
  const outputPath = path.join(tmpDir, `img_output_${id}.webp`)
  fs.writeFileSync(inputPath, media)
  try {
    await runFf(ffmpeg(inputPath).outputOptions([
      '-vf', 'scale=512:512:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000',
      '-c:v', 'libwebp', '-q:v', '50', '-fs', '900K'
    ]), 10000, outputPath)
    return fs.readFileSync(outputPath)
  } catch (ffErr) {
    console.error('FFmpeg image error:', ffErr.message)
    return await new Sticker(media, { pack: global.stickpack || '⛩️ SUKUNA BOT', author: global.stickauth || 'SUKUNA', type: StickerTypes.FULL, quality: 30 }).toBuffer()
  } finally { rm(inputPath, outputPath) }
}

// مدة ملف (صوت أو فيديو) بالثواني
function probeSeconds(file) {
  return new Promise(resolve => {
    let out = ''
    const p = spawn(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', file])
    p.stdout.on('data', d => { out += d })
    p.on('error', () => resolve(0))
    p.on('close', () => resolve(parseFloat(out) || 0))
  })
}

// 🗜️ يصغّر الفيديو الأول (الأبعاد + الجودة + FPS) مع الحفاظ على الصوت، عشان الستيكر يطلع خفيف
async function shrinkVideo(media, id) {
  const LIMIT = 800 * 1024
  if (media.length <= LIMIT) { L(id, `الفيديو صغير أصلاً (${(media.length / 1024).toFixed(0)}KB)، مش محتاج تصغير`); return media }
  const key = Date.now() + '_' + Math.random().toString(36).slice(2, 6)
  const inP = path.join(tmpDir, `shr_in_${key}.mp4`)
  const outP = path.join(tmpDir, `shr_out_${key}.mp4`)
  fs.writeFileSync(inP, media)
  const attempts = [
    { size: 256, fps: 15, crf: 32 },
    { size: 192, fps: 12, crf: 36 },
    { size: 160, fps: 10, crf: 40 }
  ]
  let best = media
  try {
    for (const a of attempts) {
      const ok = await new Promise(resolve => {
        const args = ['-y', '-i', inP, '-t', '10',
          '-vf', `fps=${a.fps},scale=${a.size}:${a.size}:force_original_aspect_ratio=decrease:force_divisible_by=2`,
          '-c:v', 'libx264', '-preset', 'veryfast', '-crf', String(a.crf), '-pix_fmt', 'yuv420p',
          '-c:a', 'aac', '-b:a', '64k', '-ac', '1', '-movflags', '+faststart', outP]
        const ff = spawn(FFMPEG, args)
        const t = setTimeout(() => { try { ff.kill('SIGKILL') } catch {} ; resolve(false) }, 40000)
        ff.on('error', () => { clearTimeout(t); resolve(false) })
        ff.on('close', code => { clearTimeout(t); resolve(code === 0 && fs.existsSync(outP)) })
      })
      if (!ok) { L(id, `تصغير الفيديو فشل (${a.size}px)`); continue }
      const b = fs.readFileSync(outP); rm(outP)
      L(id, `🗜️ تصغير الفيديو ${a.size}px/${a.fps}fps/crf${a.crf}: ${(media.length / 1024).toFixed(0)}KB → ${(b.length / 1024).toFixed(0)}KB`)
      if (b.length < best.length) best = b
      if (b.length <= LIMIT) break
    }
  } finally { rm(inP, outP) }
  return best
}

async function shrinkIfBig(buf, isVideo) {
  if (buf.length <= 900 * 1024) return buf
  try {
    return await new Sticker(buf, { pack: global.stickpack || '⛩️ SUKUNA BOT', author: global.stickauth || 'SUKUNA', type: isVideo ? StickerTypes.CROPPED : StickerTypes.FULL, quality: 10 }).toBuffer()
  } catch (e) { console.error('فشل الضغط الإضافي:', e); return buf }
}

/* ───────── لوجز ───────── */
const L = (id, ...a) => console.log(`[ملصق:صوت#${id}]`, ...a)
const E = (id, ...a) => console.error(`[ملصق:صوت#${id}:ERR]`, ...a)

/* ───────── الاتصال (نفس ستيكر_صوت) ───────── */
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

/* ───────── استخراج الصوت (OGG/Opus أول 10 ثواني) ───────── */
// هل الفيديو فيه مسار صوت؟ → '' = مفيش، 'opus,..' = فيه، null = ffprobe فشل
function audioStreamInfo(media) {
  return new Promise(resolve => {
    const f = path.join(os.tmpdir(), `has_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.mp4`)
    fs.writeFileSync(f, media)
    let out = ''
    const done = v => { rm(f); resolve(v) }
    const p = spawn(FFPROBE, ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=codec_name,sample_rate,channels,duration', '-of', 'csv=p=0', f])
    p.stdout.on('data', d => { out += d })
    p.on('error', () => done(null))
    p.on('close', () => done(out.trim()))
  })
}

// بترجّع { buf, seconds } — seconds هي المدة الفعلية للصوت (مهمة جداً لتشغيل الستيكر)
function toOpusOggBuffer(inputBuffer, maxSeconds = 10, id = '-') {
  return new Promise((resolve, reject) => {
    const t0 = Date.now()
    const key = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    const inPath = path.join(os.tmpdir(), `${key}_in`)
    const outPath = path.join(os.tmpdir(), `${key}_out.ogg`)
    fs.writeFileSync(inPath, inputBuffer)

    const args = ['-y', '-i', inPath, '-vn', '-t', String(maxSeconds), '-c:a', 'libopus', '-b:a', '64k', '-ar', '48000', '-ac', '1', outPath]
    L(id, 'ffmpeg', args.join(' '))
    const ff = spawn(FFMPEG, args)
    let err = ''
    ff.stderr.on('data', d => { err = (err + d).slice(-500) })

    ff.on('error', (e) => {
      rm(inPath, outPath)
      E(id, 'ffmpeg مش شغال:', e.message)
      reject(e)
    })

    ff.on('close', async (code) => {
      rm(inPath)
      if (code !== 0 || !fs.existsSync(outPath)) {
        rm(outPath)
        E(id, `ffmpeg خرج بكود ${code}:`, err.trim().split('\n').slice(-3).join(' | '))
        return reject(new Error('فشل تحويل الصوت إلى OGG/Opus'))
      }
      const outBuf = fs.readFileSync(outPath)
      const dur = await probeSeconds(outPath)
      rm(outPath)
      L(id, `✅ الصوت اتحوّل: ${outBuf.length} بايت | الطول الفعلي ${dur.toFixed(3)}ث | ${Date.now() - t0}ms`)
      resolve({ buf: outBuf, seconds: dur })
    })
  })
}

/* ───────── الدمج والإرسال ───────── */
async function buildAndSend(conn, m, stickerBuf, rawAudio, id) {
  const t0 = Date.now()
  const { buf: opusBuf, seconds: realSecs } = await toOpusOggBuffer(rawAudio, 10, id)

  const stickerMedia = await runWithSocket(conn, () =>
    prepareWAMessageMedia({ sticker: stickerBuf }, { upload: conn.waUploadToServer })
  )
  const audioMedia = await runWithSocket(conn, () =>
    prepareWAMessageMedia({ audio: opusBuf, mimetype: 'audio/ogg; codecs=opus', ptt: false }, { upload: conn.waUploadToServer })
  )

  // ⚠️ المدة لازم تطابق الصوت الفعلي (قبل كده كانت بتتحط 10 ثواني دايماً لو Baileys ماعرفش يحسبها)
  const realSec = realSecs > 0 ? Math.max(1, Math.ceil(realSecs)) : 0
  const secondsSent = realSec || audioMedia.audioMessage.seconds || 10

  const am = { ...audioMedia.audioMessage, seconds: secondsSent }

  // الستيكر: نفس شكل الستيكر المتحرك الحقيقي (isAnimated + الأبعاد)
  const sm = { ...stickerMedia.stickerMessage }
  const wi = webpInfo(stickerBuf)
  if (wi.animated) sm.isAnimated = true
  if (wi.width && !sm.width) { sm.width = wi.width; sm.height = wi.height }

  L(id, 'الستيكر:', JSON.stringify({
    mimetype: sm.mimetype, isAnimated: sm.isAnimated, width: sm.width, height: sm.height, bytes: Number(sm.fileLength) || stickerBuf.length
  }))
  L(id, 'الصوت:', JSON.stringify({
    mimetype: am.mimetype, ptt: am.ptt, secondsBaileys: audioMedia.audioMessage.seconds, secondsReal: realSecs, secondsSent: am.seconds, bytes: Number(am.fileLength) || opusBuf.length
  }))

  const payload = buildAudioStickerPayload(sm, am)
  L(id, 'نوع الرسالة:', payload.audioStickerMessage ? 'audioStickerMessage (native)' : 'raw field 134')

  const res = await runWithSocket(conn, () => conn.relayMessage(m.chat, payload, { quoted: m }))
  L(id, `✅ تم الإرسال (messageId=${res || '?'}) | ${Date.now() - t0}ms`)
}

/* ───────── الإرسال العادي ───────── */
async function sendPlain(conn, m, buf) {
  await conn.sendMessage(m.chat, { sticker: buf }, { quoted: m })
}

// فيديو → ستيكر عادي، وبعدين (لو بصوت) نستخرج صوت الفيديو وندمجهم
async function finishVideo(conn, m, media, withSound) {
  const id = Math.random().toString(36).slice(2, 6)
  const t0 = Date.now()
  L(id, `بدء | بصوت=${withSound} | الفيديو ${media.length} بايت | chat=${m.chat}`)

  // بصوت: نصغّر الفيديو الأول قبل أي حاجة (الصوت بيفضل موجود)
  if (withSound) media = await shrinkVideo(media, id)

  // لو بصوت: نبدأ من غير -fs (القص بيبوّظ ملف الـ webp المتحرك ويخلي الصوت مايشتغلش)
  let sticker = withSound
    ? await videoToWebpTuned(media, { q: 30, fps: 15 }).catch(() => videoToWebp(media))
    : await shrinkIfBig(await videoToWebp(media), true)
  L(id, `الستيكر جاهز: ${sticker.length} بايت (${(sticker.length / 1024).toFixed(0)}KB)`)

  // ستيكر الصوت: لو أكبر من ~500KB نضغطه (جودة + FPS أقل) لحد ما ينزل تحت الحد
  if (withSound && sticker.length > SOUND_MAX) {
    L(id, `⚠️ الستيكر أكبر من ${(SOUND_MAX / 1024).toFixed(0)}KB، هضغطه`)
    let best = sticker
    for (const cfg of [{ q: 22, fps: 15 }, { q: 15, fps: 12 }, { q: 10, fps: 10 }, { q: 6, fps: 8 }]) {
      try {
        const b = await videoToWebpTuned(media, cfg)
        L(id, `ضغط q=${cfg.q} fps=${cfg.fps} → ${b.length} بايت`)
        if (b.length < best.length) best = b
        if (b.length <= SOUND_MAX) break
      } catch (e) { E(id, `فشل الضغط q=${cfg.q}:`, e?.message || e) }
    }
    sticker = best
    L(id, `الستيكر بعد الضغط: ${sticker.length} بايت (${(sticker.length / 1024).toFixed(0)}KB)${sticker.length > SOUND_MAX ? ' ⚠️ لسه أكبر من الحد' : ''}`)
  }

  if (!withSound) {
    await sendPlain(conn, m, sticker)
    return L(id, `✅ اتبعت ستيكر عادي | ${Date.now() - t0}ms`)
  }

  const info = await audioStreamInfo(media)
  L(id, 'مسار الصوت في الفيديو:', info === null ? 'ffprobe فشل (هنجرّب نستخرج)' : (info || 'مفيش'))
  if (info === '') {
    await m.reply(box('تنبيه', 'الفيديو مفيهوش صوت، هبعته ستيكر عادي'))
    await sendPlain(conn, m, sticker)
    return L(id, `⚠️ مفيش صوت، اتبعت ستيكر عادي | ${Date.now() - t0}ms`)
  }

  try {
    await buildAndSend(conn, m, sticker, media, id)
    L(id, `✅ خلص بنجاح | ${Date.now() - t0}ms`)
  } catch (e) {
    E(id, 'فشل دمج الصوت:', e?.stack || e?.message || e)
    await m.reply(box('تنبيه', `تعذّر دمج الصوت (${String(e?.message || e).slice(0, 80)})، هبعته ستيكر عادي`))
    await sendPlain(conn, m, sticker)
  }
}

/* ───────── الأمر ───────── */
export default {
  name: 'ملصق',
  aliases: ['sticker', 'ستيكر', 'لملصق', CHOICE_CMD],
  tags: ['tools'],
  help: ['ملصق — رد على صورة أو فيديو'],

  ownerOnly: false,
  groupOnly: false,
  adminOnly: false,

  async execute(conn, m, extra = {}) {
    const usedPrefix = extra.usedPrefix || '.'
    const command = String(extra.command || '')
    const args = Array.isArray(extra.args) ? extra.args : String(extra.text || '').split(/\s+/).filter(Boolean)
    const key = `${m.chat}:${m.sender}`

    // نظّف الطلبات المنتهية
    for (const [k, v] of global.stkPending) if (v.expires < Date.now()) global.stkPending.delete(k)

    /* ───── اختيار (ضغطة زرار) ───── */
    if (command === CHOICE_CMD) {
      let p = global.stkPending.get(key)
      if (!p) {   // احتياطي: لو اتغيّر شكل الـ sender (LID) وفيه طلب واحد بس في الشات
        const inChat = [...global.stkPending.entries()].filter(([k]) => k.startsWith(m.chat + ':'))
        if (inChat.length === 1) p = inChat[0][1]
      }
      if (!p) return m.reply(box('تنبيه', 'الطلب انتهى، ابعت الفيديو واكتب لملصق تاني'))
      for (const [k, v] of global.stkPending) if (v === p) global.stkPending.delete(k)

      const withSound = String(args[0] || '').toLowerCase() === 'sound'
      await m.react('⏳')
      try {
        await finishVideo(conn, p.m || m, p.media, withSound)
        await m.react('✅')
      } catch (e) {
        console.error('[ملصق Error]', e)
        await m.react('❌')
        return m.reply(box('خطأ', `❌ فشل التحويل: ${String(e.message).slice(0, 150)}`))
      }
      return
    }

    /* ───── الطلب الأساسي ───── */
    const q = m.quoted || m
    const mime = (q.msg?.mimetype || q.mimetype || '').toLowerCase()
    const isImage = /image\/(jpeg|png|gif|webp)/.test(mime)
    const isVideo = /video\//.test(mime)

    if (!isImage && !isVideo) return m.reply(box('تنبيه', 'ꕥ رد على صورة أو فيديو'))

    if (isVideo) {
      const seconds = q.msg?.seconds || q.seconds || 0
      if (seconds > 10) return m.reply(box('تنبيه', 'ꕥ الفيديو أطول من 10 ثواني'))
    }

    await m.react('⏳')
    try {
      const media = await q.download()

      if (isImage) {
        const buf = await shrinkIfBig(await imageToWebp(media), false)
        await sendPlain(conn, m, buf)
        return await m.react('✅')
      }

      // فيديو: اختصار بالأمر نفسه؟
      const a0 = String(args[0] || '')
      if (/^(بصوت|صوت|sound)$/i.test(a0) || /^(بدون|من_غير|nosound|mute)$/i.test(a0)) {
        await finishVideo(conn, m, media, /^(بصوت|صوت|sound)$/i.test(a0))
        return await m.react('✅')
      }

      // اسأل المستخدم
      global.stkPending.set(key, { media, m, expires: Date.now() + PENDING_MS })
      await m.react('❓')
      try {
        await sendList(conn, m.chat, {
          text: '🎬 *تحويل الفيديو لستيكر*\n\nعايز الستيكر إزاي؟\n\n⇩ اختار من القايمة ⇩',
          footer: FOOTER,
          title: '🖼️ لملصق',
          buttonText: '「 اختار نوع الستيكر 」',
          sections: [{
            title: 'نوع الستيكر',
            highlight_label: 'SUKUNA BOT',
            rows: [
              { header: '🔇', title: 'بدون صوت', description: 'ستيكر متحرك عادي', id: `${usedPrefix}${CHOICE_CMD} nosound` },
              { header: '🔊', title: 'بصوت', description: 'بصوت الفيديو نفسه (أول 10 ثواني)', id: `${usedPrefix}${CHOICE_CMD} sound` }
            ]
          }],
          quoted: m
        })
      } catch (e) {
        console.error('[ملصق] الأزرار فشلت:', e.message)
        await m.reply(`🎬 *عايز الستيكر إزاي؟*\n\nاكتب:\n*${usedPrefix}لملصق بدون* ← من غير صوت\n*${usedPrefix}لملصق بصوت* ← بصوت الفيديو\n\n> ${FOOTER}`)
      }
    } catch (e) {
      console.error('[ملصق Error]', e)
      await m.react('❌')
      return m.reply(box('خطأ', `❌ فشل التحويل: ${String(e.message).slice(0, 150)}`))
    }
  }
}