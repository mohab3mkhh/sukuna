// plugins/تيكتوك_بحث.js
// 🎵 بحث تيك توك: Prexzy API أولاً، ولو فشل (زي 403 من tikwm) بيجرّب tikwm مباشرة
//   .تيك <كلمة البحث>   (أو .ttsearch / .tiktoksearch)
//   → قائمة فيديوهات → تختار → البوت يبعتلك الفيديو

import axios from 'axios'
import { sendList } from '../lib/buttons.js'

const PREXZY = 'https://prexzyapis.com/search/tiktoksearch'
const TIKWM = 'https://tikwm.com/api/feed/search'
const FOOTER = '⛩️ SUKUNA BOT ⛩️'
const MAX_RESULTS = 10
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36'

if (!global.ttCache) global.ttCache = new Map()

const abs = u => (typeof u === 'string' && u.startsWith('/') ? 'https://tikwm.com' + u : u)
const isHttp = v => typeof v === 'string' && /^https?:\/\//i.test(v)

function findArray(o, depth = 0) {
  if (!o || depth > 4) return null
  if (Array.isArray(o)) return o.length && typeof o[0] === 'object' ? o : null
  if (typeof o === 'object') {
    for (const k of ['videos', 'results', 'result', 'data', 'items']) {
      if (k in o) { const r = findArray(o[k], depth + 1); if (r) return r }
    }
    for (const v of Object.values(o)) { const r = findArray(v, depth + 1); if (r) return r }
  }
  return null
}

function normalize(v) {
  const video = abs(v.play || v.nowm || v.no_watermark || v.video || v.videoUrl || v.video_url || v.download || v.wmplay || v.url)
  if (!isHttp(video)) return null
  const author = v.author?.unique_id || v.author?.nickname || v.author?.username || (typeof v.author === 'string' ? v.author : '') || v.username || ''
  return {
    title: String(v.title || v.desc || v.description || 'TikTok').replace(/\s+/g, ' ').slice(0, 100),
    author, video,
    cover: abs(v.cover || v.thumbnail || v.origin_cover || ''),
    plays: v.play_count ?? v.plays ?? v.views ?? null,
    likes: v.digg_count ?? v.likes ?? null,
    duration: v.duration ?? null
  }
}

async function viaPrexzy(q) {
  const r = await axios.get(PREXZY, { params: { q }, timeout: 25000, validateStatus: () => true })
  const items = (findArray(r.data?.data?.videos ? r.data.data : r.data) || []).map(normalize).filter(Boolean)
  if (!items.length) { console.log('[تيك] Prexzy:', JSON.stringify(r.data?.data?.message || r.data).slice(0, 200)); throw new Error(r.data?.data?.message || 'مفيش نتائج') }
  return items
}

async function viaTikwm(q) {
  const body = new URLSearchParams({ keywords: q, count: '12', cursor: '0', HD: '1' })
  const r = await axios.post(TIKWM, body.toString(), { headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' }, timeout: 25000, validateStatus: () => true })
  const items = (r.data?.data?.videos || []).map(normalize).filter(Boolean)
  if (!items.length) throw new Error(r.data?.msg || `tikwm HTTP ${r.status}`)
  return items
}

async function search(q) {
  const errs = []
  for (const fn of [viaPrexzy, viaTikwm]) {
    try { return await fn(q) } catch (e) { errs.push(e.message) }
  }
  throw new Error(errs.join(' | '))
}

async function sendVideo(conn, m, it) {
  const caption = `🎵 *${it.title}*\n${it.author ? `👤 @${it.author}\n` : ''}\n> ${FOOTER}`
  try { await conn.sendMessage(m.chat, { video: { url: it.video }, caption, mimetype: 'video/mp4' }, { quoted: m }) }
  catch {
    const r = await axios.get(it.video, { responseType: 'arraybuffer', timeout: 60000, maxContentLength: 60 * 1024 * 1024, headers: { 'User-Agent': UA } })
    await conn.sendMessage(m.chat, { video: Buffer.from(r.data), caption, mimetype: 'video/mp4' }, { quoted: m })
  }
}

const fmtN = n => (n == null ? '' : Number(n) >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : Number(n) >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : String(n))

const handler = async (m, { conn, args, text, usedPrefix = '.', command }) => {
  const reply = t => conn.sendMessage(m.chat, { text: t }, { quoted: m })

  if (/^ttget$/i.test(command)) {
    const it = global.ttCache.get(String(args?.[0]))
    if (!it) return reply(`⌛ النتيجة دي انتهت، اعمل بحث جديد بـ *${usedPrefix}تيك <كلمة>*`)
    try { await m.react?.('⏳') } catch {}
    try { await sendVideo(conn, m, it); try { await m.react?.('✅') } catch {} }
    catch (e) { try { await m.react?.('❌') } catch {}; reply(`❌ معرفتش أبعت الفيديو: ${e.message}\n🔗 ${it.video}\n\n> ${FOOTER}`) }
    return
  }

  const q = String(text || (args || []).join(' ')).trim()
  if (!q) return reply(`🎵 *بحث تيك توك*\n\nاكتب:\n*${usedPrefix}${command} <كلمة البحث>*\n\nمثال:\n*${usedPrefix}${command} كورة*\n\n> ${FOOTER}`)

  try { await m.react?.('🔍') } catch {}
  try {
    const items = (await search(q)).slice(0, MAX_RESULTS)
    const stamp = Date.now().toString(36)
    const rows = items.map((it, i) => {
      const id = `${stamp}${i}`
      global.ttCache.set(id, it)
      const stats = [it.author && `@${it.author}`, it.plays != null && `👁 ${fmtN(it.plays)}`, it.likes != null && `❤️ ${fmtN(it.likes)}`].filter(Boolean).join(' | ')
      return { header: `🎵 ${i + 1}`, title: it.title.slice(0, 60), description: stats.slice(0, 70) || 'اضغط لإرسال الفيديو', id: `${usedPrefix}ttget ${id}` }
    })
    if (global.ttCache.size > 400) for (const k of [...global.ttCache.keys()].slice(0, 200)) global.ttCache.delete(k)

    await sendList(conn, m.chat, {
      text: `🎵 *نتائج تيك توك:* ${q}\n📦 عدد النتائج: ${items.length}\n\nاختار فيديو من القائمة 👇`,
      footer: FOOTER,
      title: '🎵 بحث تيك توك',
      buttonText: '「 قائمة الفيديوهات 」',
      sections: [{ title: `نتائج (${items.length})`, highlight_label: 'SUKUNA BOT', rows }],
      quoted: m
    })
    try { await m.react?.('✅') } catch {}
  } catch (e) {
    try { await m.react?.('❌') } catch {}
    reply(`❌ البحث فشل: ${e.message}\n\n> ${FOOTER}`)
  }
}

handler.command = /^(تيك|ttsearch|tiktoksearch|ttget)$/i
handler.help = ['تيك <كلمة>']
handler.tags = ['tools']
export default handler