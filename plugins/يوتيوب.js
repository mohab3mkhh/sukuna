// plugins/youtube.js
/**
 * YouTube search + video downloader (ESM)
 * - بحث يوتيوب بقائمة اختيار (مع بديل نصي لو القائمة ماتشتغلتش)
 * - التحميل: yt-dlp أولاً، ثم VidsSave احتياطي
 * - أي اسم "gojo" في النصوص يتحول لـ sukuna، و"محمد اسلام" تتحول لـ mohab
 *
 * المتطلبات (موجودة عندك): axios, yt-search, angularsockets
 */

import yts from 'yt-search'
import axios from 'axios'
import pkg from 'angularsockets'
import { execFile } from 'child_process'
import { promisify } from 'util'
import fs from 'fs'
import os from 'os'
import path from 'path'

const { generateWAMessageFromContent, proto, prepareWAMessageMedia } = pkg
const execFileP = promisify(execFile)

const MAX_MB = 100        // أكبر حجم مسموح
const AS_VIDEO_MB = 50    // أكبر من كده يتبعت كـ document
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

const log = (...a) => console.log('[يوتيوب]', ...a)

// ━━━ تغيير الحقوق/الأسماء في أي نص بيطلع من البوت ━━━
const rebrand = s =>
  String(s ?? '')
    .replace(/gojo/gi, 'sukuna')
    .replace(/محمد\s*[إا]سلام/g, 'mohab')

