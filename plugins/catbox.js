import fetch from 'node-fetch'
import FormData from 'form-data'
import { sendButtons, btn } from '../lib/buttons.js'

const UA = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36'

// اختياري: لو عندك حساب Catbox حط الـ userhash بتاعه في متغير بيئة CATBOX_USERHASH
// من غيره الرفع بيبقى مجهول وبيشتغل عادي. userhash غلط = "Invalid uploader"
const USERHASH = (process.env.CATBOX_USERHASH || '').trim()
// اختياري: كوكي جلسة Catbox بالشكل  PHPSESSID=xxxx  (المتصفح بيبعتها مع الـ userhash)
// اختياري: مفتاح API من api.imgbb.com (للصور فقط، رابط دائم)
const IMGBB_KEY = (process.env.IMGBB_API_KEY || '').trim()
const CATBOX_COOKIE = (process.env.CATBOX_COOKIE || '').trim()

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

// إرسال multipart بحجم معروف (Content-Length) — بعض السيرفرات بترفض الـ chunked
async function send(url, field, buffer, mime, extra = {}, headers = {}) {
  const form = new FormData()
  for (const [k, v] of Object.entries(extra)) form.append(k, v)
  form.append(field, buffer, { filename: `file.${getExtFromMime(mime)}`, contentType: mime })

  const body = form.getBuffer()
  const res = await fetch(url, {
    method: 'POST',
    body,
    headers: { ...form.getHeaders(), 'Content-Length': String(body.length), 'User-Agent': UA, ...headers }
  })
  const text = (await res.text()).trim()
  if (!res.ok && !text) throw new Error(`HTTP ${res.status}`)
  return text
}

const asUrl = (text) => {
  if (/^https?:\/\//i.test(text)) return text.split('\n')[0].trim()
  throw new Error(text.replace(/\s+/g, ' ').slice(0, 100) || 'رد فاضي')
}

const asJson = (text) => {
  try { return JSON.parse(text) } catch { throw new Error(text.replace(/\s+/g, ' ').slice(0, 100) || 'رد فاضي') }
}

const PROVIDERS = [
  {
    name: 'ImgBB (دائم)', permanent: true,
    skip: (mime) => !IMGBB_KEY || !mime.startsWith('image/'),
    run: async (buf, mime) => {
      const j = asJson(await send(`https://api.imgbb.com/1/upload?key=${encodeURIComponent(IMGBB_KEY)}`, 'image', buf, mime))
      const url = j?.data?.url || j?.data?.display_url
      if (!url) throw new Error(JSON.stringify(j?.error || j).slice(0, 100))
      return url
    }
  },
  {
    name: 'Catbox.moe', permanent: true,
    run: async (buf, mime) => {
      // نفس هيدرز المتصفح (Origin/Referer/XHR + الكوكي لو موجود)
      const hdr = {
        Origin: 'https://catbox.moe',
        Referer: 'https://catbox.moe/',
        'X-Requested-With': 'XMLHttpRequest',
        Accept: '*/*',
        ...(CATBOX_COOKIE ? { Cookie: CATBOX_COOKIE } : {})
      }
      // لو عندك userhash جرّبه الأول، وبعدين مجهول
      const attempts = USERHASH
        ? [{ reqtype: 'fileupload', userhash: USERHASH }, { reqtype: 'fileupload' }]
        : [{ reqtype: 'fileupload' }]
      let lastErr
      for (const extra of attempts) {
        try {
          return asUrl(await send('https://catbox.moe/user/api.php', 'fileToUpload', buf, mime, extra, hdr))
        } catch (e) { lastErr = e }
      }
      throw lastErr
    }
  },
  {
    name: 'Litterbox (مؤقت 72 ساعة)', permanent: false,
    run: async (buf, mime) => asUrl(await send('https://litterbox.catbox.moe/resources/internals/api.php', 'fileToUpload', buf, mime,
      { reqtype: 'fileupload', time: '72h' }))
  },
  {
    name: 'Uguu.se (مؤقت 3 ساعات)', permanent: false,
    run: async (buf, mime) => asUrl(await send('https://uguu.se/upload?output=text', 'files[]', buf, mime))
  },
  {
    name: 'qu.ax', permanent: false,
    run: async (buf, mime) => {
      const j = asJson(await send('https://qu.ax/upload.php', 'files[]', buf, mime))
      const url = j?.files?.[0]?.url
      if (!url) throw new Error(JSON.stringify(j).slice(0, 100))
      return url
    }
  },
  {
    name: 'tmpfiles.org (مؤقت ساعة)', permanent: false,
    run: async (buf, mime) => {
      const j = asJson(await send('https://tmpfiles.org/api/v1/upload', 'file', buf, mime))
      const url = j?.data?.url
      if (!url) throw new Error(JSON.stringify(j).slice(0, 100))
      return url.replace('tmpfiles.org/', 'tmpfiles.org/dl/')
    }
  }
]

async function upload(buffer, mime) {
  const errors = []
  for (const p of PROVIDERS) {
    if (p.skip?.(mime)) continue
    try {
      const link = await p.run(buffer, mime)
      console.log(`[Catbox] ✅ ${p.name}`)
      return { link, host: p.name, permanent: p.permanent }
    } catch (e) {
      const msg = `${p.name.split(' ')[0]}: ${e?.message || e}`
      errors.push(msg)
      console.error(`[Catbox] ❌ ${msg}`)
    }
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
        results.push({ num: i + 1, type, ok: false, link: `❌ *فشل:* ${String(error.message).slice(0, 200)}` })
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
        : `│  • الرابط مؤقت لأن Catbox رفض الرفع، حمّل الملف قبل ما ينتهي\n`
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