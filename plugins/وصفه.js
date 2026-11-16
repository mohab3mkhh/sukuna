/**
 * plugins/وصفه.js
 * جيب البايو/الوصف بتاع أي شخص
 */

let handler = async (m, { conn }) => {
  // ══════════════════════════════════════════
  // تحديد مين — أولوية: منشن > رد > رقم مكتوب > أنت
  // ══════════════════════════════════════════
  let who

  if (m.mentionedJid?.[0]) {
    who = m.mentionedJid[0]
  } else if (m.quoted?.sender) {
    who = m.quoted.sender
  } else {
    const textMatch = m.text?.match(/@?(\d{7,15})/)
    if (textMatch) who = textMatch[1] + '@s.whatsapp.net'
  }

  // لو lid — حوّله لـ JID حقيقي
  if (who?.includes('@lid')) {
    try {
      const pn = await conn.signalRepository?.lidMapping?.getPNForLID?.(who)
      if (pn) who = pn
    } catch {}

    // لو لسه lid — جرب من الجروب
    if (who?.includes('@lid') && m.isGroup) {
      try {
        const meta = await conn.groupMetadata(m.chat)
        const p = meta?.participants?.find(x =>
          x.id === who || x.lid === who ||
          String(x.id).replace(/:[0-9]+@/, '@') === who ||
          String(x.lid).replace(/:[0-9]+@/, '@') === who
        )
        if (p?.jid && !p.jid.includes('@lid')) who = p.jid
        else if (p?.id && !p.id.includes('@lid')) who = p.id
      } catch {}
    }
  }

  // لو لسه مش واضح
  if (!who || who.includes('@lid')) who = m.sender

  await conn.sendMessage(m.chat, { react: { text: '⏳', key: m.key } })

  const username = conn.getName(who) || who.split('@')[0]

  // جيب البايو
  let bio = null

  try {
    const res = await conn.fetchStatus(who)
    const arr = Array.isArray(res) ? res : [res]
    const found = arr.find(r => r?.status?.status?.trim())
    bio = found?.status?.status?.trim() || null
  } catch {}

  if (!bio) {
    try {
      const res = await conn.getStatus(who)
      const arr = Array.isArray(res) ? res : [res]
      const found = arr.find(r => r?.status?.status?.trim())
      bio = found?.status?.status?.trim() || null
    } catch {}
  }

  if (!bio) {
    try {
      const contact = conn.contacts?.[who]
      bio = contact?.status || contact?.statusMsg || null
    } catch {}
  }

  if (!bio) bio = '❌ لا يوجد وصف'

  // جيب الصورة
  let ppBuffer = null
  try {
    const ppUrl = await conn.profilePictureUrl(who, 'image')
    const res   = await fetch(ppUrl)
    ppBuffer    = await res.buffer()
  } catch {
    try {
      const { promises: fs } = await import('fs')
      ppBuffer = await fs.readFile('./src/sinfoto.jpg').catch(() => null)
    } catch {}
  }

  const str = `
╮═━━━━━━✦⛩️✦━━━━━━═╭
┊   ｢⛩️SUKUNA⚡️BOT⛩️｣   ┊
╯═━━━━━━✦⛩️✦━━━━━━═╰
✦───────✿───────✦
📝 *وصف المستخدم:*
┊:•⪼ *🪪 الإسم:* ｢${username}｣
┊:•⪼ *📝 الوصف:*
┊  ${bio}
✦───────✿───────✦
  `.trim()

  await conn.sendMessage(m.chat, {
    ...(ppBuffer ? { image: ppBuffer } : { text: str }),
    ...(ppBuffer ? { caption: str } : {}),
    mentions: [who]
  }, { quoted: m })

  await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } })
}

handler.help    = ['وصفه']
handler.tags    = ['info']
handler.command = ['وصفه', 'بايو', 'bio', 'status']
export default handler