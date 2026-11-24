import { proto } from '@whiskeysockets/baileys'

function rv(b, i) {
  let r = 0, s = 0
  while (i < b.length) {
    const c = b[i++]
    r += (c & 0x7f) * 2 ** s; s += 7
    if (c < 0x80) return [r, i]
    if (s > 63) break
  }
  return [0, -1]
}

function parse(b, d = 0) {
  const out = []; let i = 0
  while (i < b.length) {
    let tag; [tag, i] = rv(b, i); if (i < 0) return null
    const f = Math.floor(tag / 8), w = tag % 8
    if (w === 0) { let v; [v, i] = rv(b, i); if (i < 0) return null; out.push(`${f}:${v}`) }
    else if (w === 2) {
      let l; [l, i] = rv(b, i); if (i < 0 || i + l > b.length) return null
      const sub = b.subarray(i, i + l); i += l
      const s = sub.toString('utf8')
      if (/^[\x20-\x7e]{1,40}$/.test(s)) out.push(`${f}:"${s}"`)
      else {
        const inner = l > 1 && d < 5 ? parse(sub, d + 1) : null
        out.push(inner ? `${f}:{${inner.join(' ')}}` : `${f}:<${l}b>`)
      }
    }
    else if (w === 1) { i += 8; out.push(`${f}:f64`) }
    else if (w === 5) { i += 4; out.push(`${f}:f32`) }
    else return null
  }
  return out
}

globalThis.__rawLog = globalThis.__rawLog || []
if (!globalThis.__stkHook) {
  globalThis.__stkHook = true
  const orig = proto.Message.decode
  proto.Message.decode = function (buf, ...args) {
    try {
      const b = Buffer.from(buf)
      const t = parse(b)
      if (t && !t.every(x => /^(1|2|6|12|35):/.test(x))) {
        globalThis.__rawLog.push(t.join(' '))
        if (globalThis.__rawLog.length > 6) globalThis.__rawLog.shift()
        if (t.some(x => x.startsWith('134:'))) globalThis.__rawHex = b.toString('hex')
      }
    } catch {}
    return orig.call(this, buf, ...args)
  }
}

const handler = async (m, { conn }) => {
  const log = globalThis.__rawLog
  const text = log.length
    ? log.map((x, i) => `#${i + 1}\n${x}`).join('\n\n')
    : 'مفيش رسائل اتسجلت لسه. ابعت الستيكر الأول.'
  await conn.sendMessage(m.chat, { text }, { quoted: m })
  if (globalThis.__rawHex)
    await conn.sendMessage(m.chat, { text: globalThis.__rawHex })
}

handler.command = /^(فحص_ستيكر|stickerdump)$/i
handler.owner = true
export default handler