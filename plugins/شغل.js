/**
 * plugins/شغل.js
 * بحث في يوتيوب -> قائمة نتائج -> تنزيل صوت فقط
 */

import axios from 'axios'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFile } from 'child_process'
import { sendButtons, btn, getButtonId } from '../lib/buttons.js'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
const MAX_RESULTS = 10
const MAX_MB = 60
const PREFIX = 'shaghal_'

const YTDLP = fs.existsSync('/root/.nix-profile/bin/yt-dlp') ? '/root/.nix-profile/bin/yt-dlp' : 'yt-dlp'
const FFMPEG = fs.existsSync('/root/.nix-profile/bin/ffmpeg') ? '/root/.nix-profile/bin/ffmpeg' : 'ffmpeg'
const COOKIES = '/app/cookies.txt'

if (!global.shaghalCache) global.shaghalCache = new Map()

const log = (...a) => console.log('[شغل]', ...a)
const genId = () => Math.random().toString(36).slice(2, 10)
const react = async (conn, m, emoji) => {
  try { await conn.sendMessage(m.chat, { react: { text: emoji, key: m.key } }) } catch {}
}

// ━━━ البحث ━━━
async function searchYouTube(query) {
  // 1) yt-search
  try {
    const mod = await import('yt-search')
    const yts = mod.default || mod
    const res = await yts(query)
    let vids = (res?.videos || []).filter(v => v.seconds > 0 && v.seconds < 1800)
    if (!vids.length) vids = res?.videos || []
    if (vids.length) {
      return vids.slice(0, MAX_RESULTS).map(v => ({
        id: v.videoId,
        title: v.title,
        author: v.author?.name || '',
        duration: v.timestamp || '',
        views: v.views ? Number(v.views).toLocaleString('en') : '',
        thumbnail: v.thumbnail || `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
      }))
    }
  } catch (e) { log('yt-search:', e.message) }

  // 2) scrape كبديل
  try {
    const r = await axios.get(
      `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
      { headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9', Cookie: 'SOCS=CAI' }, timeout: 15000 }
    )
    const match = String(r.data).match(/var ytInitialData = ({.+?});<\/script>/)
    if (!match) throw new Error('no ytInitialData')
    const data = JSON.parse(match[1])
    const sections = data.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || []
    const out = []
    for (const s of sections) {
      for (const item of s.itemSectionRenderer?.contents || []) {
        const v = item.videoRenderer
        if (!v) continue
        out.push({
          id: v.videoId,
          title: v.title?.runs?.[0]?.text || '',
          author: v.ownerText?.runs?.[0]?.text || '',
          duration: v.lengthText?.simpleText || '',
          views: (v.viewCountText?.simpleText || '').replace(/\s*views?/i, ''),
          thumbnail: `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
        })
        if (out.length >= MAX_RESULTS) return out
      }
    }
    if (out.length) return out
  } catch (e) { log('scrape:', e.message) }

  return []
}

async function getThumb(url, id) {
  for (const u of [url, `https://i.ytimg.com/vi/${id}/hqdefault.jpg`]) {
    try {
      const r = await axios.get(u, { headers: { 'User-Agent': UA }, responseType: 'arraybuffer', timeout: 15000 })
      if (r.data?.length > 1000) return Buffer.from(r.data)
    } catch {}
  }
  return null
}

// ━━━ التحميل (صوت فقط) عبر yt-dlp ━━━
function runYtDlp(args) {
  return new Promise((resolve, reject) => {
    execFile(YTDLP, args, { timeout: 180000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return reject(new Error((stderr || err.message).toString().trim().split('\n').slice(-2).join(' ').slice(0, 300)))
      resolve(stdout)
    })
  })
}

async function downloadAudio(videoId) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shaghal-'))
  const out = path.join(dir, `${videoId}.%(ext)s`)
  const url = `https://www.youtube.com/watch?v=${videoId}`

  const base = [
    '-x', '--audio-format', 'mp3', '--audio-quality', '5',
    '--no-playlist', '--no-warnings',
    '--max-filesize', `${MAX_MB}M`,
    '--ffmpeg-location', FFMPEG,
    '-o', out,
  ]
  if (fs.existsSync(COOKIES)) base.push('--cookies', COOKIES)

  const attempts = [
    [...base, url],
    [...base, '--extractor-args', 'youtube:player_client=android,web', url],
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
      } catch (e) { lastErr = e; log('yt-dlp:', e.message) }
    }
    throw lastErr || new Error('فشل التحميل')
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }) } catch {}
  }
}

// ━━━ معالج الأزرار (اختيار أغنية من القائمة) ━━━
let before = async (m, { conn }) => {
  try {
    const buttonId = getButtonId(m)
    if (!buttonId || !buttonId.startsWith(PREFIX)) return false

    const data = global.shaghalCache.get(buttonId.slice(PREFIX.length))
    if (!data) return false
    global.shaghalCache.delete(buttonId.slice(PREFIX.length)) // منع التكرار

    await react(conn, m, '⬇️')
    const status = await m.reply(`⏳ *جاري تحميل:*\n${data.title}`)

    try {
      const buffer = await downloadAudio(data.videoId)
      try { await conn.sendMessage(m.chat, { delete: status.key }) } catch {}

      const safeName = String(data.title).replace(/[\\/:*?"<>|]/g, '').slice(0, 100)
      await conn.sendMessage(m.chat, {
        audio: buffer,
        mimetype: 'audio/mpeg',
        fileName: `${safeName}.mp3`,
        ptt: false,
      }, { quoted: m })
      await react(conn, m, '✅')
    } catch (e) {
      console.error('[شغل] download:', e.message)
      try { await conn.sendMessage(m.chat, { delete: status.key }) } catch {}
      await react(conn, m, '❌')
      await m.reply(`❌ فشل التحميل\n\n${e.message}\n\n💡 جرب أغنية تانية`)
    }
    return true
  } catch (e) {
    console.error('[شغل] before:', e.message)
    return false
  }
}

// ━━━ الأمر ━━━
let handler = async (m, { conn, text, usedPrefix, command }) => {
  const query = (text || '').trim()
  if (!query) {
    return m.reply(`🎧 *شغل*\n\nاكتب اسم الأغنية\n💡 مثال: ${usedPrefix}${command} انا مين`)
  }

  await react(conn, m, '🔍')

  try {
    const results = await searchYouTube(query)
    if (!results.length) {
      await react(conn, m, '❌')
      return m.reply('❌ مفيش نتايج، جرب اسم تاني')
    }

    const rows = results.map((v, i) => {
      const id = genId()
      global.shaghalCache.set(id, { videoId: v.id, title: v.title, createdAt: Date.now() })
      return {
        title: `${i + 1}. ${v.title.slice(0, 50)}`,
        description: `👤 ${v.author} | ⏱️ ${v.duration}${v.views ? ' | 👁️ ' + v.views : ''}`,
        id: `${PREFIX}${id}`,
      }
    })

    const thumb = await getThumb(results[0].thumbnail, results[0].id)

    await sendButtons(conn, m.chat, {
      title: '🎧 SUKUNA MUSIC',
      subtitle: query,
      text: `✅ *تم البحث*\n\n🔍 *الأغنية:* ${query}\n📊 *النتائج:* ${results.length}\n\n👇 اضغط على الزرار واختار الأغنية`,
      footer: '⛩️ SUKUNA BOT',
      image: thumb || `https://i.ytimg.com/vi/${results[0].id}/hqdefault.jpg`,
      buttons: [btn.list('🎵 عرض النتائج', [{ title: 'النتائج', rows }])],
    }, m)

    await react(conn, m, '✅')
  } catch (e) {
    console.error('[شغل] search:', e)
    await react(conn, m, '❌')
    m.reply('❌ حصل خطأ: ' + (e?.message || e))
  }
}

// تنظيف الكاش القديم (مرة واحدة حتى لو الملف اتعمله reload)
if (global.shaghalCleanup) clearInterval(global.shaghalCleanup)
global.shaghalCleanup = setInterval(() => {
  const now = Date.now()
  for (const [k, v] of global.shaghalCache.entries()) {
    if (now - v.createdAt > 30 * 60 * 1000) global.shaghalCache.delete(k)
  }
}, 5 * 60 * 1000)

handler.before = before
handler.help = ['شغل <اسم الأغنية>']
handler.tags = ['downloader']
handler.command = /^(شغل)$/i

export default handler