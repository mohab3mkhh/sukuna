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

    if (quotedMessage.viewOnceMessageV2) {
      quotedMessage = quotedMessage.viewOnceMessageV2.message
    } else if (quotedMessage.viewOnceMessage) {
      quotedMessage = quotedMessage.viewOnceMessage.message
    } else if (quotedMessage.viewOnceMessageV2Extension) {
      quotedMessage = quotedMessage.viewOnceMessageV2Extension.message
    }

    const mediaType  = Object.keys(quotedMessage || {})[0]
    const validMedia = ['imageMessage', 'videoMessage', 'audioMessage']

    if (!validMedia.includes(mediaType)) {
      return m.reply('❌ الرسالة لا تحتوي على ميديا مدعومة')
    }

    await conn.sendMessage(m.chat, { react: { text: '👁️', key: m.key } })

    const buffer = await downloadMediaMessage(
      { message: quotedMessage },
      'buffer',
      {},
      { logger: console, reuploadRequest: conn.updateMediaMessage }
    )

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