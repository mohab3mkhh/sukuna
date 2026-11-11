// lib/buttons.js
// إرسال أزرار واتساب (native flow) بحقن الرسالة والـ binary nodes يدوياً
// بيشتغل على @whiskeysockets/baileys الأصلية من غير أي fork.

import pkg from '@whiskeysockets/baileys'

const { proto, generateWAMessageFromContent, prepareWAMessageMedia } = pkg

// يحوّل أي شكل بسيط لزرار native flow
// { id, text }                  → quick_reply
// { url, text }                 → cta_url
// { copy, text }                → cta_copy
// { name, buttonParamsJson }    → يتبعت زي ما هو
function normalizeButton(b) {
  if (b?.name && b?.buttonParamsJson) return b
  if (b?.url) {
    return {
      name: 'cta_url',
      buttonParamsJson: JSON.stringify({ display_text: b.text, url: b.url, merchant_url: b.url }),
    }
  }
  if (b?.copy) {
    return {
      name: 'cta_copy',
      buttonParamsJson: JSON.stringify({ display_text: b.text, copy_code: b.copy }),
    }
  }
  return {
    name: 'quick_reply',
    buttonParamsJson: JSON.stringify({ display_text: b.text, id: String(b.id ?? b.text) }),
  }
}

/**
 * sendButtons(conn, jid, { text, footer, title, image, buttons, quoted })
 *  - image: { url } أو Buffer (اختياري)
 *  - buttons: مصفوفة أزرار (انظر normalizeButton)
 */
export async function sendButtons(conn, jid, { text = '', footer = '', title = '', image, buttons = [], quoted } = {}) {
  if (!buttons.length) throw new Error('sendButtons: لازم زرار واحد على الأقل')

  // هيدر الصورة (اختياري)
  let imageMessage = null
  if (image) {
    const src = Buffer.isBuffer(image) ? { image } : { image: image.url ? { url: image.url } : image }
    const media = await prepareWAMessageMedia(src, { upload: conn.waUploadToServer })
    imageMessage = media.imageMessage
  }

  const interactiveMessage = proto.Message.InteractiveMessage.create({
    body: proto.Message.InteractiveMessage.Body.create({ text }),
    footer: proto.Message.InteractiveMessage.Footer.create({ text: footer }),
    header: proto.Message.InteractiveMessage.Header.create({
      title,
      hasMediaAttachment: !!imageMessage,
      ...(imageMessage ? { imageMessage } : {}),
    }),
    nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
      buttons: buttons.map(normalizeButton),
      messageParamsJson: '',
    }),
  })

  const msg = generateWAMessageFromContent(
    jid,
    {
      viewOnceMessage: {
        message: {
          messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
          interactiveMessage,
        },
      },
    },
    { userJid: conn.user?.id, quoted }
  )

  // الـ nodes اللي واتساب بيطلبها عشان يعرض الأزرار
  const biz = {
    tag: 'biz',
    attrs: {},
    content: [
      {
        tag: 'interactive',
        attrs: { type: 'native_flow', v: '1' },
        content: [{ tag: 'native_flow', attrs: { v: '9', name: 'mixed' } }],
      },
    ],
  }
  const bot = { tag: 'bot', attrs: { biz_bot: '1' } }
  const isGroup = String(jid).endsWith('@g.us')

  await conn.relayMessage(jid, msg.message, {
    messageId: msg.key.id,
    additionalNodes: isGroup ? [biz] : [biz, bot], // الخاص محتاج bot node كمان
  })

  return msg
}

/**
 * sendList(conn, jid, { text, footer, title, buttonText, sections, quoted })
 * قائمة اختيار (single_select)
 * sections: [{ title, rows: [{ header, title, description, id }] }]
 */
export async function sendList(conn, jid, { text = '', footer = '', title = '', buttonText = 'اختر', sections = [], image, quoted } = {}) {
  return sendButtons(conn, jid, {
    text,
    footer,
    title,
    image,
    quoted,
    buttons: [
      {
        name: 'single_select',
        buttonParamsJson: JSON.stringify({ title: buttonText, sections }),
      },
    ],
  })
}

export default sendButtons
