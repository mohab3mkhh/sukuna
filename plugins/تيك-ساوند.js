/**
 * plugins/تيك-ساوند.js
 * جلب ساوندات من تيك توك (بلينك أو بكلمات بحث) وإرسالها كصوت
 *   .تيك-ساوند funk da montanha        (أول نتيجة)
 *   .تيك-ساوند 3 funk da montanha      (النتيجة رقم 3)
 *   .تيك-ساوند https://vm.tiktok.com/xxxx
 */

import axios from 'axios'
import { execFile } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
const MAX_MB = 30
const HOSTS = ['https://www.tikwm.com', 'https://tikwm.com']

const YTDLP = fs.existsSync('/root/.nix-profile/bin/yt-dlp') ? '/root/.nix-profile/bin/yt-dlp' : 'yt-dlp'
const FFMPEG = fs.existsSync('/root/.nix-profile/bin/ffmpeg') ? '/root/.nix-profile/bin/ffmpeg' : 'ffmpeg'

const log = (...a) => console.log('[تيك-ساوند]', ...a)
const errLog = (msg) => console.error('[تيك-ساوند:ERR]', String(msg || '').slice(0, 300))

const st = (e) => e?.response?.status ? `HTTP ${e.response.status}` : (e?.message || String(e))

// ---------- tikwm (مع تجربة أكتر من دومين) ----------
async function tikwmPost(pathname, params) {
  let last
  for (const host of HOSTS) {
    try {
      const r = await axios.post(host + pathname, new URLSearchParams(params).toString(), {
        headers: {
          'User-Agent': UA,
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          Accept: 'application/json, text/javascript, */*; q=0.01',
          Origin: host,
          Referer: host + '/',
          'X-Requested-With': 'XMLHttpRequest'
        },
        timeout: 20000
      })
      if (r.data?.code !== undefined && r.data.code !== 0) throw new Error(r.data?.msg || 'tikwm error')
      return r.data
    } catch (e) { last = e }
  }
  throw new Error('tikwm: ' + st(last))
}

const fullUrl = (u) => (u && u.startsWith('/') ? HOSTS[0] + u : u)

async function soundFromLink(link) {
  const j = await tikwmPost('/api/', { url: link, hd: '1' })
  const d = j?.data
  const url = fullUrl(d?.music_info?.play || d?.music)
  if (!url) throw new Error('لا يوجد صوت في اللينك')
  return { url, title: d?.music_info?.title || d?.title || 'TikTok Sound', author: d?.music_info?.author || d?.author?.nickname || '' }
}

async function soundFromSearch(query, index = 1) {
  const j = await tikwmPost('/api/feed/search', { keywords: query, count: '10', cursor: '0', HD: '1' })
  const vids = (j?.data?.videos || []).filter(v => v?.music_info?.play || v?.music)
  if (!vids.length) throw new Error('لا توجد نتائج')
  const v = vids[Math.min(index, vids.length) - 1]
  return {
    url: fullUrl(v.music_info?.play || v.music),
    title: v.music_info?.title || v.title || query,
    author: v.music_info?.author || v.author?.nickname || ''
  }
}

async function downloadAudio(url) {
  const tries = [
    { 'User-Agent': UA },
    { 'User-Agent': UA, Referer: 'https://www.tiktok.com/' }
  ]
  let last
  for (const headers of tries) {
    try {
      const d = await axios.get(url, {
        headers, responseType: 'arraybuffer', timeout: 60000,
        maxContentLength: MAX_MB * 1024 * 1024
      })
      if (d.data?.length > 5 * 1024) return Buffer.from(d.data)
      last = new Error('ملف فارغ')
    } catch (e) { last = e }
  }
  throw new Error('تحميل الصوت: ' + st(last))
}

// ---------- احتياطي: yt-dlp للينكات فقط ----------
function ytdlpTikTok(link) {
  return new Promise((resolve, reject) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tts-'))
    const out = path.join(dir, 'a.%(ext)s')
    const args = ['-x', '--audio-format', 'mp3', '--no-playlist', '--no-warnings',
      '--ffmpeg-location', FFMPEG, '--max-filesize', `${MAX_MB}M`, '-o', out, link]
    execFile(YTDLP, args, { timeout: 90000 }, (err, _o, stderr) => {
      try {
        if (err) throw new Error(String(stderr || err.message).trim().split('\n').pop().slice(0, 150))
        const f = fs.readdirSync(dir).find(x => x.endsWith('.mp3'))
        if (!f) throw new Error('لم ينتج ملف')
        resolve({ buf: fs.readFileSync(path.join(dir, f)), title: 'TikTok Sound', author: '' })
      } catch (e) { reject(e) }
      finally { try { fs.rmSync(dir, { recursive: true, force: true }) } catch {} }
    })
  })
}

const handler = async (m, { conn, text, usedPrefix, command }) => {
  let input = (text || '').trim()
  if (!input) {
    return m.reply(
      `🎵 *ساوندات تيك توك*\n\n` +
      `*${usedPrefix + command}* اسم الساوند\n` +
      `*${usedPrefix + command}* 3 اسم الساوند _(النتيجة رقم 3)_\n` +
      `*${usedPrefix + command}* لينك تيك توك`
    )
  }

  try {
    await m.reply('⏳ جاري البحث في تيك توك...')

    const link = input.match(/https?:\/\/\S*tiktok\.com\S*/i)?.[0]
    let sound, buf

    try {
      if (link) {
        sound = await soundFromLink(link)
      } else {
        let index = 1
        const mm = input.match(/^(\d{1,2})\s+([\s\S]+)$/)
        if (mm) { index = Number(mm[1]); input = mm[2].trim() }
        sound = await soundFromSearch(input, index)
      }
      buf = await downloadAudio(sound.url)
    } catch (e1) {
      errLog(e1?.message || e1)
      if (!link) throw e1
      log('fallback yt-dlp')
      const r = await ytdlpTikTok(link).catch(e2 => { throw new Error(`${e1.message} | yt-dlp: ${e2.message}`) })
      sound = { title: r.title, author: r.author }
      buf = r.buf
    }

    await conn.sendMessage(
      m.chat,
      { audio: buf, mimetype: 'audio/mpeg', ptt: false, fileName: `${sound.title}.mp3` },
      { quoted: m }
    )
    await m.reply(`🎶 *${sound.title}*${sound.author ? `\n👤 ${sound.author}` : ''}`)
    log('✅ تم الإرسال:', sound.title)
  } catch (err) {
    errLog(err?.message || err)
    try { await m.reply(`❌ *خطأ:* ${String(err?.message || err).slice(0, 200)}`) } catch {}
  }
}

handler.help = ['تيك-ساوند <اسم أو لينك>']
handler.tags = ['downloader']
handler.command = /^(تيك-ساوند|تيك_ساوند|تيكساوند|tiktoksound)$/i

export default handler