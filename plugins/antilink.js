// ════════════════════════════════════════════════════════
// ⛩️ SUKUNA BOT v4 — Anti-Link
// ════════════════════════════════════════════════════════

const linkRegex  = /chat\.whatsapp\.com\/([0-9A-Za-z]{20,24})/i
const linkRegex1 = /whatsapp\.com\/channel\/([0-9A-Za-z]{20,24})/i

// ── كشف إعادة توجيه رسالة من قناة (حتى لو من غير نص: صورة/فيديو/ملصق...) ──
const WRAPPERS = ['ephemeralMessage', 'viewOnceMessage', 'viewOnceMessageV2', 'viewOnceMessageV2Extension', 'documentWithCaptionMessage', 'editedMessage']
function unwrapMsg(message) {
  let cur = message || {}
  for (let i = 0; i < 5; i++) {
    const w = WRAPPERS.find(k => cur?.[k]?.message)
    if (!w) break
    cur = cur[w].message
  }
  return cur
}
function isChannelForward(m) {
  try {
    const direct = m.msg?.contextInfo
    if (direct?.forwardedNewsletterMessageInfo) return true
    const inner = unwrapMsg(m.message)
    for (const v of Object.values(inner || {})) {
      if (v && typeof v === 'object' && v.contextInfo?.forwardedNewsletterMessageInfo) return true
    }
  } catch {}
  return false
}

// ════════════════════════════════════════════════════════
// 📌 أمر .antilink on / off
// ════════════════════════════════════════════════════════

// ── فحص الأدمن الحقيقي (handler.js بيغلط في الـ LID فبيقول البوت مش أدمن) ──
const norm = j => String(j || '').split('@')[0].split(':')[0]
const idsOf = (...list) => list.flat().filter(Boolean).map(norm)
async function adminInfo(conn, chatId, m) {
  const meta = await conn.groupMetadata(chatId)
  const admins = new Set()
  for (const p of meta.participants || []) {
    if (p.admin) idsOf(p.id, p.lid, p.phoneNumber, p.jid).forEach(x => admins.add(x))
  }
  const botIds = idsOf(conn.user?.id, conn.user?.lid, conn.user?.jid)
  const userIds = idsOf(m.sender, m.key?.participant, m.key?.participantAlt)
  return {
    adminJids: (meta.participants || []).filter(p => p.admin).map(p => p.id || p.phoneNumber).filter(Boolean),
    botAdmin: botIds.some(x => admins.has(x)),
    userAdmin: userIds.some(x => admins.has(x)),
  }
}

const handler = async function (m, { conn, args, isAdmin, isROwner }) {
  if (!m.isGroup)
    return m.reply(
      `*╮═≼『⛩️┃تنبيه┃⛩️』≽═╭*\n` +
      `*┇⌗╎ꕥ هذا الأمر للمجموعات فقط ⌗*\n` +
      `*╯✯≼══━━﹂⛩️﹁━━══≽✯*`
    )

  if (!isAdmin && !isROwner) {
    try { isAdmin = (await adminInfo(conn, m.chat, m)).userAdmin } catch {}
  }
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

// ════════════════════════════════════════════════════════
// 🔍 before — بيتسجل كـ property على الـ handler
// ════════════════════════════════════════════════════════
handler.before = async function (m, { conn, isAdmin, isBotAdmin, isOwner, isROwner }) {
  if (!m.isGroup) return
  if (m.fromMe)   return
  const channelFwd = isChannelForward(m)       // إعادة توجيه من قناة (بنص أو من غير نص)
  if (!m.text && !channelFwd) return
  if (isOwner || isROwner) return

  if (!global.db.data.chats[m.chat]) global.db.data.chats[m.chat] = {}
  const chat = global.db.data.chats[m.chat]

  // لو مش مفعّل — تجاهل
  if (!chat.antiLink) return

  // تحقق من اللينك
  const text = m.text || ''
  const isGroupLink = linkRegex.test(text) || linkRegex1.test(text) || channelFwd
  if (!isGroupLink) return

  // فحص الأدمن الحقيقي
  let adminJids = []
  try {
    const info = await adminInfo(conn, m.chat, m)
    isBotAdmin = info.botAdmin
    adminJids = info.adminJids
    isAdmin = info.userAdmin
  } catch (e) { console.error('[antilink] فحص الأدمن فشل:', e.message) }
  if (isAdmin) return

  // استثناء لينك الجروب نفسه
  if (isBotAdmin && !channelFwd) {
    try {
      const code = await conn.groupInviteCode(m.chat)
      if (text.includes(`chat.whatsapp.com/${code}`)) return
    } catch {}
  }

  // 1) نمسح رسالة اللينك فورًا (محتاج البوت يكون أدمن)
  let deleted = false
  if (isBotAdmin) {
    try {
      await conn.sendMessage(m.chat, { delete: m.key })
      deleted = true
    } catch (e) { console.error('[antilink] فشل مسح الرسالة:', e.message) }
  }

  // 2) نظام الإنذارات
  if (!chat.warnings)             chat.warnings = {}
  if (!chat.warnings[m.sender])   chat.warnings[m.sender] = 0
  chat.warnings[m.sender]++

  const warns = chat.warnings[m.sender]
  const user  = `@${m.sender.split('@')[0]}`
  const opts  = deleted ? undefined : { quoted: m }   // لو الرسالة اتمسحت منقتبسهاش
  const note  = isBotAdmin ? '' : `\n\n❌ أنا مش أدمن، فمقدرش أمسح الرسالة أو أطرد`
  // سبب الإنذار: إعادة توجيه من قناة ولا رابط
  const onlyForward = channelFwd && !(linkRegex.test(text) || linkRegex1.test(text))
  const warnLine = onlyForward ? '⚠️ ممنوع إعادة توجيه رسائل القنوات!' : '⚠️ لا ترسل روابط!'
  const reasonLine = onlyForward ? 'إعادة توجيه رسائل من القنوات' : 'إرسال الروابط'

  // أقل من 3 إنذارات
  if (warns < 3) {
    await conn.sendMessage(m.chat, {
      text:     `*「 مضاد الروابط 」*\n\n${user}\n${warnLine}\nعدد إنذاراتك: *${warns}/3*${note}`,
      mentions: [m.sender]
    }, opts).catch(() => {})
    return true
  }

  // 3 إنذارات ➜ منشن للأدمنز (من غير طرد)
  const mentions = [m.sender, ...adminJids.filter(j => j !== m.sender)]
  const adminTags = adminJids.length ? adminJids.map(j => `@${norm(j)}`).join(' ') : '(مفيش أدمنز ظاهرين)'
  await conn.sendMessage(m.chat, {
    text:     `*「 مضاد الروابط 」*\n\n${user}\n🚨 وصل *3/3* إنذارات بسبب ${reasonLine}!\n\n👮 *يا أدمنز، اتصرفوا معاه:*\n${adminTags}`,
    mentions
  }, opts).catch(() => {})

  // نصفّر العداد عشان لو كرر يتنبه الأدمنز تاني بعد 3 جداد
  chat.warnings[m.sender] = 0
  return true
}

export default handler