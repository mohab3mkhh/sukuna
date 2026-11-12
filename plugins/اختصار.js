import fetch from 'node-fetch'

let handler = async (m, { conn, args, text }) => {
  if (!text) return conn.sendMessage(m.chat, { text:'*فين اللنك اللي عايز تختصره.*')

  try {
    let shortUrl = await (await fetch(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(text)}`)).text()

    if (!shortUrl || !shortUrl.startsWith('http')) return conn.sendMessage(m.chat, { text:'*خطأ في الاختصار، جرب تاني.*')

    let done = `*اختصار اللنكات*\n\n*اللينك الاصلي:*\n${text}\n*اللنك المختصر:*\n${shortUrl}`.trim()

    conn.sendMessage(m.chat, { text:done)
  } catch (e) {
    console.error('[اختصار]', e.message)
    conn.sendMessage(m.chat, { text:'*خطأ: ' + e.message + '*')
  }
}

handler.help = ['اختصار <link>']
handler.tags = ['tools']
handler.command = /^(tinyurl|short|اختصار)$/u
handler.fail = null

export default handler