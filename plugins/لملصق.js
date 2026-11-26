// plugins/ملصق.js
// 🖼️ تحويل صورة/فيديو لستيكر.
//   - صورة          → ستيكر مباشرة
//   - فيديو (≤10ث) → البوت يسألك: بدون صوت ولا بصوت (صوت الفيديو نفسه بيتحط جوه الستيكر)
//   اختصار من غير سؤال:  .لملصق بصوت   /   .لملصق بدون
import { Sticker, StickerTypes } from 'wa-sticker-formatter'
import ffmpeg from 'fluent-ffmpeg'
import fs from 'fs'
import path from 'path'
import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import { prepareWAMessageMedia, proto } from '@whiskeysockets/baileys'
import { sendList } from '../lib/buttons.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const tmpDir = path.join(__dirname, '../tmp')
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true })

const FOOTER = '⛩️ SUKUNA BOT ⛩️'
// نفس مسار ffmpeg اللي بيستخدمه أمر ستيكر_صوت الشغال عندك
const FFMPEG = fs.existsSync('/root/.nix-profile/bin/ffmpeg') ? '/root/.nix-profile/bin/ffmpeg' : 'ffmpeg'
const PENDING_MS = 5 * 60_000
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

// يطلّع صوت الفيديو (أول 10 ثواني) OGG/Opus — بنفس أوامر ffmpeg بتاعة ستيكر_صوت الشغال.
// بيرجّع null لو الفيديو مفيهوش صوت. وبيطبع أي خطأ من ffmpeg في اللوج عشان نعرف السبب.
function extractOpus(media) {
  return new Promise(resolve => {
    const id = Date.now() + '_' + Math.random().toString(36).slice(2, 6)
    const inputPath = path.join(tmpDir, `aud_in_${id}.mp4`)
    const outputPath = path.join(tmpDir, `aud_out_${id}.ogg`)
    fs.writeFileSync(inputPath, media)
    let err = ''
    const ff = spawn(FFMPEG, ['-y', '-i', inputPath, '-vn', '-t', '10', '-c:a', 'libopus', '-b:a', '64k', '-ar', '48000', '-ac', '1', outputPath])
    const timer = setTimeout(() => { try { ff.kill('SIGKILL') } catch {} }, 25000)
    ff.stderr.on('data', d => { err = (err + d).slice(-600) })
    const done = val => { clearTimeout(timer); rm(inputPath, outputPath); resolve(val) }
    ff.on('error', e => { console.error('[ملصق:صوت] ffmpeg مش شغال:', e.message); done(null) })
    ff.on('close', code => {
      const ok = code === 0 && fs.existsSync(outputPath)
      const buf = ok ? fs.readFileSync(outputPath) : null
      if (!buf || buf.length < 500) console.error('[ملصق:صوت] استخراج الصوت فشل (code ' + code + '):', err.trim().split('\n').slice(-3).join(' | '))
      done(buf && buf.length >= 500 ? buf : null)
    })
  })
}

async function shrinkIfBig(buf, isVideo) {
  if (buf.length <= 900 * 1024) return buf
  try {
    return await new Sticker(buf, { pack: global.stickpack || '⛩️ SUKUNA BOT', author: global.stickauth || 'SUKUNA', type: isVideo ? StickerTypes.CROPPED : StickerTypes.FULL, quality: 10 }).toBuffer()
  } catch (e) { console.error('فشل الضغط الإضافي:', e); return buf }
}

/* ───────── الإرسال ───────── */
async function sendPlain(conn, m, buf) {
  await conn.sendMessage(m.chat, { sticker: buf }, { quoted: m })
}

async function sendWithSound(conn, m, stickerBuf, opusBuf) {
  const stickerMedia = await prepareWAMessageMedia({ sticker: stickerBuf }, { upload: conn.waUploadToServer })
  const audioMedia = await prepareWAMessageMedia({ audio: opusBuf, mimetype: 'audio/ogg; codecs=opus', ptt: false }, { upload: conn.waUploadToServer })
  const sm = { ...stickerMedia.stickerMessage }
  const am = { ...audioMedia.audioMessage, seconds: audioMedia.audioMessage.seconds || 10 }
  await conn.relayMessage(m.chat, buildAudioStickerPayload(sm, am), { quoted: m })
}

async function finishVideo(conn, m, media, withSound) {
  let sticker = await shrinkIfBig(await videoToWebp(media), true)
  if (withSound) {
    const opus = await extractOpus(media)
    if (!opus) {
      await m.reply(box('تنبيه', 'الفيديو مفيهوش صوت، هبعته ستيكر عادي'))
      return sendPlain(conn, m, sticker)
    }
    return sendWithSound(conn, m, sticker, opus)
  }
  return sendPlain(conn, m, sticker)
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
        // قايمة (single_select) بدل الأزرار: هي اللي بتظهر عندك بشكل مضمون (زي أمر ساوند)
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