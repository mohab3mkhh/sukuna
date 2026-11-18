// plugins/بحث-ساوند.js
// 🎧 بحث SoundCloud + أزرار (تحميل / رابط)
//   .بحث-ساوند <اسم>   → قائمة نتائج → اختار أغنية → زر تحميل + زر رابط
//   .بحث-ساوند <رابط>  → كارت الأغنية مباشرة

import axios from 'axios'
import { spawn } from 'child_process'
// الأزرار والقوايم بتتبعت عن طريق lib/buttons.js (نفس طريقة باقي الأوامر عندك)
import { sendButtons, sendList } from '../lib/buttons.js'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36'
const MAX_RESULTS = 8
const MAX_DL_BYTES = 60 * 1024 * 1024

if (!global.scCache) global.scCache = new Map()

const HEADER = `╔══════════════════════════════════════╗
      ≪  ❪ ⛩️ 𝑺𝑼𝑲𝑼𝑵𝑨 𝑩𝑶𝑻 ⛩️ ❫  ≫
          ❪ 🎧 𝑺𝑶𝑼𝑵𝑫𝑪𝑳𝑶𝑼𝑫 🎧 ❫
╚══════════════════════════════════════╝`
const FOOTER = `╰─── ≪ ❪ ⛩️ 👑 ⛩️ ❫ ≫ ───╯
◜ ⛩️ SUKUNA BOT ⛩️ ━ MOHAB ◞`
const SMALL_FOOTER = '⛩️ SUKUNA BOT ⛩️'

// ═══════════════ client_id (بيتخزن ساعة) ═══════════════
let cachedClientId = null
let cacheTime = 0

async function getClientId(force = false) {
  // لو حطيت client_id بإيدك: global.scClientId = '...' في config
  if (global.scClientId) return global.scClientId
  if (!force && cachedClientId && Date.now() - cacheTime < 3600000) return cachedClientId

  const reList = [
    /client_id\s*[:=]\s*["']([a-zA-Z0-9]{20,40})["']/,
    /[?&]client_id=([a-zA-Z0-9]{20,40})/
  ]
  const find = js => { for (const re of reList) { const m = js.match(re); if (m) return m[1] } return null }

  let lastErr = ''
  for (const page of ['https://soundcloud.com', 'https://soundcloud.com/discover']) {
    try {
      const html = await axios.get(page, {
        headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' },
        timeout: 15000
      }).then(r => r.data)

      // لو الـ client_id في الصفحة نفسها
      const inPage = find(String(html))
      if (inPage) { cachedClientId = inPage; cacheTime = Date.now(); return inPage }

      // نفحص كل ملفات الـ JS من الآخر للأول
      const scripts = [...String(html).matchAll(/src="(https:\/\/a-v2\.sndcdn\.com\/assets\/[^"]+\.js)"/g)].map(m => m[1]).reverse()
      for (const script of scripts) {
        try {
          const js = await axios.get(script, { headers: { 'User-Agent': UA }, timeout: 15000 }).then(r => r.data)
          const id = find(String(js))
          if (id) { cachedClientId = id; cacheTime = Date.now(); return id }
        } catch (e) { lastErr = e.message }
      }
    } catch (e) { lastErr = e.message }
  }
  throw new Error('تعذّر الحصول على client_id من SoundCloud' + (lastErr ? ` (${lastErr})` : ''))
}

// طلب للـ API: لو الـ client_id اتبطل (401/403) نجيب واحد جديد ونعيد
async function scApi(path, params) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const clientId = await getClientId(attempt > 0)
    const r = await axios.get(`https://api-v2.soundcloud.com/${path}`, {
      params: { ...params, client_id: clientId },
      headers: { 'User-Agent': UA },
      timeout: 15000,
      validateStatus: () => true
    })
    if (r.status === 200) return r.data
    console.log(`[بحث-ساوند] ${path} → ${r.status}`)
    if ((r.status === 401 || r.status === 403) && attempt === 0) { cachedClientId = null; continue }
    throw new Error(`SoundCloud رد ${r.status}`)
  }
}

// ═══════════════ مساعدات ═══════════════
const msToTime = ms => {
  const m = Math.floor(ms / 60000)
  const s = Math.floor((ms % 60000) / 1000).toString().padStart(2, '0')
  return `${m}:${s}`
}

const artworkOf = t => {
  const u = t.artwork_url || t.user?.avatar_url
  return u ? u.replace('-large', '-t500x500') : null
}

