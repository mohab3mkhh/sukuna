// plugins/antdl.js
// ⛩️ SUKUNA BOT ⛩️ — طلب دفع (Payment Request) بنص مخصص
// الاستخدام:  .antdl [نص]   (منشن أو ريبلاي على شخص لتحديد المطلوب منه، وإلا هيبقى منك أنت)

const BRAND = '⛩️ SUKUNA BOT ⛩️'

let handler = async (m, { conn, text }) => {
  const noteText = (text || '').trim() || BRAND

  // الشخص المطلوب منه الدفع: منشن ← ريبلاي ← صاحب الأمر
  const target = m.mentionedJid?.[0] || m.quoted?.sender || m.sender

  try {
    await conn.relayMessage(
      m.chat,
      {
        requestPaymentMessage: {
          currencyCodeIso4217: 'MAD',
          amount1000: { low: 276447232, high: 23283, unsigned: true },
          requestFrom: target,
          noteMessage: {
            extendedTextMessage: {
              text: noteText,
              contextInfo: { mentionedJid: [] }
            }
          },
          expiryTimestamp: { low: 0, high: 0, unsigned: false },
          amount: {
            value: { low: 276447232, high: 23283, unsigned: false },
            offset: 1000,
            currencyCode: 'IDR'
          },
          contextInfo: {
            mentionedJid: [],
            participant: target
          }
        }
      },
      {
        messageId:
          typeof conn.generateMessageIDV2 === 'function'
            ? conn.generateMessageIDV2(m.chat)
            : 'SUKUNA-' + Date.now().toString(36).toUpperCase()
      }
    )

    await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } }).catch(() => {})
  } catch (e) {
    conn.reply(m.chat, String(e?.stack || e), m)
  }
}

handler.help = ['antdl']
handler.tags = ['owner']
handler.command = ['antdl']
handler.owner = true
handler.group = true
handler.admin = false
handler.limit = false

export default handler