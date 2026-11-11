// lib/buttons.js
// دعم كامل: quick_reply / single_select / cta_url / cta_copy / cta_call
// + هيدر ميديا (صورة/فيديو/GIF/مستند) + جروبات + تحويل تلقائي للأوامر القديمة

import {
  generateWAMessageFromContent,
  prepareWAMessageMedia,
  proto
} from '@whiskeysockets/baileys'

const json = (o) => JSON.stringify(o)

/* ───────────── بناة الأزرار ───────────── */
export const btn = {
  reply: (text, id) => ({
    name: 'quick_reply',
    buttonParamsJson: json({ display_text: text, id })
  }),
  url: (text, url) => ({
    name: 'cta_url',
    buttonParamsJson: json({ display_text: text, url, merchant_url: url })
  }),
  copy: (text, code) => ({
    name: 'cta_copy',
    buttonParamsJson: json({ display_text: text, copy_code: code, id: code })
  }),
  call: (text, phone) => ({
    name: 'cta_call',
    buttonParamsJson: json({ display_text: text, phone_number: phone })
  }),
  list: (title, sections) => ({
    name: 'single_select',
    buttonParamsJson: json({ title, sections })
  })
}

/* ───────────── مساعدات ───────────── */
const toMedia = (x) =>
  typeof x === 'string' ? { url: x } : x

async function buildHeader(conn, o) {
  const header = {
    title: o.title || '',
    subtitle: o.subtitle || '',
    hasMediaAttachment: false
  }

  let media = null
  if (o.image) media = { image: toMedia(o.image) }
  else if (o.video) media = { video: toMedia(o.video), gifPlayback: !!o.gif }
  else if (o.document) {
    media = {
      document: toMedia(o.document),
      mimetype: o.mimetype || 'application/octet-stream',
      fileName: o.fileName || 'file'
    }
  }

  if (media) {
    try {
      const prepared = await prepareWAMessageMedia(media, {
        upload: conn.waUploadToServer
      })
      Object.assign(header, prepared)
      header.hasMediaAttachment = true
      if (o.video && o.gif && header.videoMessage) {
        header.videoMessage.gifPlayback = true
      }
    } catch (e) {
      console.error('[buttons] media header error:', e?.message || e)
    }
  }
  return header
}

// الـ biz node ضروري عشان الأزرار تظهر في الجروبات والخاص
function bizNodes(jid) {
  const biz = {
    tag: 'biz',
    attrs: {},
    content: [{
      tag: 'interactive',
      attrs: { type: 'native_flow', v: '1' },
      content: [{ tag: 'native_flow', attrs: { v: '9', name: 'mixed' } }]
    }]
  }
  const isGroup = String(jid).endsWith('@g.us')
  return isGroup ? [biz] : [biz, { tag: 'bot', attrs: { biz_bot: '1' } }]
}

/* ───────────── الإرسال الأساسي ───────────── */
export async function sendButtons(conn, jid, opts = {}, quoted) {
  const {
    text = ' ',
    footer = '',
    buttons = [],
    mentions = []
  } = opts

  const header = await buildHeader(conn, opts)

  const interactiveMessage = proto.Message.InteractiveMessage.fromObject({
    body: { text },
    footer: { text: footer },
    header,
    nativeFlowMessage: { buttons, messageParamsJson: '' },
    contextInfo: mentions.length ? { mentionedJid: mentions } : undefined
  })

  const msg = generateWAMessageFromContent(
    jid,
    {
      viewOnceMessage: {
        message: {
          messageContextInfo: {
            deviceListMetadata: {},
            deviceListMetadataVersion: 2
          },
          interactiveMessage
        }
      }
    },
    { userJid: conn.user?.id || conn.user?.jid, quoted }
  )

  // ✅ محاولة الإرسال مع additionalNodes
  try {
    await conn.relayMessage(jid, msg.message, {
      messageId: msg.key.id,
      additionalNodes: bizNodes(jid)
    })
  } catch (e) {
    // ✅ لو فشل (مثلاً واتساب بيزنس)، نجرب بدون additionalNodes
    console.log('[buttons] Relay failed, trying without additionalNodes:', e.message)
    await conn.relayMessage(jid, msg.message, {
      messageId: msg.key.id
    })
  }

  return msg
}

