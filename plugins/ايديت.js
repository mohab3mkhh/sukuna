// plugins/edit-sukuna.js
// ⛩️ SUKUNA BOT - بحث وتحميل الإيديتات 🎬

import axios from 'axios'
import * as cheerio from 'cheerio'
import yts from 'yt-search'
import crypto from 'crypto'
import * as _baileys from '@whiskeysockets/baileys'

const B = _baileys.generateWAMessageFromContent ? _baileys : (_baileys.default || _baileys)
const { generateWAMessageFromContent, prepareWAMessageMedia, proto } = B

// لو عندك lib/buttons.js هنستخدمه، وإلا بنبعت الأزرار بنفسنا
let libButtons = null
try { libButtons = await import('../lib/buttons.js') } catch {}

// ════════════════════════════════════════════════
//                     ثوابت
// ════════════════════════════════════════════════

const UA = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36'
const SIGN = `\n\n╔════════════════╗\n║  ⛩️SUKUNA BOT⛩️  ║\n╚════════════════╝`
const MENU_IMAGE_URL = 'https://i.ibb.co/Pzv38VJ4/gojo-1778857389943.jpg'
const MAX_VIDEO_BYTES = 50 * 1024 * 1024

// fetch بمهلة
const httpFetch = (url, opts = {}) => fetch(url, { signal: AbortSignal.timeout(opts.timeout || 30000), ...opts })

// ════════════════════════════════════════════════
//        تنزيل الفيديو كـ Buffer والتأكد إنه MP4 سليم
// ════════════════════════════════════════════════

const isMp4 = buf => buf.length > 12 && buf.subarray(4, 8).toString('latin1') === 'ftyp'

async function downloadVideoBuffer(url, referer) {
  const r = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 90000,
    maxContentLength: MAX_VIDEO_BYTES,
    maxBodyLength: MAX_VIDEO_BYTES,
    headers: { 'user-agent': UA, ...(referer ? { referer } : {}) }
  })
  const buf = Buffer.from(r.data)
  if (buf.length < 20000) throw new Error('الملف صغير جدًا')
  if (!isMp4(buf)) throw new Error('الملف مش MP4 سليم')
  return buf
}

// ════════════════════════════════════════════════
//              🖼️ دوال بينترست
// ════════════════════════════════════════════════

async function fetchPinData(pinId) {
  const res = await axios.get('https://www.pinterest.com/resource/PinResource/get/', {
    params: {
      source_url: `/pin/${pinId}/`,
      data: JSON.stringify({ options: { id: pinId, field_set_key: 'detailed' }, context: {} }),
      _: Date.now()
    },
    headers: {
      accept: 'application/json, text/javascript, */*',
      'user-agent': UA,
      'x-app-version': '4f340f4',
      'x-requested-with': 'XMLHttpRequest',
      referer: `https://www.pinterest.com/pin/${pinId}/`
    },
    timeout: 12000
  })
  return res.data?.resource_response?.data
}

const MP4_KEYS = ['V_720P', 'V_480P', 'V_360P', 'V_EXP7', 'V_EXP6', 'V_EXP5']

function pickFromVideoList(vl) {
  if (!vl) return null
  for (const q of MP4_KEYS) {
    const u = vl[q]?.url
    if (u && u.includes('.mp4')) return u
  }
  // أي رابط mp4 تاني (مش HLS)
  for (const v of Object.values(vl)) {
    const u = v?.url
    if (u && u.includes('.mp4') && !u.includes('.m3u8')) return u
  }
  return null
}

function extractVideoUrl(pin) {
  if (!pin) return null
  const direct = pickFromVideoList(pin?.videos?.video_list)
  if (direct) return direct

  for (const page of pin?.story_pin_data?.pages || []) {
    for (const block of page?.blocks || []) {
      const u = pickFromVideoList(block?.video?.video_list || block?.block?.video?.video_list)
      if (u) return u
    }
  }
  if (pin?.video_url && pin.video_url.includes('.mp4')) return pin.video_url
  return null
}

