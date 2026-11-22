/**
 * plugins/اغنية.js
 * بحث عن أغنية + قائمة نتائج + تنزيل صوت حقيقي (cnv.cx + yt-dlp)
 */

import axios from 'axios'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFile } from 'child_process'
import { sendButtons, btn, getButtonId } from '../lib/buttons.js'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
const SEARCH_SC = 'https://prexzyapis.com/search/soundcloud'
const MAX_RESULTS = 10
const MAX_MB = 60
const PREFIX = 'song_'

const YTDLP = fs.existsSync('/root/.nix-profile/bin/yt-dlp') ? '/root/.nix-profile/bin/yt-dlp' : 'yt-dlp'
const FFMPEG = fs.existsSync('/root/.nix-profile/bin/ffmpeg') ? '/root/.nix-profile/bin/ffmpeg' : 'ffmpeg'
const COOKIES = '/app/cookies.txt'

if (!global.songCache) global.songCache = new Map()

const log = (...a) => console.log('[أغنية]', ...a)
const genId = () => Math.random().toString(36).slice(2, 10)
const react = async (conn, m, emoji) => {
  try { await conn.sendMessage(m.chat, { react: { text: emoji, key: m.key } }) } catch {}
}

function formatDuration(val) {
  if (!val && val !== 0) return ''
  if (typeof val === 'number') {
    const sec = val > 10000 ? Math.floor(val / 1000) : Math.floor(val)
    return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`
  }
  return String(val).trim()
}

function extractName(v) {
  if (!v) return ''
  if (typeof v === 'string' || typeof v === 'number') return String(v).trim()
  if (typeof v === 'object') return String(v.username || v.name || v.title || v.full_name || '').trim()
  return ''
}

async function searchYouTubeForTrack(query) {
  try {
    const mod = await import('yt-search')
    const yts = mod.default || mod
    const res = await yts(query)
    let vids = (res?.videos || []).filter(v => v.seconds > 0 && v.seconds < 1800)
    if (!vids.length) vids = res?.videos || []
    return vids.slice(0, MAX_RESULTS).map(v => ({
      videoId: v.videoId,
      title: v.title,
      author: v.author?.name || '',
      duration: v.timestamp || '',
      thumbnail: v.thumbnail || `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`
    }))
  } catch (e) {
    log('yt-search:', e.message)
    return []
  }
}

async function searchSongs(query) {
  try {
    const res = await axios.get(SEARCH_SC, {
      params: { q: query },
      timeout: 20000,
      headers: { 'User-Agent': UA, Accept: 'application/json' },
      validateStatus: () => true
    })
    const d = res.data
    const list =
      (Array.isArray(d?.result) && d.result) ||
      (Array.isArray(d?.results) && d.results) ||
      (Array.isArray(d?.data) && d.data) ||
      (Array.isArray(d?.tracks) && d.tracks) ||
      []

    if (list.length) {
      const ytFallback = await searchYouTubeForTrack(query)
      return list.slice(0, MAX_RESULTS).map((item, idx) => {
        const title = extractName(item?.title) || extractName(item?.name) || `مقطع ${idx + 1}`
        const author = extractName(item?.author) || extractName(item?.artist) || extractName(item?.user) || ''
        const duration = formatDuration(item?.duration || item?.full_duration || '')
        const thumb = extractName(item?.thumbnail) || extractName(item?.artwork) || extractName(item?.image) || ''
        const matchedYt = ytFallback[idx] || ytFallback[0] || null
        return {
          videoId: matchedYt?.videoId || '',
          queryForYt: `${title} ${author}`.trim(),
          title,
          author,
          duration,
          thumbnail: thumb || matchedYt?.thumbnail || ''
        }
      })
    }
  } catch (e) {
    log('soundcloud search:', e.message)
  }

  return await searchYouTubeForTrack(query)
}

async function getThumb(url, videoId) {
  const urls = [url, videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : ''].filter(Boolean)
  for (const u of urls) {
    try {
      const r = await axios.get(u, { headers: { 'User-Agent': UA }, responseType: 'arraybuffer', timeout: 15000 })
      if (r.data?.length > 1000) return Buffer.from(r.data)
    } catch {}
  }
  return null
}

function runYtDlp(args) {
  return new Promise((resolve, reject) => {
    execFile(YTDLP, args, { timeout: 180000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return reject(new Error((stderr || err.message).toString().trim().split('\n').slice(-2).join(' ').slice(0, 300)))
      resolve(stdout)
    })
  })
}

async function ytdlpAudio(videoId) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'song-'))
  const out = path.join(dir, `${videoId}.%(ext)s`)
  const url = `https://www.youtube.com/watch?v=${videoId}`

  const base = [
    '-x', '--audio-format', 'mp3', '--audio-quality', '5',
    '--no-playlist', '--no-warnings',
    '--max-filesize', `${MAX_MB}M`,
    '--ffmpeg-location', FFMPEG,
    '-o', out
  ]
  if (fs.existsSync(COOKIES)) base.push('--cookies', COOKIES)

  const attempts = [
    [...base, url],
    [...base, '--extractor-args', 'youtube:player_client=android,web', url]
  ]

  try {
    let lastErr
    for (const args of attempts) {
      try {
        await runYtDlp(args)
        const file = fs.readdirSync(dir).find(f => f.endsWith('.mp3'))
        if (!file) throw new Error('no mp3 produced')
        const buffer = fs.readFileSync(path.join(dir, file))
        if (buffer.length < 20 * 1024) throw new Error('الملف صغير جداً')
        return buffer
      } catch (e) {
        lastErr = e
        log('yt-dlp:', e.message)
      }
    }
    throw lastErr || new Error('فشل التحميل')
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }) } catch {}
  }
}