async function getImageBuffer(url) {
  if (!url) return null
  try {
    const r = await axios.get(url, { headers: { 'User-Agent': UA }, responseType: 'arraybuffer', timeout: 15000 })
    return r.data?.length > 1000 ? Buffer.from(r.data) : null
  } catch { return null }
}

// نخزّن بس اللي محتاجينه من الأغنية
const slim = t => ({
  id: t.id,
  title: t.title || 'Unknown',
  user: t.user?.username || 'Unknown',
  duration: t.duration || 0,
  url: t.permalink_url,
  artwork: artworkOf(t),
  auth: t.track_authorization || '',
  transcodings: t.media?.transcodings || [],
  createdAt: Date.now()
})

function getButtonId(m) {
  try {
    if (m.message?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson) {
      const p = JSON.parse(m.message.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson)
      return p.id
    }
    if (m.message?.buttonsResponseMessage?.selectedButtonId) return m.message.buttonsResponseMessage.selectedButtonId
    if (m.message?.listResponseMessage?.singleSelectReply?.selectedRowId) return m.message.listResponseMessage.singleSelectReply.selectedRowId
    if (/^sc(sel|dl)_/.test(m.text || '')) return m.text
  } catch {}
  return null
}

// بيحاول بالصورة، ولو فشل يبعت من غير صورة
async function withImage(imgUrl, send) {
  const buf = await getImageBuffer(imgUrl)
  if (buf) {
    try { return await send(buf) } catch (e) { console.log('[بحث-ساوند] الإرسال بالصورة فشل:', e.message) }
  }
  return send(undefined)
}

// ═══════════════ قائمة نتائج البحث ═══════════════
// ids بتبقى أوامر (.scsel <id>) عشان الـ handler بتاعك يشغّلها لما حد يختار من القايمة
async function sendResults(conn, m, query, tracks, usedPrefix = '.') {
  const rows = tracks.map((t, i) => {
    global.scCache.set(String(t.id), t)
    return {
      header: `🎵 𝑻𝒓𝒂𝒄𝒌 ${i + 1}`,
      title: t.title.slice(0, 60),
      description: `👤 ${t.user.slice(0, 30)} | ⏱️ ${msToTime(t.duration)}`,
      id: `${usedPrefix}scsel ${t.id}`
    }
  })

  await withImage(tracks[0]?.artwork, image => sendList(conn, m.chat, {
    text: `${HEADER}\n\n  🔍 ⌈ 𝑸𝒖𝒆𝒓𝒚 ⌋ ⇢ *${query}*\n  🎵 ⌈ 𝑹𝒆𝒔𝒖𝒍𝒕𝒔 ⌋ ⇢ *${tracks.length}*\n\n  ✦ O Human… Choose Your Song ✦\n\n  ⇩ اختر أغنية من القائمة بالأسفل ⇩`,
    footer: SMALL_FOOTER,
    title: '',
    buttonText: '🎧 اختر أغنية',
    sections: [{ title: `نتائج البحث (${tracks.length})`, rows }],
    image,
    quoted: m
  }))
}

// ═══════════════ كارت الأغنية: زر تحميل + زر رابط ═══════════════
async function sendTrackCard(conn, m, t, usedPrefix = '.') {
  global.scCache.set(String(t.id), t)

  await withImage(t.artwork, image => sendButtons(conn, m.chat, {
    text: `${HEADER}\n\n  🎵 ⌈ 𝑻𝒊𝒕𝒍𝒆 ⌋ ⇢ *${t.title.slice(0, 80)}*\n  👤 ⌈ 𝑨𝒓𝒕𝒊𝒔𝒕 ⌋ ⇢ *${t.user}*\n  ⏱️ ⌈ 𝑫𝒖𝒓𝒂𝒕𝒊𝒐𝒏 ⌋ ⇢ *${msToTime(t.duration)}*\n\n  ✦ O Human… Choose An Action ✦`,
    footer: SMALL_FOOTER,
    image,
    buttons: [
      { id: `${usedPrefix}scdl ${t.id}`, text: '⬇️ تحميل الأغنية' },
      { url: t.url, text: '🔗 فتح الرابط' }
    ],
    quoted: m
  }))
}

