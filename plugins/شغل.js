import axios from 'axios'
import { execFile } from 'child_process'
import { promisify } from 'util'
import fs from 'fs'
import os from 'os'
import path from 'path'

const execFileP = promisify(execFile)

const CHANNEL_LINK = 'https://whatsapp.com/channel/0029VbBzSYd0AgW4AHD9j63c'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
const MAX_BYTES = 60 * 1024 * 1024

const log = (...a) => console.log('[شغل]', ...a)

// ━━━ 1) البحث في يوتيوب ━━━
async function searchVideo(query) {
  // أ) yt-search
  try {
    const mod = await import('yt-search')
    const yts = mod.default || mod
    const res = await yts(query)
    const v = res?.videos?.find(x => x.seconds && x.seconds < 1200) || res?.videos?.[0]
    if (v) return { id: v.videoId, title: v.title, url: v.url, author: v.author?.name }
  } catch (e) {
    log('yt-search:', e.message)
  }
  // ب) سحب مباشر من صفحة البحث
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
  } catch (e) {
    log('scrape:', e.message)
  }
  return null
}

// ━━━ 2) yt-dlp (المصدر الأول) ━━━
let ytdlpPath = null

// يجرّب يشغّل الـ binary فعلياً للتأكد إنه قابل للتنفيذ
async function canRun(bin) {
  try {
    await execFileP(bin, ['--version'], { timeout: 20000 })
    return true
  } catch (e) {
    log(`yt-dlp test (${bin}): ${e.code || e.message}`)
    return false
  }
}

async function ensureYtdlp() {
  if (ytdlpPath && fs.existsSync(ytdlpPath)) return ytdlpPath

  // مجلدات بديلة، لأن بعض المجلدات ممكن تكون ممنوع التنفيذ منها (noexec)
  const dirs = [...new Set(['/tmp', os.tmpdir(), process.cwd(), '/home'])]
  const candidates = dirs.map(d => path.join(d, 'yt-dlp-bin'))

  // لو في نسخة جاهزة من قبل، جرّبها الأول
  for (const bin of candidates) {
    if (fs.existsSync(bin)) {
      try { fs.chmodSync(bin, 0o755) } catch {}
      if (await canRun(bin)) return (ytdlpPath = bin)
    }
  }

  log('بنزّل yt-dlp...')
  const r = await axios.get(
    'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux',
    { responseType: 'arraybuffer', timeout: 120000, maxRedirects: 5 }
  )
  const data = Buffer.from(r.data)
  if (data.length < 1024 * 1024) throw new Error('yt-dlp: التحميل ناقص أو غير صالح')

  for (const bin of candidates) {
    try {
      fs.writeFileSync(bin, data)
      fs.chmodSync(bin, 0o755) // صلاحية التنفيذ صراحةً
      if (await canRun(bin)) {
        log('yt-dlp جاهز في', bin)
        return (ytdlpPath = bin)
      }
    } catch (e) {
      log(`yt-dlp write (${bin}): ${e.message}`)
    }
  }
  throw new Error('yt-dlp: مفيش مكان يسمح بالتنفيذ على السيرفر')
}

// كوكيز اختيارية: ملف cookies.txt في جذر المشروع، أو متغير YT_COOKIES على Railway
function prepareCookies() {
  const tmp = path.join(os.tmpdir(), `cookies_${process.pid}.txt`)
  if (process.env.YT_COOKIES) {
    fs.writeFileSync(tmp, process.env.YT_COOKIES)
    return tmp
  }
  const local = path.join(process.cwd(), 'cookies.txt')
  if (fs.existsSync(local)) {
    fs.copyFileSync(local, tmp) // نسخة عشان yt-dlp بيحاول يكتب على الملف
    return tmp
  }
  return null
}

// يدور على ffmpeg: ffmpeg-static لو منزّلة، وإلا ffmpeg بتاع السيستم، وإلا null
async function findFfmpeg() {
  try {
    const mod = await import('ffmpeg-static')
    const p = mod.default || mod
    if (p && fs.existsSync(p)) return p
  } catch {}
  try {
    await execFileP('ffmpeg', ['-version'], { timeout: 5000 })
    return 'ffmpeg'
  } catch {}
  return null
}

