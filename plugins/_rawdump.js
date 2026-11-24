import { proto } from '@whiskeysockets/baileys'

if (!globalThis.__rawDumpInstalled) {
  globalThis.__rawDumpInstalled = true
  const orig = proto.Message.decode
  proto.Message.decode = function (buf, ...args) {
    try {
      const b = Buffer.from(buf)
      if (b.includes(Buffer.from('image/webp')))
        console.log('RAWSTICKER:' + b.toString('hex'))
    } catch {}
    return orig.call(this, buf, ...args)
  }
}
export default {}