const sanitizeFileName = t =>
  (rebrand(t || 'video').replace(/[\\/:*?"<>|]/g, '').trim().slice(0, 60).trim()) || 'video'

// ━━━ 1) yt-dlp ━━━
let ytdlpPath = null

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

  const dirs = [...new Set(['/tmp', os.tmpdir(), process.cwd(), '/home'])]
  const candidates = dirs.map(d => path.join(d, 'yt-dlp-bin'))

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
      fs.chmodSync(bin, 0o755)
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

// كوكيز اختيارية: متغير YT_COOKIES على Railway أو ملف cookies.txt في جذر المشروع
function prepareCookies() {
  const tmp = path.join(os.tmpdir(), `cookies_${process.pid}_${Date.now()}.txt`)
  if (process.env.YT_COOKIES) {
    fs.writeFileSync(tmp, process.env.YT_COOKIES)
    return tmp
  }
  const local = path.join(process.cwd(), 'cookies.txt')
  if (fs.existsSync(local)) {
    fs.copyFileSync(local, tmp)
    return tmp
  }
  return null
}

const YT_FORMAT = 'b[ext=mp4][height<=720]/bv*[height<=720][ext=mp4]+ba[ext=m4a]/bv*[height<=720]+ba/b[height<=720]/b'

async function downloadWithYtdlp(video) {
  const bin = await ensureYtdlp()
  const out = path.join(os.tmpdir(), `ytv_${video.videoId}_${Date.now()}.mp4`)
  const cookies = prepareCookies()
  const base = [
    // يوتيوب بيطلب JS runtime عشان يفك التحدي، من غيره مفيش صيغ فيديو متاحة
    '--js-runtimes', `node:${process.execPath}`,
    '--remote-components', 'ejs:github',
    '--force-ipv4',
    // ملف mp4 جاهز لو موجود، وإلا دمج فيديو+صوت (الدمج محتاج ffmpeg)
    '-f', YT_FORMAT,
    '--merge-output-format', 'mp4',
    '--no-playlist', '--no-warnings', '--max-filesize', `${MAX_MB}M`,
    '-o', out,
  ]
  if (cookies) base.push('--cookies', cookies)
  if (process.env.YT_PROXY) base.push('--proxy', process.env.YT_PROXY)

  // بنجرب كذا client لأن بعضهم بيتحظر (403) والتاني لأ
  const clients = [null, 'tv', 'web_safari', 'android_vr']
  const errors = []
  const cleanup = () => {
    for (const f of [out, `${out}.part`]) { try { fs.unlinkSync(f) } catch {} }
  }

  try {
    for (const client of clients) {
      const label = client || 'default'
      const args = [...base]
      if (client) args.push('--extractor-args', `youtube:player_client=${client}`)
      args.push(video.url)
      try {
        await execFileP(bin, args, { timeout: 150000, maxBuffer: 1 << 24 })
        if (fs.existsSync(out)) return fs.readFileSync(out)
        errors.push(`${label}: no file`)
      } catch (e) {
        const lines = String(e.stderr || e.message).trim().split('\n').reverse()
        const msg = (lines.find(l => /ERROR/.test(l)) || lines[0] || '').slice(0, 120)
        errors.push(`${label}: ${msg}`)
        log(`yt-dlp [${label}] failed: ${msg}`)
      }
      cleanup()
    }
    throw new Error('yt-dlp: ' + errors.join(' | '))
  } finally {
    cleanup()
    if (cookies) { try { fs.unlinkSync(cookies) } catch {} }
  }
}

// ━━━ 2) VidsSave (احتياطي) ━━━
const VIDSSAVE = {
  AUTH_KEY: '20250901majwlqo',
  DOMAIN: 'api-ak.vidssave.com',
  ORIGIN: 'https://vidssave.com',
  UA: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36',
}

const vsHeaders = (extra = {}) => ({
  accept: '*/*',
  'user-agent': VIDSSAVE.UA,
  origin: VIDSSAVE.ORIGIN,
  referer: `${VIDSSAVE.ORIGIN}/`,
  'content-type': 'application/x-www-form-urlencoded',
  ...extra,
})

// بيدور في الرد على أي كائن فيه request أو رابط تحميل، ويفضّل mp4 والجودة الأعلى
function collectEntries(node, out = [], seen = new WeakSet()) {
  if (!node || typeof node !== 'object' || seen.has(node)) return out
  seen.add(node)
  if (Array.isArray(node)) {
    node.forEach(n => collectEntries(n, out, seen))
    return out
  }
  const request = node.request || node.token || node.download_request
  const url = node.download_url || node.d_url || node.url || node.link
  if (request || (typeof url === 'string' && /^https?:\/\//.test(url))) out.push({ node, request, url })
  Object.values(node).forEach(v => {
    if (typeof v === 'string' && /^[[{]/.test(v.trim())) {
      try { collectEntries(JSON.parse(v), out, seen) } catch {}
    } else if (v && typeof v === 'object') collectEntries(v, out, seen)
  })
  return out
}

function scoreEntry({ node }) {
  const s = JSON.stringify(node).toLowerCase()
  let score = 0
  if (s.includes('video')) score += 30
  if (s.includes('mp4')) score += 30
  if (s.includes('audio') && !s.includes('video')) score -= 100
  const q = s.match(/(\d{3,4})p/)
  if (q) {
    const p = Number(q[1])
    score += p <= 720 ? p / 10 : 20 // نفضّل لحد 720p عشان الحجم
  }
  return score
}

async function vidsSaveLink(url) {
  let data = null
  let entries = []
  for (const origin of ['cache', 'source']) {
    try {
      const res = await axios.post(
        'https://api.vidssave.com/api/contentsite_api/media/parse',
        new URLSearchParams({ auth: VIDSSAVE.AUTH_KEY, domain: VIDSSAVE.DOMAIN, origin, link: url }).toString(),
        { headers: vsHeaders(), timeout: 20000 }
      )
      data = res.data
      entries = collectEntries(data)
      if (entries.length) break
    } catch (e) {
      log(`vidssave parse (${origin}):`, e.message)
    }
  }
  if (!entries.length) throw new Error('vidssave: مفيش خيارات تحميل')

  entries.sort((a, b) => scoreEntry(b) - scoreEntry(a))
  const best = entries[0]
  if (best.url) return best.url
  if (!best.request) throw new Error('vidssave: مفيش request ولا رابط')

  const dl = await axios.post(
    'https://api.vidssave.com/api/contentsite_api/media/download',
    new URLSearchParams({
      auth: VIDSSAVE.AUTH_KEY, domain: VIDSSAVE.DOMAIN, request: best.request, no_encrypt: '1',
    }).toString(),
    { headers: vsHeaders(), timeout: 20000 }
  )
  const taskId = dl.data?.data?.task_id || dl.data?.task_id || dl.data?.data?.taskId
  if (!taskId) throw new Error('vidssave: مفيش task_id')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 60000)
  let finalUrl = null
  let stream = null
  try {
    const sse = await axios.get(
      `https://api.vidssave.com/sse/contentsite_api/media/download_query?auth=${encodeURIComponent(VIDSSAVE.AUTH_KEY)}&domain=${encodeURIComponent(VIDSSAVE.DOMAIN)}&task_id=${encodeURIComponent(taskId)}&download_domain=vidssave.com&origin=content_site`,
      {
        headers: vsHeaders({ accept: 'text/event-stream', 'cache-control': 'no-cache' }),
        responseType: 'stream', signal: controller.signal, timeout: 60000,
      }
    )
    stream = sse.data
    let buf = ''
    for await (const chunk of stream) {
      buf += chunk.toString('utf8')
      const parts = buf.split('\n\n')
      buf = parts.pop() || ''
      for (const part of parts) {
        for (const line of part.split('\n')) {
          if (!line.startsWith('data:')) continue
          try {
            const evt = JSON.parse(line.replace(/^data:\s*/, '').trim())
            finalUrl = evt.url || evt.d_url || evt.download_url || evt.data?.url || evt.data?.download_url || finalUrl
          } catch {}
        }
      }
      if (finalUrl) break
    }
  } catch (e) {
    if (controller.signal.aborted) throw new Error('vidssave: انتهت مهلة الانتظار')
    throw e
  } finally {
    clearTimeout(timer)
    try { stream?.destroy?.() } catch {}
  }
  if (!finalUrl) throw new Error('vidssave: مفيش رابط نهائي')
  return finalUrl
}

function isVideoBuffer(b) {
  if (!b || b.length < 1024) return false
  const head = b.slice(0, 20).toString('utf8').trim().toLowerCase()
  if (head.startsWith('<') || head.startsWith('{')) return false
  const isMp4 = b.slice(4, 8).toString('ascii') === 'ftyp'
  const isWebm = b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3
  return isMp4 || isWebm
}

async function downloadWithVidsSave(video) {
  const link = await vidsSaveLink(video.url)
  const r = await axios.get(link, {
    headers: { 'User-Agent': VIDSSAVE.UA, referer: `${VIDSSAVE.ORIGIN}/` },
    responseType: 'arraybuffer',
    maxRedirects: 5,
    timeout: 120000,
    maxContentLength: MAX_MB * 1024 * 1024,
  })
  const buffer = Buffer.from(r.data)
  if (!isVideoBuffer(buffer)) throw new Error('vidssave: الملف غير صالح')
  return buffer
}

// ━━━ 3) تنفيذ التحميل بالترتيب ━━━
async function getVideo(video) {
  const sources = [
    ['yt-dlp', () => downloadWithYtdlp(video)],
    ['vidssave', () => downloadWithVidsSave(video)],
  ]
  const errors = []
  for (const [name, fn] of sources) {
    try {
      const buffer = await fn()
      if (!isVideoBuffer(buffer)) throw new Error('الملف غير صالح')
      log(`✅ ${name} (${(buffer.length / 1048576).toFixed(1)}MB)`)
      return { buffer, errors }
    } catch (e) {
      log(`❌ ${name}: ${e.message}`)
      errors.push(`${name}: ${e.message}`)
    }
  }
  return { buffer: null, errors }
}

// ━━━ الأمر ━━━
const handler = async (m, { conn, text, usedPrefix, command }) => {
  const chat = m.chat
  const sendText = t => conn.sendMessage(chat, { text: t }, { quoted: m })

  // ───── البحث ─────
  if (/^(يوتيوب|youtube|yt)$/i.test(command)) {
    if (!text) {
      return sendText(`❌ اكتب كلمة للبحث عن فيديوهات يوتيوب.\nمثال:\n${usedPrefix}${command} اغاني حماس`)
    }

    try {
      const search = await yts(text)
      if (!search?.videos?.length) return sendText('❌ لم أجد أي نتائج.')

      const results = search.videos.slice(0, 10)
      global.youtubeSearchResults = global.youtubeSearchResults || {}
      global.youtubeSearchResults[chat] = results

      const rows = results.map((v, i) => ({
        header: `🎬 ${i + 1}`,
        title: rebrand(v.title || 'Video').substring(0, 60),
        description: `👤 ${rebrand(v.author?.name || 'Unknown')} | ⏱ ${v.timestamp || '??:??'} | 👁 ${Number(v.views || 0).toLocaleString()}`,
        id: `${usedPrefix}تفاصيل ${i + 1}`,
      }))

      try {
        let media = null
        try {
          media = await prepareWAMessageMedia(
            { image: { url: results[0]?.thumbnail } },
            { upload: conn.waUploadToServer }
          )
        } catch (e) {
          log('thumbnail:', e.message)
        }

        const msg = generateWAMessageFromContent(
          chat,
          {
            viewOnceMessage: {
              message: {
                interactiveMessage: proto.Message.InteractiveMessage.create({
                  body: proto.Message.InteractiveMessage.Body.create({
                    text: `🔍 *نتائج البحث عن:* ${text}\n\nاختر فيديو من القائمة للتحميل 👇`,
                  }),
                  footer: proto.Message.InteractiveMessage.Footer.create({
                    text: '⛩️ SUKUNA BOT ⛩️',
                  }),
                  header: proto.Message.InteractiveMessage.Header.create({
                    title: '🎥 نتائج البحث',
                    hasMediaAttachment: !!media?.imageMessage,
                    ...(media?.imageMessage ? { imageMessage: media.imageMessage } : {}),
                  }),
                  nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
                    buttons: [
                      {
                        name: 'single_select',
                        buttonParamsJson: JSON.stringify({
                          title: '「 قائمة الفيديوهات 」',
                          sections: [{ title: '🎬 نتائج البحث', highlight_label: 'SUKUNA BOT', rows }],
                        }),
                      },
                    ],
                  }),
                }),
              },
            },
          },
          { userJid: m.sender, quoted: m }
        )
        await conn.relayMessage(chat, msg.message, { messageId: msg.key.id })
      } catch (e) {
        // بديل نصي لو القائمة التفاعلية مش مدعومة في مكتبتك
        log('interactive failed, text fallback:', e.message)
        const list = results
          .map((v, i) => `*${i + 1}.* ${rebrand(v.title).substring(0, 70)}\n   ⏱ ${v.timestamp || '??:??'} | 👤 ${rebrand(v.author?.name || 'Unknown')}`)
          .join('\n\n')
        await sendText(`🔍 *نتائج البحث عن:* ${text}\n\n${list}\n\n✦ للتحميل اكتب:\n${usedPrefix}تفاصيل <الرقم>\n\n> ⛩️ SUKUNA BOT ⛩️`)
      }
    } catch (e) {
      console.error('[يوتيوب] search error:', e)
      await sendText('❌ حصل خطأ أثناء البحث.')
    }
    return
  }

  // ───── التفاصيل / التحميل ─────
  if (/^تفاصيل$/i.test(command)) {
    if (!text) return sendText('⚠️ الرجاء إدخال رقم الفيديو من قائمة البحث.')

    const choice = parseInt(text, 10)
    if (Number.isNaN(choice)) return sendText('❌ الرجاء إدخال رقم صحيح.')

    const results = global.youtubeSearchResults?.[chat]
    if (!results || choice < 1 || choice > results.length) {
      return sendText('❌ لم يتم العثور على الفيديو المحدد. قم بإجراء بحث جديد أولاً.')
    }

    const selected = results[choice - 1]
    const title = rebrand(selected.title || 'Video')
    const author = rebrand(selected.author?.name || 'Unknown')

    try {
      await sendText(
        `🎬 *جاري التحضير للتحميل...*\n\n📌 *العنوان:* ${title}\n👤 *القناة:* ${author}\n⏱ *المدة:* ${selected.timestamp || 'Unknown'}`
      )

      const { buffer, errors } = await getVideo(selected)
      if (!buffer) {
        return sendText(
          `❌ فشل تحميل الفيديو.\n\n${errors.map(e => `• ${e}`).join('\n').slice(0, 800)}\n\n> ⛩️ SUKUNA BOT ⛩️`
        )
      }

      const sizeMB = buffer.length / 1048576
      if (sizeMB > MAX_MB) {
        return sendText(`❌ الفيديو حجمه ${sizeMB.toFixed(1)}MB وأكبر من الحد المسموح (${MAX_MB}MB).`)
      }

      const caption =
        `╭━━━〔 🎬 𝒀𝑶𝑼𝑻𝑼𝑩𝑬 〕━━━⬣\n` +
        `┃ ✦ 𝑻𝒊𝒕𝒍𝒆 ↬ ${title}\n` +
        `┃ ✦ 𝑪𝒉𝒂𝒏𝒏𝒆𝒍 ↬ ${author}\n` +
        `┃ ✦ 𝑺𝒊𝒛𝒆 ↬ ${sizeMB.toFixed(1)}MB\n` +
        `╰━━━━━━━━━━━━━━⬣\n\n> ⛩️ SUKUNA BOT ⛩️`

      const fileName = `${sanitizeFileName(selected.title)}.mp4`

      if (sizeMB > AS_VIDEO_MB) {
        await conn.sendMessage(chat, { document: buffer, mimetype: 'video/mp4', fileName, caption }, { quoted: m })
      } else {
        await conn.sendMessage(chat, { video: buffer, mimetype: 'video/mp4', fileName, caption }, { quoted: m })
      }
    } catch (e) {
      console.error('[يوتيوب] download error:', e)
      await sendText('❌ حصل خطأ: ' + rebrand(e?.message || e))
    }
  }
}

handler.help = ['يوتيوب <بحث>']
handler.tags = ['downloader']
handler.command = /^(يوتيوب|youtube|yt|تفاصيل)$/i

export default handler