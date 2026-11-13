// plugins/ibb.js
// ════════════════════════════════════════════════════════════════════
//        ✦─────────────────────────────────────────────✦
//           👑 𝕬𝖉𝖆𝖒 𝕭𝖔𝖙 — ImgBB Uploader v1.3 (Debug Mode) 👑
//        ✦─────────────────────────────────────────────✦
// ════════════════════════════════════════════════════════════════════

import axios from 'axios'
import FormData from 'form-data'
import { downloadMediaMessage } from '@whiskeysockets/baileys'

const UA = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36'

// ─── كشف الصورة ───────────────────────────────────────────────────
function findImageMessage(m) {
  const q = m.quoted
  if (!q) return null
  if (q.mtype === 'imageMessage') return q
  if (q.message?.imageMessage) return q
  if (q.msg?.url || q.msg?.directPath) return q
  if (q.type === 'image' || q.type === 'imageMessage') return q
  const inner = q.message
  if (!inner) return null
  const keys = Object.keys(inner)
  if (keys.includes('imageMessage')) return q
  if (keys.includes('viewOnceMessage') && inner.viewOnceMessage?.message?.imageMessage) return q
  if (keys.includes('viewOnceMessageV2') && inner.viewOnceMessageV2?.message?.imageMessage) return q
  if (keys.includes('ephemeralMessage') && inner.ephemeralMessage?.message?.imageMessage) return q
  return null
}

