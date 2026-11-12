// ════════════════════════════════════════════════════════
// ⛩️ SUKUNA BOT v4 — Anti-Link
// ════════════════════════════════════════════════════════

const linkRegex  = /chat\.whatsapp\.com\/([0-9A-Za-z]{20,24})/i
const linkRegex1 = /whatsapp\.com\/channel\/([0-9A-Za-z]{20,24})/i

// ════════════════════════════════════════════════════════
// 📌 أمر .antilink on / off
// ════════════════════════════════════════════════════════
const handler = async function (m, { conn, args, isAdmin, isROwner }) {
  if (!m.isGroup)
    return m.reply(
      `*╮═≼『⛩️┃تنبيه┃⛩️』≽═╭*\n` +
      `*┇⌗╎ꕥ هذا الأمر للمجموعات فقط ⌗*\n` +
      `*╯✯≼══━━﹂⛩️﹁━━══≽✯*`
    )

  if (!isAdmin && !isROwner)
    return m.reply(
      `*╮═≼『⛩️┃تنبيه┃⛩️』≽═╭*\n` +
      `*┇⌗╎ꕥ هذا الأمر للأدمن فقط ⌗*\n` +
      `*╯✯≼══━━﹂⛩️﹁━━══≽✯*`
    )

  const arg = (args[0] || '').toLowerCase()

  // لو مكتبش on أو off — وريه الخيارات
  if (arg !== 'on' && arg !== 'off')
    return m.reply(
      `*╮═≼『⛩️┃مضاد الروابط┃⛩️』≽═╭*\n\n` +
      `*┇⌗╎ꕥ اختار أحد الخيارات:*\n` +
      `*┇⌗╎ 🟢 .antilink on — تفعيل*\n` +
      `*┇⌗╎ 🔴 .antilink off — تعطيل*\n\n` +
      `*╯✯≼══━━﹂⛩️﹁━━══≽✯*`
    )

  if (!global.db.data.chats[m.chat]) global.db.data.chats[m.chat] = {}
  const chat = global.db.data.chats[m.chat]

  if (arg === 'on') {
    chat.antiLink = true
    return m.reply(
      `*╮═≼『⛩️┃مضاد الروابط┃⛩️』≽═╭*\n\n` +
      `*┇⌗╎ 🟢 تم تفعيل مضاد الروابط!*\n` +
      `*┇⌗╎ꕥ أي رابط واتساب سيتم التعامل معه ⌗*\n\n` +
      `*╯✯≼══━━﹂⛩️﹁━━══≽✯*`
    )
  }

  chat.antiLink = false
  return m.reply(
    `*╮═≼『⛩️┃مضاد الروابط┃⛩️』≽═╭*\n\n` +
    `*┇⌗╎ 🔴 تم تعطيل مضاد الروابط!*\n\n` +
    `*╯✯≼══━━﹂⛩️﹁━━══≽✯*`
  )
}

handler.command  = /^antilink$/i
handler.help     = ['antilink on/off']
handler.tags     = ['group']
handler.group    = true
handler.admin    = true

// ════════════════════════════════════════════════════════
// 🔍 before — بيتسجل كـ property على الـ handler
// ════════════════════════════════════════════════════════
handler.before = async function (m, { conn, isAdmin, isBotAdmin, isOwner, isROwner }) {
  if (!m.isGroup) return
  if (!m.text)    return
  if (m.fromMe)   return
  if (isAdmin || isOwner || isROwner) return

  if (!global.db.data.chats[m.chat]) global.db.data.chats[m.chat] = {}
  const chat = global.db.data.chats[m.chat]

  // لو مش مفعّل — تجاهل
  if (!chat.antiLink) return

  // تحقق من اللينك
  const isGroupLink = linkRegex.test(m.text) || linkRegex1.test(m.text)
  if (!isGroupLink) return

  // استثناء لينك الجروب نفسه
  if (isBotAdmin) {
    try {
      const code = await conn.groupInviteCode(m.chat)
      if (m.text.includes(`chat.whatsapp.com/${code}`)) return
    } catch {}
  }

  // نظام الإنذارات
  if (!chat.warnings)             chat.warnings = {}
  if (!chat.warnings[m.sender])   chat.warnings[m.sender] = 0
  chat.warnings[m.sender]++

  const warns = chat.warnings[m.sender]
  const user  = `@${m.sender.split('@')[0]}`

  // أقل من 3 إنذارات
  if (warns < 3) {
    await conn.sendMessage(m.chat, {
      text:     `*「 مضاد الروابط 」*\n\n${user}\n⚠️ لا ترسل روابط!\nعدد إنذاراتك: *${warns}/3*`,
      mentions: [m.sender]
    }, { quoted: m }).catch(() => {})
    return true
  }

  // 3 إنذارات ➜ طرد
  await conn.sendMessage(m.chat, {
    text:     `*「 مضاد الروابط 」*\n\n${user}\n💀 وصلت 3 إنذارات → سيتم طردك!`,
    mentions: [m.sender]
  }, { quoted: m }).catch(() => {})

  if (!isBotAdmin) {
    await conn.sendMessage(m.chat, {
      text: `❌ أنا مش أدمن علشان أطرد العضو`
    }).catch(() => {})
    return true
  }

  // حذف الرسالة + طرد
  await conn.sendMessage(m.chat, {
    delete: { remoteJid: m.chat, fromMe: false, id: m.key.id, participant: m.sender }
  }).catch(() => {})

  await conn.groupParticipantsUpdate(m.chat, [m.sender], 'remove').catch(() => {})

  // إعادة تصفير الإنذارات
  chat.warnings[m.sender] = 0
  return true
}

export default handler