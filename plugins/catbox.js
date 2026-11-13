import fetch from 'node-fetch'
import FormData from 'form-data'
import { sendButtons, btn } from '../lib/buttons.js'

const UA = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36'

// اختياري: لو عندك حساب Catbox حط الـ userhash بتاعه في متغير بيئة CATBOX_USERHASH
// من غيره الرفع بيبقى مجهول وبيشتغل عادي. userhash غلط = "Invalid uploader"
const USERHASH = (process.env.CATBOX_USERHASH || '').trim()

function getExtFromMime(mime) {
  const map = {
    'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png',
    'image/gif': 'gif', 'image/webp': 'webp', 'image/bmp': 'bmp',
    'video/mp4': 'mp4', 'video/webm': 'webm', 'video/3gpp': '3gp',
    'video/quicktime': 'mov', 'video/x-msvideo': 'avi', 'video/x-matroska': 'mkv',
    'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/mp4': 'm4a',
    'audio/ogg': 'ogg', 'audio/wav': 'wav', 'audio/aac': 'aac',
    'audio/flac': 'flac', 'audio/x-flac': 'flac', 'audio/opus': 'opus',
    'audio/webm': 'weba', 'audio/amr': 'amr',
  }
  return map[mime] || mime.split('/')[1]?.split(';')[0] || 'bin'
}

function getMediaType(mime) {
  if (mime.startsWith('image/')) return 'صورة'
  if (mime.startsWith('video/')) return 'فيديو'
  if (mime.startsWith('audio/')) return 'صوت'
  return 'ملف'
}

async function post(url, buffer, mime, extra = {}) {
  const form = new FormData()
  for (const [k, v] of Object.entries(extra)) form.append(k, v)
  form.append('reqtype', 'fileupload')
  form.append('fileToUpload', buffer, { filename: `file.${getExtFromMime(mime)}`, contentType: mime })

  const res = await fetch(url, {
    method: 'POST',
    body: form,
    headers: { ...form.getHeaders(), 'User-Agent': UA }
  })
  const text = (await res.text()).trim()
  if (/^https?:\/\//i.test(text)) return text
  throw new Error(text.slice(0, 100) || `HTTP ${res.status}`)
}

// 1) Catbox (دائم)  2) Litterbox (مؤقت 72 ساعة) كاحتياطي
async function upload(buffer, mime) {
  const errors = []

  try {
    const link = await post('https://catbox.moe/user/api.php', buffer, mime, USERHASH ? { userhash: USERHASH } : {})
    return { link, host: 'Catbox.moe', permanent: true }
  } catch (e) {
    errors.push(`catbox: ${e.message}`)
    // لو المشكلة في الـ userhash جرّب مجهول قبل ما نروح للاحتياطي
    if (USERHASH && /invalid uploader/i.test(e.message)) {
      try {
        const link = await post('https://catbox.moe/user/api.php', buffer, mime)
        return { link, host: 'Catbox.moe', permanent: true }
      } catch (e2) { errors.push(`catbox-anon: ${e2.message}`) }
    }
  }

  try {
    const link = await post('https://litterbox.catbox.moe/resources/internals/api.php', buffer, mime, { time: '72h' })
    return { link, host: 'Litterbox (مؤقت 72 ساعة)', permanent: false }
  } catch (e) {
    errors.push(`litterbox: ${e.message}`)
  }

  throw new Error(errors.join(' | '))
}

const handler = async (m, { conn }) => {
  const targets = []
  const isMedia = (mime = '') => /^(image|video|audio)\//.test(mime)

  if (m.quoted && isMedia(m.quoted.mimetype)) targets.push(m.quoted)
  if (isMedia(m.mimetype)) targets.push(m)

  if (targets.length === 0) {
    return m.reply(`╭─「 📦 *كات بوكس* 」
│
│  ⚠️ *استخدم الأمر بشكل صحيح*
│
│  📌 *طريقة الاستخدام:*
│  • رد على صورة أو فيديو أو صوت
│
│  💡 *الصيغ المدعومة:*
│  🖼️ صور: jpg, png, gif, webp
│  🎬 فيديو: mp4, mkv, avi, mov
│  🎵 صوت: mp3, ogg, wav, aac, flac, opus
│
╰──────────────`)
  }

  await m.react('⏳')

  try {
    const results = []

    for (let i = 0; i < targets.length; i++) {
      const target = targets[i]
      const mime = target.mimetype || ''
      const type = getMediaType(mime)

      try {
        await m.reply(`📤 *جاري رفع ${type} ${i + 1} من ${targets.length}...*`)
        const buffer = await target.download()
        const { link, host, permanent } = await upload(buffer, mime)
        results.push({ num: i + 1, type, link, host, permanent, ok: true })
      } catch (error) {
        console.error('[Catbox Error]', error?.message || error)
        results.push({ num: i + 1, type, ok: false, link: `❌ *فشل:* ${String(error.message).slice(0, 90)}` })
      }
    }

    const okList = results.filter(r => r.ok)
    const allOk = okList.length === results.length

    let msg = `╭─「 ${okList.length ? (allOk ? '✅ *تم الرفع بنجاح*' : '⚠️ *تم الرفع جزئياً*') : '❌ *فشل الرفع*'} 」\n│\n`
    if (okList.length) msg += `│  📤 *رفع إلى:* ${okList[0].host}\n│\n`
    for (const item of results) {
      msg += `│  ${item.num}. ${item.type}:\n│     🔗 ${item.link}\n│\n`
    }
    if (okList.length) {
      msg += `│  💡 *ملاحظات:*\n`
      msg += okList.every(r => r.permanent)
        ? `│  • الملفات تبقى دائمة\n│  • الحد الأقصى: 200 ميجابايت\n`
        : `│  • الرابط مؤقت (72 ساعة) لأن Catbox رفض الرفع\n`
      msg += `│\n`
    }
    msg += `╰──────────────`

    await m.react(okList.length ? '✅' : '❌')

    // رابط واحد ناجح: أزرار نسخ وفتح
    if (okList.length === 1 && results.length === 1) {
      try {
        await sendButtons(conn, m.chat, {
          text: msg,
          footer: '📦 Catbox Uploader',
          buttons: [btn.copy('📋 نسخ الرابط', okList[0].link), btn.url('🔗 فتح الرابط', okList[0].link)]
        }, m)
        return
      } catch (e) {
        console.error('[Catbox] buttons failed:', e?.message || e)
      }
    }
    await m.reply(msg)

  } catch (error) {
    await m.react('❌')
    await m.reply(`❌ *خطأ:* ${error.message}`)
  }
}

handler.help = ['catbox', 'cb']
handler.tags = ['tools']
handler.command = /^(cat\s?box|cb)$/i

export default handler