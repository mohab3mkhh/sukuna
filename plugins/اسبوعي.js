let handler = async (m, { conn, isPrems }) => {
  let user = global.db.data.users[m.sender]
  if (!user) return m.reply('*┇⌗╎حدث خطأ، حاول مرة أخرى*')

  const free = 5000
  const prem = 20000
  const now  = Date.now()
  const week = 7 * 24 * 60 * 60 * 1000  // 7 أيام

  if (user.lastweekly && (now - user.lastweekly) < week) {
    const left = user.lastweekly + week - now
    return m.reply(`*╮═≼『⛩️┃تنبيه┃⛩️』≽═╭*\n*┇⌗╎🎁 جمعت الهدية الأسبوعية بالفعل*\n*┇⌗╎🕚 ادخل بعد ${clockString(left)}*\n*╯✯≼══━━﹂⛩️﹁━━══≽✯*`)
  }

  const reward = isPrems ? prem : free
  user.exp += reward
  user.lastweekly = now

  await m.reply(`*╮═≼『⛩️┃هدية أسبوعية┃⛩️』≽═╭*\n*┇⌗╎🎁 لقد حصلت على هديتك الأسبوعية*\n*┇⌗╎🆙 XP : +${reward}*\n*╯✯≼══━━﹂⛩️﹁━━══≽✯*`)
}

handler.help    = ['اسبوعي']
handler.tags    = ['economy']
handler.command = ['اسبوعي', 'weekly']
export default handler

function clockString(ms) {
  let d = isNaN(ms) ? '--' : Math.floor(ms / 86400000)
  let h = isNaN(ms) ? '--' : Math.floor(ms / 3600000) % 24
  let m = isNaN(ms) ? '--' : Math.floor(ms / 60000) % 60
  d = (d < 10) ? '0' + d : d
  h = (h < 10) ? '0' + h : h
  m = (m < 10) ? '0' + m : m
  return `${d} أيام ${h} ساعات ${m} دقائق`
}