// ═══════════════ التحميل ═══════════════
// ترتيب الأفضلية: progressive mp3 ← progressive ← hls mp3 ← hls
function sortTranscodings(list) {
  const score = t => {
    const prog = t.format?.protocol === 'progressive'
    const mp3 = /mpeg/i.test(t.format?.mime_type || '')
    return (prog ? 0 : 2) + (mp3 ? 0 : 1)
  }
  return [...list].sort((x, y) => score(x) - score(y))
}

async function getStreamUrl(tc, auth) {
  const cid = await getClientId()
  const r = await axios.get(tc.url, {
    params: { client_id: cid, ...(auth ? { track_authorization: auth } : {}) },
    headers: { 'User-Agent': UA },
    timeout: 15000,
    validateStatus: () => true
  })
  if (r.status === 200 && r.data?.url) return r.data.url
  const err = new Error(`رابط الصوت رجع ${r.status}`)
  err.status = r.status
  throw err
}

async function ffmpegPath() {
  try { const p = (await import('ffmpeg-static')).default; if (p) return p } catch {}
  return 'ffmpeg'
}

async function hlsToMp3(url) {
  const bin = await ffmpegPath()
  return new Promise((resolve, reject) => {
    const ff = spawn(bin, ['-i', url, '-vn', '-acodec', 'libmp3lame', '-b:a', '192k', '-f', 'mp3', '-loglevel', 'error', 'pipe:1'])
    const chunks = []
    let size = 0, err = ''
    ff.stdout.on('data', d => { size += d.length; if (size > MAX_DL_BYTES) { ff.kill(); reject(new Error('الملف كبير')) } else chunks.push(d) })
    ff.stderr.on('data', d => { err += d })
    ff.on('error', e => reject(new Error(e.code === 'ENOENT' ? 'ffmpeg مش متثبت على السيرفر' : e.message)))
    ff.on('close', code => code === 0 && chunks.length ? resolve(Buffer.concat(chunks)) : reject(new Error('ffmpeg: ' + err.slice(0, 120))))
  })
}

async function downloadTrack(t) {
  // نجيب بيانات الأغنية من جديد: روابط الصوت و track_authorization بتتغير وبتنتهي
  let fresh = t
  try {
    const data = await scApi(`tracks/${t.id}`, {})
    if (data?.media?.transcodings?.length) {
      fresh = { ...t, auth: data.track_authorization || t.auth, transcodings: data.media.transcodings, policy: data.policy, access: data.access }
    }
  } catch (e) { console.log('[sc dl] refresh failed:', e.message) }

  if (!fresh.transcodings.length) throw new Error('الأغنية دي مفيهاش رابط تحميل (محمية)')
  if (fresh.access && fresh.access !== 'playable')
    throw new Error(`الأغنية دي غير متاحة للتشغيل الكامل (${fresh.access})`)

  const statuses = []
  for (const tc of sortTranscodings(fresh.transcodings)) {
    try {
      const streamUrl = await getStreamUrl(tc, fresh.auth)

      if (tc.format?.protocol === 'progressive') {
        const r = await axios.get(streamUrl, {
          headers: { 'User-Agent': UA },
          responseType: 'arraybuffer',
          timeout: 300000,
          maxContentLength: MAX_DL_BYTES,
          maxBodyLength: MAX_DL_BYTES
        })
        if (r.data?.length > 5000) return Buffer.from(r.data)
        statuses.push('empty')
      } else {
        return await hlsToMp3(streamUrl)
      }
    } catch (e) {
      console.log(`[sc dl] ${tc.format?.protocol}/${tc.format?.mime_type}: ${e.message}`)
      statuses.push(e.status || e.message)
      if (/كبير|maxContentLength|maxBodyLength/i.test(e.message)) throw new Error('الملف أكبر من 60MB')
    }
  }
  throw new Error(`كل روابط الصوت فشلت (${statuses.join(', ')})`)
}

async function handleDownload(m, conn, t) {
  await m.react('⏳')
  const status = await m.reply(`${HEADER}

  ⏳ ⌈ 𝑫𝒐𝒘𝒏𝒍𝒐𝒂𝒅𝒊𝒏𝒈 ⌋ ⇢ *${t.title.slice(0, 60)}*

  ✦ O Human… Please Wait ✦

${FOOTER}`)

  try {
    const buffer = await downloadTrack(t)
    try { if (status?.key) await conn.sendMessage(m.chat, { delete: status.key }) } catch {}

    await conn.sendMessage(m.chat, {
      audio: buffer,
      mimetype: 'audio/mpeg',
      fileName: `${t.title.replace(/[\\/:*?"<>|]/g, '').slice(0, 80)}.mp3`,
      ptt: false
    }, { quoted: m })
    await m.react('⛩️')
  } catch (e) {
    console.error('[sc dl]', e.message)
    try { if (status?.key) await conn.sendMessage(m.chat, { delete: status.key }) } catch {}
    await m.react('❌')
    await m.reply(`${HEADER}

  ╟「 ❌ 」↬ *فشل التحميل*
  ╟「 ⚠️ 」↬ *${e.message}*
  ╟「 🔗 」↬ ${t.url}

${FOOTER}`)
  }
}

