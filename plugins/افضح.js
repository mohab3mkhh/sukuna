// plugins/viewonce.js
import { downloadContentFromMessage } from '@whiskeysockets/baileys'

if (!global._voCache) global._voCache = new Map()

const handler = async (m, { conn }) => {
  try {
    const contextInfo =
      m.message?.extendedTextMessage?.contextInfo ||
      m.message?.imageMessage?.contextInfo ||
      m.message?.videoMessage?.contextInfo

    if (!contextInfo?.quotedMessage) {
      return m.reply('⚠️ رد على رسالة عرض لمرة واحدة بكتابة .ع')
    }

    const stanzaId = contextInfo.stanzaId

    // جلب الرسالة الكاملة من الكاش
    const fullMsg = global._voCache.get(stanzaId) || null

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
      return m.reply('⚠️ فشل التحميل — الرسالة قديمة أو تم حذفها')
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

// ══════════════════════════════════════════════════
// يحفظ كل رسالة viewOnce بتيجي تلقائياً
// ══════════════════════════════════════════════════
handler.before = async function (m) {
  try {
    if (!m?.message) return false

    const mtype = m.mtype || ''
    const isViewOnce =
      mtype === 'viewOnceMessageV2' ||
      mtype === 'viewOnceMessage' ||
      mtype === 'viewOnceMessageV2Extension' ||
      !!m.message?.viewOnceMessageV2 ||
      !!m.message?.viewOnceMessage ||
      !!m.message?.viewOnceMessageV2Extension

    if (!isViewOnce) return false

    const msgId = m.id || m.key?.id
    if (!msgId) return false

    global._voCache.set(msgId, m)

    // امسح القديم لو الكاش كبر
    if (global._voCache.size > 200) {
      const firstKey = global._voCache.keys().next().value
      global._voCache.delete(firstKey)
    }

  } catch (e) {
    console.error('[عرض before]', e.message)
  }
  return false
}

handler.help    = ['فضح', 'عرض']
handler.tags    = ['ادوات']
handler.command = /^(ع|عرض|view|فضح|vv)$/i

export default handler