// plugins/viewonce.js
import { downloadContentFromMessage } from '@whiskeysockets/baileys'

let handler = async (m, { conn }) => {
  try {
    const contextInfo =
      m.message?.extendedTextMessage?.contextInfo ||
      m.message?.imageMessage?.contextInfo ||
      m.message?.videoMessage?.contextInfo

    if (!contextInfo?.quotedMessage) {
      return m.reply('⚠️ رد على رسالة عرض لمرة واحدة بكتابة .ع')
    }

    // ===== محاولة جلب الرسالة الكاملة من الـ store =====
    const stanzaId   = contextInfo.stanzaId
    const participant = contextInfo.participant || contextInfo.remoteJid || m.chat

    let fullMsg = null

    // طريقة 1 — من store البوت
    try {
      const stored = await conn.store?.loadMessage?.(m.chat, stanzaId)
        || conn.loadMessage?.(m.chat, stanzaId)
        || conn.getMessage?.(m.chat, stanzaId)
      if (stored?.message) fullMsg = stored
    } catch {}

    // طريقة 2 — من messages cache
    if (!fullMsg) {
      try {
        const msgs = conn.chats?.[m.chat]?.messages || conn.messages?.get?.(m.chat)
        if (msgs) {
          const found = [...(msgs.values?.() || Object.values(msgs))].find(
            msg => msg.key?.id === stanzaId
          )
          if (found?.message) fullMsg = found
        }
      } catch {}
    }

    // استخراج الرسالة — إما من store أو من contextInfo مباشرة
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

    // تحقق إن فيه directPath أو url
    if (!mediaMsg?.directPath && !mediaMsg?.url && !mediaMsg?.mediaKey) {
      return m.reply('❌ البوت لم يخزن الرسالة — يجب أن يكون البوت في الجروب وقت الإرسال')
    }

    await conn.sendMessage(m.chat, { react: { text: '👁️', key: m.key } })

    // تحميل الميديا
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