// plugins/اضافة-مطور.js

const handler = async (m, { conn }) => {
  const targetJid = m.mentionedJid?.[0] || m.quoted?.sender
  if (!targetJid) return m.reply('❌ منشن الشخص أو رد على رسالته')

  const num = targetJid.split('@')[0]

  if (!global.db.data.settings) global.db.data.settings = {}
  if (!global.db.data.settings.devs) global.db.data.settings.devs = []

  if (global.db.data.settings.devs.includes(num)) {
    return m.reply(`❌ @${num} مطور بالفعل!`, m.chat, { mentions: [targetJid] })
  }

  global.db.data.settings.devs.push(num)
  await global.db.write()

  if (!global.owners) global.owners = []
  if (!global.owners.includes(num)) global.owners.push(num)

  await m.reply(`✅ تم إضافة @${num} كمطور!\nهيفضل مطور حتى بعد الريستارت 🔒`, m.chat, { mentions: [targetJid] })
}

handler.command = /^(اضافة-مطور|adddev|مطور|اونر|owner)$/i
handler.owner = true
export default handler