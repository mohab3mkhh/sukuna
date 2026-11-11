import moment from 'moment-timezone'
import { prepareWAMessageMedia, generateWAMessageFromContent } from '@whiskeysockets/baileys'

let usageLimits = {}

let handler = async (m, { isOwner, isAdmin, conn, text, participants, args, command }) => {
  if (!(isAdmin || isOwner)) {
    global.dfail('admin', m, conn)
    throw false
  }

  let groupId = m.chat
  let senderId = m.sender
  let usageKey = `${groupId}:${command}`

  if (command === 'تحديد_منشن') {
    if (!isOwner) {
      m.reply('❌ هذا الأمر متاح فقط للمطور.')
      return
    }
    let limit = parseInt(args[0])
    if (isNaN(limit) || limit <= 0) {
      m.reply('❌ الرجاء إدخال رقم صحيح كحد للاستخدام.')
      return
    }
    usageLimits[groupId] = limit
    m.reply(`✨💖 تم تعيين الحد الأقصى لاستخدام أوامر المنشن إلى *${limit}* مرة 🎀🌸`)
    return
  }

  if (!usageLimits[groupId]) usageLimits[groupId] = 3
  if (usageLimits[usageKey] === undefined) usageLimits[usageKey] = usageLimits[groupId]

  if (usageLimits[usageKey] <= 0) {
    m.reply('❌ تم استنفاد الحد الأقصى لاستخدام هذا الأمر في المجموعة. الرجاء التواصل مع المطور لإعادة التعيين.')
    return
  }

  const coverImageUrl = 'https://files.catbox.moe/pp8b1z.jpg'
  const messa = await prepareWAMessageMedia(
    { image: { url: coverImageUrl } },
    { upload: conn.waUploadToServer }
  )

  const messageContent = {
    buttonsMessage: {
      contentText: "✨ *اختر نوع المنشن الذي تريده:*",
      footerText: "⛩️ *SUKUNA ⚡️ BOT* ⛩️",
      buttons: [
        {
          buttonId: ".منشن_الكل",
          buttonText: { displayText: '👥 منشن الكل' },
          type: 1
        },
        {
          buttonId: ".منشن_اعضاء",
          buttonText: { displayText: '🌟 منشن الأعضاء' },
          type: 1
        },
        {
          buttonId: ".منشن_مشرفين",
          buttonText: { displayText: '👑 منشن المشرفين' },
          type: 1
        }
      ],
      headerType: 4,
      imageMessage: messa.imageMessage,
    }
  }

  const message = generateWAMessageFromContent(
    m.chat,
    { ephemeralMessage: { message: messageContent } },
    { userJid: conn.user.id }
  )

  await conn.relayMessage(m.chat, message.message, { messageId: message.key.id })
}

handler.help = ['منشن_اعضاء', 'منشن_مشرفين', 'منشن_الكل', 'تحديد_منشن']
handler.tags = ['group']
handler.command = /^(منشن)$/i
handler.admin = true
handler.group = true

export default handler