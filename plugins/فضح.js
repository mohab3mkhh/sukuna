// plugins/viewonce.js
import { downloadMediaMessage } from '@whiskeysockets/baileys'

let handler = async (m, { conn }) => {
  try {
    const contextInfo =
      m.message?.extendedTextMessage?.contextInfo ||
      m.message?.imageMessage?.contextInfo ||
      m.message?.videoMessage?.contextInfo

    if (!contextInfo?.quotedMessage) {
      return m.reply('⚠️ رد على رسالة عرض لمرة واحدة بكتابة .ع')
    }

    let quotedMessage = contextInfo.quotedMessage

    // استخراج الرسالة من كل أنواع viewOnce
    if (quotedMessage.viewOnceMessageV2?.message) {
      quotedMessage = quotedMessage.viewOnceMessageV2.message
    } else if (quotedMessage.viewOnceMessage?.message) {
      quotedMessage = quotedMessage.viewOnceMessage.message
    } else if (quotedMessage.viewOnceMessageV2Extension?.message) {
      quotedMessage = quotedMessage.viewOnceMessageV2Extension.message
    }

    const mediaType  = Object.keys(quotedMessage || {})[0]
    const validMedia = ['imageMessage', 'videoMessage', 'audioMessage']

    if (!validMedia.includes(mediaType)) {
      return m.reply('❌ الرسالة لا تحتوي على ميديا مدعومة')
    }

    await conn.sendMessage(m.chat, { react: { text: '👁️', key: m.key } })

    // بناء كائن الرسالة الكامل للتحميل
    const fakeMsg = {
      key: {
        remoteJid: m.chat,
        id: contextInfo.stanzaId || m.key.id
      },
      message: quotedMessage
    }

    let buffer = null

    // طريقة 1 — downloadMediaMessage العادي
    try {
      buffer = await downloadMediaMessage(
        fakeMsg,
        'buffer',
        {},
        {
          logger: console,
          reuploadRequest: conn.updateMediaMessage?.bind(conn)
        }
      )
    } catch (e1) {
      console.error('[عرض] طريقة 1 فشلت:', e1.message)
    }

    // طريقة 2 — بدون reuploadRequest
    if (!buffer) {
      try {
        buffer = await downloadMediaMessage(
          fakeMsg,
          'buffer',
          {}
        )
      } catch (e2) {
        console.error('[عرض] طريقة 2 فشلت:', e2.message)
      }
    }

    // طريقة 3 — downloadContentFromMessage يدوي
    if (!buffer) {
      try {
        const { downloadContentFromMessage } = await import('@whiskeysockets/baileys')
        const mediaMsg = quotedMessage[mediaType]
        const stream = await downloadContentFromMessage(mediaMsg, mediaType.replace('Message', ''))
        const chunks = []
        for await (const chunk of stream) chunks.push(chunk)
        buffer = Buffer.concat(chunks)
      } catch (e3) {
        console.error('[عرض] طريقة 3 فشلت:', e3.message)
      }
    }

    if (!buffer) {
      return m.reply('⚠️ فشل التحميل — الرسالة قديمة أو تم حذفها')
    }

    const caption = quotedMessage[mediaType]?.caption || '👁️ *تم الكشف*'

    if (mediaType === 'imageMessage') {
      await conn.sendMessage(m.chat, { image: buffer, caption }, { quoted: m })
    } else if (mediaType === 'videoMessage') {
      await conn.sendMessage(m.chat, { video: buffer, caption }, { quoted: m })
    } else if (mediaType === 'audioMessage') {
      await conn.sendMessage(m.chat, {
        audio: buffer,
        mimetype: 'audio/mp4',
        ptt: quotedMessage[mediaType]?.ptt || false
      }, { quoted: m })
    }

  } catch (err) {
    console.error('[عرض]', err.message)
    m.reply('⚠️ فشل التحميل — الرسالة قديمة أو تم حذفها')
  }
}

handler.help    = ['فضح', 'عرض']
handler.tags    = ['ادوات']
handler.command = /^(ع|عرض|view|فضح|vv)$/i

export default handler