// ─── جلب auth_token — مع debug كامل ────────────────────────────────
async function getAuthToken() {
  const dbg = { httpStatus: null, token: null, cookie: null, error: null, htmlSnippet: null }

  try {
    const r = await axios.get('https://imgbb.com/', {
      timeout: 15000,
      headers: {
        'User-Agent'      : UA,
        'Accept'          : 'text/html,application/xhtml+xml',
        'Accept-Language' : 'ar-EG,ar;q=0.9,en;q=0.7',
        'Accept-Encoding' : 'gzip, deflate, br',
        'sec-ch-ua'       : '"Chromium";v="139", "Not;A=Brand";v="99"',
        'sec-ch-ua-mobile': '?1',
        'sec-ch-ua-platform': '"Android"',
        'Upgrade-Insecure-Requests': '1',
      },
    })

    dbg.httpStatus = r.status
    const html = typeof r.data === 'string' ? r.data : JSON.stringify(r.data)
    dbg.htmlSnippet = html.slice(0, 400)

    const patterns = [
      /auth_token['":\s]+["']([a-f0-9]{40})["']/,
      /PF\.obj\.meta\.auth_token\s*=\s*["']([^"']+)["']/,
      /"auth_token"\s*:\s*"([a-f0-9]{40})"/,
      /auth_token\s*=\s*['"]([a-f0-9]{40})['"]/,
      /['"](auth_token)['"]\s*:\s*['"]([^'"]+)['"]/,
    ]

    for (const p of patterns) {
      const match = html.match(p)
      const val   = match?.[1]?.length === 40 ? match[1] : match?.[2]
      if (val && val.length === 40) { dbg.token = val; break }
    }

    dbg.cookie = r.headers['set-cookie']
      ?.find(c => c.includes('PHPSESSID'))
      ?.match(/PHPSESSID=([^;]+)/)?.[1] || null

  } catch (e) {
    dbg.error      = e?.message
    dbg.httpStatus = e?.response?.status || 'no response'
    dbg.htmlSnippet = e?.response?.data
      ? String(e.response.data).slice(0, 200)
      : null
  }

  return dbg
}

// ─── رفع الصورة ────────────────────────────────────────────────────
async function uploadToImgbb(imgBuffer, token, cookie, filename = 'image.jpg') {
  const form = new FormData()
  form.append('source', imgBuffer, { filename, contentType: 'image/jpeg' })
  form.append('type',       'file')
  form.append('action',     'upload')
  form.append('timestamp',  String(Date.now()))
  form.append('auth_token', token)

  const r = await axios.post('https://imgbb.com/json', form, {
    timeout: 30000,
    headers: {
      ...form.getHeaders(),
      'User-Agent'      : UA,
      'Accept'          : 'application/json',
      'Accept-Language' : 'ar-EG,ar;q=0.9,en;q=0.7',
      'Origin'          : 'https://imgbb.com',
      'Referer'         : 'https://imgbb.com/',
      'sec-ch-ua'       : '"Chromium";v="139", "Not;A=Brand";v="99"',
      'sec-ch-ua-mobile': '?1',
      ...(cookie ? { Cookie: `PHPSESSID=${cookie}` } : {}),
    },
  })

  const d = r.data
  if (!d?.status_code || d.status_code !== 200)
    throw new Error(d?.error?.message || d?.status_txt || `upload failed: ${JSON.stringify(d).slice(0,100)}`)

  const img = d.image
  return {
    url        : img?.url         || '',
    display_url: img?.display_url || img?.thumb?.url || '',
    delete_url : img?.delete_url  || '',
    viewer_url : img?.url_viewer  || '',
    size       : img?.size        || 0,
    width      : img?.width       || 0,
    height     : img?.height      || 0,
  }
}

// ════════════════════════════════════════════════════════════════════
//  🤖 HANDLER
// ════════════════════════════════════════════════════════════════════
let handler = async (m, { conn }) => {

  const found = findImageMessage(m)

  if (!found) {
    let debugInfo = '❌ *m.quoted = null*'
    if (m.quoted) {
      debugInfo =
`🔎 *Debug m.quoted:*
• mtype: ${m.quoted.mtype || 'undefined'}
• type: ${m.quoted.type || 'undefined'}
• msg keys: ${m.quoted.msg ? Object.keys(m.quoted.msg).join(', ') : 'no msg'}
• message keys: ${m.quoted.message ? Object.keys(m.quoted.message).join(', ') : 'no message'}`
    }
    return m.reply(
`❌ *يجب عليك الرد على صورة*

${debugInfo}

*طريقة الاستخدام:*
↩️ رد على أي صورة بالأمر:
*.ibb*`
    )
  }

  await m.reply('⏳ *جاري الرفع على ImgBB...*')

  try {
    const dbg = await getAuthToken()

    if (!dbg.token) {
      return m.reply(
`❌ *فشل جلب auth_token*

🔎 *Debug تفاصيل:*
• HTTP Status: ${dbg.httpStatus}
• Error: ${dbg.error || 'لا يوجد خطأ'}
• Cookie: ${dbg.cookie || 'لا يوجد'}
• Token Found: لا

📄 *أول 400 حرف من الرد:*
\`\`\`
${dbg.htmlSnippet || 'فارغ'}
\`\`\``)
    }

    const fakeWAMsg = {
      key    : found.key,
      message: found.message || { imageMessage: found.msg || found },
    }

    let buf
    try {
      buf = await downloadMediaMessage(
        fakeWAMsg,
        'buffer',
        {},
        {
          logger: { info: () => {}, error: console.error, warn: () => {} },
          reuploadRequest: conn.updateMediaMessage?.bind(conn),
        }
      )
    } catch (dlErr) {
      if (typeof found.download === 'function') {
        buf = await found.download()
      } else {
        throw dlErr
      }
    }

    if (!buf || !buf.length)
      throw new Error('فشل تنزيل الصورة من واتساب')

    const result = await uploadToImgbb(buf, dbg.token, dbg.cookie, `adam_${Date.now()}.jpg`)

    if (!result.url)
      throw new Error('لم يتم الحصول على رابط بعد الرفع')

    await conn.sendMessage(m.chat, {
      image  : { url: result.display_url || result.url },
      caption:
`✅ *تم الرفع بنجاح على ImgBB!*

🔗 *الرابط المباشر:*
${result.url}

👁️ *رابط العرض:*
${result.viewer_url || result.url}

🗑️ *رابط الحذف:*
${result.delete_url || 'غير متاح'}

📐 *الأبعاد:* ${result.width}×${result.height}
💾 *الحجم:* ${result.size ? (result.size / 1024).toFixed(1) + ' KB' : 'غير معروف'}

👑 𝕬𝖉𝖆𝖒 𝕭𝖔𝖙 — ImgBB Uploader`,
    }, { quoted: m })

  } catch (e) {
    console.error('[IBB:upload]', e?.message)
    return m.reply(`❌ *فشل الرفع*\n\n🔎 *Error:* ${e?.message || 'خطأ غير معروف'}`)
  }
}

handler.help    = ['ibb']
handler.tags    = ['tools']
handler.command = /^ibb$/i

export default handler