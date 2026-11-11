// lib/buttons.js
// إرسال كل أنواع أزرار واتساب (native flow) على @whiskeysockets/baileys الأصلية
//
// الدوال:
//   sendButtons   → أزرار مخصصة (أي خليط من الأنواع) + هيدر صورة/فيديو/ملف + منشن
//   sendList      → قائمة اختيار (single_select)
//   sendQuick     → أزرار رد سريع بس
//   sendUrl       → أزرار روابط بس
//   sendCopy      → زرار نسخ كود
//   sendCall      → زرار اتصال
//   sendLocation  → زرار "ابعت موقعك"
//   sendCarousel  → كروت قابلة للتمرير (كل كارت فيه صورة وأزرار)
//   sendPoll      → استطلاع رأي (مش من الأزرار بس مفيد)
//
// أشكال الزراير (buttons) المقبولة:
//   { id, text }                   → quick_reply
//   { url, text }                  → cta_url
//   { copy, text }                 → cta_copy
//   { call, text }                 → cta_call (رقم تليفون)
//   { location: true, text }       → send_location
//   { list: { title, sections } }  → single_select (قائمة جوه الأزرار)
//   { name, buttonParamsJson }     → يتبعت زي ما هو

import pkg from '@whiskeysockets/baileys'

const { proto, generateWAMessageFromContent, prepareWAMessageMedia } = pkg
const IM = proto.Message.InteractiveMessage

// ━━━━━━━━━━━━━━━━ الزراير ━━━━━━━━━━━━━━━━
export function normalizeButton(b) {
  if (b?.name && b?.buttonParamsJson) return b

  if (b?.list) {
    return {
      name: 'single_select',
      buttonParamsJson: JSON.stringify({ title: b.list.title || b.text || 'اختر', sections: b.list.sections || [] }),
    }
  }
  if (b?.url) {
    return {
      name: 'cta_url',
      buttonParamsJson: JSON.stringify({ display_text: b.text, url: b.url, merchant_url: b.url }),
    }
  }
  if (b?.copy) {
    return {
      name: 'cta_copy',
      buttonParamsJson: JSON.stringify({ display_text: b.text, copy_code: String(b.copy) }),
    }
  }
  if (b?.call) {
    return {
      name: 'cta_call',
      buttonParamsJson: JSON.stringify({ display_text: b.text, phone_number: String(b.call) }),
    }
  }
  if (b?.location) {
    return {
      name: 'send_location',
      buttonParamsJson: JSON.stringify({ display_text: b.text || 'ابعت موقعك' }),
    }
  }
  return {
    name: 'quick_reply',
    buttonParamsJson: JSON.stringify({ display_text: b.text, id: String(b.id ?? b.text) }),
  }
}

// ━━━━━━━━━━━━━━━━ الميديا ━━━━━━━━━━━━━━━━
// يقبل: Buffer أو { url } أو string (رابط)
function mediaSrc(kind, value, extra = {}) {
  if (Buffer.isBuffer(value)) return { [kind]: value, ...extra }
  if (typeof value === 'string') return { [kind]: { url: value }, ...extra }
  return { [kind]: value.url ? { url: value.url } : value, ...extra }
}

async function buildHeader(conn, { title = '', subtitle = '', image, video, gifPlayback = false, document, fileName, mimetype } = {}) {
  let imageMessage, videoMessage, documentMessage

  if (image) {
    imageMessage = (await prepareWAMessageMedia(mediaSrc('image', image), { upload: conn.waUploadToServer })).imageMessage
  } else if (video) {
    videoMessage = (await prepareWAMessageMedia(mediaSrc('video', video, { gifPlayback }), { upload: conn.waUploadToServer })).videoMessage
  } else if (document) {
    documentMessage = (
      await prepareWAMessageMedia(
        mediaSrc('document', document, { mimetype: mimetype || 'application/pdf', fileName: fileName || 'file' }),
        { upload: conn.waUploadToServer }
      )
    ).documentMessage
  }

  return IM.Header.create({
    title,
    subtitle,
    hasMediaAttachment: !!(imageMessage || videoMessage || documentMessage),
    ...(imageMessage ? { imageMessage } : {}),
    ...(videoMessage ? { videoMessage } : {}),
    ...(documentMessage ? { documentMessage } : {}),
  })
}

