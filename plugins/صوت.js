// plugins/صوت.js
// 🔊 بحث في مكتبة أصوات/ساوندات عن طريق Prexzy API (sound/search)
//   .صوت <كلمة البحث>   (أو .sfx)    مثال: .صوت انا مين
//   → قائمة نتائج → تختار واحد → البوت يبعتهولك صوت
//   (مختلف عن .ساوند اللي بيبحث في SoundCloud)

import axios from 'axios'
import { sendList } from '../lib/buttons.js'

const API = 'https://prexzyapis.com/sound/search'
const FOOTER = '⛩️ SUKUNA BOT ⛩️'
const MAX_RESULTS = 10
const PARAM_NAMES = [process.env.SOUND_PARAM, 'query', 'q', 'search', 'name'].filter(Boolean)

if (!global.sfxCache) global.sfxCache = new Map()   // id -> { title, url }

const str = v => (typeof v === 'string' ? v : null)
const isHttp = v => typeof v === 'string' && /^https?:\/\//i.test(v)

// شكل الرد مش معروف: ندوّر على أول Array من الكائنات
function findArray(o, depth = 0) {
  if (!o || depth > 4) return null
  if (Array.isArray(o)) return o.length && typeof o[0] === 'object' ? o : null
  if (typeof o === 'object') {
    for (const k of ['results', 'result', 'data', 'sounds', 'items']) {
      if (k in o) { const r = findArray(o[k], depth + 1); if (r) return r }
    }
    for (const v of Object.values(o)) { const r = findArray(v, depth + 1); if (r) return r }
  }
  return null
}

// نطلع من كل عنصر: العنوان + رابط الصوت
function normalize(it) {
  const title = str(it.title) || str(it.name) || str(it.text) || str(it.label) || 'صوت'
  const keys = ['mp3', 'audio', 'sound', 'download', 'downloadUrl', 'download_url', 'src', 'file', 'media', 'url', 'link']
  let url = null
  for (const k of keys) if (isHttp(it[k])) { url = it[k]; if (/\.(mp3|ogg|wav|m4a|opus)(\?|$)/i.test(url)) break }
  if (!url) for (const v of Object.values(it)) if (isHttp(v) && /\.(mp3|ogg|wav|m4a|opus)(\?|$)/i.test(v)) { url = v; break }
  return url ? { title, url } : null
}

async function search(query) {
  let lastErr = 'مفيش رد'
  for (const key of PARAM_NAMES) {
    try {
      const r = await axios.get(API, { params: { [key]: query }, timeout: 25000, validateStatus: () => true })
      const arr = findArray(r.data)
      const items = (arr || []).map(normalize).filter(Boolean)
      if (items.length) return items
      lastErr = r.data?.message || r.data?.error || (arr ? 'النتائج مفيهاش رابط صوت' : 'مفيش نتائج')
      console.log(`[صوت] ${key} ->`, JSON.stringify(r.data).slice(0, 300))
      if (r.status === 429) break
    } catch (e) { lastErr = e.message }
  }
  throw new Error(lastErr)
}

async function sendAudio(conn, m, item) {
  try {
    await conn.sendMessage(m.chat, { audio: { url: item.url }, mimetype: 'audio/mpeg', fileName: `${item.title.slice(0, 40)}.mp3` }, { quoted: m })
  } catch {
    // لو الإرسال بالرابط فشل نحمّله الأول
    const r = await axios.get(item.url, { responseType: 'arraybuffer', timeout: 40000, maxContentLength: 30 * 1024 * 1024 })
    await conn.sendMessage(m.chat, { audio: Buffer.from(r.data), mimetype: 'audio/mpeg', fileName: `${item.title.slice(0, 40)}.mp3` }, { quoted: m })
  }
}

const handler = async (m, { conn, args, text, usedPrefix = '.', command }) => {
  const reply = t => conn.sendMessage(m.chat, { text: t }, { quoted: m })

  // اختيار من القائمة: .sfxget <id>
  if (/^sfxget$/i.test(command)) {
    const item = global.sfxCache.get(String(args?.[0]))
    if (!item) return reply(`⌛ النتيجة دي انتهت، اعمل بحث جديد بـ *${usedPrefix}صوت <كلمة>*`)
    try { await m.react?.('⏳') } catch {}
    try { await sendAudio(conn, m, item); try { await m.react?.('✅') } catch {} }
    catch (e) { try { await m.react?.('❌') } catch {}; reply(`❌ معرفتش أبعت الصوت: ${e.message}\n🔗 ${item.url}\n\n> ${FOOTER}`) }
    return
  }

  const query = String(text || (args || []).join(' ')).trim()
  if (!query) return reply(`🔊 *بحث أصوات*\n\nاكتب:\n*${usedPrefix}${command} <كلمة البحث>*\n\nمثال:\n*${usedPrefix}${command} انا مين*\n\n> ${FOOTER}`)

  try { await m.react?.('🔍') } catch {}
  try {
    const items = (await search(query)).slice(0, MAX_RESULTS)
    const stamp = Date.now().toString(36)
    const rows = items.map((it, i) => {
      const id = `${stamp}${i}`
      global.sfxCache.set(id, it)
      return { header: `🔊 ${i + 1}`, title: it.title.slice(0, 60), description: 'اضغط لإرسال الصوت', id: `${usedPrefix}sfxget ${id}` }
    })
    // تنضيف الكاش القديم
    if (global.sfxCache.size > 500) for (const k of [...global.sfxCache.keys()].slice(0, 250)) global.sfxCache.delete(k)

    await sendList(conn, m.chat, {
      text: `🔊 *نتائج البحث عن:* ${query}\n📦 عدد النتائج: ${items.length}\n\nاختار صوت من القائمة 👇`,
      footer: FOOTER,
      title: '🔊 بحث الأصوات',
      buttonText: '「 قائمة الأصوات 」',
      sections: [{ title: `نتائج (${items.length})`, highlight_label: 'SUKUNA BOT', rows }],
      quoted: m
    })
    try { await m.react?.('✅') } catch {}
  } catch (e) {
    try { await m.react?.('❌') } catch {}
    reply(`❌ مفيش نتائج أو حصل خطأ: ${e.message}\n\n> ${FOOTER}`)
  }
}

handler.command = /^(صوت|sfx|sfxget)$/i
handler.help = ['صوت <كلمة>']
handler.tags = ['tools']
export default handler