const CNV_HEADERS = { 'User-Agent': UA, Origin: 'https://iframe.y2meta-uk.com', Referer: 'https://iframe.y2meta-uk.com/' }

async function cnvAudio(videoId) {
  const k = await axios.get(`https://cnv.cx/v2/sanity/key?id=${videoId}`, { headers: CNV_HEADERS, timeout: 20000 })
  if (!k.data?.key) throw new Error('cnv: no key')
  await new Promise(r => setTimeout(r, 1500))

  const params = new URLSearchParams({
    link: `https://youtu.be/${videoId}`,
    format: 'mp3',
    audioBitrate: '128',
    videoQuality: '720',
    filenameStyle: 'pretty',
    vCodec: 'h264'
  })
  const r = await axios.post('https://cnv.cx/v2/converter', params.toString(), {
    headers: { ...CNV_HEADERS, 'Content-Type': 'application/x-www-form-urlencoded', accept: '*/*', key: k.data.key },
    timeout: 120000,
    validateStatus: () => true
  })
  if (!(r.status === 200 && r.data?.url)) throw new Error(r.data?.errorMsg || `cnv: status ${r.status}`)

  for (let i = 0; i < 3; i++) {
    try {
      const d = await axios.get(r.data.url, {
        headers: { 'User-Agent': UA, Referer: 'https://cnv.cx/', Origin: 'https://cnv.cx' },
        responseType: 'arraybuffer',
        timeout: 180000,
        maxContentLength: MAX_MB * 1024 * 1024,
        validateStatus: () => true
      })
      if (d.status === 200 && d.data?.length > 20 * 1024) return Buffer.from(d.data)
    } catch (e) {
      log('cnv dl:', e.message)
    }
    await new Promise(r => setTimeout(r, 2000))
  }
  throw new Error('cnv: الملف فاضي')
}

async function resolveVideoId(item) {
  if (item.videoId) return item.videoId
  const q = item.queryForYt || item.title
  const vids = await searchYouTubeForTrack(q)
  return vids[0]?.videoId || ''
}

async function downloadAudio(item) {
  const videoId = await resolveVideoId(item)
  if (!videoId) throw new Error('لم يتم العثور على مصدر صوتي متاح')

  try {
    const b = await cnvAudio(videoId)
    log('✅ cnv.cx')
    return b
  } catch (e) {
    log('cnv.cx:', e.message)
  }

  const b = await ytdlpAudio(videoId)
  log('✅ yt-dlp')
  return b
}

