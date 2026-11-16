import axios from 'axios'

const CHANNEL_LINK = 'https://whatsapp.com/channel/0029VbBilcVAO7RNV5OlOI0j'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
const MAX_BYTES = 60 * 1024 * 1024

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

// ━━━ 2) مصادر التحميل ━━━

// cobalt.tools — بيشتغل بدون cookies
async function cobaltSource(video) {
  const r = await axios.post('https://cobalt.tools/api/json', {
    url: video.url,
    aFormat: 'mp3',
    isAudioOnly: true
  }, {
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': UA
    },
    timeout: 30000
  })
  const url = r.data?.url
  if (!url) throw new Error('cobalt: no url — ' + JSON.stringify(r.data).slice(0, 100))
  return { name: 'cobalt', url, mimetype: 'audio/mpeg' }
}

// y2mate API
async function y2mateSource(video) {
  const r1 = await axios.post('https://www.y2mate.com/mates/analyzeV2/ajax',
    new URLSearchParams({ k_query: video.url, k_page: 'home', hl: 'en', q_auto: '0' }),
    { headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 20000 }
  )
  const links = r1.data?.links?.mp3
  if (!links) throw new Error('y2mate: no mp3 links')
  const best = Object.values(links).find(x => x?.f === 'mp3') || Object.values(links)[0]
  if (!best?.k) throw new Error('y2mate: no key')

  const r2 = await axios.post('https://www.y2mate.com/mates/convertV2/index',
    new URLSearchParams({ vid: video.id, k: best.k }),
    { headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 20000 }
  )
  const url = r2.data?.dlink
  if (!url) throw new Error('y2mate: no dlink')
  return { name: 'y2mate', url, mimetype: 'audio/mpeg' }
}

// yt1s.com
async function yt1sSource(video) {
  const r1 = await axios.post('https://yt1s.com/api/ajaxSearch/index',
    new URLSearchParams({ q: video.url, vt: 'mp3' }),
    { headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 20000 }
  )
  const links = r1.data?.links?.mp3
  if (!links) throw new Error('yt1s: no mp3 links')
  const best = Object.values(links)[0]
  if (!best?.k) throw new Error('yt1s: no key')

  const r2 = await axios.post('https://yt1s.com/api/ajaxConvert/convert',
    new URLSearchParams({ vid: video.id, k: best.k }),
    { headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 30000 }
  )
  const url = r2.data?.dlink
  if (!url) throw new Error('yt1s: no dlink')
  return { name: 'yt1s', url, mimetype: 'audio/mpeg' }
}

// musicdownloader.bot
async function musicDlSource(video) {
  const r = await axios.get(
    `https://musicdownloader.bot/api/download?url=${encodeURIComponent(video.url)}`,
    { headers: { 'User-Agent': UA }, timeout: 30000 }
  )
  const url = r.data?.url || r.data?.download_url || r.data?.link
  if (!url) throw new Error('musicdl: no url')
  return { name: 'musicdl', url, mimetype: 'audio/mpeg' }
}

// agatz
async function agatzSource(video) {
  const r = await axios.get(
    `https://api.agatz.xyz/api/ytmp3?url=${encodeURIComponent(video.url)}`,
    { headers: { 'User-Agent': UA }, timeout: 25000 }
  )
  const url = r.data?.download || r.data?.url || r.data?.data?.download
  if (!url) throw new Error('agatz: no url — ' + JSON.stringify(r.data).slice(0, 100))
  return { name: 'agatz', url, mimetype: 'audio/mpeg' }
}

async function getAudio(video) {
  const sources = [cobaltSource, y2mateSource, yt1sSource, agatzSource, musicDlSource]

  for (const srcFn of sources) {
    try {
      const res = await srcFn(video)
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
      fileName: `${safeName}.${audio.mimetype === 'audio/mpeg' ? 'mp3' : 'm4a'}`,
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