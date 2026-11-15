// plugins/اضافة-مطور.js

const resolveLid = async (jid, conn, groupId, isGroup) => {
  if (!jid?.endsWith('@lid')) return jid

  // 1) الـ mapping الرسمي في Baileys v7
  try {
    const pn = await conn.signalRepository.lidMapping.getPNForLID(jid)
    if (pn) return pn.replace(/:\d+@/, '@')
  } catch {}

  // 2) بيانات الجروب (participants فيها id / lid / phoneNumber)
  if (isGroup) {
    try {
      const meta = await conn.groupMetadata(groupId)
      const p = meta.participants.find(x => x.id === jid || x.lid === jid)
      const real = p?.phoneNumber || (p?.id?.endsWith('@s.whatsapp.net') ? p.id : null)
      if (real) return real.replace(/:\d+@/, '@')
    } catch {}
  }

  // 3) من الـ contacts
  try {
    for (const [cJid, c] of Object.entries(conn.contacts || {})) {
      if ((c?.lid === jid || c?.id === jid) && cJid.endsWith('@s.whatsapp.net')) return cJid
    }
  } catch {}

  return jid
}

const handler = async (m, { conn, text }) => {
  let targetJid = m.mentionedJid?.[0] || m.quoted?.sender
  let num

  if (targetJid) {
    if (targetJid.endsWith('@lid')) {
      targetJid = await resolveLid(targetJid, conn, m.chat, m.isGroup)
    }
    if (targetJid.endsWith('@lid')) {
      return m.reply('❌ مش قادر أتعرف على رقم الشخص، اكتب الرقم بنفسك:\n.adddev 201xxxxxxxxx')
    }
    num = targetJid.split('@')[0].replace(/\D/g, '')
  } else if (text) {
    num = text.replace(/\D/g, '')
    // رقم مصري بصفر في الأول: 010xxxxxxxx -> 2010xxxxxxxx
    if (/^01\d{9}$/.test(num)) num = '2' + num
  }

  if (!num || num.length < 8) {
    return m.reply('❌ منشن الشخص، أو رد على رسالته، أو اكتب رقمه\nمثال: .adddev 201066036607')
  }

  const jid = `${num}@s.whatsapp.net`

  global.db.data.settings ||= {}
  global.db.data.settings.devs ||= []

  if (global.db.data.settings.devs.includes(num)) {
    return conn.sendMessage(m.chat, {
      text: `❌ @${num} مطور بالفعل!`,
      mentions: [jid]
    }, { quoted: m })
  }

  global.db.data.settings.devs.push(num)
  if (typeof global.db.write === 'function') await global.db.write()

  // إضافته لقائمة الـ owner الحالية بنفس صيغتها
  if (!Array.isArray(global.owner)) global.owner = []
  const exists = global.owner.some(o => (Array.isArray(o) ? o[0] : o) === num)
  if (!exists) {
    const usesArrays = global.owner.some(o => Array.isArray(o))
    global.owner.push(usesArrays ? [num, 'Dev', true] : num)
  }

  await conn.sendMessage(m.chat, {
    text: `✅ تم إضافة @${num} كمطور!\nهيفضل مطور حتى بعد الريستارت 🔒`,
    mentions: [jid]
  }, { quoted: m })
}

handler.command = /^(اضافة-مطور|adddev)$/i
handler.owner = true
export default handler