let before = async (m, { conn }) => {
  try {
    const buttonId = getButtonId(m)
    if (!buttonId || !buttonId.startsWith(PREFIX)) return false

    const data = global.songCache.get(buttonId.slice(PREFIX.length))
    if (!data) return false
    global.songCache.delete(buttonId.slice(PREFIX.length))

    await react(conn, m, '⬇️')
    const status = await m.reply(`⏳ *جاري تحميل:*\n${data.title}`)

    try {
      const buffer = await downloadAudio(data)
      try { await conn.sendMessage(m.chat, { delete: status.key }) } catch {}

      const safeName = String(data.title).replace(/[^\x20-\x7E]+/g, '_').replace(/[\\/:*?"<>|]/g, '').slice(0, 60) || 'song'
      await conn.sendMessage(m.chat, {
        audio: buffer,
        mimetype: 'audio/mpeg',
        fileName: `${safeName}.mp3`,
        ptt: false
      }, { quoted: m })
      await react(conn, m, '✅')
    } catch (e) {
      console.error('[أغنية] download:', e.message)
      try { await conn.sendMessage(m.chat, { delete: status.key }) } catch {}
      await react(conn, m, '❌')
      await m.reply(`❌ فشل التحميل\n\n${e.message}\n\n💡 جرب أغنية تانية`)
    }
    return true
  } catch (e) {
    console.error('[أغنية] before:', e.message)
    return false
  }
}

let handler = async (m, { conn, text, usedPrefix, command }) => {
  const query = (text || '').trim()
  if (!query) {
    return m.reply(`🎧 *أغنية*\n\nاكتب اسم الأغنية\n💡 مثال: ${usedPrefix}${command} انا مين`)
  }

  await react(conn, m, '🔍')

  try {
    const results = await searchSongs(query)
    if (!results.length) {
      await react(conn, m, '❌')
      return m.reply('❌ مفيش نتايج، جرب اسم تاني')
    }

    const rows = results.map((v, i) => {
      const id = genId()
      global.songCache.set(id, { ...v, createdAt: Date.now() })
      return {
        title: `${i + 1}. ${v.title.slice(0, 50)}`,
        description: `${v.author ? '👤 ' + v.author : ''}${v.duration ? ' | ⏱️ ' + v.duration : ''}`.slice(0, 70) || 'اضغط للتحميل',
        id: `${PREFIX}${id}`
      }
    })

    const thumb = await getThumb(results[0].thumbnail, results[0].videoId)

    await sendButtons(conn, m.chat, {
      title: '🎧 SUKUNA MUSIC',
      subtitle: query,
      text: `✅ *تم البحث*\n\n🔍 *الأغنية:* ${query}\n📊 *النتائج:* ${results.length}\n\n👇 اضغط على الزرار واختار الأغنية`,
      footer: '⛩️ SUKUNA BOT',
      image: thumb || (results[0].videoId ? `https://i.ytimg.com/vi/${results[0].videoId}/hqdefault.jpg` : undefined),
      buttons: [btn.list('🎵 عرض النتائج', [{ title: 'النتائج', rows }])]
    }, m)

    await react(conn, m, '✅')
  } catch (e) {
    console.error('[أغنية] search:', e)
    await react(conn, m, '❌')
    m.reply('❌ حصل خطأ: ' + (e?.message || e))
  }
}

if (global.songCleanup) clearInterval(global.songCleanup)
global.songCleanup = setInterval(() => {
  const now = Date.now()
  for (const [k, v] of global.songCache.entries()) {
    if (now - v.createdAt > 30 * 60 * 1000) global.songCache.delete(k)
  }
}, 5 * 60 * 1000)

handler.before = before
handler.help = ['اغنية <اسم الأغنية>']
handler.tags = ['downloader']
handler.command = /^(اغنية|أغنية)$/i

export default handler