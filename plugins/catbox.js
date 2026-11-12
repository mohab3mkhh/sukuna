import fetch from 'node-fetch'
import FormData from 'form-data'

const UA = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36'
const USERHASH = '9607dc8f8f57bc7a216b3ffdd'

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
  return map[mime] || mime.split('/')[1] || 'bin'
}

function getMediaType(mime) {
  if (mime.startsWith('image/')) return 'صورة'
  if (mime.startsWith('video/')) return 'فيديو'
  if (mime.startsWith('audio/')) return 'صوت'
  return 'ملف'
}

async function uploadToCatbox(buffer, mime) {
  const ext = getExtFromMime(mime)
  const form = new FormData()
  form.append('userhash', USERHASH)
  form.append('reqtype', 'fileupload')
  form.append('fileToUpload', buffer, {
    filename: `file.${ext}`,
    contentType: mime
  })

  const response = await fetch('https://catbox.moe/user/api.php', {
    method: 'POST',
    body: form,
    headers: {
      ...form.getHeaders(),
      'User-Agent': UA,
      'Origin': 'https://catbox.moe',
      'Referer': 'https://catbox.moe/',
      'x-requested-with': 'XMLHttpRequest',
    }
  })

  const result = await response.text()
  if (result.startsWith('https://')) return result.trim()
  throw new Error(result)
}

const handler = async (m, { conn }) => {
  const targets = []

  if (m.quoted) {
    const qmime = m.quoted.mimetype || ''
    if (qmime.startsWith('image/') || qmime.startsWith('video/') || qmime.startsWith('audio/')) {
      targets.push(m.quoted)
    }
  }

  const mmime = m.mimetype || ''
  if (mmime.startsWith('image/') || mmime.startsWith('video/') || mmime.startsWith('audio/')) {
    targets.push(m)
  }

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
    const links = []

    for (let i = 0; i < targets.length; i++) {
      const target = targets[i]
      const mime = target.mimetype || ''
      const type = getMediaType(mime)

      try {
        await m.reply(`📤 *جاري رفع ${type} ${i + 1} من ${targets.length}...*`)
        const buffer = await target.download()
        const link = await uploadToCatbox(buffer, mime)
        links.push({ num: i + 1, type, link })
      } catch (error) {
        console.error(`[Catbox Error]`, error)
        links.push({ num: i + 1, type, link: `❌ *فشل:* ${error.message.slice(0, 80)}` })
      }
    }

    let msg = `╭─「 ✅ *تم الرفع بنجاح* 」\n│\n│  📤 *رفع إلى:* Catbox.moe\n│\n`
    for (const item of links) {
      msg += `│  ${item.num}. ${item.type}:\n│     🔗 ${item.link}\n│\n`
    }
    msg += `│  💡 *ملاحظات:*\n│  • الملفات تبقى دائمة\n│  • الحد الأقصى: 200 ميجابايت\n│\n╰──────────────`

    await m.react('✅')
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