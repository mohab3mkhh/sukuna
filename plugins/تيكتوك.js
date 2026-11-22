/**
 * plugins/تيكتوك.js
 * بحث في تيكتوك (prexzyapis + tikwm مباشر كبديل + yt-dlp كاحتياط) مع إرسال الفيديو
 */

import axios from 'axios'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFile } from 'child_process'
import { sendButtons, btn, getButtonId } from '../lib/buttons.js'

const SEARCH_ENDPOINT = 'https://prexzyapis.com/search/tiktoksearch'
const TIKWM_SEARCH = 'https://tikwm.com/api/feed/search'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const MAX_MB = 80
const PREFIX = 'tt_'

const YTDLP = fs.existsSync('/root/.nix-profile/bin/yt-dlp') ? '/root/.nix-profile/bin/yt-dlp' : 'yt-dlp'
const COOKIES = '/app/cookies.txt'

if (!global.ttSearchCache) global.ttSearchCache = new Map()

const genId = () => Math.random().toString(36).slice(2, 10)
const react = async (conn, m, emoji) => {
  try { await conn.sendMessage(m.chat, { react: { text: emoji, key: m.key } }) } catch {}
}

function parseListFromResponse(payload) {
  if (!payload || typeof payload !== 'object') return []
  if (payload?.data?.name === 'AxiosError' || payload?.data?.status === 403) return []

  return (
    (Array.isArray(payload?.data?.videos) && payload.data.videos) ||
    (Array.isArray(payload?.data?.aweme_list) && payload.data.aweme_list) ||
    (Array.isArray(payload?.data) && payload.data) ||
    (Array.isArray(payload?.result) && payload.result) ||
    (Array.isArray(payload?.results) && payload.results) ||
    []
}

function normalizeItems(rawList) {
  return rawList.slice(0, 10).map((v, idx) => {
    const pageUrl = String(
      v?.webpage_url ||
      v?.url ||
      (v?.author?.unique_id && v?.video_id ? `https://www.tiktok.com/@${v.author.unique_id}/video/${v.video_id}` : '') ||
      ''
    ).trim()

    const directPlay = String(
      v?.play ||
      v?.hdplay ||
      v?.wmplay ||
      v?.video?.play_addr?.url_list?.[0] ||
      v?.videoUrl ||
      ''
    ).trim()

    const coverUrl = String(
      v?.cover ||
      v?.origin_cover ||
      v?.ai_dynamic_cover ||
      v?.video?.cover?.url_list?.[0] ||
      v?.thumbnail ||
      ''
    ).trim()

    const author = String(
      v?.author?.nickname ||
      v?.author?.unique_id ||
      v?.author ||
      v?.nickname ||
      'غير معروف'
    ).trim()

    const title = String(
      v?.title ||
      v?.desc ||
      `فيديو تيكتوك ${idx + 1}`
    ).trim()

    return {
      title,
      author,
      pageUrl: /^https?:\/\//i.test(pageUrl) ? pageUrl : '',
      directPlay: /^https?:\/\//i.test(directPlay) ? directPlay : '',
      coverUrl: /^https?:\/\//i.test(coverUrl) ? coverUrl : ''
    }
  }).filter(item => item.pageUrl || item.directPlay || item.title)
}

async function searchViaPrexzy(query) {
  const res = await axios.get(SEARCH_ENDPOINT, {
    params: { q: query },
    timeout: 25000,
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    validateStatus: () => true
  })
  if (res.status >= 400) return []
  return normalizeItems(parseListFromResponse(res.data))
}

async function searchViaTikwmDirect(query) {
  const form = new URLSearchParams({
    keywords: query,
    count: '10',
    cursor: '0',
    HD: '1'
  })
  const res = await axios.post(TIKWM_SEARCH, form.toString(), {
    timeout: 25000,
    headers: {
      'User-Agent': UA,
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'Accept': 'application/json, text/plain, */*',
      'Origin': 'https://www.tikwm.com',
      'Referer': 'https://www.tikwm.com/'
    },
    validateStatus: () => true
  })
  if (res.status >= 400) return []
  return normalizeItems(parseListFromResponse(res.data))
}

function runYtDlp(args) {
  return new Promise((resolve, reject) => {
    execFile(YTDLP, args, { timeout: 180000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return reject(new Error((stderr || err.message).toString().trim().split('\n').slice(-2).join(' ').slice(0, 250)))
      resolve(stdout)
    })
  })
}

async function searchAndDownloadViaYtDlp(query, explicitUrl = '') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-'))
  const outTemplate = path.join(dir, 'video.%(ext)s')
  const target = explicitUrl || `ytsearch10:tiktok ${query}`

  const args = [
    target,
    '--no-playlist',
    '--no-warnings',
    '--max-filesize', `${MAX_MB}M`,
    '-f', 'mp4/best[ext=mp4]/best',
    '-o', outTemplate
  ]
  if (fs.existsSync(COOKIES)) args.push('--cookies', COOKIES)

  try {
    await runYtDlp(args)
    const files = fs.readdirSync(dir).filter(f => /\.(mp4|mkv|webm|mov)$/i.test(f))
    if (!files.length) throw new Error('لم يتم تنزيل أي ملف فيديو')
    const filePath = path.join(dir, files[0])
    const buf = fs.readFileSync(filePath)
    if (buf.length < 10000) throw new Error('ملف الفيديو غير صالح')
    return buf
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }) } catch {}
  }
}

