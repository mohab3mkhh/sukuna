/**
 * plugins/تيكتوك.js
 * بحث في تيكتوك عبر /search/tiktoksearch مع معالجة خطأ 403 من المصدر وإرسال الفيديو
 */

import axios from 'axios'
import { sendButtons, btn, getButtonId } from '../lib/buttons.js'

const SEARCH_ENDPOINT = 'https://prexzyapis.com/search/tiktoksearch'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const PREFIX = 'tt_'

if (!global.ttSearchCache) global.ttSearchCache = new Map()

const genId = () => Math.random().toString(36).slice(2, 10)
const react = async (conn, m, emoji) => {
  try { await conn.sendMessage(m.chat, { react: { text: emoji, key: m.key } }) } catch {}
}

function normalizeTikTokItems(payload) {
  const rawList =
    (Array.isArray(payload?.data?.videos) && payload.data.videos) ||
    (Array.isArray(payload?.data?.aweme_list) && payload.data.aweme_list) ||
    (Array.isArray(payload?.data) && payload.data) ||
    (Array.isArray(payload?.result) && payload.result) ||
    (Array.isArray(payload?.results) && payload.results) ||
    []

  return rawList.slice(0, 10).map((v, idx) => {
    const videoUrl = String(
      v?.play ||
      v?.wmplay ||
      v?.hdplay ||
      v?.video?.play_addr?.url_list?.[0] ||
      v?.videoUrl ||
      v?.url ||
      ''
    ).trim()

    const coverUrl = String(
      v?.cover ||
      v?.origin_cover ||
      v?.ai_dynamic_cover ||
      v?.video?.cover?.url_list?.[0] ||
      v?.thumbnail ||
      ''
    ).trim()

    const author = String(
      v?.author?.nickname ||
      v?.author?.unique_id ||
      v?.author ||
      v?.nickname ||
      'غير معروف'
    ).trim()

    const title = String(
      v?.title ||
      v?.desc ||
      `فيديو تيكتوك ${idx + 1}`
    ).trim()

    return {
      title,
      author,
      videoUrl,
      coverUrl
    }
  }).filter(item => item.videoUrl || item.title)
}

async function searchTikTok(query) {
  const res = await axios.get(SEARCH_ENDPOINT, {
    params: { q: query },
    timeout: 25000,
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    validateStatus: () => true
  })

  if (res.status >= 400) {
    throw new Error(`HTTP ${res.status}`)
  }

  const body = res.data || {}
  if (body?.data?.name === 'AxiosError' || body?.data?.status === 403 || body?.data?.code === 'ERR_BAD_REQUEST') {
    throw new Error('المصدر حظر الطلب (403 Forbidden من tikwm حاليًا)')
  }

  return normalizeTikTokItems(body)
}

async function getThumbBuffer(url) {
  if (!url || !/^https?:\/\//i.test(url)) return null
  try {
    const r = await axios.get(url, {
      headers: { 'User-Agent': UA },
      responseType: 'arraybuffer',
      timeout: 15000,
      validateStatus: () => true
    })
    if (r.status < 400 && r.data?.length > 1000) return Buffer.from(r.data)
  } catch {}
  return null
}

let before = async (m, { conn }) => {
  try {
    const buttonId = getButtonId(m)
    if (!buttonId || !buttonId.startsWith(PREFIX)) return false

    const item = global.ttSearchCache.get(buttonId.slice(PREFIX.length))
    if (!item) return false
    global.ttSearchCache.delete(buttonId.slice(PREFIX.length))

    await react(conn, m, '⏳')
    const wait = await m.reply(`⏳ *جاري إرسال الفيديو:*\n${item.title.slice(0, 60)}`)

    try {
      if (!item.videoUrl || !/^https?:\/\//i.test(item.videoUrl)) {
        throw new Error('لا يوجد رابط فيديو متاح لهذه النتيجة')
      }

      const vidRes = await axios.get(item.videoUrl, {
        responseType: 'arraybuffer',
        timeout: 120000,
        headers: { 'User-Agent': UA, Referer: 'https://www.tiktok.com/' },
        validateStatus: () => true
      })

      if (vidRes.status >= 400 || !vidRes.data || vidRes.data.length < 10000) {
        throw new Error(`تعذر تحميل الفيديو (HTTP ${vidRes.status})`)
      }

      try { await conn.sendMessage(m.chat, { delete: wait.key }) } catch {}

      await conn.sendMessage(m.chat, {
        video: Buffer.from(vidRes.data),
        mimetype: 'video/mp4',
        caption: `🎵 *العنوان:* ${item.title}\n👤 *الناشر:* ${item.author}`
      }, { quoted: m })

      await react(conn, m, '✅')
    } catch (e) {
      try { await conn.sendMessage(m.chat, { delete: wait.key }) } catch {}
      await react(conn, m, '❌')
      await m.reply(`❌ *تعذر إرسال الفيديو:*\n${e.message}`)
    }
    return true
  } catch (e) {
    console.error('[تيكتوك] before:', e.message)
    return false
  }
}

let handler = async (m, { conn, text, usedPrefix, command }) => {
  const query = (text || '').trim()
  if (!query) {
    return m.reply(`🎵 *بحث تيكتوك*\n\nاكتب كلمة البحث\n💡 مثال: ${usedPrefix}${command} تصميم انمي`)
  }

  await react(conn, m, '🔍')

  try {
    const items = await searchTikTok(query)
    if (!items.length) {
      await react(conn, m, '❌')
      return m.reply('❌ لا توجد نتائج متاحة حالياً.')
    }

    const rows = items.map((v, i) => {
      const id = genId()
      global.ttSearchCache.set(id, { ...v, createdAt: Date.now() })
      return {
        title: `${i + 1}. ${v.title.slice(0, 50)}`,
        description: `👤 ${v.author.slice(0, 60)}`,
        id: `${PREFIX}${id}`
      }
    })

    const thumb = await getThumbBuffer(items[0].coverUrl)

    await sendButtons(conn, m.chat, {
      title: '🎵 TikTok Search',
      subtitle: query,
      text: `✅ *تم البحث*\n\n🔍 *الكلمة:* ${query}\n📊 *النتائج:* ${items.length}\n\n👇 اختر فيديو من القائمة:`,
      footer: '⛩️ SUKUNA BOT',
      ...(thumb ? { image: thumb } : {}),
      buttons: [btn.list('🎬 عرض النتائج', [{ title: 'النتائج', rows }])]
    }, m)

    await react(conn, m, '✅')
  } catch (e) {
    console.error('[تيكتوك] search:', e.message)
    await react(conn, m, '❌')
    await m.reply(`❌ *فشل البحث في تيكتوك:*\n${e.message}`)
  }
}

if (global.ttCleanup) clearInterval(global.ttCleanup)
global.ttCleanup = setInterval(() => {
  const now = Date.now()
  for (const [k, v] of global.ttSearchCache.entries()) {
    if (now - v.createdAt > 30 * 60 * 1000) global.ttSearchCache.delete(k)
  }
}, 5 * 60 * 1000)

handler.before = before
handler.help = ['تيكتوك <كلمة البحث>']
handler.tags = ['search']
handler.command = /^(تيكتوك|tiktok|ttsearch)$/i

export default handler