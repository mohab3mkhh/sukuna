// plugins/neko.js
import { sendButtons, btn } from '../lib/buttons.js'

const PROVIDERS = [
  { name: 'nekos.best', url: 'https://nekos.best/api/v2/neko', pick: d => d?.results?.[0]?.url },
  { name: 'waifu.pics', url: 'https://api.waifu.pics/sfw/neko', pick: d => d?.url },
  { name: 'nekos.life', url: 'https://nekos.life/api/v2/img/neko', pick: d => d?.url }
]

async function fetchJson(url, ms = 12000) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'Mozilla/5.0' } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(t)
  }
}

async function getNekoUrl() {
  const errors = []
  for (const p of PROVIDERS) {
    try {
      const data = await fetchJson(p.url)
      const url = p.pick(data)
      if (url && /^https?:\/\//i.test(url)) return url
      errors.push(`${p.name}: رد بدون رابط`)
    } catch (e) {
      errors.push(`${p.name}: ${e?.name === 'AbortError' ? 'timeout' : e?.message || e}`)
    }
  }
  throw new Error(errors.join(' | '))
}

let handler = async (m, { conn, command, usedPrefix }) => {
  try {
    await m.react('⏳')
    const imageUrl = await getNekoUrl()

    await sendButtons(conn, m.chat, {
      image: imageUrl,
      text: 'Nyaww~ 🐾💗\n🐱 قطط أنمي لطيفة',
      footer: 'اضغط الزر لصورة جديدة',
      buttons: [btn.reply('🐱 التالي 🆕', `${usedPrefix}${command}`)]
    }, m)

    await m.react('✅')
  } catch (error) {
    console.error('[neko]', error?.message || error)
    await m.react('❌')
    await m.reply('❌ حدث خطأ في جلب الصورة، حاول مرة أخرى')
  }
}

handler.command = /^(كيوت|neko)$/i
handler.tags = ['anime']
handler.help = ['neko']

export default handler