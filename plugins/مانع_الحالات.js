// plugins/مانع_الحالات.js  —  ⛩️ SUKUNA BOT ⛩️
// منع منشن المجموعة في الستوري (الحالة) بثلاثة أوضاع مع أزرار. الأدمن والمطور مستثنون.

// صورة قائمة الإعدادات (غيّر الرابط هنا لو عايز صورة تانية)
const STATUS_IMAGE = 'https://file.garden/apRPrQwG5p78Av-N/fb605f1e759cc261622ed26dbd27bbcd%20(2).jpg'

const MODES = ['delete', 'warn', 'kick']
const modeNames = {
  delete: 'حذف وتنبيه فقط',
  warn: 'حذف وإنذار',
  kick: 'طرد فورًا'
}
const modeFromAction = {
  'حذف': 'delete', 'تنبيه': 'delete', 'حذف_وتنبيه': 'delete',
  'انذار': 'warn', 'إنذار': 'warn', 'حذف_وانذار': 'warn',
  'طرد': 'kick', 'طرد_فورا': 'kick'
}

const num = (jid) => String(jid || '').split('@')[0].split(':')[0]

function ensureChat(chatId) {
  if (!global.db?.data?.chats) return null
  const chat = (global.db.data.chats[chatId] ||= {})
  if (typeof chat.antiStatus !== 'boolean') chat.antiStatus = false
  if (!MODES.includes(chat.antiStatusMode)) chat.antiStatusMode = 'delete'
  if (!chat.warnings || typeof chat.warnings !== 'object') chat.warnings = {}
  return chat
}

// لو قاعدة البيانات مفيهاش writeData (lowdb) نكتب بـ write() بدلها بدل ما يحصل خطأ
const save = (chatId, data) =>
  global.db.writeData ? global.db.writeData('chats', chatId, data) : global.db.write?.()

// رسالة منشن المجموعة في الستوري بتوصل بأشكال مختلفة حسب نسخة واتساب/المكتبة
function isStatusMention(m) {
  const msg = m?.message || {}
  return Boolean(
    m?.mtype === 'groupStatusMentionMessage' ||
    msg.groupStatusMentionMessage ||
    msg.statusMentionMessage ||
    msg.protocolMessage?.type === 25 ||
    msg.protocolMessage?.type === 'STATUS_MENTION_MESSAGE'
  )
}

// بنقارن بالرقم على كل حقول المشارك (id / lid / phoneNumber) عشان LID
function isAdminInMeta(meta, jid) {
  const n = num(jid)
  return (meta?.participants || []).some((p) =>
    p.admin && [p.id, p.lid, p.phoneNumber, p.jid].some((x) => x && num(x) === n))
}

function isBotInMeta(conn, meta) {
  return [conn.user?.jid, conn.user?.id, conn.user?.lid, conn.user?.phoneNumber]
    .filter(Boolean).some((b) => isAdminInMeta(meta, b))
}

const isOwnerJid = (jid) => (global.owner || []).some((o) => {
  const n = String(Array.isArray(o) ? o[0] : o || '').replace(/\D/g, '')
  return n && n === num(jid).replace(/\D/g, '')
})

const statusText = (chat) => `╭━━ 🎞️ *مانع الحالات* ━━╮
│
│ الحالة: *${chat.antiStatus ? 'مفعّل ✅' : 'متوقف ❌'}*
│ الوضع: *${modeNames[chat.antiStatusMode]}*
│
│ بيمنع منشن المجموعة في الستوري.
│ الأدمن والمطور مستثنون.
│
│ اختر الوضع:
│ • حذف وتنبيه فقط (يحذف الستوري فقط)
│ • حذف وإنذار (3 إنذارات ثم طرد)
│ • طرد فورًا
│
│ أو بالكتابة:
│ • مانع_الحالات تشغيل / طفي
│ • مانع_الحالات حذف / انذار / طرد
│
│ ⛩️ SUKUNA BOT ⛩️
╰━━━━━━━━━━━━━━╯`

