// plugins/edit-all-final.js
// ✧ 𝑺𝑼𝑲𝑼𝑵𝑨 - بحث وتحميل الإيديتات 🎬

const axios = (await import('axios')).default
const cheerio = await import('cheerio')
const { default: yts } = await import('yt-search')
const { default: fetch } = await import('node-fetch')
const { default: crypto } = await import('node:crypto')

const {
  generateWAMessageFromContent,
  prepareWAMessageMedia,
  proto
} = await import('@whiskeysockets/baileys')

// ════════════════════════════════════════════════
//                     ثوابت
// ════════════════════════════════════════════════

const UA =
  'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36'

const SIGN = `

╔════════════════╗
║  𝑺𝑼𝑲𝑼𝑵𝑨 𝑩𝑶𝑻 🔥  ║
╚════════════════╝`

const BOT_CHANNEL_ID =
  '120363413128415519@newsletter'

const BOT_CHANNEL_NAME =
  '𝑺𝑼𝑲𝑼𝑵𝑨✧𝑩𝑶𝑻'

// صورة القائمة
const MENU_IMAGE_URL =
  'https://i.ibb.co/F4CNxTDR/2f5c033d8cb0.jpg'

// ════════════════════════════════════════════════
//              🖼️ دوال بينترست
// ════════════════════════════════════════════════

async function validateVideoUrl(url) {
  if (!url) return false
  if (url.includes('.m3u8')) return false

  try {
    const res = await axios.head(url, {
      headers: { 'user-agent': UA },
      timeout: 8000,
      maxRedirects: 5
    })

    const ct = res.headers['content-type'] || ''
    const cl = parseInt(res.headers['content-length'] || '0')

    return (
      (ct.includes('video') || ct.includes('octet-stream') || url.includes('.mp4')) &&
      cl > 50000
    )
  } catch {
    return false
  }
}

