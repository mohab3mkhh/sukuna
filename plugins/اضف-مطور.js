// plugins/اضافة-مطور.js

const resolveLid = async (jid, conn, groupId) => {
  if (!jid || !jid.endsWith('@lid')) return jid
  try {
    const meta = await conn.groupMetadata(groupId).catch(() => null)
    if (!meta) return jid
    const match = meta.participants.find(p => p.id === jid || p.lid === jid)
    if (match?.jid && !match.jid.endsWith('@lid')) return match.jid
    // جرب من contacts
    const contacts = conn.contacts || {}
    for (const [cJid, c] of Object.entries(contacts)) {
      if ((c?.lid === jid || c?.id === jid) && cJid.endsWith('@s.whatsapp.net')) return cJid
    }
  } catch {}
  return jid
}

const handler = async (m, { conn }) => {
  let targetJid = m.mentionedJid?.[0] || m.quoted?.sender
  if (!targetJid) return m.reply('❌ منشن الشخص أو رد على رسالته')

  // حل الـ lid
  if (targetJid.endsWith('@lid')) {
    targetJid = await resolveLid(targetJid, conn, m.chat)
  }

  if (targetJid.endsWith('@lid')) {
    return m.reply('❌ مش قادر أتعرف على رقم الشخص، اطلب منه يبعت رسالة في الجروب وجرب تاني')
  }

  const num = targetJid.replace('@s.whatsapp.net', '').replace(/\D/g, '')
  const jid = `${num}@s.whatsapp.net`

  if (!global.db.data.settings) global.db.data.settings = {}
  if (!global.db.data.settings.devs) global.db.data.settings.devs = []

  if (global.db.data.settings.devs.includes(num)) {
    return conn.sendMessage(m.chat, {
      text: `❌ @${num} مطور بالفعل!`,
      mentions: [jid]
    }, { quoted: m })
  }

  global.db.data.settings.devs.push(num)
  await global.db.write()

  if (!global.owners) global.owners = []
  if (!global.owners.includes(num)) global.owners.push(num)

  await conn.sendMessage(m.chat, {
    text: `✅ تم إضافة @${num} كمطور!\nهيفضل مطور حتى بعد الريستارت 🔒`,
    mentions: [jid]
  }, { quoted: m })
}

handler.command = /^(اضافة-مطور|adddev)$/i
handler.owner = true
export default handler