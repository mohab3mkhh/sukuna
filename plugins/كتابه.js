import fs from 'fs'
import similarity from 'similarity'

const { generateWAMessageFromContent, prepareWAMessageMedia } = await import('@whiskeysockets/baileys')

const threshold = 0.72
const activeGames = {}
const tekateki = global.tekateki = {}

let handler = async (m, { conn, command, args, usedPrefix }) => {
  const id = m.chat
  const sender = m.sender

  if (command === 'ابدا_مسابقه') {
    if (activeGames[id]) return m.reply('❗ توجد مسابقة بالفعل. اكتب ".انهاء" لإنهائها أولاً.')
    activeGames[id] = { players: {}, current: null, round: 0, owner: sender }
    return m.reply('✨ تم بدء المسابقة! كل مشارك يكتب .دخول + لقبه للانضمام.')
  }

  if (command === 'دخول') {
    if (!activeGames[id]) return m.reply('❗ لا توجد مسابقة مفعلة. اكتب ".ابدا_مسابقه" أولاً.')
    if (!args[0]) return m.reply('❗ اكتب اللقب مثل: .دخول نينجا')
    activeGames[id].players[sender] = { name: args.join(' '), points: 0 }
    return m.reply(`✅ تم تسجيلك بلقب: ${args.join(' ')}`)
  }

  if (command === 'ابدا') {
    if (!activeGames[id]) return m.reply('❗ لا توجد مسابقة مفعلة.')
    if (sender !== activeGames[id].owner) return m.reply('❗ فقط من بدأ المسابقة يمكنه إرسال الأسئلة.')
    if (activeGames[id].current) return m.reply('❗ يوجد سؤال قيد الإجابة.')

    let questions = JSON.parse(fs.readFileSync('./src/game/كت.json'))
    let q = questions[Math.floor(Math.random() * questions.length)]

    activeGames[id].current = {
      question: q.question,
      answer: q.response.toLowerCase(),
      from: sender
    }

    await conn.sendMessage(id, { text: `*❖ السؤال:* ${q.question}\n⏱ لديك 60 ثانية للإجابة.` })

    tekateki[id] = [
      null,
      q,
      1,
      setTimeout(() => {
        if (tekateki[id]) {
          conn.sendMessage(id, { text: `⏰ انتهى الوقت!\nالإجابة كانت: ${q.response}` })
          delete tekateki[id]
          if (activeGames[id]) activeGames[id].current = null
        }
      }, 60000)
    ]
    return
  }

  if (command === 'انهاء') {
    if (!activeGames[id]) return m.reply('❗ لا توجد مسابقة مفعلة.')
    if (sender !== activeGames[id].owner) return m.reply('❗ فقط من بدأ المسابقة يمكنه إنهاؤها.')

    let result = Object.entries(activeGames[id].players)
      .map(([jid, data]) => `🎖️ ${data.name}: ${data.points} نقطة`)
      .join('\n') || 'لا يوجد مشاركون.'

    clearTimeout(tekateki[id]?.[3])
    delete tekateki[id]
    delete activeGames[id]
    return m.reply(`🏁 تم إنهاء المسابقة.\n\n${result}`)
  }
}

handler.before = async function (m, { conn }) {
  const id = m.chat

  // لو مفيش لعبة نشطة، كمّل عادي
  if (!tekateki[id]) return false
  if (!activeGames[id]) return false
  if (!activeGames[id].players[m.sender]) return false
  if (!m.text) return false

  const correct = tekateki[id][1].response.toLowerCase().trim()
  const userAnswer = m.text.toLowerCase().trim()

  if (!global.db.data.users[m.sender]) global.db.data.users[m.sender] = { exp: 0 }

  if (userAnswer === correct) {
    activeGames[id].players[m.sender].points += 1
    global.db.data.users[m.sender].exp += tekateki[id][2]

    await conn.sendMessage(id, {
      text: `✅ *إجابة صحيحة من:* @${m.sender.split('@')[0]}\n🧠 *الجواب:* ${correct}\n✨ *نقاطه الآن:* ${activeGames[id].players[m.sender].points}\n\n📌 اكتب *.ابدا* لسؤال جديد أو *.انهاء* لإنهاء المسابقة`,
      mentions: [m.sender]
    })

    clearTimeout(tekateki[id][3])
    delete tekateki[id]
    activeGames[id].current = null

  } else if (similarity(userAnswer, correct) >= threshold) {
    await conn.sendMessage(id, { text: `*❍━━━══━━❪⛩️❫━━══━━━❍*\n*｢😈｣⇇اقـتـربـت مـن الاجـابـه*\n*❍━━━══━━❪⛩️❫━━══━━━❍*` })
  } else {
    await conn.sendMessage(id, { text: `*❍━━━══━━❪⛩️❫━━══━━━❍*\n*｢😈｣⇇الاجـابـه خـلـط*\n*❍━━━══━━❪⛩️❫━━══━━━❍*` })
  }

  return false
}

handler.command = /^(ابدا_مسابقه|دخول|ابدا|انهاء)$/
handler.group = true

export default handler