/**
 * plugins/منع_الخاص.js
 * أي حد يكلم البوت في الخاص -> رسالة تحذير + جهة اتصال المطور + بلك تلقائي
 */

const OWNERS = [
  '201036547166',
  '201016855501',
  '201066036607',
]
const DEV_NUMBER = '201036547166'
const DEV_NAME = 'المطور | SUKUNA'

const num = jid => String(jid || '').split('@')[0].split(':')[0].replace(/\D/g, '')
const sleep = ms => new Promise(r => setTimeout(r, ms))

if (!global.autoBlockBusy) global.autoBlockBusy = new Set()

const WARN_TEXT = `╭━━━〔 🚫 𝑷𝑹𝑰𝑽𝑨𝑻𝑬 𝑩𝑳𝑶𝑪𝑲 〕━━━⬣
┃
┃ ✦ ❌ الخاص ممنوع مع البوت
┃ ✦ 🤖 البوت بيشتغل في الجروبات بس
┃ ✦ 📞 لو عايز تتكلم مع حد، كلّم مطوري
┃    وجهة الاتصال بتاعته في الرسالة الجاية 👇
┃
┃ ⚠️ تم حظرك تلقائياً
╰━━━━━━━━━━━━━━⬣

> ⛩️ 𝑺𝑼𝑲𝑼𝑵𝑨 𝑩𝑶𝑻 ⛩️`

let before = async (m, { conn }) => {
  try {
    const chat = m.chat || ''
    // خاص بس (مش جروب / ستوري / بث)
    if (chat.endsWith('@g.us') || chat.includes('broadcast') || chat.endsWith('@newsletter')) return false
    if (m.fromMe || m.isBaileys) return false
    if (!m.sender) return false

    // المطورين مستثنيين
    if (OWNERS.includes(num(m.sender))) return false

    // منع التكرار لو بعت كذا رسالة ورا بعض
    if (global.autoBlockBusy.has(chat)) return true
    global.autoBlockBusy.add(chat)
    setTimeout(() => global.autoBlockBusy.delete(chat), 60 * 1000)

    await conn.sendMessage(chat, { text: WARN_TEXT }, { quoted: m })

    const vcard = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      `FN:${DEV_NAME}`,
      'ORG:SUKUNA BOT;',
      `TEL;type=CELL;type=VOICE;waid=${DEV_NUMBER}:+${DEV_NUMBER}`,
      'END:VCARD',
    ].join('\n')

    await conn.sendMessage(chat, {
      contacts: { displayName: DEV_NAME, contacts: [{ vcard }] },
    })

    await sleep(3000) // نسيب الرسايل توصل قبل البلك
    await conn.updateBlockStatus(chat, 'block')
    console.log('[منع_الخاص] blocked', chat)
    return true // وقف باقي المعالجة
  } catch (e) {
    console.error('[منع_الخاص]', e)
    return false
  }
}

let handler = async () => {}
handler.before = before
handler.command = /^__منع_الخاص__$/i // مش بيتنادى فعلياً

export default handler