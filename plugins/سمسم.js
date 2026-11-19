// plugins/simsimi.js
import axios from 'axios'

/* ═══════════════════════════════════════
   𝑺𝑼𝑲𝑼𝑵𝑨 SIMSIMI
═══════════════════════════════════════ */

function panel(title, body) {
  return `🌊 *${title}*\n\n${body}`
}

/* REACTION */
async function react(conn, m, emoji) {
  try {
    if (typeof m.react === 'function') {
      await m.react(emoji)
      return
    }
    await conn.sendMessage(m.chat, { react: { text: emoji, key: m.key } })
  } catch {}
}

/* SEND
   الإصلاح: الـ quoted لازم يكون الرسالة كاملة (فيها key)،
   مش m.msg (ده المحتوى بس ومفيهوش key → كان بيطلع "reading 'fromMe'") */
async function send(conn, m, text) {
  const opts = m?.key ? { quoted: m } : {}
  try {
    return await conn.sendMessage(m.chat, { text }, opts)
  } catch (e) {
    // لو الرد على الرسالة فشل لأي سبب، نبعت من غير quoted بدل ما البوت يسكت
    return conn.sendMessage(m.chat, { text })
  }
}

/* SIMSIMI API */
async function getSimSimiResponse(query) {
  try {
    const response = await axios.get('https://engez.a7a.online/api/v1/ai/ai/simsimi', {
      params: { action: 'تكلم', message: query },
      timeout: 15000
    })

    const data = response.data
    if (data && data.success && data.response?.reply) {
      return String(data.response.reply)
    }
    return 'مش لاقي رد مناسب للكلام ده 🤔'
  } catch (error) {
    console.error('[𝑺𝑼𝑲𝑼𝑵𝑨 SIMSIMI API ERROR]', error.response?.data || error.message)
    throw new Error('API Connection Failed')
  }
}

/* HANDLER */
const handler = async (m, { conn, text, args }) => {
  const query = (text || (Array.isArray(args) ? args.join(' ') : '') || '').trim()

  try {
    if (!query) {
      await react(conn, m, '🐤')
      return send(conn, m, panel('𝑺𝑼𝑲𝑼𝑵𝑨 𝑺𝒊𝒎𝒔𝒊𝒎𝒊',
`🐤 أهلاً بيك في سمسمي!

📍 اكتب رسالتك بعد الأمر.

⟢ مثال:
.سمسم عامل إيه؟`))
    }

    await react(conn, m, '🕰')
    const reply = await getSimSimiResponse(query)
    await react(conn, m, '☑️')
    await send(conn, m, panel('𝑺𝑼𝑲𝑼𝑵𝑨 𝑺𝒊𝒎𝒔𝒊𝒎𝒊', `🐤 *سمسم:* ${reply}`))

  } catch (error) {
    console.error('[𝑺𝑼𝑲𝑼𝑵𝑨 SIMSIMI ERROR]', error.stack || error.message || error)
    await react(conn, m, '🚫')
    return send(conn, m, panel('𝑺𝑼𝑲𝑼𝑵𝑨 𝑺𝒊𝒎𝒔𝒊𝒎𝒊', `🔶️ البوت في وقت الصيانة الآن، حاول مرة أخرى بعد قليل.`))
  }
}

handler.command = /^(سمسم\.ب|سمسم|سيمسيم|simsimi)$/i
handler.tags = ['ai']
handler.help = ['سمسم.ب']

export default handler