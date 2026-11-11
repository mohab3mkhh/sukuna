import axios from 'axios'
import pkg from '@whiskeysockets/baileys'
const { generateWAMessageFromContent, prepareWAMessageMedia } = pkg
const THUMBNAIL_URL = 'https://i.postimg.cc/LY76JmYd/upload-1780503470117.jpg'
const SYSTEM_NAME   = '◜⏤͟͟͞͞ 𝙂𝙊𝙅𝙊 ✦ 𝙔𝙊𝙐𝙏𝙐𝘽𝙀 ˖࣪⃟♦️ ◞'

function gojoStyle(title, lines = []) {
  const top = `╔════ ≪ ━ ─ ❪ 🔱 ${title} 🔱 ❫ ─ ━ ≫ ════╗\n║ ✧ ━━━━━ ❪ 𝐆 𝐎 𝐉 𝐎 ♱ 𝐁 𝐎 𝐓 ❫ ━━━━━ ✧ ║\n╚════ ≪ ━ ─ ❪ ♾️ 𝐈 𝐍 𝐅 𝐈 𝐍 𝐈 𝐓 𝐘 ♾️ ❫ ─ ━ ≫ ════╝\n⋮\n`
  const mid = lines.map(l => `╟「 👁️‍🗨️ 」↬ ${l}`).join('\n')
  const bot = `\n⋮\n╰─── ≪ ━ ─ ❪ 🔱 ❪ ♾️ ❫ 🔱 ❫ ─ ━ ≫ ───╯\n${SYSTEM_NAME}`
  return top + mid + bot
}

async function searchYouTube(query, maxResults = 20) {
  const payload = {
    query,
    context: {
      client: {
        clientName: 'WEB',
        clientVersion: '2.20260603.00.00',
        hl: 'ar',
        gl: 'EG',
        platform: 'MOBILE',
        osName: 'Android',
        osVersion: '10',
        deviceModel: 'android 10.0'
      }
    }
  }

  const { data } = await axios.post(
    'https://www.youtube.com/youtubei/v1/search?prettyPrint=false',
    payload,
    {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36',
        'Accept': '*/*',
        'Accept-Language': 'ar,en-GB;q=0.9,en-US;q=0.8,en;q=0.7',
        'Origin': 'https://www.youtube.com',
        'Referer': 'https://www.youtube.com/',
        'x-youtube-client-name': '1',
        'x-youtube-client-version': '2.20260603.00.00',
        'x-youtube-bootstrap-logged-in': 'false',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'same-origin',
        'sec-fetch-site': 'same-origin'
      },
      timeout: 15000
    }
  )

  const sectionContents =
    data?.contents
      ?.twoColumnSearchResultsRenderer
      ?.primaryContents
      ?.sectionListRenderer
      ?.contents ?? []

  let items = []
  for (const section of sectionContents) {
    const rows = section?.itemSectionRenderer?.contents
    if (rows?.length) { items = rows; break }
  }

  const videos = []
  for (const item of items) {
    const vr = item?.videoRenderer
    if (!vr?.videoId) continue
    videos.push({
      videoId  : vr.videoId,
      title    : vr.title?.runs?.[0]?.text ?? 'بدون عنوان',
      url      : `https://www.youtube.com/watch?v=${vr.videoId}`,
      timestamp: vr.lengthText?.simpleText ?? 'N/A',
      views    : vr.viewCountText?.simpleText ?? 'N/A',
      channel  : vr.ownerText?.runs?.[0]?.text ?? 'N/A'
    })
    if (videos.length >= maxResults) break
  }

  return videos
}

