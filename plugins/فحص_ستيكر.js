// plugins/فحص_ستيكر.js
// 🔬 أداة كشف: بتطلّع كل حقول رسالة الستيكر (ستيكر الصوت) عشان نعرف صيغته
//   رد على ستيكر الصوت بـ .فحص_ستيكر  → البوت يبعتلك ملف JSON فيه كل الحقول
//   (البيانات الثنائية الكبيرة بتتلخص "<bytes N>" والمفاتيح السرية للتشفير بتتشال)

import fs from 'fs'
import path from 'path'

const SECRET_KEYS = new Set(['mediaKey', 'fileEncSha256', 'fileSha256', 'directPath', 'url', 'jpegThumbnail', 'pngThumbnail', 'thumbnail'])

function clean(v, depth = 0) {
  if (v == null) return v
  if (depth > 8) return '<deep>'
  if (typeof v === 'bigint') return v.toString()
  if (v instanceof Uint8Array || Buffer.isBuffer(v)) return `<bytes ${v.length}>`
  if (typeof v === 'object' && typeof v.toNumber === 'function') return v.toNumber()   // Long
  if (typeof v === 'object' && 'low' in v && 'high' in v && 'unsigned' in v) return Number(v.low)
  if (Array.isArray(v)) return v.slice(0, 20).map(x => clean(x, depth + 1))
  if (typeof v === 'object') {
    const o = {}
    for (const [k, x] of Object.entries(v)) o[k] = SECRET_KEYS.has(k) ? `<hidden ${k}>` : clean(x, depth + 1)
    return o
  }
  return v
}

const handler = async (m, { conn, usedPrefix = '.', command }) => {
  const reply = t => conn.sendMessage(m.chat, { text: t }, { quoted: m })
  const q = m.quoted
  if (!q) return reply(`📌 رد على ستيكر الصوت بـ *${usedPrefix}${command}*`)

  const raw = q.fakeObj?.message || q.message || (q.mtype ? { [q.mtype]: q.msg } : null)
  if (!raw) return reply('❌ معرفتش أقرا الرسالة المردود عليها.')

  const dump = {
    mtype: q.mtype || Object.keys(raw)[0],
    topLevelKeys: Object.keys(raw),
    message: clean(raw),
    contextOfCommand: clean(m.msg?.contextInfo || {})
  }
  const json = JSON.stringify(dump, null, 2)
  console.log('[فحص_ستيكر]\n' + json)

  try {
    const dir = path.join(process.cwd(), 'Sessions')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'sound_sticker_dump.json'), json)
  } catch {}

  await conn.sendMessage(m.chat, {
    document: Buffer.from(json),
    mimetype: 'application/json',
    fileName: 'sound_sticker_dump.json',
    caption: `🔬 النوع: *${dump.mtype}*\nالمفاتيح: ${dump.topLevelKeys.join(', ')}\n\nابعت الملف ده لـ Claude.`
  }, { quoted: m })
}

handler.command = /^(فحص_ستيكر|stickerdump)$/i
handler.owner = true
export default handler