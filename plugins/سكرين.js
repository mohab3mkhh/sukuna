// plugins/سكرين.js
// 📸 لقطة شاشة لأي موقع عن طريق Prexzy API (webss)
//   .سكرين <الرابط>      (أو .ssweb / .screenshot)
//
// شكل الرد من الـ API مش معروف بالظبط، فالكود بيتعامل مع كل الحالات:
//   - الرد صورة مباشرة  - JSON فيه لينك صورة  - JSON فيه base64

import axios from 'axios'

const API = 'https://prexzyapis.com/ssweb/webss'
const FOOTER = '⛩️ SUKUNA BOT ⛩️'

const isUrl = s => { try { return /^https?:$/.test(new URL(s).protocol) } catch { return false } }
const isImgUrl = v => typeof v === 'string' && /^https?:\/\//i.test(v) && (/\.(png|jpe?g|webp|gif)(\?|$)/i.test(v) || /(screenshot|image|img|shot|capture)/i.test(v))

// دوّر جوه الـ JSON على لينك صورة أو base64
function findImage(o, depth = 0) {
  if (!o || depth > 4) return null
  if (typeof o === 'string') {
    if (/^data:image\/\w+;base64,/.test(o)) return { buf: Buffer.from(o.split(',')[1], 'base64') }
    if (o.length > 2000 && /^[A-Za-z0-9+/=\s]+$/.test(o)) return { buf: Buffer.from(o, 'base64') }
    if (isImgUrl(o)) return { url: o }
    return null
  }
  if (typeof o === 'object') {
    for (const k of ['screenshot', 'image', 'url', 'result', 'data', 'link', 'image_url', 'screenshot_url']) {
      if (k in o) { const r = findImage(o[k], depth + 1); if (r) return r }
    }
    for (const v of Object.values(o)) { const r = findImage(v, depth + 1); if (r) return r }
  }
  return null
}

async function getShot(url) {
  const r = await axios.get(API, { params: { url }, responseType: 'arraybuffer', timeout: 60000, validateStatus: () => true })
  const type = String(r.headers?.['content-type'] || '')
  const buf = Buffer.from(r.data)
  if (type.startsWith('image/')) return buf
  let json
  try { json = JSON.parse(buf.toString('utf8')) } catch { throw new Error(`رد غير مفهوم (HTTP ${r.status})`) }
  const found = findImage(json)
  if (!found) {
    console.log('[سكرين] رد الـ API:', JSON.stringify(json).slice(0, 400))
    throw new Error(json?.message || json?.error || 'مش لاقي صورة في رد الـ API')
  }
  if (found.buf) return found.buf
  const img = await axios.get(found.url, { responseType: 'arraybuffer', timeout: 60000 })
  return Buffer.from(img.data)
}

const handler = async (m, { conn, args, usedPrefix = '.', command }) => {
  const reply = text => conn.sendMessage(m.chat, { text }, { quoted: m })
  const raw = (args || [])[0]
  if (!raw) return reply(`📸 *لقطة شاشة لموقع*\n\nاكتب:\n*${usedPrefix}${command} <الرابط>*\n\nمثال:\n*${usedPrefix}${command} https://wheelofnames.com*\n\n> ${FOOTER}`)

  const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
  if (!isUrl(url) || !url.includes('.')) return reply('❌ الرابط غير صحيح.')

  try { await m.react?.('⏳') } catch {}
  try {
    const buf = await getShot(url)
    await conn.sendMessage(m.chat, { image: buf, caption: `📸 *لقطة شاشة*\n🔗 ${url}\n\n> ${FOOTER}` }, { quoted: m })
    try { await m.react?.('✅') } catch {}
  } catch (e) {
    try { await m.react?.('❌') } catch {}
    reply(`❌ معرفتش أجيب لقطة الشاشة: ${e.message}\n\n> ${FOOTER}`)
  }
}

handler.command = /^(سكرين|ssweb|screenshot)$/i
handler.help = ['سكرين <الرابط>']
handler.tags = ['tools']
export default handler