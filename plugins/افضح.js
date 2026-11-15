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

    // ══════════════════════════════════════
    // طريقة 1: جلب الرسالة الكاملة من _voCache (فيها message object كامل)
    // ══════════════════════════════════════
    const cachedFullMsg = global._voCache.get(stanzaId)

    if (cachedFullMsg) {
      let quotedMessage = cachedFullMsg.message || {}

      // unwrap viewOnce
      if (quotedMessage?.viewOnceMessageV2?.message) {
        quotedMessage = quotedMessage.viewOnceMessageV2.message
      } else if (quotedMessage?.viewOnceMessage?.message) {
        quotedMessage = quotedMessage.viewOnceMessage.message
      } else if (quotedMessage?.viewOnceMessageV2Extension?.message) {
        quotedMessage = quotedMessage.viewOnceMessageV2Extension.message
      }

      const mediaType = Object.keys(quotedMessage || {})[0]
      const validMedia = ['imageMessage', 'videoMessage', 'audioMessage']

      if (validMedia.includes(mediaType)) {
        const mediaMsg = quotedMessage[mediaType]

        if (mediaMsg?.mediaKey) {
          await conn.sendMessage(m.chat, { react: { text: '👁️', key: m.key } })

          const typeMap = { imageMessage: 'image', videoMessage: 'video', audioMessage: 'audio' }
          const stream = await downloadContentFromMessage(mediaMsg, typeMap[mediaType])
          const chunks = []
          for await (const chunk of stream) chunks.push(chunk)
          const buffer = Buffer.concat(chunks)
          const caption = mediaMsg?.caption || '👁️ *تم الكشف*'

          if (mediaType === 'imageMessage') {
            return conn.sendMessage(m.chat, { image: buffer, caption }, { quoted: m })
          } else if (mediaType === 'videoMessage') {
            return conn.sendMessage(m.chat, { video: buffer, caption }, { quoted: m })
          } else if (mediaType === 'audioMessage') {
            return conn.sendMessage(m.chat, {
              audio: buffer,
              mimetype: 'audio/mp4',
              ptt: mediaMsg?.ptt || false
            }, { quoted: m })
          }
        }
      }
    }

    // ══════════════════════════════════════
    // طريقة 2: جلب الميديا المحملة مسبقاً من _msgCache (اكشف.js بيحملها)
    // ══════════════════════════════════════
    const cachedData = global._msgCache?.[stanzaId]

    if (cachedData?.media) {
      await conn.sendMessage(m.chat, { react: { text: '👁️', key: m.key } })
      const caption = '👁️ *تم الكشف*'

      if (cachedData.type === 'image') {
        return conn.sendMessage(m.chat, { image: cachedData.media, caption }, { quoted: m })
      } else if (cachedData.type === 'video') {
        return conn.sendMessage(m.chat, { video: cachedData.media, caption }, { quoted: m })
      } else if (cachedData.type === 'audio') {
        return conn.sendMessage(m.chat, {
          audio: cachedData.media,
          mimetype: 'audio/mp4',
          ptt: false
        }, { quoted: m })
      }
    }

    // مفيش كاش
    if (!cachedFullMsg && !cachedData) {
      return m.reply('❌ البوت لم يخزن الرسالة — تأكد إن البوت كان موجود وقت إرسالها')
    }

    return m.reply('⚠️ فشل التحميل — الميديا غير متاحة')

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

    const mtype = m.mtype || m.type || ''
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

    // حفظ الـ message object كامل في _voCache
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