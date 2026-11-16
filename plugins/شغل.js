import axios from 'axios'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFile } from 'child_process'

const CHANNEL_LINK = 'https://whatsapp.com/channel/0029VbBilcVAO7RNV5OlOI0j'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
const MAX_MB = 60

const YTDLP = fs.existsSync('/root/.nix-profile/bin/yt-dlp') ? '/root/.nix-profile/bin/yt-dlp' : 'yt-dlp'
const FFMPEG = fs.existsSync('/root/.nix-profile/bin/ffmpeg') ? '/root/.nix-profile/bin/ffmpeg' : 'ffmpeg'
const COOKIES = '/app/cookies.txt'

const log = (...a) => console.log('[شغل]', ...a)

// ━━━ 1) البحث في يوتيوب ━━━
async function searchVideo(query) {
  try {
    const mod = await import('yt-search')
    const yts = mod.default || mod
    const res = await yts(query)
    const v = res?.videos?.find(x => x.seconds && x.seconds < 1200) || res?.videos?.[0]
    if (v) return { id: v.videoId, title: v.title, url: v.url, author: v.author?.name }
  } catch (e) { log('yt-search:', e.message) }

  try {
    const r = await axios.get(
      `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&hl=en`,
      { headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' }, timeout: 15000 }
    )
    const html = String(r.data)
    const idm = html.match(/"videoRenderer":\{"videoId":"([\w-]{11})"/) || html.match(/"videoId":"([\w-]{11})"/)
    if (!idm) throw new Error('no videoId in page')
    const id = idm[1]
    const tm = html.slice(html.indexOf(id)).match(/"title":\{"runs":\[\{"text":"(.*?)"\}/)
    return { id, title: tm ? tm[1] : query, url: `https://www.youtube.com/watch?v=${id}` }
  } catch (e) { log('scrape:', e.message) }

  return null
}

// ━━━ 2) التحميل عبر yt-dlp (بدل المواقع اللي ماتت) ━━━
function runYtDlp(args) {
  return new Promise((resolve, reject) => {
    execFile(YTDLP, args, { timeout: 120000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return reject(new Error((stderr || err.message).toString().trim().split('\n').slice(-2).join(' ').slice(0, 300)))
      resolve(stdout)
    })
  })
}

async function getAudio(video) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shaghal-'))
  const out = path.join(dir, `${video.id}.%(ext)s`)

  const base = [
    '-x',
    '--audio-format', 'mp3',
    '--audio-quality', '5',
    '--no-playlist',
    '--no-warnings',
    '--max-filesize', `${MAX_MB}M`,
    '--ffmpeg-location', FFMPEG,
    '-o', out,
  ]
  if (fs.existsSync(COOKIES)) base.push('--cookies', COOKIES)

  // محاولة 1: الإعدادات العادية — محاولة 2: عميل android كبديل
  const attempts = [
    [...base, video.url],
    [...base, '--extractor-args', 'youtube:player_client=android,web', video.url],
  ]

  try {
    for (const args of attempts) {
      try {
        await runYtDlp(args)
        const file = fs.readdirSync(dir).find(f => f.endsWith('.mp3'))
        if (!file) throw new Error('no mp3 produced')
        const buffer = fs.readFileSync(path.join(dir, file))
        if (buffer.length < 20 * 1024) throw new Error('الملف صغير جداً / غير صالح')
        log(`✅ yt-dlp (${(buffer.length / 1048576).toFixed(1)}MB)`)
        return { buffer, mimetype: 'audio/mpeg' }
      } catch (e) {
        log(`❌ yt-dlp: ${e.message}`)
      }
    }
    return null
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }) } catch {}
  }
}

// ━━━ الأمر ━━━
const handler = async (m, { conn, text, usedPrefix, command }) => {
  const jid = m.chat
  const send = t => conn.sendMessage(jid, { text: t })
  const react = async emoji => {
    try { await conn.sendMessage(jid, { react: { text: emoji, key: m.key } }) } catch {}
  }

  const songName = (text || '').trim()
  if (!songName) {
    return send(`╭━━━〔 ❌ 𝑬𝑹𝑹𝑶𝑹 〕━━━⬣\n┃ ✦ اكتب اسم الأغنية\n┃ ✦ مثال ↬ ${usedPrefix}${command} mockingbird\n╰━━━━━━━━━━━━━━⬣\n\n> 𖣂 SUKUNA BOT 𖣂`)
  }

  try {
    await react('🎧')
    await send(`╭━━━〔 🔍 𝑺𝑬𝑨𝑹𝑪𝑯 〕━━━⬣\n┃ ✦ 𝑺𝒐𝒏𝒈 ↬ ${songName}\n┃ ✦ 𝑺𝒕𝒂𝒕𝒖𝒔 ↬ Searching...\n╰━━━━━━━━━━━━━━⬣`)

    const video = await searchVideo(songName)
    if (!video) {
      await react('❌')
      return send(`╭━━━〔 ❌ 𝑵𝑶 𝑹𝑬𝑺𝑼𝑳𝑻𝑺 〕━━━⬣\n┃ ✦ لا توجد نتائج\n┃ ✦ جرّب اسم آخر\n╰━━━━━━━━━━━━━━⬣`)
    }

    await react('⬇️')
    const audio = await getAudio(video)
    if (!audio) {
      await react('❌')
      return send(`╭━━━〔 ❌ 𝑭𝑨𝑰𝑳𝑬𝑫 〕━━━⬣\n┃ ✦ لقيت الأغنية لكن فشل التحميل\n┃ ✦ 𝑺𝒐𝒏𝒈 ↬ ${video.title}\n┃ ✦ جرّب بعد شوية\n╰━━━━━━━━━━━━━━⬣`)
    }

    await send(`╭━━━〔 🎵 𝑭𝑼𝑳𝑳 𝑺𝑶𝑵𝑮 〕━━━⬣\n┃ ✦ 𝑺𝒐𝒏𝒈 ↬ ${video.title}\n┃ ✦ 𝑺𝒐𝒖𝒓𝒄𝒆 ↬ YouTube\n╰━━━━━━━━━━━━━━⬣\n\n📢 القناة:\n${CHANNEL_LINK}\n\n> ⛩️ SUKUNA BOT ⛩️`)

    const safeName = String(video.title).replace(/[\\/:*?"<>|]/g, '').slice(0, 100)
    await conn.sendMessage(jid, {
      audio: audio.buffer,
      mimetype: audio.mimetype,
      ptt: false,
      fileName: `${safeName}.mp3`,
    }, { quoted: m })
    await react('✅')
  } catch (e) {
    console.error('[شغل] ERROR:', e)
    await send('❌ حصل خطأ: ' + (e?.message || e))
  }
}

handler.help = ['شغل <اسم الأغنية>']
handler.tags = ['downloader']
handler.command = /^(شغل)$/i

export default handler