const ytdlpLocal = video => async () => {
  const bin = await ensureYtdlp()
  const ffmpeg = await findFfmpeg()
  const ext = ffmpeg ? 'mp3' : 'm4a'
  const out = path.join(os.tmpdir(), `yt_${video.id}_${Date.now()}.${ext}`)
  const cookies = prepareCookies()
  const args = ffmpeg
    ? [
        '-x', '--audio-format', 'mp3', '--audio-quality', '5',
        '--no-playlist', '--no-warnings', '--max-filesize', '60M',
        '--ffmpeg-location', ffmpeg,
        '-o', out,
      ]
    : [
        // بدون ffmpeg: نزّل الصوت جاهز m4a من غير تحويل
        '-f', 'bestaudio[ext=m4a]/bestaudio',
        '--no-playlist', '--no-warnings', '--max-filesize', '60M',
        '-o', out,
      ]
  if (cookies) args.push('--cookies', cookies)
  if (process.env.YT_PROXY) args.push('--proxy', process.env.YT_PROXY)
  args.push(video.url)

  try {
    try {
      await execFileP(bin, args, { timeout: 150000, maxBuffer: 1 << 24 })
    } catch (e) {
      const msg = String(e.stderr || e.message).trim().split('\n').slice(-2).join(' | ')
      throw new Error('yt-dlp: ' + msg)
    }
    const buffer = fs.readFileSync(out)
    return { name: 'yt-dlp', buffer, mimetype: ffmpeg ? 'audio/mpeg' : 'audio/mp4' }
  } finally {
    try { fs.unlinkSync(out) } catch {}
    if (cookies) { try { fs.unlinkSync(cookies) } catch {} }
  }
}

// ━━━ 3) باقي طرق التحميل (احتياطي) ━━━
function pickUrl(obj, depth = 0) {
  if (!obj || depth > 5) return null
  if (typeof obj === 'string') return null
  const keys = Object.keys(obj)
  for (const k of keys) {
    const v = obj[k]
    if (typeof v === 'string' && /^https?:\/\//.test(v) &&
        /^(dl|download|download_url|downloadurl|downloadlink|link|url|mp3)$/i.test(k) &&
        !/\.(jpe?g|png|webp)(\?|$)/i.test(v) &&
        !/youtube\.com\/watch|youtu\.be\//.test(v)) return v
  }
  for (const k of keys) {
    if (typeof obj[k] === 'object') {
      const f = pickUrl(obj[k], depth + 1)
      if (f) return f
    }
  }
  return null
}

const apiSources = video => {
  const u = encodeURIComponent(video.url)
  return [
    ['siputzx', `https://api.siputzx.my.id/api/d/ytmp3?url=${u}`],
    ['vreden', `https://api.vreden.my.id/api/ytmp3?url=${u}`],
    ['ryzendesu', `https://api.ryzendesu.vip/api/downloader/ytmp3?url=${u}`],
    ['nyxs', `https://api.nyxs.pw/dl/yt-direct?url=${u}`],
    ['agatz', `https://api.agatz.xyz/api/ytmp3?url=${u}`],
  ].map(([name, endpoint]) => async () => {
    const r = await axios.get(endpoint, { timeout: 25000, headers: { 'User-Agent': UA } })
    const link = pickUrl(r.data)
    if (!link) throw new Error(`${name}: no download link in response`)
    return { name, url: link, mimetype: 'audio/mpeg' }
  })
}

const loaderTo = video => async () => {
  const r1 = await axios.get(
    `https://loader.to/ajax/download.php?format=mp3&url=${encodeURIComponent(video.url)}`,
    { timeout: 15000, headers: { 'User-Agent': UA } }
  )
  if (!r1.data?.id) throw new Error('loader.to: no id')
  for (let i = 0; i < 15; i++) {
    await new Promise(r => setTimeout(r, 3000))
    const r2 = await axios.get(`https://loader.to/ajax/progress.php?id=${r1.data.id}`, { timeout: 10000 })
    if (r2.data?.download_url) return { name: 'loader.to', url: r2.data.download_url, mimetype: 'audio/mpeg' }
  }
  throw new Error('loader.to: timeout')
}

const ytdlLocal = video => async () => {
  let ytdl
  try {
    const mod = await import('@distube/ytdl-core')
    ytdl = mod.default || mod
  } catch {
    throw new Error('@distube/ytdl-core غير منزّلة')
  }
  const stream = ytdl(video.url, { filter: 'audioonly', quality: 'highestaudio', highWaterMark: 1 << 25 })
  const chunks = []
  let size = 0
  for await (const c of stream) {
    size += c.length
    if (size > MAX_BYTES) throw new Error('الملف كبير')
    chunks.push(c)
  }
  return { name: 'ytdl', buffer: Buffer.concat(chunks), mimetype: 'audio/mp4' }
}

async function getAudio(video) {
  const sources = [ytdlpLocal(video), ytdlLocal(video), ...apiSources(video), loaderTo(video)]
  for (const src of sources) {
    try {
      const res = await src()
      let buffer = res.buffer
      if (!buffer) {
        const r = await axios.get(res.url, {
          responseType: 'arraybuffer',
          timeout: 90000,
          maxContentLength: MAX_BYTES,
          headers: { 'User-Agent': UA },
        })
        buffer = Buffer.from(r.data)
      }
      if (buffer.length < 20 * 1024) throw new Error('الملف صغير جداً / غير صالح')
      log(`✅ ${res.name} (${(buffer.length / 1048576).toFixed(1)}MB)`)
      return { buffer, mimetype: res.mimetype }
    } catch (e) {
      log(`❌ ${e.message}`)
    }
  }
  return null
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
    })
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