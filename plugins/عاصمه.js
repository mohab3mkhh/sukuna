import fs from 'fs'
import pkg from '@whiskeysockets/baileys'
const { generateWAMessageFromContent, proto } = pkg

const timeout = 60000
const poin    = 500

let handler = async (m, { conn }) => {
  if (!conn.tekateki) conn.tekateki = {}

  const id = m.chat

  if (id in conn.tekateki) {
    await conn.reply(m.chat,
      '*❍━━━══━━❪⛩️❫━━══━━━❍*\n' +
      '*｢❤️｣⇇ مازال هناك سؤال هنا*\n' +
      '*❍━━━══━━❪⛩️❫━━══━━━❍*',
      conn.tekateki[id][0])
    return
  }

  let tekateki
  try {
    tekateki = JSON.parse(fs.readFileSync('./src/game/عواصم.json', 'utf8'))
  } catch {
    return m.reply('*┇⌗╎ملف الأسئلة غير موجود*')
  }

  const json    = tekateki[Math.floor(Math.random() * tekateki.length)]
  const choices = json.choices || [json.response]

  // خلط الاختيارات
  const shuffled = [...choices].sort(() => Math.random() - 0.5)

  // أزرار الاختيارات
  const buttons = shuffled.map(choice => ({
    name: 'quick_reply',
    buttonParamsJson: JSON.stringify({
      display_text: choice,
      id: `.عاصمه_اجابة ${choice}`
    })
  }))

  const caption =
    `*｢🍭｣⇇ السؤال↶*\n` +
    `> ❀ ${json.question} ❀\n` +
    `*⊏─๋︩︪─๋︩︪─๋︩︪─๋︩︪─═͜⊐❪⛩️❫⊏═─๋︩︪─๋︩︪─๋︩︪─๋︩︪─๋︩︪─⊐*\n` +
    `*｢👤｣⇇ اللاعب↜❪@${m.sender.split('@')[0]}❫*\n` +
    `*｢🕛｣⇇ الوقت↜❪${timeout / 1000} ثانية❫*\n` +
    `*｢⚜️｣⇇ الجائزة↜❪${poin} نقطة❫*\n` +
    `*⊏─๋︩︪─๋︩︪─๋︩︪─๋︩︪─═͜⊐❪⛩️❫⊏═─๋︩︪─๋︩︪─๋︩︪─๋︩︪─๋︩︪─⊐*\n` +
    `*｢👑｣⇇ المطور: MOHAB*\n` +
    `*❍━━━══━━❪⛩️❫━━══━━━❍*`

  // إرسال السؤال مع أزرار
  let sentMsg
  try {
    const built = generateWAMessageFromContent(m.chat, {
      interactiveMessage: {
        body:   { text: caption },
        footer: { text: '⛩️ SUKUNA BOT ⛩️' },
        nativeFlowMessage: {
          buttons,
          messageParamsJson: ''
        }
      }
    }, { userJid: conn.user?.jid, quoted: m })

    await conn.relayMessage(m.chat, built.message, { messageId: built.key.id })
    sentMsg = built
  } catch {
    // Fallback لو الأزرار ما اشتغلتش
    const choiceText = shuffled.map((c, i) => `*${i + 1}.* ${c}`).join('\n')
    sentMsg = await conn.reply(m.chat, caption + '\n\n' + choiceText, m)
  }

  conn.tekateki[id] = [
    sentMsg,
    json,
    poin,
    m.sender,
    setTimeout(async () => {
      if (conn.tekateki[id]) {
        await conn.reply(m.chat,
          `*⊏─๋︩︪─๋︩︪─๋︩︪─๋︩︪─═͜⊐❪⛩️❫⊏═─๋︩︪─๋︩︪─๋︩︪─๋︩︪─๋︩︪─⊐*\n` +
          `*｢🌀｣⇇ انتهى الوقت💔*\n` +
          `*｢🍡｣⇇ الإجابة↜❪${json.response}❫*\n` +
          `*⊏─๋︩︪─๋︩︪─๋︩︪─๋︩︪─═͜⊐❪⛩️❫⊏═─๋︩︪─๋︩︪─๋︩︪─๋︩︪─๋︩︪─⊐*`,
          conn.tekateki[id][0])
      }
      delete conn.tekateki[id]
    }, timeout)
  ]
}

// ════════════════════════════════════════════
// معالجة الإجابة لما حد يضغط الزرار
// ════════════════════════════════════════════
handler.all = async function (m) {
  if (!m.text?.startsWith('.عاصمه_اجابة ')) return
  if (!this.tekateki?.[m.chat]) return

  const answer  = m.text.replace('.عاصمه_اجابة ', '').trim()
  const game    = this.tekateki[m.chat]
  const json    = game[1]
  const points  = game[2]
  const conn    = this

  clearTimeout(game[3])

  if (answer === json.response) {
    // إجابة صح
    const user = global.db?.data?.users?.[m.sender]
    if (user) user.exp = (user.exp || 0) + points

    await conn.sendMessage(m.chat, {
      text:
        `*⊏─๋︩︪─๋︩︪─๋︩︪─๋︩︪─═͜⊐❪⛩️❫⊏═─๋︩︪─๋︩︪─๋︩︪─๋︩︪─๋︩︪─⊐*\n` +
        `*｢🎉｣⇇ إجابة صحيحة!*\n` +
        `*｢👤｣⇇ الفائز:* @${m.sender.split('@')[0]}\n` +
        `*｢✅｣⇇ الإجابة:* ${json.response}\n` +
        `*｢⚜️｣⇇ النقاط:* +${points}\n` +
        `*⊏─๋︩︪─๋︩︪─๋︩︪─๋︩︪─═͜⊐❪⛩️❫⊏═─๋︩︪─๋︩︪─๋︩︪─๋︩︪─๋︩︪─⊐*`,
      mentions: [m.sender]
    }, { quoted: game[0] })
  } else {
    // إجابة غلط
    await conn.sendMessage(m.chat, {
      text:
        `*⊏─๋︩︪─๋︩︪─๋︩︪─๋︩︪─═͜⊐❪⛩️❫⊏═─๋︩︪─๋︩︪─๋︩︪─๋︩︪─๋︩︪─⊐*\n` +
        `*｢❌｣⇇ إجابة خاطئة!*\n` +
        `*｢👤｣⇇* @${m.sender.split('@')[0]}\n` +
        `*｢💡｣⇇ حاول مرة أخرى*\n` +
        `*⊏─๋︩︪─๋︩︪─๋︩︪─๋︩︪─═͜⊐❪⛩️❫⊏═─๋︩︪─๋︩︪─๋︩︪─๋︩︪─๋︩︪─⊐*`,
      mentions: [m.sender]
    }, { quoted: game[0] })
    return  // السؤال لسه شغال
  }

  delete this.tekateki[m.chat]
}

handler.help    = ['عاصمه']
handler.tags    = ['game']
handler.command = /^(عاصمه)$/i
export default handler