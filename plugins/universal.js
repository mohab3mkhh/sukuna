// plugins/_universal.js
// ✧ يحوّل أي رسالة (أزرار / قوائم / interactive) لنص عادي بيظهر على كل أنواع واتساب
//   مش بس واتساب أعمال. ملف واحد بيصلح كل الأوامر من غير ما تعدل كل أمر لوحده.
//   لو عايز توقفه مؤقتاً: global.universalButtons = false

const UNWRAP = ['viewOnceMessage', 'viewOnceMessageV2', 'viewOnceMessageV2Extension', 'ephemeralMessage', 'documentWithCaptionMessage', 'editedMessage']
const MEDIA = ['imageMessage', 'videoMessage', 'documentMessage']

const safeJson = s => { try { return JSON.parse(s || '{}') } catch { return {} } }
const clean = s => String(s ?? '').trim()

// ── يفك الأغلفة (viewOnce وغيره) ويرجّع الرسالة الداخلية ──
export function unwrap(msg) {
    let cur = msg
    for (let i = 0; i < 5 && cur; i++) {
        const k = UNWRAP.find(x => cur[x]?.message)
        if (!k) break
        cur = cur[k].message
    }
    return cur
}

// ── قائمة الخيارات كنص ──
function optionLines(options) {
    return options.map(o => {
        if (o.url) return `🔗 ${o.label}: ${o.url}`
        if (o.copy) return `📋 ${o.label}: ${o.copy}`
        if (o.phone) return `📞 ${o.label}: ${o.phone}`
        if (o.header) return `\n*${o.header}*`
        return o.id && o.id !== o.label ? `▫️ ${o.label}  ⟵  ${o.id}` : `▫️ ${o.label}`
    })
}

function fromNativeFlow(buttons = []) {
    const out = []
    for (const b of buttons) {
        const p = safeJson(b.buttonParamsJson)
        switch (b.name) {
            case 'quick_reply': out.push({ label: p.display_text, id: p.id }); break
            case 'cta_url': out.push({ label: p.display_text, url: p.url }); break
            case 'cta_copy': out.push({ label: p.display_text, copy: p.copy_code }); break
            case 'cta_call': out.push({ label: p.display_text, phone: p.phone_number }); break
            case 'single_select':
                for (const s of p.sections || []) {
                    if (s.title) out.push({ header: s.title })
                    for (const r of s.rows || []) out.push({ label: r.title, id: r.id || r.rowId })
                }
                break
            default: if (p.display_text) out.push({ label: p.display_text, id: p.id })
        }
    }
    return out
}

function fromSections(sections = []) {
    const out = []
    for (const s of sections) {
        if (s.title) out.push({ header: s.title })
        for (const r of s.rows || []) out.push({ label: r.title, id: r.rowId || r.id })
    }
    return out
}

function fromLegacyButtons(buttons = []) {
    return buttons.map(b => ({ label: b.buttonText?.displayText || b.displayText, id: b.buttonId || b.id }))
}

function fromTemplateButtons(buttons = []) {
    return buttons.map(b => {
        if (b.quickReplyButton) return { label: b.quickReplyButton.displayText, id: b.quickReplyButton.id }
        if (b.urlButton) return { label: b.urlButton.displayText, url: b.urlButton.url }
        if (b.callButton) return { label: b.callButton.displayText, phone: b.callButton.phoneNumber }
        return null
    }).filter(Boolean)
}

function compose(parts, options) {
    const lines = optionLines(options.filter(o => o.label || o.header))
    return [...parts.filter(Boolean).map(clean).filter(Boolean), lines.length ? lines.join('\n') : ''].filter(Boolean).join('\n\n')
}

