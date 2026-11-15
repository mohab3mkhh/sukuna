// plugins/viewonce.js — نسخة DEBUG مؤقتة
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

    // ══ DEBUG ══
    console.log('[عرض LOOKUP]', {
      stanzaId,
      voCacheSize: global._voCache?.size,
      inVoCache: global._voCache?.has(stanzaId),
      inMsgCache: !!global._msgCache?.[stanzaId]
    })

    const cachedFullMsg = global._voCache.get(stanzaId)

    if (cachedFullMsg) {
      let quotedMessage = cachedFullMsg.message || {}

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
          if (mediaType === 'imageMessage') return conn.sendMessage(m.chat, { image: buffer, caption }, { quoted: m })
          if (mediaType === 'videoMessage') return conn.sendMessage(m.chat, { video: buffer, caption }, { quoted: m })
          if (mediaType === 'audioMessage') return conn.sendMessage(m.chat, { audio: buffer, mimetype: 'audio/mp4', ptt: mediaMsg?.ptt || false }, { quoted: m })
        }
      }
    }

    const cachedData = global._msgCache?.[stanzaId]
    if (cachedData?.media) {
      await conn.sendMessage(m.chat, { react: { text: '👁️', key: m.key } })
      if (cachedData.type === 'image') return conn.sendMessage(m.chat, { image: cachedData.media, caption: '👁️ *تم الكشف*' }, { quoted: m })
      if (cachedData.type === 'video') return conn.sendMessage(m.chat, { video: cachedData.media, caption: '👁️ *تم الكشف*' }, { quoted: m })
      if (cachedData.type === 'audio') return conn.sendMessage(m.chat, { audio: cachedData.media, mimetype: 'audio/mp4', ptt: false }, { quoted: m })
    }

    if (!cachedFullMsg && !cachedData) {
      return m.reply('❌ البوت لم يخزن الرسالة\n\n📋 *DEBUG:*\n• stanzaId: ' + stanzaId + '\n• voCache size: ' + (global._voCache?.size || 0) + '\n• msgCache keys: ' + Object.keys(global._msgCache || {}).length)
    }

    return m.reply('⚠️ فشل التحميل')

  } catch (err) {
    console.error('[عرض]', err.message)
    m.reply('⚠️ فشل التحميل — ' + err.message)
  }
}

handler.before = async function (m) {
  try {
    if (!m?.message) return false

    const mtype = m.mtype || m.type || ''

    // ══ DEBUG: اطبع كل رسالة بتيجي ══
    console.log('[عرض BEFORE]', {
      id: m.id || m.key?.id,
      mtype,
      messageKeys: Object.keys(m.message || {})
    })

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

    // ══ DEBUG ══
    console.log('[عرض BEFORE] ✅ تم حفظ viewOnce:', msgId)

    global._voCache.set(msgId, m)

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