/* اختصارات */
export const sendList = (conn, jid, { title = 'اختر', sections, ...rest }, quoted) =>
  sendButtons(conn, jid, { ...rest, buttons: [btn.list(title, sections)] }, quoted)

/* ───────────── قراءة الضغط على الزرار ───────────── */
export function getButtonId(m) {
  const msg = m?.message || m?.msg || {}
  const inner =
    msg.viewOnceMessage?.message ||
    msg.ephemeralMessage?.message ||
    msg

  try {
    const p = inner.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson
    if (p) {
      const id = JSON.parse(p).id
      if (id) return id
    }
  } catch {}

  return (
    inner.buttonsResponseMessage?.selectedButtonId ||
    inner.templateButtonReplyMessage?.selectedId ||
    inner.listResponseMessage?.singleSelectReply?.selectedRowId ||
    null
  )
}

/* ───────────── تحويل الأشكال القديمة ───────────── */
function convertOld(content) {
  const out = {
    text: content.text || content.caption || ' ',
    footer: content.footer || '',
    title: content.title || '',
    subtitle: content.subtitle || '',
    image: content.image,
    video: content.video,
    gif: content.gifPlayback,
    document: content.document,
    mimetype: content.mimetype,
    fileName: content.fileName,
    mentions: content.mentions || [],
    buttons: []
  }

  if (Array.isArray(content.buttons)) {
    for (const b of content.buttons) {
      out.buttons.push(
        btn.reply(
          b.buttonText?.displayText || b.displayText || b.text || 'زر',
          b.buttonId || b.id || ''
        )
      )
    }
  }

  if (Array.isArray(content.templateButtons)) {
    for (const t of content.templateButtons) {
      if (t.quickReplyButton)
        out.buttons.push(btn.reply(t.quickReplyButton.displayText, t.quickReplyButton.id))
      else if (t.urlButton)
        out.buttons.push(btn.url(t.urlButton.displayText, t.urlButton.url))
      else if (t.callButton)
        out.buttons.push(btn.call(t.callButton.displayText, t.callButton.phoneNumber))
    }
  }

  if (Array.isArray(content.interactiveButtons)) {
    for (const b of content.interactiveButtons) {
      out.buttons.push(
        b.buttonParamsJson
          ? { name: b.name, buttonParamsJson: b.buttonParamsJson }
          : { name: b.name, buttonParamsJson: json(b.params || {}) }
      )
    }
  }

  if (Array.isArray(content.sections)) {
    const sections = content.sections.map(s => ({
      title: s.title || '',
      highlight_label: s.highlight_label,
      rows: (s.rows || []).map(r => ({
        title: r.title,
        description: r.description || '',
        id: r.rowId || r.id || r.title
      }))
    }))
    out.buttons.push(btn.list(content.buttonText || 'اختر', sections))
  }

  return out
}

export function hasLegacyButtons(content = {}) {
  return (
    Array.isArray(content.buttons) ||
    Array.isArray(content.templateButtons) ||
    Array.isArray(content.interactiveButtons) ||
    Array.isArray(content.sections)
  )
}

export async function sendLegacy(conn, jid, content = {}, options = {}) {
  const opts = convertOld(content)
  if (!opts.buttons.length) return null
  return sendButtons(conn, jid, opts, options?.quoted)
}

export function stripButtons(content = {}) {
  const { buttons, templateButtons, interactiveButtons, sections, ...plain } = content
  const hasMedia = plain.image || plain.video || plain.document || plain.audio || plain.sticker
  return hasMedia ? plain : { ...plain, text: plain.text || plain.caption || ' ' }
}

export function patchButtons(conn) {
  const add = (name, fn) => {
    try {
      if (!(name in conn)) conn[name] = fn
    } catch {}
  }
  add('sendButtons', (jid, opts, quoted) => sendButtons(conn, jid, opts, quoted))
  add('sendNativeList', (jid, opts, quoted) => sendList(conn, jid, opts, quoted))
  return conn
}

export default { btn, sendButtons, sendList, getButtonId, patchButtons, hasLegacyButtons, sendLegacy, stripButtons }