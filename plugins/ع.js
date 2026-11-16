import { downloadMediaMessage } from '@whiskeysockets/baileys'

const CACHE = (global._voCache ||= new Map())
const MEDIA = ['imageMessage', 'videoMessage', 'audioMessage']
const MAX_ITEMS = 30
const TTL = 2 * 60 * 60 * 1000

function extract(message) {
  let m = message, wrapped = false
  for (let i = 0; i < 5 && m; i++) {
    const vo = m.viewOnceMessage || m.viewOnceMessageV2 || m.viewOnceMessageV2Extension
    if (vo) { wrapped = true; m = vo.message }
    else if (m.ephemeralMessage) m = m.ephemeralMessage.message
    else break
  }
  return { inner: m, wrapped }
}

function prune() {
  const now = Date.now()
  for (const [k, v] of CACHE) if (now - v.t > TTL) CACHE.delete(k)
  while (CACHE.size > MAX_ITEMS) CACHE.delete(CACHE.keys().next().value)
}

// 1) يلتقط أي view once لحظة وصوله
export async function before(m, { conn }) {
  try {
    if (!m.message || !m.key?.id) return false
    const { inner, wrapped } = extract(m.message)
    const type = MEDIA.find(t => inner?.[t])
    if (!type) return false
    if (!(wrapped || inner[type].viewOnce === true)) return false
    if (CACHE.has(m.key.id)) return false

    const buffer = await downloadMediaMessage(
      { key: m.key, message: inner },
      'buffer', {},
      { logger: console, reuploadRequest: conn.updateMediaMessage }
    )
    CACHE.set(m.key.id, {
      type, buffer, t: Date.now(),
      caption: inner[type].caption || '',
      ptt: !!inner[type].ptt
    })
    prune()
    console.log('[VO] captured', type, m.key.id)
  } catch (e) {
    console.error('[VO] capture failed:', e.message)
  }
  return false
}

// 2) الأمر
let handler = async (m, { conn }) => {
  const ctx = Object.values(m.message || {}).find(v => v?.contextInfo)?.contextInfo
  const qid = ctx?.stanzaId || m.quoted?.id
  if (!qid) return m.reply('⚠️ رد على رسالة عرض لمرة واحدة بكتابة .ع')

  const item = CACHE.get(qid)
  if (!item) return m.reply('❌ الرسالة دي ما اتسجلتش (وصلت قبل ما البوت يشتغل أو بعد ريستارت)')

  const caption = item.caption || '👁️ *تم الكشف*'
  if (item.type === 'imageMessage')
    await conn.sendMessage(m.chat, { image: item.buffer, caption }, { quoted: m })
  else if (item.type === 'videoMessage')
    await conn.sendMessage(m.chat, { video: item.buffer, caption }, { quoted: m })
  else
    await conn.sendMessage(m.chat, { audio: item.buffer, mimetype: 'audio/mp4', ptt: item.ptt }, { quoted: m })
}

handler.help = ['ع', 'عرض']
handler.tags = ['ادوات']
handler.command = /^(ع|عرض|view)$/i
export default handler