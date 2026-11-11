// plugins/neko.js
import fetch from 'node-fetch'
import pkg from '@whiskeysockets/baileys'
const { generateWAMessageFromContent, prepareWAMessageMedia } = pkg

let handler = async (m, { conn, command, usedPrefix }) => {
  try {
    await m.react('⏳')
    
    // جلب صورة neko
    const response = await fetch('https://nekos.life/api/v2/img/neko')
    const data = await response.json()
    const nekoUrl = data.url
    
    // تجهيز الصورة
    const imageMessage = await prepareWAMessageMedia(
      { image: { url: nekoUrl } },
      { upload: conn.waUploadToServer }
    )
    
    // بناء الأزرار
    const buttons = [
      {
        name: 'quick_reply',
        buttonParamsJson: JSON.stringify({
          display_text: '🐱 التالي 🆕',
          id: `${usedPrefix}${command}`
        })
      }
    ]
    
    // بناء الرسالة التفاعلية
    const interactiveMessage = {
      viewOnceMessage: {
        message: {
          interactiveMessage: {
            header: { hasMediaAttachment: true, ...imageMessage },
            body: { text: 'Nyaww~ 🐾💗\n🐱 قطط أنمي لطيفة' },
            footer: { text: 'اضغط الزر لصورة جديدة' },
            nativeFlowMessage: { buttons }
          }
        }
      }
    }
    
    const msg = generateWAMessageFromContent(m.chat, interactiveMessage, { userJid: conn.user.id })
    await conn.relayMessage(m.chat, msg.message, { messageId: msg.key.id })
    await m.react('✅')
    
  } catch (error) {
    console.error(error)
    await m.react('❌')
    await m.reply('❌ حدث خطأ في جلب الصورة، حاول مرة أخرى')
  }
}

handler.command = /^(كيوت|neko)$/i
handler.tags = ['anime']
handler.help = ['neko']

export default handler