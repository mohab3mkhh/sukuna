/**
 * plugins/اكشف.js
 * يحفظ الرسايل اللي اتمسحت ويعرضها بالأمر .اكشف
 */

if (!global._deletedMsgs) global._deletedMsgs = {}
if (!global._msgCache)    global._msgCache    = {}

const MAX = 50 // خلي الكاش أكبر عشان نقدر نفلتر

const handler = async (m, { conn, usedPrefix, command, isROwner }) => {
  if (!isROwner) return m.reply('❌ هذا الأمر للمالك فقط')

  const chatId = m.chat

  // جيب المنشن لو موجود
  const mentioned = m.mentionedJid?.[0] || 
                    (m.quoted?.sender) ||
                    null

  const allMsgs = global._deletedMsgs[chatId] || []

  // فلتر بالمنشن لو موجود
  const msgs = mentioned
    ? allMsgs.filter(msg => msg.sender === mentioned)
    : allMsgs

  if (!msgs.length) {
    const who = mentioned ? `@${mentioned.split('@')[0]}` : 'أي حد'
    return conn.sendMessage(chatId, {
      text: `📭 مفيش رسايل محذوفة لـ ${who} دلوقتي.`,
      mentions: mentioned ? [mentioned] : []
    }, { quoted: m })
  }

  const recent = msgs.slice(0, 10).reverse()
  const senderJid = recent[0]?.sender
  const senderTag = senderJid ? `@${senderJid.split('@')[0]}` : 'غير معروف'

  // اجمع الرسايل النصية في رسالة واحدة
  const textMsgs  = recent.filter(msg => msg.type === 'text' && (msg.text || msg.caption))
  const mediaMsgs = recent.filter(msg => msg.type !== 'text' && msg.media)

  if (textMsgs.length) {
    const lines = textMsgs.map((msg, i) => {
      const time    = new Date(msg.time).toLocaleString('ar-EG', { timeStyle: 'short', dateStyle: 'short' })
      const content = msg.text || msg.caption || ''
      return `*${i + 1}.* 🕐 ${time}\n📝 ${content}`
    })
    await conn.sendMessage(chatId, {
      text: `🔍 *الرسايل النصية المحذوفة لـ ${senderTag}:*\n\n${lines.join('\n\n━━━━━━━━\n\n')}`,
      mentions: senderJid ? [senderJid] : []
    }, { quoted: m })
  }

  for (const msg of mediaMsgs) {
    const time   = new Date(msg.time).toLocaleString('ar-EG', { timeStyle: 'short', dateStyle: 'short' })
    const header = `🔍 *ميديا محذوفة*\n👤 ${senderTag}\n🕐 ${time}`
    try {
      if (msg.type === 'image') {
        await conn.sendMessage(chatId, {
          image: msg.media,
          caption: `${header}${msg.caption ? '\n📝 ' + msg.caption : ''}`,
          mentions: senderJid ? [senderJid] : []
        }, { quoted: m })
      } else if (msg.type === 'sticker') {
        await conn.sendMessage(chatId, { text: header, mentions: senderJid ? [senderJid] : [] }, { quoted: m })
        await conn.sendMessage(chatId, { sticker: msg.media }, { quoted: m })
      } else if (msg.type === 'video') {
        await conn.sendMessage(chatId, {
          video: msg.media,
          caption: `${header}${msg.caption ? '\n📝 ' + msg.caption : ''}`,
          mentions: senderJid ? [senderJid] : []
        }, { quoted: m })
      } else if (msg.type === 'audio') {
        await conn.sendMessage(chatId, { text: header, mentions: senderJid ? [senderJid] : [] }, { quoted: m })
        await conn.sendMessage(chatId, { audio: msg.media, mimetype: 'audio/ogg; codecs=opus', ptt: true }, { quoted: m })
      }
      await new Promise(r => setTimeout(r, 500))
    } catch (e) {
      console.error('[اكشف send]', e.message)
    }
  }
}

// ══════════════════════════════════════════════════
// مستمع يلتقط الرسايل ويخزنها
// ══════════════════════════════════════════════════
handler.before = async function (m) {
  try {
    if (!m) return false

    const chatId = m.chat

    // لو حدث حذف
    const isRevoke =
      m.type === 'protocolMessage' ||
      m.msg?.type === 'revoke' ||
      m.mtype === 'protocolMessage'

    if (isRevoke) {
      const key   = m.msg?.key || m.message?.protocolMessage?.key
      if (!key) return false

      const msgId  = key.id
      const cached = global._msgCache?.[msgId]
      if (!cached) return false

      if (!global._deletedMsgs[chatId]) global._deletedMsgs[chatId] = []

      global._deletedMsgs[chatId].unshift(cached)

      if (global._deletedMsgs[chatId].length > MAX) {
        global._deletedMsgs[chatId] = global._deletedMsgs[chatId].slice(0, MAX)
      }

      return false
    }

    // خزّن الرسالة في الكاش
    const msgId = m.id || m.key?.id
    if (!msgId) return false

    const mtype = m.mtype || m.type || ''
    let type    = 'text'
    let text    = m.text || m.body || ''
    let caption = m.msg?.caption || ''
    let media   = null

    // كشف view once
    const isViewOnce = mtype === 'viewOnceMessageV2' || 
                       mtype === 'viewOnceMessage' ||
                       mtype === 'viewOnceMessageV2Extension' ||
                       !!m.message?.viewOnceMessageV2 ||
                       !!m.message?.viewOnceMessage

    let actualMsg = m.message
    if (isViewOnce) {
      actualMsg = m.message?.viewOnceMessageV2?.message ||
                  m.message?.viewOnceMessage?.message ||
                  m.message?.viewOnceMessageV2Extension?.message ||
                  m.msg?.message || {}
    }

    const actualType = Object.keys(actualMsg || {})[0] || mtype

    if (actualType.includes('image') || mtype.includes('image')) {
      type = 'image'
      try { media = await m.download() } catch {}
    } else if (actualType.includes('sticker') || mtype.includes('sticker')) {
      type = 'sticker'
      try { media = await m.download() } catch {}
    } else if (actualType.includes('video') || mtype.includes('video')) {
      type = 'video'
      try { media = await m.download() } catch {}
    } else if (actualType.includes('audio') || mtype.includes('audio')) {
      type = 'audio'
      try { media = await m.download() } catch {}
    }

    // لو view once وعندنا الميديا، خلي النوع واضح
    if (isViewOnce && media) {
      caption = (actualMsg?.[actualType]?.caption || '') + ' 👁️ [view once]'
    }

    global._msgCache[msgId] = {
      id:      msgId,
      sender:  m.sender || m.key?.participant || m.key?.remoteJid,
      text:    text.slice(0, 500),
      caption: caption.slice(0, 300),
      type,
      media,
      time:    Date.now()
    }

    // نظف الكاش لو كبر
    const keys = Object.keys(global._msgCache)
    if (keys.length > 300) {
      keys.slice(0, keys.length - 300).forEach(k => delete global._msgCache[k])
    }

  } catch (e) {
    console.error('[اكشف]', e.message)
  }
  return false
}

handler.help    = ['اكشف', 'اكشف @شخص']
handler.tags    = ['tools']
handler.command = /^(اكشف|reveal)$/i

export default handler