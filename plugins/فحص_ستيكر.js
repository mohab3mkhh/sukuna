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

// تحليل ملف الـ webp نفسه: ممكن الصوت مدفون جواه (RIFF chunk / EXIF) مش في حقول الرسالة
function analyzeWebp(buf) {
  const res = { size: buf.length, riff: buf.slice(0, 4).toString('latin1'), webp: buf.slice(8, 12).toString('latin1'), chunks: [], signatures: [], exifStrings: null }
  if (res.riff === 'RIFF') {
    let off = 12
    while (off + 8 <= buf.length && res.chunks.length < 40) {
      const id = buf.slice(off, off + 4).toString('latin1'), size = buf.readUInt32LE(off + 4)
      res.chunks.push(`${id}:${size}`)
      if (id === 'EXIF') {
        const t = buf.slice(off + 8, off + 8 + Math.min(size, 4000)).toString('latin1').replace(/[^\x20-\x7e]+/g, ' ').replace(/\s+/g, ' ').trim()
        res.exifStrings = t.slice(0, 1200)
      }
      off += 8 + size + (size % 2)
    }
  }
  const sigs = { ID3: 'ID3', OggS: 'OggS', ftyp: 'ftyp', fLaC: 'fLaC', 'RIFF..WAVE': null, audio: 'audio', opus: 'Opus', mp4a: 'mp4a', sound: 'sound' }
  for (const [name, needle] of Object.entries(sigs)) if (needle && buf.includes(Buffer.from(needle))) res.signatures.push(name)
  return res
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
  try {
    const buf = await q.download?.()
    if (buf?.length) dump.webpAnalysis = analyzeWebp(Buffer.from(buf))
    else dump.webpAnalysis = 'download غير متاح'
  } catch (e) { dump.webpAnalysis = 'فشل التحميل: ' + e.message }
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
    caption: `🔬 النوع: *${dump.mtype}*\nالمفاتيح: ${dump.topLevelKeys.join(', ')}\n\nابعت الملف ده لـ Claude.\n(فيه كمان تحليل لملف الستيكر نفسه)`
  }, { quoted: m })
}

handler.command = /^(فحص_ستيكر|stickerdump)$/i
handler.owner = true
export default handler