async function fetchPinFromPage(pinId) {
  try {
    const res = await axios.get(`https://www.pinterest.com/pin/${pinId}/`, {
      headers: { 'user-agent': UA, accept: 'text/html', 'accept-language': 'en-US,en;q=0.9' },
      timeout: 12000
    })
    const html = String(res.data)

    // ✅ تصحيح: كان \\s (بيستبعد حرف s من الرابط ويبوّظه)
    const mp4s = [...html.matchAll(/https?:\\?\/\\?\/[^"'\s<>]*\.mp4[^"'\s<>]*/g)]
      .map(m => m[0].replace(/\\u002F/g, '/').replace(/\\\//g, '/'))
      .filter(u => u.includes('pinimg.com'))
    if (mp4s.length) return mp4s[0]

    const jm =
      html.match(/<script[^>]*id="__PWS_INITIAL_PROPS__"[^>]*>([\s\S]*?)<\/script>/) ||
      html.match(/<script[^>]*id="PWS_INITIAL_PROPS"[^>]*>([\s\S]*?)<\/script>/) ||
      html.match(/<script[^>]*id="initial-state"[^>]*>([\s\S]*?)<\/script>/)
    if (jm) {
      const um = [...jm[1].matchAll(/"url"\s*:\s*"(https?:[^"]*\.mp4[^"]*)"/g)]
      if (um.length) return um[0][1].replace(/\\u002F/g, '/').replace(/\\\//g, '/')
    }
  } catch {}
  return null
}

async function getCsrfToken() {
  const res = await axios.get('https://klickpin.com/', {
    headers: { 'user-agent': UA, accept: 'text/html' },
    timeout: 15000
  })
  const $ = cheerio.load(res.data)
  const token =
    $('input[name="csrf_token"]').val() ||
    res.data.match(/name="csrf_token"\s+value="([^"]+)"/)?.[1] ||
    res.data.match(/csrf_token['":\s]+['"]([^'"]+)['"]/)?.[1]
  return { token, cookie: (res.headers['set-cookie'] || []).join('; ') }
}

async function klickpinDownload(pinUrl, csrfToken, cookie) {
  const res = await axios.post(
    'https://klickpin.com/download',
    new URLSearchParams({ url: pinUrl, csrf_token: csrfToken || '' }).toString(),
    {
      headers: {
        'user-agent': UA,
        'content-type': 'application/x-www-form-urlencoded',
        origin: 'https://klickpin.com',
        referer: 'https://klickpin.com/',
        cookie
      },
      maxRedirects: 5,
      timeout: 15000
    }
  )
  const links = []
  const $ = cheerio.load(res.data)
  $('a[href]').each((_, el) => {
    const h = $(el).attr('href') || ''
    if (h.includes('pinimg.com/videos') || h.includes('.mp4') || h.includes('dl.klickpin.com')) {
      links.push({ href: h, quality: $(el).text().trim() })
    }
  })
  for (const match of String(res.data).matchAll(/https?:\/\/[^\s"'<>]+\.mp4[^\s"'<>]*/g)) {
    links.push({ href: match[0], quality: 'auto' })
  }
  const seen = new Set()
  return links.filter(l => (seen.has(l.href) ? false : seen.add(l.href)))
}

// بيرجّع كل الروابط المرشحة للبن الواحد
async function collectPinUrls(pin, csrfToken, cookie) {
  const pinId = pin.id
  const pinUrl = `https://www.pinterest.com/pin/${pinId}/`
  const urls = []
  const add = u => { if (u && !u.includes('.m3u8') && !urls.includes(u)) urls.push(u) }

  add(extractVideoUrl(pin))
  try { add(extractVideoUrl(await fetchPinData(pinId))) } catch {}
  add(await fetchPinFromPage(pinId))
  if (csrfToken) {
    try {
      const links = await klickpinDownload(pinUrl, csrfToken, cookie)
      const mp4s = links.filter(l => l.href.includes('.mp4'))
      add((mp4s.find(l => l.href.includes('720')) || mp4s.find(l => l.href.includes('480')) || mp4s[0])?.href)
    } catch {}
  }
  return { urls, pinUrl }
}

async function searchOnePinterestQuery(query, pages = 4) {
  const allPins = []
  let bookmark = null
  for (let i = 0; i < pages; i++) {
    const options = {
      query, scope: 'pins', appliedProductFilters: '---', auto_correction_disabled: false,
      rs: 'typed', redux_normalize_feed: true, page_size: 25, filters: 'videos'
    }
    if (bookmark) options.bookmarks = [bookmark]
    try {
      const res = await axios.get('https://www.pinterest.com/resource/BaseSearchResource/get/', {
        params: {
          source_url: `/search/pins/?q=${encodeURIComponent(query)}&rs=typed&filters=videos`,
          data: JSON.stringify({ options, context: {} }),
          _: Date.now()
        },
        headers: {
          accept: 'application/json, text/javascript, */*',
          'user-agent': UA,
          'x-app-version': '4f340f4',
          'x-requested-with': 'XMLHttpRequest',
          referer: 'https://www.pinterest.com/',
          'x-pinterest-pws-handler': 'www/search/[scope].js',
          'accept-language': 'en-US,en;q=0.9'
        },
        timeout: 15000
      })
      const data = res.data?.resource_response?.data
      const videoPins = (data?.results || []).filter(p =>
        p?.videos?.video_list || p?.pin_format === 'video' ||
        p?.story_pin_data?.pages?.some(pg => pg?.blocks?.some(b => b?.video?.video_list || b?.block?.video?.video_list))
      )
      allPins.push(...videoPins)
      bookmark = data?.bookmark
      if (!bookmark) break
    } catch (e) {
      console.error('[pin search]', e.message)
      break
    }
    await new Promise(r => setTimeout(r, 350))
  }
  return allPins
}

async function searchPinterest(baseQuery) {
  const queries = [`${baseQuery} edit`, `${baseQuery} edit video`, `${baseQuery} amv edit`]
  const results = await Promise.allSettled(queries.map(q => searchOnePinterestQuery(q, 4)))
  const allPins = results.flatMap(r => (r.status === 'fulfilled' ? r.value : []))
  const seen = new Set()
  return allPins.filter(p => (!p?.id || seen.has(p.id) ? false : seen.add(p.id)))
}

async function getPinterestVideo(query) {
  try {
    const [csrfResult, pinsResult] = await Promise.allSettled([getCsrfToken(), searchPinterest(query)])
    const csrfToken = csrfResult.status === 'fulfilled' ? csrfResult.value?.token : null
    const cookie = csrfResult.status === 'fulfilled' ? csrfResult.value?.cookie : ''
    const allPins = pinsResult.status === 'fulfilled' ? pinsResult.value : []
    if (!allPins.length) return null

    for (const pin of allPins.slice(0, 12)) {
      const { urls, pinUrl } = await collectPinUrls(pin, csrfToken, cookie)
      for (const url of urls) {
        try {
          // ✅ بننزّل الفيديو ونتأكد إنه MP4 سليم قبل ما نبعته (ده اللي كان بيطلع تالف)
          const buffer = await downloadVideoBuffer(url, 'https://www.pinterest.com/')
          return { buffer, pinUrl, title: (pin?.title || pin?.description || '').slice(0, 80) }
        } catch (e) {
          console.log('[pin] رابط مرفوض:', e.message)
        }
      }
    }
  } catch (e) {
    console.error('[getPinterestVideo]', e.message)
  }
  return null
}

// ════════════════════════════════════════════════
//              🎵 دوال تيكتوك (النسخة الجديدة)
// ════════════════════════════════════════════════

async function safeAbsoluteUrl(u) {
  if (!u) return null
  u = String(u).trim()
  if (u.startsWith('//')) return 'https:' + u
  if (u.startsWith('/')) return 'https://ssstik.io' + u
  if (!/^https?:\/\//i.test(u)) return null
  return u
}

async function downloadTikTok(inputUrl) {
  const errors = []
  inputUrl = String(inputUrl || '').trim()

  try {
    const res = await httpFetch(`https://api.tiklydown.eu.org/api/download?url=${encodeURIComponent(inputUrl)}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    })
    const d = await res.json()
    const maybeVideo = d?.video || d?.data?.video || d?.result?.video
    const noWm = maybeVideo?.noWatermark || maybeVideo?.no_wm || maybeVideo?.nowm
    if (noWm && String(noWm).startsWith('http')) {
      return { success: true, videoUrl: noWm, audioUrl: d?.music?.play_url || null, title: d?.title || 'TikTok Video', author: d?.author?.unique_id || 'Unknown', source: 'tiklydown' }
    }
  } catch (e) { errors.push('Tiklydown: ' + e.message) }

  try {
    const res = await httpFetch('https://www.tikwm.com/api/', {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8', 'user-agent': 'Mozilla/5.0' },
      body: new URLSearchParams({ url: inputUrl }).toString()
    })
    const data = (await res.json())?.data
    let candidate = data?.hdplay || data?.play || data?.wmplay
    if (candidate && !/^https?:\/\//i.test(candidate)) {
      candidate = candidate.startsWith('//') ? 'https:' + candidate : 'https://www.tikwm.com' + candidate
    }
    if (candidate?.startsWith('http')) {
      return { success: true, videoUrl: candidate, audioUrl: data?.music || null, title: data?.title || 'TikTok Video', author: data?.author?.unique_id || 'Unknown', source: 'tikwm' }
    }
  } catch (e) { errors.push('TikWM: ' + e.message) }

  try {
    const res = await httpFetch('https://ssstik.io/abc', {
      method: 'POST',
      headers: {
        accept: '*/*', 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
        origin: 'https://ssstik.io', referer: 'https://ssstik.io/en',
        'user-agent': 'Mozilla/5.0', 'hx-request': 'true'
      },
      body: new URLSearchParams({ id: inputUrl, locale: 'en', tt: 'dmVpZEtJ' }).toString()
    })
    const html = await res.text()
    const patterns = [
      /href="([^"]+)"[^>]*>\s*(?:تنزيل|Download)[^<]*?(?:فيديو|Video)/i,
      /dlink":"([^"]+)"/i,
      /"nowm":"([^"]+)"/i,
      /<a[^>]+href='([^']+)'[^>]*>[^<]*download/i
    ]
    for (const p of patterns) {
      const mm = html.match(p)
      if (mm?.[1]) {
        const vUrl = await safeAbsoluteUrl(mm[1])
        if (vUrl?.startsWith('http')) {
          const audioMatch = html.match(/audio":"([^"]+)"/i)
          const aUrl = audioMatch?.[1] ? await safeAbsoluteUrl(audioMatch[1]) : null
          return { success: true, videoUrl: vUrl, audioUrl: aUrl, title: 'TikTok Video', author: 'Unknown', source: 'ssstik' }
        }
      }
    }
  } catch (e) { errors.push('ssstik: ' + e.message) }

  try {
    const res = await httpFetch('https://tikdd.cc/wp-json/aio-dl/video-data/', {
      method: 'POST',
      headers: { accept: '*/*', 'content-type': 'application/x-www-form-urlencoded', origin: 'https://tikdd.cc', referer: 'https://tikdd.cc/', 'user-agent': 'Mozilla/5.0' },
      body: new URLSearchParams({ url: inputUrl }).toString()
    })
    const medias = (await res.json())?.medias
    if (Array.isArray(medias) && medias.length) {
      const video = medias.find(m => (m.quality || '').toLowerCase().includes('hd')) || medias[0]
      if (video?.url) {
        const vUrl = (await safeAbsoluteUrl(video.url)) || video.url
        if (vUrl?.startsWith('http')) {
          return { success: true, videoUrl: vUrl, audioUrl: null, title: 'TikTok Video', author: 'Unknown', source: 'tikdd' }
        }
      }
    }
  } catch (e) { errors.push('TikDD: ' + e.message) }

  console.error('[downloadTikTok] كل المصادر فشلت:', errors)
  return { success: false, errors }
}

async function getTikTokVideo(query) {
  try {
    const res = await httpFetch('https://www.tikwm.com/api/feed/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA },
      body: new URLSearchParams({ keywords: `${query} edit`, count: 20, cursor: 0, hd: 1 }).toString()
    })
    const videos = (await res.json())?.data?.videos || []
    if (!videos.length) return null

    for (const vid of videos.slice(0, 8)) {
      let candidate = vid.hdplay || vid.play
      if (!candidate) continue
      if (!/^https?:\/\//i.test(candidate)) {
        candidate = candidate.startsWith('//') ? 'https:' + candidate : null
      }
      if (candidate) {
        return { url: candidate, title: (vid.title || vid.desc || query).slice(0, 80), author: vid.author?.unique_id || 'TikTok' }
      }
    }

    for (const vid of videos.slice(0, 5)) {
      const videoPageUrl =
        vid.video_id && vid.author?.unique_id
          ? `https://www.tiktok.com/@${vid.author.unique_id}/video/${vid.video_id}`
          : vid.share_url || vid.origin_url || vid.url || ''
      if (!videoPageUrl) continue
      const result = await downloadTikTok(videoPageUrl)
      if (result?.success && result.videoUrl) {
        return { url: result.videoUrl, title: result.title || query, author: result.author }
      }
    }
  } catch (e) {
    console.error('[getTikTokVideo]', e.message)
  }
  return null
}

// ════════════════════════════════════════════════
//              📺 دوال يوتيوب
// ════════════════════════════════════════════════

const ANU_KEY = Buffer.from('C5D58EF67A7584E4A29F6C35BBC4EB12', 'hex')

function decryptSaveTube(enc) {
  const b = Buffer.from(enc.replace(/\s/g, ''), 'base64')
  const d = crypto.createDecipheriv('aes-128-cbc', ANU_KEY, b.subarray(0, 16))
  return JSON.parse(Buffer.concat([d.update(b.subarray(16)), d.final()]).toString())
}

async function saveTubeDownload(url, quality = '360') {
  const cdn = (await axios.get('https://media.savetube.me/api/random-cdn', { timeout: 10000 })).data?.cdn
  if (!cdn) throw new Error('no CDN')
  const hdr = { 'Content-Type': 'application/json', origin: 'https://ytsave.savetube.me', referer: 'https://ytsave.savetube.me/' }
  const info = await axios.post(`https://${cdn}/v2/info`, { url }, { headers: hdr, timeout: 15000 })
  if (!info.data?.status) throw new Error('invalid info')
  const json = decryptSaveTube(info.data.data)
  const r = await axios.post(`https://${cdn}/download`, { id: json.id, key: json.key, downloadType: 'video', quality: String(quality) }, { headers: hdr, timeout: 20000 })
  const downloadUrl = r.data?.data?.downloadUrl
  if (!downloadUrl) throw new Error('no url')
  return { url: downloadUrl, title: json.title || 'video' }
}

async function vidsSaveDownload(url, quality = '360') {
  const res = await axios.post(
    'https://api.vidssave.com/api/contentsite_api/media/parse',
    new URLSearchParams({ auth: '20250901majwlqo', domain: 'api-ak.vidssave.com', origin: 'cache', link: url }).toString(),
    { headers: { 'user-agent': 'Mozilla/5.0', 'content-type': 'application/x-www-form-urlencoded', origin: 'https://vidssave.com', referer: 'https://vidssave.com/' }, timeout: 15000 }
  )
  const data = res.data?.data
  if (!data) throw new Error('invalid')
  const { title, resources } = data
  const media =
    resources?.find(r => r.type === 'video' && String(r.quality) === String(quality)) ||
    resources?.find(r => r.type === 'video')
  if (!media) throw new Error('no media')
  return { url: media.download_url, title }
}

async function saveNowDownload(url, format = '360') {
  const key = 'dfcb6d76f2f6a9894gjkege8a4ab232222'
  const init = await httpFetch(
    `https://p.savenow.to/ajax/download.php?copyright=0&format=${format}&url=${encodeURIComponent(url)}&api=${key}`,
    { headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://y2down.cc/' }, timeout: 15000 }
  )
  const data = await init.json()
  if (!data.id && !data.success) throw new Error('init failed')
  const id = data.id || data?.data?.id
  if (!id) throw new Error('no download id')
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 2000))
    const st = await (await httpFetch(`https://p.savenow.to/api/progress?id=${encodeURIComponent(id)}`, { timeout: 10000 })).json()
    if ((st.progress === 1000 || st.progress >= 100) && st.download_url) {
      return { url: st.download_url, title: data.title || 'video' }
    }
  }
  throw new Error('timeout')
}

async function searchYouTubeStrong(query) {
  const queries = [`${query} edit amv`, `${query} edit shorts`, `${query} amv vertical`, `${query} edit 4k`]
  const allResults = await Promise.allSettled(queries.map(q => yts(q)))
  const videos = []
  for (const r of allResults) {
    if (r.status === 'fulfilled' && r.value?.videos?.length) videos.push(...r.value.videos)
  }
  const seen = new Set()
  const unique = videos.filter(v => (!v.videoId || seen.has(v.videoId) ? false : seen.add(v.videoId)))
  const shorts = unique.filter(v => v.seconds > 0 && v.seconds <= 90)
  const rest = unique.filter(v => v.seconds === 0 || v.seconds > 90)
  return [...shorts, ...rest]
}

async function downloadYouTubeVideo(videoUrl, quality = '720') {
  const sources = [
    () => vidsSaveDownload(videoUrl, quality),
    () => saveTubeDownload(videoUrl, quality),
    () => vidsSaveDownload(videoUrl, '360'),
    () => saveTubeDownload(videoUrl, '360'),
    () => saveNowDownload(videoUrl, quality),
    () => saveNowDownload(videoUrl, '360')
  ]
  for (const fn of sources) {
    try {
      const result = await Promise.race([fn(), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 22000))])
      if (result?.url) return result
    } catch {}
  }
  throw new Error('جميع مصادر يوتيوب فشلت')
}

async function getYouTubeShorts(query) {
  try {
    const videos = await searchYouTubeStrong(query)
    for (const video of videos.slice(0, 4)) {
      try {
        const result = await downloadYouTubeVideo(video.url, '720')
        if (result?.url) return { url: result.url, title: result.title || video.title }
      } catch {}
    }
  } catch (e) {
    console.error('[getYouTubeShorts]', e.message)
  }
  return null
}

// ════════════════════════════════════════════════
//                 🔘 أزرار القائمة
// ════════════════════════════════════════════════

async function sendEditMenu(conn, m, query, prefix) {
  const choices = [
    ['📌 بينترست Edit', `${prefix}ايديت_بين ${query}`],
    ['🎵 تيك توك Edit', `${prefix}ايديت_تيك ${query}`],
    ['▶️ يوتيوب Shorts', `${prefix}ايديت_يوتيوب ${query}`]
  ]
  const bodyText = `✨ *بحث عن ايديت:* ${query}\n\nاختر المنصة للتحميل الفوري:`
  const footer = '🎬 نظام الإيديت السريع — ⛩️SUKUNA BOT⛩️'

  // 1) lib/buttons.js لو موجود
  if (libButtons?.sendButtons && libButtons?.btn) {
    try {
      await libButtons.sendButtons(conn, m.chat, {
        title: '🎥 Edit Downloader',
        subtitle: query,
        text: bodyText,
        footer,
        image: MENU_IMAGE_URL,
        buttons: choices.map(([label, id]) => libButtons.btn.reply(label, id))
      }, m)
      return
    } catch (e) {
      console.error('[ايديت] lib/buttons فشل:', e.message)
    }
  }

  // 2) native flow بإرسال proto مباشر
  try {
    let header = { title: '🎥 Edit Downloader', hasMediaAttachment: false }
    try {
      const media = await prepareWAMessageMedia({ image: { url: MENU_IMAGE_URL } }, { upload: conn.waUploadToServer })
      header = { title: '🎥 Edit Downloader', hasMediaAttachment: true, imageMessage: media.imageMessage }
    } catch (e) {
      console.error('[ايديت] صورة القائمة:', e.message)
    }

    const interactiveMessage = proto.Message.InteractiveMessage.fromObject({
      body: { text: bodyText },
      footer: { text: footer },
      header,
      nativeFlowMessage: {
        buttons: choices.map(([label, id]) => ({
          name: 'quick_reply',
          buttonParamsJson: JSON.stringify({ display_text: label, id })
        }))
      }
    })

    const msg = generateWAMessageFromContent(
      m.chat,
      {
        viewOnceMessage: {
          message: {
            messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
            interactiveMessage
          }
        }
      },
      { userJid: conn.user?.id || conn.user?.jid }
    )

    const relayOpts = { messageId: msg.key.id }
    if (!m.chat.endsWith('@g.us')) {
      relayOpts.additionalNodes = [
        { tag: 'biz', attrs: {}, content: [{ tag: 'interactive', attrs: { type: 'native_flow', v: '1' }, content: [{ tag: 'native_flow', attrs: { v: '9', name: 'mixed' } }] }] },
        { tag: 'bot', attrs: { biz_bot: '1' } }
      ]
    }
    await conn.relayMessage(m.chat, msg.message, relayOpts)
    return
  } catch (e) {
    console.error('[ايديت] native flow فشل:', e.message)
  }

  // 3) نص عادي
  await conn.sendMessage(m.chat, {
    text: `${bodyText}\n\n${choices.map(([label, id]) => `${label}\n↬ ${id}`).join('\n\n')}${SIGN}`
  })
}

// ════════════════════════════════════════════════
//                 🚀 الهاندلر
// ════════════════════════════════════════════════

let handler = async (m, { conn, text, usedPrefix, command }) => {
  const send = t => conn.sendMessage(m.chat, { text: t })
  const react = async emoji => {
    try { await conn.sendMessage(m.chat, { react: { text: emoji, key: m.key } }) } catch {}
  }
  const query = (text || '').trim()
  const cmd = String(command || '').toLowerCase()

  if (cmd === 'ايديت') {
    if (!query) return send(`🎬 اكتب اسم الشخصية أو الانمي بعد الأمر\nمثال: ${usedPrefix}ايديت زورو` + SIGN)
    await react('🔎')
    return sendEditMenu(conn, m, query, usedPrefix)
  }

  if (!query) return send('❌ اكتب اسم الشخصية أو الانمي.' + SIGN)

  let platformName = ''
  let getter = null
  if (cmd === 'ايديت_بين') { platformName = '📌 بينترست'; getter = getPinterestVideo }
  else if (cmd === 'ايديت_تيك') { platformName = '🎵 تيك توك'; getter = getTikTokVideo }
  else if (cmd === 'ايديت_يوتيوب' || cmd === 'ايديت_يوت') { platformName = '📺 يوتيوب'; getter = getYouTubeShorts }
  else return

  await react('⏳')
  await send(`⏳ *جاري البحث في ${platformName} عن:* ${query}...` + SIGN)

  let result = null
  try {
    result = await getter(query)
  } catch (e) {
    console.error('[ايديت] بحث:', e.message)
  }

  if (!result) {
    await react('❌')
    return send(`❌ فشل تحميل الفيديو من ${platformName}، جرب منصة أخرى.` + SIGN)
  }

  try {
    // بنبعت دايمًا Buffer لـ MP4 متأكد منه (بينترست جاهز، والباقي بننزّله هنا)
    const buffer = result.buffer || await downloadVideoBuffer(result.url)

    const lines = [`✅ *تم التحميل بنجاح*`, platformName, `📌 *العنوان:* ${result.title || query}`]
    if (result.author) lines.push(`👤 ${result.author}`)
    if (result.pinUrl) lines.push(`🔗 ${result.pinUrl}`)

    await conn.sendMessage(m.chat, {
      video: buffer,
      mimetype: 'video/mp4',
      caption: lines.join('\n') + SIGN
    })
    await react('✅')
  } catch (e) {
    console.error('[ايديت] فشل إرسال الفيديو:', e.message)
    await react('❌')
    await send(`❌ لقيت الفيديو لكن فشل تحميله/إرساله (${e.message})، جرب مرة تانية.` + SIGN)
  }
}

handler.help = ['ايديت <بحث>']
handler.tags = ['downloader']
handler.command = /^(ايديت|ايديت_تيك|ايديت_بين|ايديت_يوتيوب|ايديت_يوت)$/i

export default handler