// ── يحوّل رسالة relay خام (protobuf-like) لـ { text, media } أو null لو مش أزرار ──
export function flattenRaw(message) {
    const inner = unwrap(message)
    if (!inner) return null

    if (inner.interactiveMessage) {
        const im = inner.interactiveMessage
        const header = im.header || {}
        const text = compose(
            [header.title, header.subtitle, im.body?.text, im.footer?.text],
            fromNativeFlow(im.nativeFlowMessage?.buttons)
        )
        const media = header.imageMessage ? { imageMessage: header.imageMessage }
            : header.videoMessage ? { videoMessage: header.videoMessage }
            : header.documentMessage ? { documentMessage: header.documentMessage } : null
        return { text, media, mentions: im.contextInfo?.mentionedJid }
    }

    if (inner.buttonsMessage) {
        const b = inner.buttonsMessage
        const text = compose([b.text, b.contentText, b.footerText], fromLegacyButtons(b.buttons))
        const k = MEDIA.find(x => b[x])
        return { text, media: k ? { [k]: b[k] } : null, mentions: b.contextInfo?.mentionedJid }
    }

    if (inner.listMessage) {
        const l = inner.listMessage
        return { text: compose([l.title, l.description, l.footerText], fromSections(l.sections)), media: null, mentions: l.contextInfo?.mentionedJid }
    }

    if (inner.templateMessage) {
        const t = inner.templateMessage.hydratedTemplate || inner.templateMessage.hydratedFourRowTemplate || inner.templateMessage.fourRowTemplate || {}
        const text = compose([t.hydratedTitleText, t.hydratedContentText, t.hydratedFooterText], fromTemplateButtons(t.hydratedButtons))
        const k = MEDIA.find(x => t[x])
        return { text, media: k ? { [k]: t[k] } : null }
    }
    return null
}

// ── يحوّل محتوى sendMessage العالي المستوى (buttons / sections / templateButtons ...) ──
export function flattenContent(content) {
    if (!content || typeof content !== 'object') return null
    const has = content.buttons || content.templateButtons || content.interactiveButtons || content.sections
    if (!has) return null

    let options = []
    if (content.buttons) options = fromLegacyButtons(content.buttons)
    else if (content.templateButtons) options = fromTemplateButtons(content.templateButtons)
    else if (content.interactiveButtons) options = fromNativeFlow(content.interactiveButtons)
    else if (content.sections) options = fromSections(content.sections)

    const text = compose([content.title, content.text || content.caption, content.footer], options)

    const next = { ...content }
    for (const k of ['buttons', 'templateButtons', 'interactiveButtons', 'sections', 'buttonText', 'listType', 'headerType', 'footer', 'title', 'viewOnce']) delete next[k]
    if (next.image || next.video || next.document) { delete next.text; next.caption = text } else { next.text = text; delete next.caption }
    return next
}

function patch(conn) {
    if (conn.__universalPatched) return
    const origSend = conn.sendMessage.bind(conn)
    const origRelay = conn.relayMessage?.bind(conn)

    try {
        conn.sendMessage = async (jid, content, opts) => {
            if (global.universalButtons !== false) {
                try {
                    const flat = flattenContent(content)
                    if (flat) return origSend(jid, flat, opts)
                } catch (e) { console.error('[universal] sendMessage:', e.message) }
            }
            return origSend(jid, content, opts)
        }

        if (origRelay) {
            conn.relayMessage = async (jid, message, opts = {}) => {
                if (global.universalButtons !== false) {
                    try {
                        const flat = flattenRaw(message)
                        if (flat && (flat.text || flat.media)) {
                            const send = { messageId: opts.messageId }
                            if (flat.media) {
                                const [k, v] = Object.entries(flat.media)[0]
                                return origRelay(jid, { [k]: { ...v, caption: flat.text } }, send)
                            }
                            return origSend(jid, { text: flat.text, ...(flat.mentions?.length ? { mentions: flat.mentions } : {}) }, send)
                        }
                    } catch (e) { console.error('[universal] relayMessage:', e.message) }
                }
                return origRelay(jid, message, opts)
            }
        }
        conn.__universalPatched = true
        console.log('[universal] ✅ رسائل الأزرار هتتحول لنص عادي يظهر للكل')
    } catch (e) {
        console.error('[universal] patch failed:', e.message)
    }
}

let handler = m => m
handler.all = async function () {
    patch(this)
}

export default handler