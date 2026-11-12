// plugins/autoreply.js  (اسم الملف حسب ما هو عندك)
import { sendButtons } from '../lib/buttons.js'

const REPLIES = [
  [/^احا$/i,                                          '*خدها و شلحها😆*'],
  [/^فورينا$/i,                                       '*نـعـم انـا هـنـا*'],
  [/^الحمدلله$/i,                                     '*ادام الله حمدك*'],
  [/^(عبيط|يا عبيط|اهبل|غبي)$/i,                    '*انت يبيبي 🥲❤️*'],
  [/^بوت$/i,                                          '*ارغي عايز ايه*'],
  [/^يب$/i,                                           '*متسترجل يــاض🐦❤*'],
  [/^الاستور$/i,                                      '*مطوري و حبيبي😊*'],
  [/^(بوت خرا|بوت زفت|خرا عليك)$/i,                 '*بص يسطا لم نفسك بدل ما افــشــخـك😒🗿*'],
  [/^(منور|منوره)$/i,                                 '*بنوري انا 🫠💔*'],
  [/^(بنورك|دا نورك|نورك الاصل|نور نورك)$/i,        '*يعم بنوري انا 🫠🐦*'],
  [/^(امزح|بهزر)$/i,                                  '*دمك تقيل متهزرش تاني😒*'],
  [/^في ايه$/i,                                       '*انا معرفش حاجه🙂*'],
  [/^تست$/i,                                          '*موجود عايز فــيـن🗿*'],
  [/^(بتعمل ايه دلوقتي|بتعمل اي)$/i,                '*انت مالك😒*'],
  [/^انا جيت$/i,                                      '*امشي تاني*'],
  [/^(حرامي|سارق)$/i,                                 '*تتهم بريء بالسرقة ... فبسكوتك اقتل جهلك*'],
  [/^(ملل|مللل|ملللل|زهق)$/i,                       '*لانك موجود🗿*'],
  [/^🤖$/i,                                           'انت بوت عشان ترسل الايموجي ده 🐦'],
  [/^🐦‍⬛$/i,                                          '🐦'],
  [/^ايه$/i,                                          '*خــدتـك عـلـيــه🌝🤣*'],
  [/^نعم$/i,                                          '*حد ناداك 🌚🐦*'],
  [/^(كيفك|شخبارك|علوك|عامل ايه|اخبارك|اي الدنيا)$/i, '*⛄وانــت مـالًــك؟*'],
  [/^🐤$/i,                                           '🐦'],
  [/^(تصبح علي خير|تصبحوا علي خير)$/i,              'وانت من اهل الخير حبيبي✨💜'],
  [/^(ببحبك بوت|حبك|بوت بحبك)$/i,                   '🙄'],
  [/^🙂$/i,                                           'بص بعيد🙂'],
  [/^باي$/i,                                          '*مـع الـسـلامـه🐥*'],
  [/^هلا$/i,                                          '*اهـلا كـيـفـك🧸*'],
]

const THUMB = 'https://stitch-api.vercel.app/api/v3/upload/view/image5w7he.jpg'
const CHANNEL = 'https://whatsapp.com/channel/0029VaENL4h1lD3MZsVEty'

let handler = m => m

handler.all = async function (m) {
  if (m.key?.fromMe) return
  const chat = global.db.data.chats?.[m.chat]
  if (!chat || chat.isBanned) return

  const t = (m.text || '').trim()
  const hit = REPLIES.find(([re]) => re.test(t))
  if (!hit) return true

  const conn = this
  const text = hit[1]
  const buttons = [
    { id: '.المطور', text: '⌈🚀╎المطور╎🚀⌋' },
    { id: '.الاوامر', text: '⌈🧩╎الاوامر╎🧩⌋' },
  ]

  try {
    await sendButtons(conn, m.chat, {
      text,
      footer: '⛩️ SUKUNA BOT ⛩️',
      buttons,
      quoted: m,
      contextInfo: {
        externalAdReply: {
          title: 'MOHAB',
          body: '⛩️ SUKUNA BOT ⛩️',
          thumbnailUrl: THUMB,
          sourceUrl: CHANNEL,
          mediaType: 1,
          showAdAttribution: true,
          renderLargerThumbnail: false,
        },
      },
    })
  } catch (e) {
    console.log('[autoreply] buttons failed, text fallback:', e.message)
    await conn.sendMessage(m.chat, { text }, { quoted: m })
  }
  return true
}

export default handler