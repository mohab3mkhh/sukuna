// plugins/مانع_الجهات.js
// ⛩️ SUKUNA BOT ⛩️ - مانع جهات الاتصال 🛡️
// أي عضو (غير مشرف) يبعت جهة اتصال في المجموعة: يتطرد فورًا، تتمسح كل جهاته،
// وبعد التأكد من المسح البوت يبعت رسالة التحذير مع منشن العضو.

// ✏️ رسالة التحذير (غيّرها زي ما تحب). {user} مكان منشن العضو.
const ANNOUNCE_TEXT =
  'القحبه {user} كان هيبند الشات\n' +
  'بوت سوكونا ⛩️ لديكم لا خوف عليكم🥰👌🏿'

const QUIET_MS = 2500      // مدة هدوء بعد آخر جهة عشان نتأكد إن مفيش جهات تانية جاية
const DELETE_RETRIES = 2   // عدد محاولات إعادة الحذف لو فشل

function ensureChatData(chatId) {
  if (!global.db?.data?.chats) return null
  if (!global.db.data.chats[chatId]) global.db.data.chats[chatId] = {}
  const chat = global.db.data.chats[chatId]
  if (typeof chat.antiContacts !== 'boolean') chat.antiContacts = false
  return chat
}

function jidMatches(conn, left, right) {
  if (!left || !right) return false
  const decode = (jid) => {
    try { return conn.decodeJid?.(jid) || jid } catch { return jid }
  }
  const clean = (jid) => String(decode(jid)).replace(/:\d+(?=@)/, '')
  const a = clean(left)
  const b = clean(right)
  if (a === b) return true
  const digits = (jid) => String(jid).split('@')[0].replace(/:\d+$/, '').replace(/\D/g, '')
  const da = digits(a)
  const db = digits(b)
  return da.length >= 7 && db.length >= 7 && da === db
}

function isBotOwner(jid) {
  const number = String(jid || '').split('@')[0].split(':')[0].replace(/\D/g, '')
  return (global.owner || []).some((owner) => {
    const ownerNumber = Array.isArray(owner) ? owner[0] : owner
    const cleanOwner = String(ownerNumber || '').split('@')[0].split(':')[0].replace(/\D/g, '')
    return number && cleanOwner && number === cleanOwner
  })
}

async function getFreshMetadata(conn, chatId) {
  const metadata = await conn.groupMetadata(chatId)
  if (metadata && conn.chats) {
    conn.chats[chatId] = {
      ...(conn.chats[chatId] || {}),
      id: chatId,
      subject: metadata.subject,
      metadata
    }
  }
  return metadata
}

function isParticipantAdmin(conn, participant, jid) {
  return Boolean(
    participant &&
    (participant.admin === 'admin' || participant.admin === 'superadmin') &&
    jidMatches(conn, participant.id || participant.jid || participant.lid, jid)
  )
}

async function isBotAdmin(conn, m, metadata) {
  if (m.isBotAdmin) return true
  const botIds = [conn.user?.jid, conn.user?.id, conn.user?.lid, conn.user?.phoneNumber].filter(Boolean)
  return (metadata?.participants || []).some((p) =>
    botIds.some((botId) => isParticipantAdmin(conn, p, botId))
  )
}

async function isSenderAdmin(conn, m, metadata) {
  if (m.isAdmin) return true
  return (metadata?.participants || []).some((p) => isParticipantAdmin(conn, p, m.sender))
}

// ---- كشف رسائل جهات الاتصال (حتى لو جوه ephemeral / view once) ----
const WRAPPERS = [
  'ephemeralMessage', 'viewOnceMessage', 'viewOnceMessageV2',
  'viewOnceMessageV2Extension', 'documentWithCaptionMessage', 'editedMessage'
]

function unwrap(message) {
  let current = message
  for (let i = 0; i < 5 && current; i++) {
    let next = null
    for (const wrapper of WRAPPERS) {
      if (current[wrapper]?.message) { next = current[wrapper].message; break }
    }
    if (!next) break
    current = next
  }
  return current
}

