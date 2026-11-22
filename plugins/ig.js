// plugins/انستا_بروفايل.js
// 📸 بيانات بروفايل انستجرام العام عن طريق Prexzy API (igstalkV2)
//   .انستا <اليوزر>      (أو .igstalk / .ig)    مثال: .انستا mohab

import axios from 'axios'

const API = 'https://prexzyapis.com/stalk/igstalkV2'
const FOOTER = '⛩️ SUKUNA BOT ⛩️'
const PARAM_NAMES = [process.env.IGSTALK_PARAM, 'username', 'user', 'q', 'name', 'query'].filter(Boolean)

// شكل الرد مش معروف، فبنقرا الحقول بأكتر من اسم محتمل
const pick = (o, keys) => { for (const k of keys) if (o?.[k] !== undefined && o[k] !== null && o[k] !== '') return o[k]; return null }
const num = v => (v == null ? '—' : isNaN(Number(v)) ? String(v) : Number(v).toLocaleString('en-US'))

async function stalk(user) {
  let lastErr = 'مفيش رد'
  for (const key of PARAM_NAMES) {
    try {
      const r = await axios.get(API, { params: { [key]: user }, timeout: 25000, validateStatus: () => true })
      const d = r.data
      const p = d?.data?.user || d?.data || d?.result
      if (d?.status && p && typeof p === 'object') return p
      lastErr = d?.message || d?.error || `HTTP ${r.status}`
      console.log(`[انستا] ${key} ->`, JSON.stringify(d).slice(0, 300))
      if (r.status === 429) break
    } catch (e) { lastErr = e.message }
  }
  throw new Error(lastErr)
}

const handler = async (m, { conn, args, usedPrefix = '.', command }) => {
  const reply = text => conn.sendMessage(m.chat, { text }, { quoted: m })
  let user = String((args || [])[0] || '').trim()
  if (!user) return reply(`📸 *بروفايل انستجرام*\n\nاكتب:\n*${usedPrefix}${command} <اليوزر>*\n\nمثال:\n*${usedPrefix}${command} mohab*\n\n> ${FOOTER}`)

  const mt = user.match(/instagram\.com\/([\w.]+)/i)
  if (mt) user = mt[1]
  user = user.replace(/^@/, '')
  if (!/^[\w.]{1,30}$/.test(user)) return reply('❌ اليوزر غير صحيح.')

  try { await m.react?.('⏳') } catch {}
  try {
    const p = await stalk(user)
    const name = pick(p, ['full_name', 'fullName', 'name', 'nickname'])
    const uname = pick(p, ['username', 'userName', 'user']) || user
    const bio = pick(p, ['biography', 'bio', 'description'])
    const followers = pick(p, ['followers', 'follower_count', 'followersCount', 'edge_followed_by'])
    const following = pick(p, ['following', 'following_count', 'followingCount', 'edge_follow'])
    const posts = pick(p, ['posts', 'post_count', 'media_count', 'postsCount', 'edge_owner_to_timeline_media'])
    const priv = pick(p, ['is_private', 'isPrivate', 'private'])
    const verified = pick(p, ['is_verified', 'isVerified', 'verified'])
    const img = pick(p, ['profile_pic_url_hd', 'profile_pic_url', 'profilePic', 'profile_picture', 'avatar', 'image', 'pfp'])
    const n = v => (v && typeof v === 'object' ? v.count : v)

    const caption =
`📸 *بروفايل انستجرام*

👤 *الاسم:* ${name || '—'}${verified ? ' ✔️' : ''}
🔖 *اليوزر:* @${uname}
👥 *المتابعين:* ${num(n(followers))}
➡️ *بيتابع:* ${num(n(following))}
🖼️ *المنشورات:* ${num(n(posts))}
${priv != null ? `🔒 *الحساب:* ${priv ? 'خاص' : 'عام'}\n` : ''}📝 *البايو:* ${bio ? String(bio).slice(0, 400) : 'مفيش بايو'}
🔗 https://instagram.com/${uname}

> ${FOOTER}`
    if (img && /^https?:/i.test(img)) {
      try { await conn.sendMessage(m.chat, { image: { url: img }, caption }, { quoted: m }) }
      catch { await reply(caption) }
    } else await reply(caption)
    try { await m.react?.('✅') } catch {}
  } catch (e) {
    try { await m.react?.('❌') } catch {}
    reply(`❌ مش لاقي الحساب أو حصل خطأ: ${e.message}\n\n> ${FOOTER}`)
  }
}

handler.command = /^(انستا|igstalk|ig)$/i
handler.help = ['انستا <اليوزر>']
handler.tags = ['tools']
export default handler