// ═══════════════ الأمر ═══════════════
let handler = async (m, { conn, text, usedPrefix = '.', command }) => {
  const query = (text || '').trim()

  // اختيار من القايمة / زر التحميل (بيجي كأمر)
  if (/^(scsel|scdl)$/i.test(command)) {
    const t = global.scCache.get(query.split(/\s+/)[0])
    if (!t) return m.reply('*┇⌗╎⚠️ انتهت صلاحية الأزرار، ابحث من جديد*')
    return /^scsel$/i.test(command) ? sendTrackCard(conn, m, t, usedPrefix) : handleDownload(m, conn, t)
  }

  if (!query) {
    return m.reply(`${HEADER}

  ⛩️ ⌈ 𝑺𝒆𝒂𝒓𝒄𝒉 ⌋ ⇢ *${usedPrefix}${command} <اسم الأغنية>*
  ⛩️ ⌈ 𝑳𝒊𝒏𝒌 ⌋ ⇢ *${usedPrefix}${command} <رابط ساوند كلاود>*

⌬──══─┈•⤣⛩️⤤•┈─══──⌬
*║* *『 ⌬╎°⃟𑁁⛩️❯ مثال: 』*
*║* *『 ⌬╎°⃟𑁁⛩️❯ ${usedPrefix}${command} bad bunny 』*
⌬──══─┈•⤣⛩️⤤•┈─══──⌬

  ✦ O Human… Type Something ✦

${FOOTER}`)
  }

  await m.react('🔍')

  try {
    const isLink = /^https?:\/\/(on\.|m\.)?soundcloud\.com\//i.test(query)

    if (isLink) {
      const data = await scApi('resolve', { url: query })
      if (data?.kind !== 'track') throw new Error('الرابط ده مش أغنية')
      await sendTrackCard(conn, m, slim(data), usedPrefix)
    } else {
      const data = await scApi('search/tracks', { q: query, limit: MAX_RESULTS })
      const tracks = (data?.collection || []).map(slim)
      if (!tracks.length) throw new Error('لم يتم العثور على نتائج')
      await sendResults(conn, m, query, tracks, usedPrefix)
    }
    await m.react('✅')
  } catch (e) {
    console.error('[بحث-ساوند]', e.message)
    await m.react('❌')
    await m.reply(`${HEADER}

  ╟「 ❌ 」↬ *فشل البحث*
  ╟「 ⚠️ 」↬ *${e.message}*

${FOOTER}`)
  }
}

// ═══════════════ معالج الأزرار ═══════════════
handler.before = async (m, { conn }) => {
  try {
    const id = getButtonId(m)
    if (!id || !/^sc(sel|dl)_/.test(id)) return false

    const isSelect = id.startsWith('scsel_')
    const trackId = id.replace(/^sc(sel|dl)_/, '')
    const t = global.scCache.get(trackId)
    if (!t) {
      await m.reply('*┇⌗╎⚠️ انتهت صلاحية الأزرار، ابحث من جديد*')
      return true
    }

    if (isSelect) await sendTrackCard(conn, m, t, '.')
    else await handleDownload(m, conn, t)
    return true
  } catch (e) {
    console.error('[sc before]', e.message)
    return false
  }
}

// تنظيف الكاش القديم كل 10 دقايق
if (global.scCleanTimer) clearInterval(global.scCleanTimer)
global.scCleanTimer = setInterval(() => {
  const now = Date.now()
  for (const [k, v] of global.scCache) if (now - v.createdAt > 30 * 60 * 1000) global.scCache.delete(k)
}, 10 * 60 * 1000)
global.scCleanTimer.unref?.()

handler.help = ['بحث-ساوند <اسم أو رابط>']
handler.tags = ['search', 'downloader']
handler.command = /^(بحث-ساوند|بحث_ساوند|scsearch|scsel|scdl)$/i

export default handler