const handler = async (m, { conn, args = [], isAdmin, isOwner }) => {
  if (!m.isGroup) return m.reply('❌ هذا الأمر يعمل داخل المجموعات فقط.')

  const chat = ensureChat(m.chat)
  if (!chat) return m.reply('❌ قاعدة البيانات غير جاهزة.')

  const action = String(args[0] || '').trim().toLowerCase()

  if (!action) {
    try {
      return await conn.sendButton(
        m.chat,
        statusText(chat),
        'إعدادات مانع الحالات',
        STATUS_IMAGE,
        [
          ['🗑️ حذف وتنبيه فقط', '.مانع_الحالات حذف'],
          ['⚠️ حذف وإنذار', '.مانع_الحالات انذار'],
          ['🚫 طرد فورًا', '.مانع_الحالات طرد'],
          [chat.antiStatus ? '⛔ إيقاف المانع' : '✅ تشغيل المانع', chat.antiStatus ? '.مانع_الحالات طفي' : '.مانع_الحالات تشغيل']
        ],
        null, null, null, m
      )
    } catch {
      return m.reply(statusText(chat))
    }
  }

  if (!(isAdmin || isOwner || m.isAdmin)) return m.reply('❌ هذا الأمر للمشرفين فقط.')

  if (['تشغيل', 'تفعيل', 'on'].includes(action)) {
    chat.antiStatus = true
    await save(m.chat, { antiStatus: true, antiStatusMode: chat.antiStatusMode })
    return m.reply(`✅ تم تشغيل مانع الحالات.\n📌 الوضع الحالي: ${modeNames[chat.antiStatusMode]}`)
  }

  if (['طفي', 'تعطيل', 'off'].includes(action)) {
    chat.antiStatus = false
    await save(m.chat, { antiStatus: false })
    return m.reply('✅ تم إيقاف مانع الحالات.')
  }

  const mode = modeFromAction[action]
  if (mode) {
    chat.antiStatus = true
    chat.antiStatusMode = mode
    await save(m.chat, { antiStatus: true, antiStatusMode: mode })
    return m.reply(`✅ تم تفعيل مانع الحالات.\n📌 الوضع: ${modeNames[mode]}`)
  }

  return m.reply(
    '❌ الاستخدام الصحيح:\n' +
    'مانع_الحالات\nمانع_الحالات تشغيل\nمانع_الحالات طفي\n' +
    'مانع_الحالات حذف\nمانع_الحالات انذار\nمانع_الحالات طرد'
  )
}

handler.before = async function (m, { conn, isOwner, isROwner }) {
  if (!m?.isGroup || m.fromMe || !m.sender || !isStatusMention(m)) return

  const chat = ensureChat(m.chat)
  if (!chat?.antiStatus) return

  // المطور مستثنى
  if (isOwner || isROwner || isOwnerJid(m.sender)) return

  let meta
  try {
    meta = conn.chats?.[m.chat]?.metadata
    if (!meta?.participants?.length) meta = await conn.groupMetadata(m.chat)
  } catch (e) {
    console.error('[AntiStatus] تعذر جلب بيانات المجموعة:', e?.message || e)
    return
  }

  // الأدمن مستثنى، والبوت لازم يكون أدمن عشان يحذف/يطرد
  if (m.isAdmin || isAdminInMeta(meta, m.sender)) return
  if (!m.isBotAdmin && !isBotInMeta(conn, meta)) {
    console.error('[AntiStatus] البوت ليس مشرفًا')
    return
  }

  try {
    await conn.sendMessage(m.chat, {
      delete: { remoteJid: m.chat, fromMe: false, id: m.key.id, participant: m.key.participant || m.sender }
    })
  } catch (e) {
    console.error('[AntiStatus] فشل حذف الستوري:', e?.message || e)
  }

  const mention = { mentions: [m.sender] }
  const tag = `@${num(m.sender)}`

  if (chat.antiStatusMode === 'delete') {
    return conn.sendMessage(m.chat, { text: `🗑️ ${tag} تم حذف منشن المجموعة في الستوري. ممنوع منشن المجموعة في الحالات.`, ...mention }, { quoted: m })
  }

  if (chat.antiStatusMode === 'kick') {
    try {
      await conn.groupParticipantsUpdate(m.chat, [m.sender], 'remove')
      return conn.sendMessage(m.chat, { text: `🚫 تم طرد ${tag} بسبب منشن المجموعة في الستوري.`, ...mention })
    } catch (e) {
      console.error('[AntiStatus] فشل الطرد:', e?.message || e)
      return conn.sendMessage(m.chat, { text: `⚠️ تم حذف الستوري لكن معرفتش أطرد ${tag}.`, ...mention })
    }
  }

  // warn: حذف + إنذار، وعند 3 إنذارات طرد (نفس عدّاد تحذير ومانع الروابط)
  const strikes = (Number(chat.warnings[m.sender]) || 0) + 1
  chat.warnings[m.sender] = strikes
  if (strikes >= 3) {
    try {
      await conn.groupParticipantsUpdate(m.chat, [m.sender], 'remove')
      delete chat.warnings[m.sender]
      await save(m.chat, { warnings: chat.warnings })
      return conn.sendMessage(m.chat, { text: `🚫 تم طرد ${tag} بعد 3 إنذارات (منشن المجموعة في الستوري).`, ...mention })
    } catch (e) {
      console.error('[AntiStatus] فشل الطرد:', e?.message || e)
      await save(m.chat, { warnings: chat.warnings })
      return conn.sendMessage(m.chat, { text: `⚠️ تم حذف الستوري لكن معرفتش أطرد ${tag}. الإنذارات: ${strikes}/3`, ...mention })
    }
  }
  await save(m.chat, { warnings: chat.warnings })
  return conn.sendMessage(m.chat, {
    text: `⚠️ ${tag} ممنوع منشن المجموعة في الستوري.\n📊 الإنذار: ${strikes}/3`,
    ...mention
  }, { quoted: m })
}

handler.help = ['مانع_الحالات']
handler.tags = ['group']
handler.command = /^(مانع_الحالات|منع_الحالات)$/i
handler.group = true
handler.admin = true
handler.botAdmin = true

export default handler