function hasContacts(m) {
  const type = String(m.mtype || '')
  if (type === 'contactMessage' || type === 'contactsArrayMessage') return true
  const inner = unwrap(m.message)
  return Boolean(inner?.contactMessage || inner?.contactsArrayMessage)
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function deleteMessage(conn, m) {
  for (let attempt = 0; attempt <= DELETE_RETRIES; attempt++) {
    try {
      await conn.sendMessage(m.chat, {
        delete: {
          remoteJid: m.chat,
          fromMe: false,
          id: m.key.id,
          participant: m.key.participant || m.sender
        }
      })
      return true
    } catch (error) {
      console.error(`[AntiContacts] فشل الحذف (محاولة ${attempt + 1}):`, error?.message || error)
      await sleep(400)
    }
  }
  return false
}

// جلسة لكل (مجموعة + عضو): بتجمّع كل الجهات اللي بعتها قبل ما نبعت الرسالة النهائية
const sessions = new Map()
const noAdminNoticeAt = new Map()

async function finalize(conn, key, chatId, sender) {
  const session = sessions.get(key)
  if (!session || session.pending > 0) return   // لسه فيه حذف شغال أو جهة جديدة وصلت
  sessions.delete(key)

  const kicked = await session.kickPromise
  if (!kicked) console.error('[AntiContacts] تعذر طرد العضو:', sender)

  // نبعت الرسالة بس لو اتأكدنا إن كل الجهات اتمسحت
  if (session.failed > 0 || session.deleted === 0) {
    console.error(`[AntiContacts] لم يتم التأكد من مسح كل الجهات (تم: ${session.deleted}، فشل: ${session.failed})`)
    return
  }

  const number = String(sender).split('@')[0].split(':')[0]
  await conn.sendMessage(chatId, {
    text: ANNOUNCE_TEXT.replace('{user}', '@' + number),
    mentions: [sender]
  }).catch((error) => {
    console.error('[AntiContacts] فشل إرسال الرسالة:', error?.message || error)
  })
}

const statusText = (chat) => `╭━━ 📇 *مانع الجهات* ━━╮
│
│ الحالة: *${chat.antiContacts ? 'مفعّل ✅' : 'متوقف ❌'}*
│
│ أي عضو يبعت جهة اتصال:
│ • يتطرد فورًا
│ • تتمسح كل جهاته
│ • البوت يبعت رسالة تحذير
│
│ يمكنك استخدام الأزرار أو الكتابة:
│ • مانع_الجهات شغل
│ • مانع_الجهات طفي
│
╰━━━━━━━━━━━━━━╯`

const ON_WORDS = ['شغل', 'تشغيل', 'تفعيل', 'فعل', 'on']
const OFF_WORDS = ['طفي', 'اطفي', 'ايقاف', 'تعطيل', 'off']

const handler = async (m, { conn, args, isAdmin, isOwner }) => {
  if (!m.isGroup) return m.reply('❌ هذا الأمر يعمل داخل المجموعات فقط.')

  const chat = ensureChatData(m.chat)
  if (!chat) return m.reply('❌ قاعدة البيانات غير جاهزة.')

  const action = String(args?.[0] || '').trim().toLowerCase()

  // بدون كلمة: اعرض اللوحة بالأزرار
  if (!action) {
    try {
      return await conn.sendButton(
        m.chat,
        statusText(chat),
        'إعدادات مانع الجهات',
        null,
        [
          ['✅ تفعيل', '.مانع_الجهات شغل'],
          ['⛔ طفي', '.مانع_الجهات طفي']
        ],
        null,
        null,
        null,
        m
      )
    } catch {
      return m.reply(statusText(chat))
    }
  }

  if (!(isAdmin || isOwner)) return m.reply('❌ هذا الأمر للمشرفين فقط.')

  if (ON_WORDS.includes(action)) {
    let metadata
    try { metadata = await getFreshMetadata(conn, m.chat) } catch {}
    if (!(await isBotAdmin(conn, m, metadata))) {
      return m.reply('⚠️ يجب أن يكون البوت مشرفًا أولًا حتى يطرد ويمسح الجهات.')
    }
    chat.antiContacts = true
    await (global.db.writeData ? global.db.writeData('chats', m.chat, { antiContacts: true }) : global.db.write?.())
    return m.reply('✅ تم تشغيل مانع الجهات.\n📌 أي عضو يبعت جهة اتصال هيتطرد وتتمسح جهاته.')
  }

  if (OFF_WORDS.includes(action)) {
    chat.antiContacts = false
    await (global.db.writeData ? global.db.writeData('chats', m.chat, { antiContacts: false }) : global.db.write?.())
    return m.reply('✅ تم إيقاف مانع الجهات.')
  }

  return m.reply('❌ الاستخدام الصحيح:\nمانع_الجهات\nمانع_الجهات شغل\nمانع_الجهات طفي')
}

handler.before = async (m, { conn }) => {
  if (!m?.isGroup || m.fromMe || !m.sender || !m.key?.id) return
  if (!hasContacts(m)) return

  const chat = ensureChatData(m.chat)
  if (!chat?.antiContacts) return

  let metadata
  try {
    metadata = conn.chats?.[m.chat]?.metadata
    if (!metadata?.participants?.length) metadata = await getFreshMetadata(conn, m.chat)
  } catch (error) {
    console.error('[AntiContacts] تعذر جلب بيانات المجموعة:', error?.message || error)
    return
  }

  if (!(await isBotAdmin(conn, m, metadata))) {
    const now = Date.now()
    if (now - (noAdminNoticeAt.get(m.chat) || 0) > 60 * 1000) {
      noAdminNoticeAt.set(m.chat, now)
      await conn.sendMessage(m.chat, {
        text: '⚠️ *مانع الجهات مفعّل*\nتم اكتشاف جهة اتصال لكن البوت ليس مشرفًا.\n✅ ارفع البوت مشرفًا حتى يعمل المانع.'
      }).catch(() => {})
    }
    return
  }

  // المشرفون والمطور مسموح لهم
  if (isBotOwner(m.sender) || await isSenderAdmin(conn, m, metadata)) return

  const key = `${m.chat}|${m.sender}`
  let session = sessions.get(key)
  if (!session) {
    session = { pending: 0, deleted: 0, failed: 0, timer: null, kickPromise: null }
    sessions.set(key, session)
    // الطرد فورًا (من غير ما ننتظر الحذف)
    session.kickPromise = conn.groupParticipantsUpdate(m.chat, [m.sender], 'remove')
      .then(() => true)
      .catch((error) => {
        console.error('[AntiContacts] فشل الطرد:', error?.message || error)
        return false
      })
  }

  clearTimeout(session.timer)
  session.pending++

  const ok = await deleteMessage(conn, m)
  session.pending--
  if (ok) session.deleted++
  else session.failed++

  // بعد فترة هدوء من غير جهات جديدة، نتأكد ونبعت الرسالة
  clearTimeout(session.timer)
  session.timer = setTimeout(() => {
    finalize(conn, key, m.chat, m.sender).catch((error) => {
      console.error('[AntiContacts] خطأ أثناء الإنهاء:', error?.message || error)
      sessions.delete(key)
    })
  }, QUIET_MS)
}

handler.help = ['مانع_الجهات']
handler.tags = ['group']
handler.command = /^(مانع_الجهات|منع_الجهات)$/i
handler.group = true
handler.admin = true
handler.botAdmin = true

export default handler