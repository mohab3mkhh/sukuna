// plugins/يوتيوب_بحث.js
// 📺 معلومات قناة يوتيوب عن طريق Prexzy API (ytstalk)
//   .قناة <اليوزر>      (أو .ytstalk / .ytchannel)   مثال: .قناة @mohabhita

import axios from 'axios'

const API = 'https://prexzyapis.com/stalk/ytstalk'
const FOOTER = '⛩️ SUKUNA BOT ⛩️'

// اسم البارامتر مش مؤكد، بنجرّب أكتر من اسم لحد ما واحد يشتغل
const PARAM_NAMES = [process.env.YTSTALK_PARAM, 'username', 'user', 'q', 'name', 'query'].filter(Boolean)

async function stalk(user) {
  let lastErr = 'مفيش رد'
  for (const key of PARAM_NAMES) {
    try {
      const r = await axios.get(API, { params: { [key]: user }, timeout: 25000, validateStatus: () => true })
      const d = r.data
      if (d?.status && d?.data?.name) return d.data
      lastErr = d?.message || d?.error || `HTTP ${r.status}`
      console.log(`[قناة] ${key} ->`, JSON.stringify(d).slice(0, 200))
      if (r.status === 429) break
    } catch (e) { lastErr = e.message }
  }
  throw new Error(lastErr)
}

const handler = async (m, { conn, args, usedPrefix = '.', command }) => {
  const reply = text => conn.sendMessage(m.chat, { text }, { quoted: m })
  let user = String((args || [])[0] || '').trim()
  if (!user) return reply(`📺 *معلومات قناة يوتيوب*\n\nاكتب:\n*${usedPrefix}${command} @اليوزر*\n\nمثال:\n*${usedPrefix}${command} @mohabhita*\n\n> ${FOOTER}`)

  const mt = user.match(/youtube\.com\/(@[\w.-]+)/i)
  if (mt) user = mt[1]
  if (!/^@?[\w.-]{2,60}$/.test(user)) return reply('❌ اليوزر غير صحيح.')
  user = user.replace(/^@/, '')

  try { await m.react?.('⏳') } catch {}
  try {
    const c = await stalk(user)
    const vids = (c.videos || []).slice(0, 5).map((v, i) => `   ${i + 1}. ${v}`).join('\n')
    const subs = c.subscribers != null ? Number(c.subscribers).toLocaleString('en-US') : 'مخفي / غير متاح'
    const caption =
`📺 *قناة يوتيوب*

👤 *الاسم:* ${c.name}
🔖 *اليوزر:* ${c.username || '@' + user}
👥 *المشتركين:* ${subs}
🆔 *ID:* ${c.channelId || '—'}
📝 *الوصف:* ${c.description ? String(c.description).slice(0, 300) : 'مفيش وصف'}
🔗 ${c.url}
${vids ? `\n🎬 *آخر الفيديوهات:*\n${vids}\n` : ''}
> ${FOOTER}`
    if (c.image) await conn.sendMessage(m.chat, { image: { url: c.image }, caption }, { quoted: m })
    else await reply(caption)
    try { await m.react?.('✅') } catch {}
  } catch (e) {
    try { await m.react?.('❌') } catch {}
    reply(`❌ مش لاقي القناة أو حصل خطأ: ${e.message}\n\n> ${FOOTER}`)
  }
}

handler.command = /^(قناة|ytstalk|ytchannel)$/i
handler.help = ['قناة @اليوزر']
handler.tags = ['tools']
export default handler