// ━━━━━━━━━━━━━━━━ الإرسال الداخلي ━━━━━━━━━━━━━━━━
async function relayInteractive(conn, jid, interactiveMessage, { quoted } = {}) {
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

// ━━━━━━━━━━━━━━━━ sendButtons ━━━━━━━━━━━━━━━━
/**
 * sendButtons(conn, jid, {
 *   text, footer, title, subtitle,
 *   image | video (+gifPlayback) | document (+fileName, mimetype),
 *   mentions: [jid],
 *   buttons: [...],
 *   quoted
 * })
 */
export async function sendButtons(
  conn,
  jid,
  { text = '', footer = '', title = '', subtitle = '', image, video, gifPlayback = false, document, fileName, mimetype, mentions = [], buttons = [], quoted } = {}
) {
  if (!buttons.length) throw new Error('sendButtons: لازم زرار واحد على الأقل')

  const header = await buildHeader(conn, { title, subtitle, image, video, gifPlayback, document, fileName, mimetype })

  const interactiveMessage = IM.create({
    body: IM.Body.create({ text }),
    footer: IM.Footer.create({ text: footer }),
    header,
    ...(mentions.length ? { contextInfo: { mentionedJid: mentions } } : {}),
    nativeFlowMessage: IM.NativeFlowMessage.create({
      buttons: buttons.map(normalizeButton),
      messageParamsJson: '',
    }),
  })

  return relayInteractive(conn, jid, interactiveMessage, { quoted })
}

// ━━━━━━━━━━━━━━━━ دوال مختصرة ━━━━━━━━━━━━━━━━

/** قائمة اختيار: sections: [{ title, rows: [{ header, title, description, id }] }] */
export async function sendList(conn, jid, { buttonText = 'اختر', sections = [], ...rest } = {}) {
  return sendButtons(conn, jid, {
    ...rest,
    buttons: [{ list: { title: buttonText, sections } }],
  })
}

/** أزرار رد سريع: quick: [{ id, text }] */
export async function sendQuick(conn, jid, { quick = [], ...rest } = {}) {
  return sendButtons(conn, jid, { ...rest, buttons: quick.map(q => ({ id: q.id, text: q.text })) })
}

/** أزرار روابط: urls: [{ url, text }] */
export async function sendUrl(conn, jid, { urls = [], ...rest } = {}) {
  return sendButtons(conn, jid, { ...rest, buttons: urls.map(u => ({ url: u.url, text: u.text })) })
}

/** زرار نسخ: sendCopy(conn, jid, { text, copy: 'الكود', buttonText: 'نسخ' }) */
export async function sendCopy(conn, jid, { copy, buttonText = '📋 نسخ', ...rest } = {}) {
  return sendButtons(conn, jid, { ...rest, buttons: [{ copy, text: buttonText }] })
}

/** زرار اتصال: sendCall(conn, jid, { text, call: '+201000000000', buttonText: 'اتصل' }) */
export async function sendCall(conn, jid, { call, buttonText = '📞 اتصل', ...rest } = {}) {
  return sendButtons(conn, jid, { ...rest, buttons: [{ call, text: buttonText }] })
}

/** زرار طلب الموقع */
export async function sendLocation(conn, jid, { buttonText = '📍 ابعت موقعك', ...rest } = {}) {
  return sendButtons(conn, jid, { ...rest, buttons: [{ location: true, text: buttonText }] })
}

// ━━━━━━━━━━━━━━━━ Carousel ━━━━━━━━━━━━━━━━
/**
 * sendCarousel(conn, jid, {
 *   text, footer, mentions, quoted,
 *   cards: [{ image | video, title, body, footer, buttons: [...] }]
 * })
 */
export async function sendCarousel(conn, jid, { text = '', footer = '', mentions = [], cards = [], quoted } = {}) {
  if (!cards.length) throw new Error('sendCarousel: لازم كارت واحد على الأقل')

  const builtCards = []
  for (const c of cards) {
    const header = await buildHeader(conn, { title: c.title || '', image: c.image, video: c.video, gifPlayback: c.gifPlayback })
    builtCards.push(
      IM.create({
        header,
        body: IM.Body.create({ text: c.body || '' }),
        footer: IM.Footer.create({ text: c.footer || '' }),
        nativeFlowMessage: IM.NativeFlowMessage.create({
          buttons: (c.buttons || []).map(normalizeButton),
          messageParamsJson: '',
        }),
      })
    )
  }

  const interactiveMessage = IM.create({
    body: IM.Body.create({ text }),
    footer: IM.Footer.create({ text: footer }),
    ...(mentions.length ? { contextInfo: { mentionedJid: mentions } } : {}),
    carouselMessage: IM.CarouselMessage.create({ cards: builtCards, messageVersion: 1 }),
  })

  return relayInteractive(conn, jid, interactiveMessage, { quoted })
}

// ━━━━━━━━━━━━━━━━ Poll ━━━━━━━━━━━━━━━━
/** sendPoll(conn, jid, { name, values: ['أ','ب'], selectableCount: 1, quoted }) */
export async function sendPoll(conn, jid, { name, values = [], selectableCount = 1, quoted } = {}) {
  return conn.sendMessage(jid, { poll: { name, values, selectableCount } }, { quoted })
}

export default sendButtons
