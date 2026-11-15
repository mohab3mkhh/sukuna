// plugins/فحص-يوزر.js
// أمر للمطور فقط: يفحص هل نسخة Baileys عندك فيها دعم اليوزرنيم / USync
// الاستخدام: .فحص-يوزر

import * as B from '@whiskeysockets/baileys'
import { createRequire } from 'module'

const PATTERN = /usync|username|lidmapping|onwhatsapp|getlid|pnfor|lidfor/i

const list = (arr) => (arr.length ? arr.map(x => `• ${x}`).join('\n') : '— مفيش —')

const protoMethods = (cls) => {
    try {
        return Object.getOwnPropertyNames(cls?.prototype || {}).filter(n => n !== 'constructor')
    } catch { return [] }
}

const handler = async (m, { conn, isROwner }) => {
    if (!isROwner) return

    // نسخة Baileys
    let version = 'غير معروفة'
    try {
        const require = createRequire(import.meta.url)
        version = require('@whiskeysockets/baileys/package.json').version
    } catch {}

    // 1) دوال السوكت المتعلقة
    const sockKeys = []
    let obj = conn
    for (let i = 0; obj && i < 3; i++) {
        sockKeys.push(...Object.getOwnPropertyNames(obj))
        obj = Object.getPrototypeOf(obj)
    }
    const sockMatches = [...new Set(sockKeys)].filter(k => PATTERN.test(k)).sort()

    // 2) صادرات المكتبة
    const exportMatches = Object.keys(B).filter(k => PATTERN.test(k)).sort()

    // 3) دوال USyncQuery / USyncUser
    const queryMethods = protoMethods(B.USyncQuery).filter(n => /username|lid|contact|device/i.test(n))
    const userMethods = protoMethods(B.USyncUser).filter(n => /username|lid|phone|id/i.test(n))

    // 4) lidMapping
    const lidMap = conn.signalRepository?.lidMapping
    const lidMapMethods = lidMap ? protoMethods(lidMap.constructor) : []

    const hasUsernameProtocol = !!B.USyncUsernameProtocol || queryMethods.some(n => /username/i.test(n))

    const text =
`🔎 *فحص دعم اليوزرنيم*

📦 Baileys: *${version}*
🧩 بروتوكول اليوزرنيم: *${hasUsernameProtocol ? 'موجود ✅' : 'مش موجود ❌'}*

*USyncQuery:*
${list(queryMethods)}

*USyncUser:*
${list(userMethods)}

*صادرات المكتبة:*
${list(exportMatches)}

*دوال السوكت:*
${list(sockMatches)}

*lidMapping:*
${list(lidMapMethods)}`

    await m.reply(text)
}

handler.help = ['فحص-يوزر']
handler.tags = ['owner']
handler.command = /^(فحص-يوزر|فحص_يوزر|checkusername)$/i
handler.rowner = true

export default handler