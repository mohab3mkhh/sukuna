import pkg from '@whiskeysockets/baileys';
const { generateWAMessageFromContent } = pkg;

let handler = m => m;

handler.all = async function (m) {
  if (m.key.fromMe) return

  const chat = global.db.data.chats?.[m.chat]
  if (!chat || chat.isBanned) return

  const conn = this

  const sendAdReply = async (text) => {
    const buttons = [
      {
        name: 'quick_reply',
        buttonParamsJson: JSON.stringify({
          display_text: '⌈🚀╎المطور╎🚀⌋',
          id: '.المطور'
        })
      },
      {
        name: 'quick_reply',
        buttonParamsJson: JSON.stringify({
          display_text: '⌈🧩╎الاوامر╎🧩⌋',
          id: '.الاوامر'
        })
      }
    ]

    const message = generateWAMessageFromContent(m.chat, {
      extendedTextMessage: {
        text,
        contextInfo: {
          externalAdReply: {
            title:                'MOHAB',
            body:                 '⛩️ SUKUNA BOT ⛩️',
            thumbnailUrl:         'https://stitch-api.vercel.app/api/v3/upload/view/image5w7he.jpg',
            sourceUrl:            'https://whatsapp.com/channel/0029VaENL4h1lD3MZsVEty',
            mediaType:            1,
            showAdAttribution:    true,
            renderLargerThumbnail: false
          },
          buttons
        }
      }
    }, { quoted: m })

    await conn.relayMessage(m.chat, message.message, { messageId: message.key.id })
  }

  const t = m.text || ''

  if (/^احا$/i.test(t))                                          await sendAdReply('*خدها و شلحها😆*')
  if (/^فورينا$/i.test(t))                                       await sendAdReply('*نـعـم انـا هـنـا*')
  if (/^الحمدلله$/i.test(t))                                     await sendAdReply('*ادام الله حمدك*')
  if (/^(عبيط|يا عبيط|اهبل|غبي)$/i.test(t))                    await sendAdReply('*انت يبيبي 🥲❤️*')
  if (/^بوت$/i.test(t))                                          await sendAdReply('*ارغي عايز ايه*')
  if (/^يب$/i.test(t))                                           await sendAdReply('*متسترجل يــاض🐦❤*')
  if (/^الاستور$/i.test(t))                                      await sendAdReply('*مطوري و حبيبي😊*')
  if (/^(بوت خرا|بوت زفت|خرا عليك)$/i.test(t))                 await sendAdReply('*بص يسطا لم نفسك بدل ما افــشــخـك😒🗿*')
  if (/^(منور|منوره)$/i.test(t))                                 await sendAdReply('*بنوري انا 🫠💔*')
  if (/^(بنورك|دا نورك|نورك الاصل|نور نورك)$/i.test(t))        await sendAdReply('*يعم بنوري انا 🫠🐦*')
  if (/^(امزح|بهزر)$/i.test(t))                                  await sendAdReply('*دمك تقيل متهزرش تاني😒*')
  if (/^في ايه$/i.test(t))                                       await sendAdReply('*انا معرفش حاجه🙂*')
  if (/^تست$/i.test(t))                                          await sendAdReply('*موجود عايز فــيـن🗿*')
  if (/^(بتعمل ايه دلوقتي|بتعمل اي)$/i.test(t))                await sendAdReply('*انت مالك😒*')
  if (/^انا جيت$/i.test(t))                                      await sendAdReply('*امشي تاني*')
  if (/^(حرامي|سارق)$/i.test(t))                                 await sendAdReply('*تتهم بريء بالسرقة ... فبسكوتك اقتل جهلك*')
  if (/^(ملل|مللل|ملللل|زهق)$/i.test(t))                       await sendAdReply('*لانك موجود🗿*')
  if (/^🤖$/i.test(t))                                           await sendAdReply('انت بوت عشان ترسل الايموجي ده 🐦')
  if (/^🐦‍⬛$/i.test(t))                                          await sendAdReply('🐦')
  if (/^ايه$/i.test(t))                                          await sendAdReply('*خــدتـك عـلـيــه🌝🤣*')
  if (/^نعم$/i.test(t))                                          await sendAdReply('*حد ناداك 🌚🐦*')
  if (/^(كيفك|شخبارك|علوك|عامل ايه|اخبارك|اي الدنيا)$/i.test(t)) await sendAdReply('*⛄وانــت مـالًــك؟*')
  if (/^🐤$/i.test(t))                                           await sendAdReply('🐦')
  if (/^(تصبح علي خير|تصبحوا علي خير)$/i.test(t))              await sendAdReply('وانت من اهل الخير حبيبي✨💜')
  if (/^(ببحبك بوت|حبك|بوت بحبك)$/i.test(t))                   await sendAdReply('🙄')
  if (/^🙂$/i.test(t))                                           await sendAdReply('بص بعيد🙂')
  if (/^باي$/i.test(t))                                          await sendAdReply('*مـع الـسـلامـه🐥*')
  if (/^هلا$/i.test(t))                                          await sendAdReply('*اهـلا كـيـفـك🧸*')
  if (/^ادم$/i.test(t))                                          await sendAdReply('*꧁༺ ذَآ عَمَّكَ وَعَمَّ عَيَآلَكَ ༻꧂*')

  return true
}

export default handler