async function searchTikTok(query) {
  const viaPrexzy = await searchViaPrexzy(query)
  if (viaPrexzy.length) return viaPrexzy

  const viaTikwm = await searchViaTikwmDirect(query)
  if (viaTikwm.length) return viaTikwm

  // بديل مباشر عبر yt-dlp في حال حجب tikwm للـ IP
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-list-'))
  try {
    const raw = await runYtDlp([
      `ytsearch10:tiktok ${query}`,
      '--dump-json',
      '--no-playlist',
      '--no-warnings'
    ])
    const lines = String(raw).split('\n').map(l => l.trim()).filter(Boolean)
    const items = []
    for (const line of lines) {
      try {
        const j = JSON.parse(line)
        const u = j.webpage_url || j.url || ''
        if (!/^https?:\/\//i.test(u)) continue
        items.push({
          title: String(j.title || j.fulltitle || `فيديو ${items.length + 1}`).trim(),
          author: String(j.uploader || j.channel || 'TikTok').trim(),
          pageUrl: u,
          directPlay: '',
          coverUrl: String(j.thumbnail || '').trim()
        })
        if (items.length >= 10) break
      } catch {}
    }
    return items
  } catch {
    return []
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }) } catch {}
  }
}

async function getThumbBuffer(url) {
  if (!url || !/^https?:\/\//i.test(url)) return null
  try {
    const r = await axios.get(url, {
      headers: { 'User-Agent': UA },
      responseType: 'arraybuffer',
      timeout: 15000,
      validateStatus: () => true
    })
    if (r.status < 400 && r.data?.length > 1000) return Buffer.from(r.data)
  } catch {}
  return null
}

async function fetchVideoBuffer(item) {
  if (item.directPlay) {
    try {
      const vidRes = await axios.get(item.directPlay, {
        responseType: 'arraybuffer',
        timeout: 120000,
        headers: { 'User-Agent': UA, Referer: 'https://www.tiktok.com/' },
        validateStatus: () => true
      })
      if (vidRes.status < 400 && vidRes.data && vidRes.data.length > 10000) {
        return Buffer.from(vidRes.data)
      }
    } catch {}
  }

  return await searchAndDownloadViaYtDlp(item.title, item.pageUrl)
}

let before = async (m, { conn }) => {
  try {
    const buttonId = getButtonId(m)
    if (!buttonId || !buttonId.startsWith(PREFIX)) return false

    const item = global.ttSearchCache.get(buttonId.slice(PREFIX.length))
    if (!item) return false
    global.ttSearchCache.delete(buttonId.slice(PREFIX.length))

    await react(conn, m, '⏳')
    const wait = await m.reply(`⏳ *جاري تحميل الفيديو:*\n${item.title.slice(0, 60)}`)

    try {
      const videoBuf = await fetchVideoBuffer(item)
      try { await conn.sendMessage(m.chat, { delete: wait.key }) } catch {}

      await conn.sendMessage(m.chat, {
        video: videoBuf,
        mimetype: 'video/mp4',
        caption: `🎵 *العنوان:* ${item.title}\n👤 *الناشر:* ${item.author}`
      }, { quoted: m })

      await react(conn, m, '✅')
    } catch (e) {
      try { await conn.sendMessage(m.chat, { delete: wait.key }) } catch {}
      await react(conn, m, '❌')
      await m.reply(`❌ *تعذر إرسال الفيديو:*\n${e.message}`)
    }
    return true
  } catch (e) {
    console.error('[تيكتوك] before:', e.message)
    return false
  }
}

let handler = async (m, { conn, text, usedPrefix, command }) => {
  const query = (text || '').trim()
  if (!query) {
    return m.reply(`🎵 *بحث تيكتوك*\n\nاكتب كلمة البحث\n💡 مثال: ${usedPrefix}${command} تصميم انمي`)
  }

  await react(conn, m, '🔍')

  try {
    const items = await searchTikTok(query)
    if (!items.length) {
      await react(conn, m, '❌')
      return m.reply('❌ لا توجد نتائج متاحة حالياً.')
    }

    const rows = items.map((v, i) => {
      const id = genId()
      global.ttSearchCache.set(id, { ...v, createdAt: Date.now() })
      return {
        title: `${i + 1}. ${v.title.slice(0, 50)}`,
        description: `👤 ${v.author.slice(0, 60)}`,
        id: `${PREFIX}${id}`
      }
    })

    const thumb = await getThumbBuffer(items[0].coverUrl)

    await sendButtons(conn, m.chat, {
      title: '🎵 TikTok Search',
      subtitle: query,
      text: `✅ *تم البحث*\n\n🔍 *الكلمة:* ${query}\n📊 *النتائج:* ${items.length}\n\n👇 اختر فيديو من القائمة:`,
      footer: '⛩️ SUKUNA BOT',
      ...(thumb ? { image: thumb } : {}),
      buttons: [btn.list('🎬 عرض النتائج', [{ title: 'النتائج', rows }])]
    }, m)

    await react(conn, m, '✅')
  } catch (e) {
    console.error('[تيكتوك] search:', e.message)
    await react(conn, m, '❌')
    await m.reply(`❌ *فشل البحث في تيكتوك:*\n${e.message}`)
  }
}

if (global.ttCleanup) clearInterval(global.ttCleanup)
global.ttCleanup = setInterval(() => {
  const now = Date.now()
  for (const [k, v] of global.ttSearchCache.entries()) {
    if (now - v.createdAt > 30 * 60 * 1000) global.ttSearchCache.delete(k)
  }
}, 5 * 60 * 1000)

handler.before = before
handler.help = ['تيكتوك <كلمة البحث>']
handler.tags = ['search']
handler.command = /^(تيكتوك|tiktok|ttsearch)$/i

export default handler