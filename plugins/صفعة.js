/**
 * plugins/صفعة.js
 * .صفعة [@منشن أو رد] -> كليب أنمي slap (SFW) من nekos.best
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

if (!global.slapLast) global.slapLast = new Map()

const tag = jid => '@' + String(jid || '').split('@')[0].split(':')[0]

// رابط GIF: بنجرّب أكتر من مصدر، وبنسجّل سبب فشل كل واحد
const SOURCES = [
  { name: 'nekos.best', url: 'https://nekos.best/api/v2/slap', pick: d => d?.results?.[0]?.url },
  { name: 'purrbot',    url: 'https://api.purrbot.site/v2/img/sfw/slap/gif', pick: d => d?.link },
  { name: 'otakugifs',  url: 'https://api.otakugifs.xyz/gif?reaction=slap', pick: d => d?.url },
  { name: 'waifu.pics', url: 'https://api.waifu.pics/sfw/slap', pick: d => d?.url },
]

async function getGifUrl() {
  const errors = []
  for (const src of SOURCES) {
    try {
      const r = await axios.get(src.url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, timeout: 15000 })
      const url = src.pick(r.data)
      if (url) return url
      errors.push(`${src.name}: رد بدون رابط`)
    } catch (e) {
      const why = e?.response ? `HTTP ${e.response.status}` : (e?.code || e?.message)
      errors.push(`${src.name}: ${why}`)
    }
  }
  console.error('[صفعة] كل المصادر فشلت →', errors.join(' | '))
  throw new Error(errors.join(' | '))
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
  const left = COOLDOWN_MS - (now - (global.slapLast.get(m.sender) || 0))
  if (left > 0) return m.reply(`⏳ استنى ${Math.ceil(left / 1000)} ثانية`)
  global.slapLast.set(m.sender, now)

  const target = m.mentionedJid?.[0] || m.quoted?.sender || null
  const caption = (target
    ? `👋 ${tag(m.sender)} صفع ${tag(target)}`
    : `👋 ${tag(m.sender)} صفع الهوا بغضب`) + `\n\n> ${FOOTER}`
  const mentions = [m.sender, target].filter(Boolean)

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slap-'))
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
      console.error(`[صفعة] ${step} فشل:`, e1?.message || e1, '← بجرّب الإرسال المباشر')
      try {
        await conn.sendMessage(m.chat, {
          video: { url }, gifPlayback: true, caption, mentions,
        }, { quoted: m })
      } catch (e2) {
        console.error('[صفعة] الإرسال المباشر فشل:', e2?.message || e2)
        step = 'send-image'
        await conn.sendMessage(m.chat, { image: Buffer.from(gif.data), caption, mentions }, { quoted: m })
      }
    }
  } catch (e) {
    console.error(`[صفعة] فشل عند (${step}):`, e?.message || e)
    m.reply(`❌ فشل الكليب عند: ${step}\n${String(e?.message || e).slice(0, 400)}`)
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }) } catch {}
  }
}

handler.help = ['صفعة @منشن']
handler.tags = ['fun']
handler.command = /^(صفعة|صفعه|slap)$/i
handler.group = true   // في الجروبات بس

export default handler