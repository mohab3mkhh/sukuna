// plugins/getlid.js — أمر مؤقت لمعرفة الـ lid

const OWNERS = ['201016855501', '201036547166']

const handler = async (m, { conn, text }) => {
  const senderNum = m.sender.replace(/@.+/, '').replace(/\D/g, '')
  const isOwner = OWNERS.some(o => senderNum.slice(-9) === o.slice(-9))
  if (!isOwner) return

  if (!m.isGroup) return m.reply('استخدم في جروب!')

  const metadata = await conn.groupMetadata(m.chat)
  
  // لو في رقم في النص ابحث عنه
  if (text) {
    const searchNum = text.replace(/\D/g, '').slice(-9)
    const found = metadata.participants.filter(p => {
      const num = p.id.replace(/@.+/, '').slice(-9)
      return num === searchNum
    })
    if (found.length) {
      return m.reply(`✅ الـ JID:\n${found.map(p => p.id).join('\n')}`)
    }
    // لو مش لاقيه بالرقم، ممكن يكون lid
    return m.reply(`❌ مش لاقيه\n\nعدد المشاركين: ${metadata.participants.length}\nأول 5 منهم:\n${metadata.participants.slice(0,5).map(p=>p.id).join('\n')}`)
  }

  // لو مفيش نص، اطبع كل المشاركين
  const list = metadata.participants.map(p => p.id).join('\n')
  await conn.sendMessage(m.chat, { text: `المشاركين:\n${list}` }, { quoted: m })
}

handler.command = /^getlid$/i
handler.group = true

export default handler