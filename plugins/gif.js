import ffmpeg from 'fluent-ffmpeg'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const tmpDir = path.join(__dirname, '../tmp')
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true })

export default {
  name: 'gif',
  aliases: ['gif', 'جيف', 'صورة متحركة'],
  tags: ['tools'],
  help: ['gif — رد على فيديو لتحويله لـ GIF'],

  ownerOnly: false,
  groupOnly: false,
  adminOnly: false,

  async execute(conn, m) {
    const q = m.quoted || m
    const mime = (q.msg?.mimetype || q.mimetype || '').toLowerCase()

    const isVideo = /video\//.test(mime)
    const isGif = mime.includes('gif')

    if (!isVideo && !isGif) {
      return m.reply(
        `*╮═≼『⛩️┃تنبيه┃⛩️』≽═╭*\n` +
        `*┇⌗╎ꕥ رد على فيديو لتحويله لـ GIF ⌗*\n` +
        `*╯✯≼══━━﹂⛩️﹁━━══≽✯*`
      )
    }

    const seconds = q.msg?.seconds || q.seconds || 0
    if (seconds > 59) {
      return m.reply(
        `*╮═≼『⛩️┃تنبيه┃⛩️』≽═╭*\n` +
        `*┇⌗╎ꕥ الفيديو أطول من دقيقة ⌗*\n` +
        `*╯✯≼══━━﹂⛩️﹁━━══≽✯*`
      )
    }

    await m.react('⏳')

    const inputPath = path.join(tmpDir, `gif_input_${Date.now()}.mp4`)
    const outputPath = path.join(tmpDir, `gif_output_${Date.now()}.mp4`)

    try {
      const media = await q.download()
      fs.writeFileSync(inputPath, media)

      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('انتهى الوقت')), 90000)

        ffmpeg(inputPath)
          .outputOptions(
            '-vf', 'fps=10,scale=320:-2:flags=lanczos',
            '-c:v', 'libx264',
            '-pix_fmt', 'yuv420p',
            '-movflags', '+faststart',
            '-crf', '28',
            '-preset', 'ultrafast',
            '-an'
          )
          .on('end', () => { clearTimeout(timeout); resolve() })
          .on('error', (err) => { clearTimeout(timeout); reject(err) })
          .save(outputPath)
      })

      const gifBuffer = fs.readFileSync(outputPath)

      await conn.sendMessage(m.chat, {
        video: gifBuffer,
        gifPlayback: true,
        mimetype: 'video/mp4'
      }, { quoted: m })

      await m.react('✅')

    } catch (e) {
      console.error('[GIF Error]', e.message)
      await m.react('❌')

      return m.reply(
        `*╮═≼『⛩️┃خطأ┃⛩️』≽═╭*\n` +
        `*┇⌗╎❌ فشل التحويل: ${e.message} ⌗*\n` +
        `*╯✯≼══━━﹂⛩️﹁━━══≽✯*`
      )
    } finally {
      for (const p of [inputPath, outputPath]) {
        try { if (fs.existsSync(p)) fs.unlinkSync(p) } catch {}
      }
    }
  }
}