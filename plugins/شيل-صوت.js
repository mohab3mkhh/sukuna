// plugins/شيل_صوت.js
// 🔇 يشيل الصوت من ستيكر الصوت ويرجّعه ستيكر عادي
//   رد على ستيكر الصوت بـ  .شيل_صوت   (أو .شيل-صوت)
//
// ملحوظة تقنية: Baileys مبتفهمش رسالة audioStickerMessage (حقل 134) وبتتجاهلها، فبنضيف هنا
// "مترجم" صغير جوه proto.Message.decode يطلّع الستيكر اللي جواها. بيشتغل بس لما الرسالة فيها الحقل ده،
// وأي خطأ فيه بيرجّع النتيجة الأصلية زي ما هي (يعني مفيش خطر على باقي الرسايل).

import { proto } from '@whiskeysockets/baileys'

const FOOTER = '⛩️ SUKUNA BOT ⛩️'
const TAG_134 = Buffer.from([0xb2, 0x08])   // varint للـ tag: (134<<3)|2

/* ───────── قراءة protobuf الخام ───────── */
function readVarint(buf, pos) {
  let result = 0, shift = 0
  while (pos < buf.length) {
    const b = buf[pos++]
    result += (b & 0x7f) * 2 ** shift
    if (!(b & 0x80)) return [result, pos]
    shift += 7
    if (shift > 49) break
  }
  throw new Error('varint')
}

// يفكّك الحقول: [{ num, wt, start, end, data }] — data للحقول من نوع length-delimited
function scanFields(buf) {
  const out = []
  let pos = 0
  while (pos < buf.length) {
    const start = pos
    let tag; [tag, pos] = readVarint(buf, pos)
    const num = Math.floor(tag / 8), wt = tag & 7
    let data = null
    if (wt === 0) { [, pos] = readVarint(buf, pos) }
    else if (wt === 1) pos += 8
    else if (wt === 5) pos += 4
    else if (wt === 2) { let len; [len, pos] = readVarint(buf, pos); data = buf.subarray(pos, pos + len); pos += len }
    else throw new Error('wiretype')
    if (pos > buf.length) throw new Error('overflow')
    out.push({ num, wt, start, end: pos, data })
  }
  return out
}

// بيطلّع StickerMessage (من غير حقل الصوت 26) من محتوى حقل 134
function extractSticker(raw134) {
  const future = scanFields(raw134).find(f => f.num === 1 && f.data)           // FutureProof.message
  const inner = future && scanFields(future.data).find(f => f.num === 26 && f.data)   // Message.stickerMessage
  if (!inner) return null
  const stickerBuf = inner.data
  const parts = []
  for (const f of scanFields(stickerBuf)) {
    if (f.num === 26 && f.wt === 2) continue      // audioMessage جوه الستيكر (بتتشال عشان ما تتفسرش غلط)
    parts.push(stickerBuf.subarray(f.start, f.end))
  }
  return Buffer.concat(parts)
}

/* ───────── مترجم audioStickerMessage ───────── */
if (!proto.Message.__audioDecodePatched) {
  const _dec = proto.Message.decode
  proto.Message.decode = function (reader, length) {
    const msg = _dec.call(this, reader, length)
    try {
      if (msg && !msg.stickerMessage) {
        let raw
        if (reader && reader.buf) {   // Reader متداخل (مثلاً quotedMessage)
          const end = length === undefined ? reader.len : reader.pos
          const start = length === undefined ? 0 : Math.max(0, end - length)
          raw = reader.buf.subarray(start, end)
        } else if (reader instanceof Uint8Array) raw = reader
        if (raw && Buffer.from(raw.buffer, raw.byteOffset, raw.length).includes(TAG_134)) {
          const f = scanFields(Buffer.from(raw)).find(x => x.num === 134 && x.data)
          const st = f && extractSticker(f.data)
          if (st) {
            msg.stickerMessage = proto.Message.StickerMessage.decode(st)
            Object.defineProperty(msg, '__audioSticker', { value: true, enumerable: false })
          }
        }
      }
    } catch { /* نرجّع الأصلي */ }
    return msg
  }
  proto.Message.__audioDecodePatched = true
}

export const _test = { scanFields, extractSticker }

/* ───────── الأمر ───────── */
const handler = async (m, { conn }) => {
  const reply = t => conn.sendMessage(m.chat, { text: `${t}\n\n> ${FOOTER}` }, { quoted: m })
  const q = m.quoted
  const mime = String(q?.mimetype || q?.msg?.mimetype || '').toLowerCase()
  if (!q || !(q.mtype === 'stickerMessage' || mime.includes('webp'))) {
    return reply('📌 رد على ستيكر الصوت بـ *.شيل_صوت*')
  }
  try { await m.react?.('⏳') } catch {}
  try {
    const buf = await q.download()
    if (!buf || buf.length < 200) throw new Error('تعذر تحميل الستيكر')
    await conn.sendMessage(m.chat, { sticker: buf }, { quoted: m })
    try { await m.react?.('✅') } catch {}
  } catch (e) {
    try { await m.react?.('❌') } catch {}
    reply(`❌ معرفتش أشيل الصوت: ${String(e.message).slice(0, 150)}`)
  }
}

handler.command = /^(شيل[-_]صوت|rmsound|unsound)$/i
handler.help = ['شيل_صوت']
handler.tags = ['sticker']
export default handler