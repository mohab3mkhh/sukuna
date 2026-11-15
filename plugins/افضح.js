// plugins/viewonce.js
import { downloadContentFromMessage } from '@whiskeysockets/baileys'

// ===== كاش محلي للرسايل =====
// بيتملى تلقائياً من handler.js لو أضفت السطر ده:
// if (m.message?.viewOnceMessageV2 || m.message?.viewOnceMessage) global._voCache?.set(m.key.id, m)
const voCache = global._voCache || (global._voCache = new Map())

let handler = async (m, { conn }) => {
  try {
    const contextInfo =
      m.message?.extendedTextMessage?.contextInfo ||
      m.message?.imageMessage?.contextInfo ||
      m.message?.videoMessage?.contextInfo

    if (!contextInfo?.quotedMessage) {
      return m.reply('⚠️ رد على رسالة عرض لمرة واحدة بكتابة .ع')
    }

    const stanzaId = contextInfo.stanzaId

    // ===== جلب الرسالة الكاملة من الكاش =====
    let fullMsg = voCache.get(stanzaId) || null

    // لو مش في الكاش، جرب من conn.chats
    if (!fullMsg) {
      try {
        const chatMsgs = conn.chats?.[m.chat]?.messages
        if (chatMsgs) {
          fullMsg = [...(chatMsgs.values?.() || Object.values(chatMsgs))]
            .find(msg => msg.key?.id === stanzaId) || null
        }
      } catch {}
    }

    // استخراج الرسالة
    let quotedMessage = fullMsg?.message || contextInfo.quotedMessage

    // unwrap viewOnce
    if (quotedMessage?.viewOnceMessageV2?.message) {
      quotedMessage = quotedMessage.viewOnceMessageV2.message
    } else if (quotedMessage?.viewOnceMessage?.message) {
      quotedMessage = quotedMessage.viewOnceMessage.message
    } else if (quotedMessage?.viewOnceMessageV2Extension?.message) {
      quotedMessage = quotedMessage.viewOnceMessageV2Extension.message
    }

    const mediaType  = Object.keys(quotedMessage || {})[0]
    const validMedia = ['imageMessage', 'videoMessage', 'audioMessage']

    if (!validMedia.includes(mediaType)) {
      return m.reply('❌ الرسالة لا تحتوي على ميديا مدعومة')
    }

    const mediaMsg = quotedMessage[mediaType]

    if (!mediaMsg?.mediaKey) {
      return m.reply(
        '❌ البوت لم يخزن الرسالة\n\n' +
        '📌 *الحل:* أضف السطر ده في handler.js بعد سطر smsg:\n' +
        '```if (m.message?.viewOnceMessageV2 || m.message?.viewOnceMessage || m.message?.viewOnceMessageV2Extension) global._voCache?.set(m.key.id, m)```'
      )
    }

    await conn.sendMessage(m.chat, { react: { text: '👁️', key: m.key } })

    const typeMap = {
      imageMessage: 'image',
      videoMessage: 'video',
      audioMessage: 'audio'
    }

    const stream = await downloadContentFromMessage(mediaMsg, typeMap[mediaType])
    const chunks = []
    for await (const chunk of stream) chunks.push(chunk)
    const buffer = Buffer.concat(chunks)

    const caption = mediaMsg?.caption || '👁️ *تم الكشف*'

    if (mediaType === 'imageMessage') {
      await conn.sendMessage(m.chat, { image: buffer, caption }, { quoted: m })
    } else if (mediaType === 'videoMessage') {
      await conn.sendMessage(m.chat, { video: buffer, caption }, { quoted: m })
    } else if (mediaType === 'audioMessage') {
      await conn.sendMessage(m.chat, {
        audio: buffer,
        mimetype: 'audio/mp4',
        ptt: mediaMsg?.ptt || false
      }, { quoted: m })
    }

  } catch (err) {
    console.error('[عرض]', err.message)
    m.reply('⚠️ فشل التحميل — ' + err.message)
  }
}

handler.help    = ['فضح', 'عرض']
handler.tags    = ['ادوات']
handler.command = /^(ع|عرض|view|فضح|vv)$/i

export default handler