async function fetchPinData(pinId) {
  const res = await axios.get(
    'https://www.pinterest.com/resource/PinResource/get/',
    {
      params: {
        source_url: `/pin/${pinId}/`,
        data: JSON.stringify({
          options: { id: pinId, field_set_key: 'detailed' },
          context: {}
        }),
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
    }
  )

  return res.data?.resource_response?.data
}

function extractVideoUrl(pin) {
  if (!pin) return null

  const MP4_KEYS = ['V_720P', 'V_480P', 'V_360P', 'V_EXP7', 'V_EXP6', 'V_EXP5']

  const vl = pin?.videos?.video_list

  if (vl) {
    for (const q of MP4_KEYS) {
      if (vl[q]?.url && vl[q].url.includes('.mp4')) return vl[q].url
    }
  }

  for (const page of pin?.story_pin_data?.pages || []) {
    for (const block of page?.blocks || []) {
      const bvl = block?.video?.video_list || block?.block?.video?.video_list

      if (bvl) {
        for (const q of MP4_KEYS) {
          if (bvl[q]?.url && bvl[q].url.includes('.mp4')) return bvl[q].url
        }
      }
    }
  }

  if (pin?.video_url && pin.video_url.includes('.mp4')) return pin.video_url

  return null
}

async function fetchPinFromPage(pinId) {
  try {
    const res = await axios.get(`https://www.pinterest.com/pin/${pinId}/`, {
      headers: {
        'user-agent': UA,
        accept: 'text/html',
        'accept-language': 'en-US,en;q=0.9'
      },
      timeout: 12000
    })

    const html = res.data

    const mp4s = [
      ...html.matchAll(/https?:\\?\/\\?\/[^"'\\s<>]+\.mp4[^"'\\s<>]*/g)
    ]
      .map(m => m[0].replace(/\\u002F/g, '/').replace(/\\\//g, '/'))
      .filter(u => u.includes('pinimg.com'))

    if (mp4s.length) return mp4s[0]

    const jm =
      html.match(/<script[^>]*id="PWS_INITIAL_PROPS"[^>]*>([\s\S]*?)<\/script>/) ||
      html.match(/<script[^>]*id="initial-state"[^>]*>([\s\S]*?)<\/script>/)

    if (jm) {
      const um = [...jm[1].matchAll(/"url"\s*:\s*"(https?:[^"]+\.mp4[^"]*)"/g)]

      if (um.length) {
        return um[0][1].replace(/\\u002F/g, '/').replace(/\\\//g, '/')
      }
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

  return {
    token,
    cookie: res.headers['set-cookie']?.join('; ') || ''
  }
}

async function klickpinDownload(pinUrl, csrfToken, cookie) {
  const res = await axios.post(
    'https://klickpin.com/download',
    new URLSearchParams({
      url: pinUrl,
      csrf_token: csrfToken || ''
    }).toString(),
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

    if (
      h.includes('pinimg.com/videos') ||
      h.includes('.mp4') ||
      h.includes('dl.klickpin.com')
    ) {
      links.push({ href: h, quality: $(el).text().trim() })
    }
  })

  for (const match of res.data.matchAll(/https?:\/\/[^\s"'<>]+\.mp4[^\s"'<>]*/g)) {
    links.push({ href: match[0], quality: 'auto' })
  }

  const seen = new Set()

  return links.filter(l => {
    if (seen.has(l.href)) return false
    seen.add(l.href)
    return true
  })
}

async function processPin(pin, csrfToken, cookie) {
  const pinId = pin.id
  const pinUrl = `https://www.pinterest.com/pin/${pinId}/`

  let videoUrl = extractVideoUrl(pin)

  if (!videoUrl) {
    try {
      videoUrl = extractVideoUrl(await fetchPinData(pinId))
    } catch {}
  }

  if (!videoUrl) videoUrl = await fetchPinFromPage(pinId)

  if (!videoUrl && csrfToken) {
    try {
      const links = await klickpinDownload(pinUrl, csrfToken, cookie)
      const mp4s = links.filter(l => l.href.includes('.mp4'))

      videoUrl =
        (
          mp4s.find(l => l.href.includes('720')) ||
          mp4s.find(l => l.href.includes('480')) ||
          mp4s[0]
        )?.href || null
    } catch {}
  }

  if (!videoUrl) return null
  if (!(await validateVideoUrl(videoUrl))) return null

  return {
    url: videoUrl,
    pinUrl,
    title: (pin?.title || pin?.description || '').slice(0, 80)
  }
}

async function searchOnePinterestQuery(query, pages = 5) {
  let allPins = []
  let bookmark = null

  for (let i = 0; i < pages; i++) {
    const options = {
      query,
      scope: 'pins',
      appliedProductFilters: '---',
      auto_correction_disabled: false,
      rs: 'typed',
      redux_normalize_feed: true,
      page_size: 25,
      filters: 'videos'
    }

    if (bookmark) options.bookmarks = [bookmark]

    try {
      const res = await axios.get(
        'https://www.pinterest.com/resource/BaseSearchResource/get/',
        {
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
        }
      )

      const data = res.data?.resource_response?.data

      const videoPins = (data?.results || []).filter(p =>
        p?.videos?.video_list ||
        p?.pin_format === 'video' ||
        p?.story_pin_data?.pages?.some(pg =>
          pg?.blocks?.some(b =>
            b?.video?.video_list || b?.block?.video?.video_list
          )
        )
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
  const queries = [
    `${baseQuery} edit`,
    `${baseQuery} edit video`,
    `${baseQuery} amv edit`
  ]

  const results = await Promise.allSettled(
    queries.map(q => searchOnePinterestQuery(q, 5))
  )

  const allPins = results.flatMap(r => (r.status === 'fulfilled' ? r.value : []))

  const seen = new Set()

  return allPins.filter(p => {
    if (!p?.id || seen.has(p.id)) return false
    seen.add(p.id)
    return true
  })
}

async function getPinterestVideo(query) {
  try {
    const [csrfResult, pinsResult] = await Promise.allSettled([
      getCsrfToken(),
      searchPinterest(query)
    ])

    const csrfToken = csrfResult.status === 'fulfilled' ? csrfResult.value?.token : null
    const cookie = csrfResult.status === 'fulfilled' ? csrfResult.value?.cookie : ''
    const allPins = pinsResult.status === 'fulfilled' ? pinsResult.value : []

    if (!allPins.length) return null

    for (let i = 0; i < Math.min(15, allPins.length); i++) {
      const result = await processPin(allPins[i], csrfToken, cookie)
      if (result) return result
    }
  } catch (e) {
    console.error('[getPinterestVideo]', e.message)
  }

  return null
}

// ════════════════════════════════════════════════
//              🎵 دوال تيكتوك
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

  const pushErr = (tag, e) => {
    try {
      errors.push(`${tag}: ${e?.message ?? String(e)}`)
    } catch {
      errors.push(tag + ': unknown')
    }
  }

  inputUrl = String(inputUrl || '').trim()

  // المصدر 1 - TiklyDown
  try {
    const res = await axios.get(
      `https://api.tiklydown.eu.org/api/download?url=${encodeURIComponent(inputUrl)}`,
      {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 40000,
        validateStatus: () => true
      }
    )

    const d = res.data

    const maybeVideo = d?.video || d?.data?.video || d?.result?.video
    const noWm = maybeVideo?.noWatermark || maybeVideo?.no_wm || maybeVideo?.nowm

    if (noWm && String(noWm).startsWith('http')) {
      return {
        success: true,
        videoUrl: noWm,
        audioUrl: d?.music?.play_url || d?.music?.url || null,
        title: d?.title || d?.data?.title || 'TikTok Video',
        author: d?.author?.unique_id || d?.author?.nickname || 'Unknown',
        source: 'tiklydown'
      }
    }
  } catch (e) {
    pushErr('Tiklydown', e)
  }

  // المصدر 2 - TikWM
  try {
    const res = await axios.post(
      'https://www.tikwm.com/api/',
      new URLSearchParams({ url: inputUrl }).toString(),
      {
        headers: {
          accept: 'application/json',
          'content-type': 'application/x-www-form-urlencoded',
          'user-agent': 'Mozilla/5.0'
        },
        timeout: 40000,
        validateStatus: () => true
      }
    )

    const data = res.data?.data || res.data

    let candidate = data?.hdplay || data?.play || data?.wmplay

    if (candidate && !/^https?:\/\//i.test(candidate)) {
      candidate = candidate.startsWith('//')
        ? 'https:' + candidate
        : 'https://www.tikwm.com' + candidate
    }

    if (candidate?.startsWith('http')) {
      return {
        success: true,
        videoUrl: candidate,
        audioUrl: data?.music || null,
        title: data?.title || 'TikTok Video',
        author: data?.author?.unique_id || 'Unknown',
        source: 'tikwm'
      }
    }
  } catch (e) {
    pushErr('TikWM', e)
  }

  // المصدر 3 - SSSTik
  try {
    const res = await axios({
      method: 'POST',
      url: 'https://ssstik.io/abc',
      data: new URLSearchParams({
        id: inputUrl,
        locale: 'en',
        tt: 'dmVpZEtJ'
      }).toString(),
      headers: {
        accept: '*/*',
        'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
        origin: 'https://ssstik.io',
        referer: 'https://ssstik.io/en',
        'user-agent': 'Mozilla/5.0',
        'hx-request': 'true'
      },
      timeout: 60000,
      validateStatus: () => true
    })

    if (res.status === 200 && res.data) {
      const html = String(res.data)

      const patterns = [
        /href="([^"]+)"[^>]*>\s*(?:تنزيل|Download)[^<]*(?:فيديو|Video)/i,
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

            return {
              success: true,
              videoUrl: vUrl,
              audioUrl: aUrl,
              title: 'TikTok Video',
              author: 'Unknown',
              source: 'ssstik'
            }
          }
        }
      }
    }
  } catch (e) {
    pushErr('ssstik', e)
  }

  // المصدر 4 - TikDD
  try {
    const res = await axios.post(
      'https://tikdd.cc/wp-json/aio-dl/video-data/',
      new URLSearchParams({ url: inputUrl }).toString(),
      {
        headers: {
          accept: '*/*',
          'content-type': 'application/x-www-form-urlencoded',
          origin: 'https://tikdd.cc',
          referer: 'https://tikdd.cc/',
          'user-agent': 'Mozilla/5.0'
        },
        timeout: 40000,
        validateStatus: () => true
      }
    )

    const medias = res.data?.medias || res.data?.data?.medias

    if (Array.isArray(medias) && medias.length) {
      const video =
        medias.find(m => (m.quality || '').toLowerCase().includes('hd')) ||
        medias[0]

      if (video?.url) {
        const vUrl = (await safeAbsoluteUrl(video.url)) || video.url

        if (vUrl?.startsWith('http')) {
          return {
            success: true,
            videoUrl: vUrl,
            audioUrl: null,
            title: 'TikTok Video',
            author: 'Unknown',
            source: 'tikdd'
          }
        }
      }
    }
  } catch (e) {
    pushErr('TikDD', e)
  }

  console.error('[downloadTikTok] All sources failed:', errors)

  return { success: false, errors }
}

async function getTikTokVideo(query) {
  try {
    const res = await axios.post(
      'https://www.tikwm.com/api/feed/search',
      new URLSearchParams({
        keywords: `${query} edit`,
        count: '20',
        cursor: '0',
        hd: '1'
      }).toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': UA
        },
        timeout: 30000
      }
    )

    const videos = res.data?.data?.videos || []

    if (!videos.length) return null

    for (const vid of videos.slice(0, 8)) {
      let candidate = vid.hdplay || vid.play

      if (!candidate) continue

      if (!/^https?:\/\//i.test(candidate)) {
        candidate = candidate.startsWith('//') ? 'https:' + candidate : null
      }

      if (candidate) {
        return {
          url: candidate,
          title: (vid.title || vid.desc || query).slice(0, 80),
          author: vid.author?.unique_id || vid.author?.nickname || 'TikTok'
        }
      }
    }

    for (const vid of videos.slice(0, 5)) {
      let videoPageUrl = null

      if (vid.video_id && vid.author?.unique_id) {
        videoPageUrl = `https://www.tiktok.com/@${vid.author.unique_id}/video/${vid.video_id}`
      } else {
        videoPageUrl = vid.share_url || vid.origin_url || vid.url || ''
      }

      if (!videoPageUrl) continue

      const result = await downloadTikTok(videoPageUrl)

      if (result?.success && result.videoUrl) {
        return {
          url: result.videoUrl,
          title: result.title || query,
          author: result.author
        }
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
  const iv = b.subarray(0, 16)
  const data = b.subarray(16)

  const d = crypto.createDecipheriv('aes-128-cbc', ANU_KEY, iv)

  return JSON.parse(Buffer.concat([d.update(data), d.final()]).toString())
}

async function saveTubeDownload(url, quality = '360') {
  const cdnRes = await axios.get('https://media.savetube.me/api/random-cdn', {
    timeout: 10000
  })

  const cdn = cdnRes.data?.cdn

  if (!cdn) throw new Error('no CDN')

  const info = await axios.post(
    `https://${cdn}/v2/info`,
    { url },
    {
      headers: {
        'Content-Type': 'application/json',
        origin: 'https://ytsave.savetube.me',
        referer: 'https://ytsave.savetube.me/'
      },
      timeout: 15000
    }
  )

  if (!info.data?.status) throw new Error('invalid info')

  const json = decryptSaveTube(info.data.data)

  const r = await axios.post(
    `https://${cdn}/download`,
    {
      id: json.id,
      key: json.key,
      downloadType: 'video',
      quality: String(quality)
    },
    {
      headers: {
        'Content-Type': 'application/json',
        origin: 'https://ytsave.savetube.me',
        referer: 'https://ytsave.savetube.me/'
      },
      timeout: 20000
    }
  )

  const downloadUrl = r.data?.data?.downloadUrl

  if (!downloadUrl) throw new Error('no url')

  return { url: downloadUrl, title: json.title || 'video' }
}

async function vidsSaveDownload(url, quality = '360') {
  const res = await axios.post(
    'https://api.vidssave.com/api/contentsite_api/media/parse',
    new URLSearchParams({
      auth: '20250901majwlqo',
      domain: 'api-ak.vidssave.com',
      origin: 'cache',
      link: url
    }).toString(),
    {
      headers: {
        'user-agent': 'Mozilla/5.0',
        'content-type': 'application/x-www-form-urlencoded',
        origin: 'https://vidssave.com',
        referer: 'https://vidssave.com/'
      },
      timeout: 15000
    }
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

  const init = await fetch(
    `https://p.savenow.to/ajax/download.php?copyright=0&format=${format}&url=${encodeURIComponent(url)}&api=${key}`,
    {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        Referer: 'https://y2down.cc/'
      },
      timeout: 15000
    }
  )

  const data = await init.json()

  if (!data.id && !data.success) throw new Error('init failed')

  const id = data.id || data?.data?.id

  if (!id) throw new Error('no download id')

  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 2000))

    const prog = await fetch(
      `https://p.savenow.to/api/progress?id=${encodeURIComponent(id)}`,
      { timeout: 10000 }
    )

    const st = await prog.json()

    if ((st.progress === 1000 || st.progress >= 100) && st.download_url) {
      return { url: st.download_url, title: data.title || 'video' }
    }
  }

  throw new Error('timeout')
}

async function searchYouTubeStrong(query) {
  try {
    const r = await yts({ query: `${query} edit`, pages: 2 })
    const videos = (r.videos || []).filter(v => v.duration?.seconds < 300)
    if (videos.length) return videos[0]
  } catch {}

  try {
    const r = await yts(query + ' amv edit')
    const videos = (r.videos || []).filter(v => v.duration?.seconds < 300)
    if (videos.length) return videos[0]
  } catch {}

  return null
}

async function getYouTubeVideo(query) {
  const yt = await searchYouTubeStrong(query)
  if (!yt) return null

  const ytUrl = yt.url || yt.link || `https://www.youtube.com/watch?v=${yt.videoId}`

  const qualities = ['360', '480', '720']

  for (const q of qualities) {
    try {
      const result = await saveTubeDownload(ytUrl, q)
      if (result?.url) return { url: result.url, title: result.title || yt.title }
    } catch {}
  }

  for (const q of qualities) {
    try {
      const result = await vidsSaveDownload(ytUrl, q)
      if (result?.url) return { url: result.url, title: result.title || yt.title }
    } catch {}
  }

  for (const fmt of qualities) {
    try {
      const result = await saveNowDownload(ytUrl, fmt)
      if (result?.url) return { url: result.url, title: result.title || yt.title }
    } catch {}
  }

  return null
}

// ════════════════════════════════════════════════
//          🎬 الدالة الرئيسية للبحث
// ════════════════════════════════════════════════

async function searchEditVideo(query) {
  const sources = [
    { name: 'Pinterest', fn: () => getPinterestVideo(query) },
    { name: 'TikTok',    fn: () => getTikTokVideo(query) },
    { name: 'YouTube',   fn: () => getYouTubeVideo(query) }
  ]

  for (const src of sources) {
    try {
      const result = await src.fn()
      if (result?.url) {
        return { ...result, source: src.name }
      }
    } catch (e) {
      console.error(`[searchEditVideo] ${src.name} failed:`, e.message)
    }
  }

  return null
}

// ════════════════════════════════════════════════
//           📋 قائمة الأوامر
// ════════════════════════════════════════════════

async function sendMenu(m, conn) {
  const menuText = `
╔══════════════════════╗
║   🎬 *بوت الإيديتات*   ║
╚══════════════════════╝

*الأوامر المتاحة:*

🔍 *.ايديت [اسم]*
  ← بحث عن إيديت وإرساله

📥 *.تيكتوك [رابط]*
  ← تحميل فيديو تيكتوك

📥 *.بينترست [رابط]*
  ← تحميل فيديو بينترست

📥 *.يوتيوب [رابط]*
  ← تحميل فيديو يوتيوب

❓ *.ايديت مساعدة*
  ← عرض هذه القائمة
${SIGN}`.trim()

  try {
    await conn.sendMessage(m.chat, {
      image: { url: MENU_IMAGE_URL },
      caption: menuText
    }, { quoted: m })
  } catch {
    await conn.sendMessage(m.chat, { text: menuText }, { quoted: m })
  }
}

// ════════════════════════════════════════════════
//          📥 تحميل من رابط مباشر
// ════════════════════════════════════════════════

async function handleDirectDownload(m, conn, platform, url) {
  const loading = await conn.sendMessage(m.chat, {
    text: `⏳ جاري تحميل الفيديو من ${platform}...`
  }, { quoted: m })

  try {
    let result = null

    if (platform === 'تيكتوك') {
      const dl = await downloadTikTok(url)
      if (dl?.success && dl.videoUrl) {
        result = { url: dl.videoUrl, title: dl.title || 'TikTok Video' }
      }
    } else if (platform === 'بينترست') {
      const pinMatch = url.match(/\/pin\/(\d+)/)
      if (pinMatch) {
        const pin = await fetchPinData(pinMatch[1])
        const videoUrl = extractVideoUrl(pin) || await fetchPinFromPage(pinMatch[1])
        if (videoUrl) result = { url: videoUrl, title: 'Pinterest Video' }
      }
    } else if (platform === 'يوتيوب') {
      for (const q of ['360', '480', '720']) {
        try {
          const r = await saveTubeDownload(url, q)
          if (r?.url) { result = r; break }
        } catch {}
      }
      if (!result) {
        for (const q of ['360', '480']) {
          try {
            const r = await vidsSaveDownload(url, q)
            if (r?.url) { result = r; break }
          } catch {}
        }
      }
    }

    if (!result?.url) {
      return conn.sendMessage(m.chat, {
        text: `❌ فشل تحميل الفيديو من ${platform}!\nتأكد من الرابط وحاول مجدداً.`
      }, { quoted: m })
    }

    await conn.sendMessage(m.chat, {
      video: { url: result.url },
      caption: `✅ *${result.title || platform}*${SIGN}`,
      mimetype: 'video/mp4'
    }, { quoted: m })

  } catch (e) {
    console.error(`[handleDirectDownload] ${platform}:`, e.message)
    await conn.sendMessage(m.chat, {
      text: `❌ حدث خطأ أثناء التحميل!\n${e.message}`
    }, { quoted: m })
  }
}

// ════════════════════════════════════════════════
//              🤖 الهاندلر الرئيسي
// ════════════════════════════════════════════════

const handler = async (m, { conn }) => {
  const text = (m.text || '').trim()

  // قائمة المساعدة
  if (/^[.!#\/\\]ايديت\s+مساعدة$/i.test(text)) {
    return sendMenu(m, conn)
  }

  // تحميل من روابط مباشرة
  const tikMatch   = text.match(/^[.!#\/\\]تيكتوك\s+(https?:\/\/\S+)/i)
  const pinMatch   = text.match(/^[.!#\/\\]بينترست\s+(https?:\/\/\S+)/i)
  const ytMatch    = text.match(/^[.!#\/\\]يوتيوب\s+(https?:\/\/\S+)/i)

  if (tikMatch)   return handleDirectDownload(m, conn, 'تيكتوك',    tikMatch[1])
  if (pinMatch)   return handleDirectDownload(m, conn, 'بينترست',   pinMatch[1])
  if (ytMatch)    return handleDirectDownload(m, conn, 'يوتيوب',    ytMatch[1])

  // بحث عن إيديت
  const searchMatch = text.match(/^[.!#\/\\]ايديت\s+(.+)$/i)
  if (!searchMatch) return

  const query = searchMatch[1].trim()
  if (!query) return m.reply('❌ اكتب اسم الشخصية!\nمثال: .ايديت ناروتو')

  // رسالة انتظار
  const waitMsg = `
🔍 *جاري البحث عن إيديت...*

🎯 الاستعلام: *${query}*
⏳ قد يستغرق بعض الوقت...

📡 جاري البحث في:
• Pinterest 🖼️
• TikTok 🎵
• YouTube 📺
  `.trim()

  await conn.sendMessage(m.chat, { text: waitMsg }, { quoted: m })

  const result = await searchEditVideo(query)

  if (!result?.url) {
    return conn.sendMessage(m.chat, {
      text: `❌ *لم يتم العثور على إيديت لـ: ${query}*\n\nجرب:\n• اسم مختلف\n• اسم بالإنجليزي\n• كلمة أكثر تحديداً${SIGN}`
    }, { quoted: m })
  }

  const caption = `
🎬 *${result.title || query}*

📡 المصدر: ${result.source}
${result.author ? `👤 صاحب الإيديت: ${result.author}` : ''}
${SIGN}`.trim()

  try {
    await conn.sendMessage(m.chat, {
      video: { url: result.url },
      caption,
      mimetype: 'video/mp4'
    }, { quoted: m })
  } catch (e) {
    console.error('[handler] send video error:', e.message)
    await conn.sendMessage(m.chat, {
      text: `❌ تعذر إرسال الفيديو!\n${caption}`
    }, { quoted: m })
  }
}

handler.command = /^(ايديت|تيكتوك|بينترست|يوتيوب)(\s+.*)?$/i

export default handler