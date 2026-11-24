/**
 * plugins/تيك-ساوند.js
 * جلب ساوندات من تيك توك (بلينك أو بكلمات بحث) وإرسالها كصوت
 * أمثلة:
 *   .تيك-ساوند funk da montanha        (أول نتيجة)
 *   .تيك-ساوند 3 funk da montanha      (النتيجة رقم 3 من 5)
 *   .تيك-ساوند https://vm.tiktok.com/xxxx
 */

import axios from 'axios'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
const MAX_MB = 30
const HEADERS = { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' }

const log = (...a) => console.log('[تيك-ساوند]', ...a)
const errLog = (msg) => console.error('[تيك-ساوند:ERR]', String(msg || '').slice(0, 240))

async function getSoundFromLink(link) {
  const r = await axios.post(
    'https://www.tikwm.com/api/',
    new URLSearchParams({ url: link, hd: '1' }).toString(),
    { headers: HEADERS, timeout: 20000 }
  )
  const d = r.data?.data
  const url = d?.music_info?.play || d?.music
  if (!url) throw new Error(r.data?.msg || 'لم يتم العثور على صوت في اللينك')
  return {
    url,
    title: d?.music_info?.title || d?.title || 'TikTok Sound',
    author: d?.music_info?.author || d?.author?.nickname || ''
  }
}

async function searchSound(query, index = 1) {
  const r = await axios.post(
    'https://www.tikwm.com/api/feed/search',
    new URLSearchParams({ keywords: query, count: '10', cursor: '0', HD: '1' }).toString(),
    { headers: HEADERS, timeout: 20000 }
  )
  const vids = (r.data?.data?.videos || []).filter(v => v?.music_info?.play || v?.music)
  if (!vids.length) throw new Error(r.data?.msg || 'لا توجد نتائج')
  const v = vids[Math.min(index, vids.length) - 1]
  return {
    url: v.music_info?.play || v.music,
    title: v.music_info?.title || v.title || query,
    author: v.music_info?.author || v.author?.nickname || ''
  }
}

async function downloadAudio(url) {
  const d = await axios.get(url, {
    headers: { 'User-Agent': UA, Referer: 'https://www.tiktok.com/' },
    responseType: 'arraybuffer',
    timeout: 60000,
    maxContentLength: MAX_MB * 1024 * 1024,
    validateStatus: () => true
  })
  if (d.status !== 200 || !d.data || d.data.length < 5 * 1024) throw new Error('فشل تحميل الصوت')
  return Buffer.from(d.data)
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

    let sound
    if (/tiktok\.com/i.test(input)) {
      sound = await getSoundFromLink(input.match(/https?:\/\/\S+/)?.[0] || input)
    } else {
      let index = 1
      const mm = input.match(/^(\d{1,2})\s+(.+)$/s)
      if (mm) { index = Number(mm[1]); input = mm[2].trim() }
      sound = await searchSound(input, index)
    }

    const buf = await downloadAudio(sound.url)

    await conn.sendMessage(
      m.chat,
      {
        audio: buf,
        mimetype: 'audio/mpeg',
        ptt: false,
        fileName: `${sound.title}.mp3`
      },
      { quoted: m }
    )
    await m.reply(`🎶 *${sound.title}*${sound.author ? `\n👤 ${sound.author}` : ''}`)
    log('✅ تم الإرسال:', sound.title)
  } catch (err) {
    errLog(err?.message || err)
    try { await m.reply(`❌ *خطأ:* ${String(err?.message || err).slice(0, 180)}`) } catch {}
  }
}

handler.help = ['تيك-ساوند <اسم أو لينك>']
handler.tags = ['downloader']
handler.command = /^(تيك-ساوند|تيك_ساوند|تيكساوند|tiktoksound)$/i

export default handler