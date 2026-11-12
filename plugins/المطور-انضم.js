let handler = async (m, { conn, text, usedPrefix, command, args, participants, isOwner }) => {

   if (!isOwner) return conn.sendButton(m.chat, `*دعوة البوت إلى مجموعة*\n\nيا @${m.sender.split('@')[0]}\nلو عاوز تضيف البوت لمجموعة، كلم الأونر عشان يظبطلك الموضوع`.trim(), igfg, null, [
       ['اتصل بالأونر', `${usedPrefix}buyprem`]] , m, { mentions: [m.sender] })

  let linkRegex = /chat.whatsapp.com\/([0-9A-Za-z]{20,24})/i
  let delay = time => new Promise(res => setTimeout(res, time))

  let [_, code] = text.match(linkRegex) || []
  if (!args[0]) throw `✠ ابعت رابط الجروب يا زعيم\n\n 📌 مثال:\n *${usedPrefix + command}* <الرابط>`
  if (!code) throw `✠ الرابط ده مش مظبوط يا فندم!`
  
  conn.sendMessage(m.chat, { text:`😎 استنى عليا ثواني، هدخل الجروب حالاً`)
  await delay(3000)
  try {
  let res = await conn.groupAcceptInvite(code)
  let b = await conn.groupMetadata(res)
  let d = b.participants.map(v => v.id)
  let member = d.toString()

  await conn.sendMessage(m.chat, { text:`✅ البوت دخل الجروب بنجاح!\n\n✠ معلومات الجروب  \n\n *الاسم :* ${await conn.getName(res)}\n`)
  await conn.reply(res, `🏮 أهلاً بالجميع!\n\n@${m.sender.split('@')[0]} هو اللي دعاني`, m, {
    mentions: d
  }).then(async () => {
    await delay(7000)
  }).then(async () => {
    await conn.reply(res, `فليهدأ الجميع! 🤭`, 0)
  })

  } catch (e) {
      conn.reply(global.owner[1]+'@s.whatsapp.net', e)
      throw `في مشكلة في دعوة البوت للجروب.`
  }
}
handler.help = ['join <chat.whatsapp.com>']
handler.tags = ['owner']
handler.command = ['join', 'انضم'] 

//handler.owner = true

export default handler
