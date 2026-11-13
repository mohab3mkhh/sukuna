import { getDevice } from '@whiskeysockets/baileys'
import { googleImage } from '@bochilteam/scraper'
import { sendButtons, btn } from '../lib/buttons.js'

const BLOCKED = ['caca', 'سكس', 'اباحي', 'مايا خليفه', 'نيك', 'شاذ', 'شذوذ', 'polla', 'porno', 'porn', 'gore', 'cum', 'semen', 'puta', 'puto', 'culo', 'putita', 'putito', 'pussy', 'hentai', 'pene', 'coño', 'asesinato', 'zoofilia', 'mia khalifa', 'desnudo', 'desnuda', 'cuca', 'chocha', 'muertos', 'pornhub', 'xnxx', 'xvideos', 'teta', 'vagina', 'marsha may', 'misha cross', 'sexmex', 'furry', 'furro', 'furra', 'xxx', 'rule34', 'panocha', 'pedofilia', 'necrofilia', 'pinga', 'horny', 'ass', 'nude', 'popo', 'nsfw', 'femdom', 'futanari', 'erofeet', 'sexo', 'sex', 'yuri', 'ero', 'ecchi', 'blowjob', 'anal', 'ahegao', 'pija', 'verga', 'trasero', 'violation', 'violacion', 'bdsm', 'cachonda', '+18', 'cp', 'mia marin', 'lana rhoades', 'cepesito', 'hot', 'buceta']

const handler = async (m, { conn, text, usedPrefix }) => {
  const lower = (m.text || '').toLowerCase()
  if (BLOCKED.some(w => lower.includes(w))) {
    return conn.reply(m.chat, ' *استغفر ربك احسن* 😒', m)
  }

  if (!text) throw `استخدم أمر صور عن طريق 🔎\n${usedPrefix}صوره eren`

  let device = 'android'
  try { device = await getDevice(m.key.id) } catch {}

  const results = await googleImage(text)
  const imageUrl = results.getRandom()

  // ديسكتوب/ويب: الأزرار التفاعلية ممكن ما تظهرش، فنبعت الصورة عادي
  if (device === 'desktop' || device === 'web') {
    return conn.sendMessage(m.chat, {
      image: { url: imageUrl },
      caption: `- الـصـوره الـمـراد الــبحث عـنـها : ${text}\n\nللمزيد: ${usedPrefix}صوره ${text}`
    }, { quoted: m })
  }

  await sendButtons(conn, m.chat, {
    title: 'الـتـحـميل مـن مـوقـع صور جوجل 🪩',
    text: `- الـصـوره الـمـراد الــبحث عـنـها : ${text}`,
    footer: '❯⏐ • SUKUNA BOT) ء',
    image: imageUrl,
    buttons: [
      btn.reply('جيب صوره تاني', `.image0 ${text}`)
    ]
  }, m)
}

handler.help = ['صوره']
handler.tags = ['For Test']
handler.command = /^(image0|صوره)$/i

export default handler