/**
 * plugins/بوسة.js
 * .بوسة [@منشن أو رد] -> كليب أنمي kiss (SFW) من nekos.best
 */

import axios from 'axios'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFile } from 'child_process'

const FFMPEG = fs.existsSync('/root/.nix-profile/bin/ffmpeg') ? '/root/.nix-profile/bin/ffmpeg' : 'ffmpeg'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
const COOLDOWN_MS = 8 * 1000
const FOOTER = '⛩️ SUKUNA BOT ⛩️'

if (!global.kissLast) global.kissLast = new Map()

const tag = jid => '@' + String(jid || '').split('@')[0].split(':')[0]

// رابط GIF: nekos.best أولاً، وwaifu.pics احتياطي
async function getGifUrl() {
  try {
    const r = await axios.get('https://nekos.best/api/v2/kiss', { headers: { 'User-Agent': UA }, timeout: 15000 })
    const url = r.data?.results?.[0]?.url
    if (url) return url
  } catch {}
  const r = await axios.get('https://api.waifu.pics/sfw/kiss', { headers: { 'User-Agent': UA }, timeout: 15000 })
  if (!r.data?.url) throw new Error('no gif url')
  return r.data.url
}

// واتساب بيعرض الـ GIF كفيديو mp4 بس
function gifToMp4(gifPath, mp4Path) {
  return new Promise((resolve, reject) => {
    execFile(FFMPEG, [
      '-y', '-i', gifPath,
      '-movflags', 'faststart', '-pix_fmt', 'yuv420p',
      '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
      mp4Path,
    ], { timeout: 60000 }, err => (err ? reject(err) : resolve()))
  })
}

let handler = async (m, { conn }) => {
  const now = Date.now()
  const left = COOLDOWN_MS - (now - (global.kissLast.get(m.sender) || 0))
  if (left > 0) return m.reply(`⏳ استنى ${Math.ceil(left / 1000)} ثانية`)
  global.kissLast.set(m.sender, now)

  const target = m.mentionedJid?.[0] || m.quoted?.sender || null
  const caption = (target
    ? `💋 ${tag(m.sender)} بوّس ${tag(target)}`
    : `💋 ${tag(m.sender)} بيبعت بوسة للجميع`) + `\n\n> ${FOOTER}`
  const mentions = [m.sender, target].filter(Boolean)

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kiss-'))
  let step = 'api'
  let url = null
  try {
    url = await getGifUrl()

    step = 'download'
    const gif = await axios.get(url, { headers: { 'User-Agent': UA }, responseType: 'arraybuffer', timeout: 30000 })
    const gifPath = path.join(dir, 'k.gif')
    const mp4Path = path.join(dir, 'k.mp4')
    fs.writeFileSync(gifPath, Buffer.from(gif.data))

    try {
      step = 'ffmpeg'
      await gifToMp4(gifPath, mp4Path)
      step = 'send'
      await conn.sendMessage(m.chat, {
        video: fs.readFileSync(mp4Path), gifPlayback: true, caption, mentions,
      }, { quoted: m })
    } catch (e1) {
      // لو ffmpeg مش شغال: نجرّب نبعت الـ GIF مباشرة كفيديو، وبعدين كصورة
      console.error(`[بوسة] ${step} فشل:`, e1?.message || e1, '← بجرّب الإرسال المباشر')
      try {
        await conn.sendMessage(m.chat, {
          video: { url }, gifPlayback: true, caption, mentions,
        }, { quoted: m })
      } catch (e2) {
        console.error('[بوسة] الإرسال المباشر فشل:', e2?.message || e2)
        step = 'send-image'
        await conn.sendMessage(m.chat, { image: Buffer.from(gif.data), caption, mentions }, { quoted: m })
      }
    }
  } catch (e) {
    console.error(`[بوسة] فشل عند (${step}):`, e?.message || e)
    m.reply(`❌ فشل الكليب عند: ${step}\n${String(e?.message || e).slice(0, 150)}`)
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }) } catch {}
  }
}

handler.help = ['بوسة @منشن']
handler.tags = ['fun']
handler.command = /^(بوسة|بوسه|kiss)$/i
handler.group = true   // في الجروبات بس

export default handler