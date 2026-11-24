import fs from 'fs'
import { proto } from '@whiskeysockets/baileys'

if (!globalThis.__rawDumpInstalled) {
  globalThis.__rawDumpInstalled = true
  const orig = proto.Message.decode
  proto.Message.decode = function (buf, ...args) {
    try {
      if (buf && Buffer.from(buf).includes(Buffer.from('image/webp')))
        fs.appendFileSync('raw_stickers.hex', Buffer.from(buf).toString('hex') + '\n')
    } catch {}
    return orig.call(this, buf, ...args)
  }
}
export default {}