let handler = async (m, { conn, usedPrefix, command, text }) => {
  try {
    const query = (text || '').trim()

    if (!query) {
      return m.reply(gojoStyle('𝐒 𝐄 𝐀 𝐑 𝐂 𝐇', [
        `اكْتُبْ اسْمَ الفِيدْيُو بَعْدَ الأَمْر`,
        `مِثَال: ${usedPrefix}${command} Infinito gojo`
      ]))
    }

    await m.react('🔎')

    const results = await searchYouTube(query, 20).catch(e => {
      console.error('[يوت_بحث]', e.message)
      return []
    })

    if (!results.length) {
      await m.react('❌')
      return m.reply(gojoStyle('𝐒 𝐄 𝐀 𝐑 𝐂 𝐇', [
        `❌ لَمْ يُعْثَرْ عَلَى نَتَائِجَ لـ: ${query}`,
        'حَاوِلْ مُجَدَّداً بِكَلِمَاتٍ مُخْتَلِفَة'
      ]))
    }

    const captionText = gojoStyle('𝐘 𝐎 𝐔 𝐓 𝐔 𝐁 𝐄  𝐒 𝐄 𝐀 𝐑 𝐂 𝐇', [
      `نَتَائِجُ البَحْثِ عَن: ${query}`,
      `عَدَدُ النَّتَائِج: ${results.length}`,
      `اضْغَطْ عَلَى أَيِّ فِيدْيُو لِرُؤْيَةِ رَابِطِه`
    ])

    const listRows = results.map((v, i) => {
      const shortTitle = v.title.length > 50 ? v.title.slice(0, 50) + '…' : v.title
      return {
        title: `${i + 1}. ${shortTitle}`,
        description: `⏱️ ${v.timestamp}  |  👁️ ${v.views}  |  📺 ${v.channel}`,
        id: v.url
      }
    })

    const fstatus = {
      key: { fromMe: false, participant: `0@s.whatsapp.net`, remoteJid: 'status@broadcast' },
      message: { imageMessage: { caption: SYSTEM_NAME, jpegThumbnail: '' } }
    }

    const { imageMessage } = await prepareWAMessageMedia(
      { image: { url: THUMBNAIL_URL } },
      { upload: conn.waUploadToServer }
    ).catch(() => ({ imageMessage: null }))

    const msg = generateWAMessageFromContent(m.chat, {
      viewOnceMessage: {
        message: {
          interactiveMessage: {
            body: { text: captionText },
            footer: { text: '〚🔍〛 ⤏ 𝕴 𝕬𝖑𝖔𝖓𝖊 𝕬𝖒 𝕿𝖍𝖊 𝕳𝖔𝖓𝖔𝖗𝖊𝖉 𝕺𝖓𝖊' },
            header: imageMessage ? { hasMediaAttachment: true, imageMessage } : { hasMediaAttachment: false },
            nativeFlowMessage: {
              buttons: [{
                name: 'single_select',
                buttonParamsJson: JSON.stringify({
                  title: '👁️‍🗨️ قَائِمَةُ النَّتَائِج 👁️‍🗨️',
                  sections: [{
                    title: '✨ اخْتَرْ فِيدْيُو لِرُؤْيَةِ رَابِطِه',
                    rows: listRows
                  }]
                })
              }]
            }
          }
        }
      }
    }, { quoted: fstatus })

    try {
      await conn.relayMessage(m.chat, msg.message, { messageId: msg.key.id })
      await m.react('✅')
    } catch (_) {
      let fallback = captionText + '\n\n'
      results.forEach((v, i) => {
        fallback += `*${i + 1}. ${v.title}*\n`
        fallback += `⏱️ ${v.timestamp}  |  👁️ ${v.views}\n`
        fallback += `📺 ${v.channel}\n`
        fallback += `🔗 ${v.url}\n\n`
      })
      await conn.sendMessage(m.chat, { image: { url: THUMBNAIL_URL }, caption: fallback }, { quoted: fstatus })
      await m.react('✅')
    }

  } catch (err) {
    console.error('[يوت_بحث]', err)
    await m.react('❌')
    return m.reply('❌ حَدَثَ خَطَأٌ فِي النِّظَامِ الدَّاخِلِي.')
  }
}

handler.command = /^(يوت_بحث|ytsearch|yt)$/i
handler.tags    = ['تحميل']
handler.help    = ['يوت_بحث <اسم الفيديو>']
export default handler