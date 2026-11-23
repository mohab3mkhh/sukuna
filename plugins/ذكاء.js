/**
 * plugins/aiapk.js
 * محادثة AI عبر /ai/aiapk
 */

import axios from 'axios'

const CHAT_ENDPOINT = 'https://prexzyapis.com/ai/aiapk'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

const react = async (conn, m, emoji) => {
  try { await conn.sendMessage(m.chat, { react: { text: emoji, key: m.key } }) } catch {}
}

function extractReplyText(payload) {
  if (!payload) return ''
  if (typeof payload === 'string') return payload.trim()

  const candidates = [
    payload.response,
    payload.reply,
    payload.answer,
    payload.text,
    payload.message,
    payload.result?.response,
    payload.result?.reply,
    payload.result?.text,
    payload.data?.response,
    payload.data?.reply,
    payload.data?.text,
    payload.data?.message
  ]

  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim()
  }
  return ''
}

async function requestChat(prompt) {
  const res = await axios.get(CHAT_ENDPOINT, {
    params: { prompt },
    timeout: 60000,
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    validateStatus: () => true
  })

  if (res.status >= 400) {
    throw new Error(`HTTP ${res.status}`)
  }

  const data = res.data
  if (data && data.status === false) {
    throw new Error(data.error || data.message || 'فشل طلب الذكاء الاصطناعي')
  }

  return extractReplyText(data)
}

let handler = async (m, { conn, text, usedPrefix, command }) => {
  const prompt = (text || '').trim()
  if (!prompt) {
    return m.reply(`🤖 *الذكاء الاصطناعي*\n\nاكتب سؤالك:\n💡 *مثال:* ${usedPrefix + command} اشرح لي الذكاء الاصطناعي ببساطة`)
  }

  await react(conn, m, '⏳')
  const wait = await m.reply('🤖 *جاري التفكير...*')

  try {
    const textReply = await requestChat(prompt)
    try { await conn.sendMessage(m.chat, { delete: wait.key }) } catch {}

    if (textReply) {
      await conn.sendMessage(m.chat, { text: textReply }, { quoted: m })
      await react(conn, m, '✅')
      return
    }

    await m.reply('❌ لم يرجع الـ API رداً نصياً.')
    await react(conn, m, '❌')
  } catch (e) {
    console.error('[aiapk]', e.message)
    try { await conn.sendMessage(m.chat, { delete: wait.key }) } catch {}
    await react(conn, m, '❌')
    await m.reply(`❌ *خطأ:* ${e.message}`)
  }
}

handler.help = ['ai <سؤال>']
handler.tags = ['ai']
handler.command = /^(ai|ذكاء|aiapk)$/i

export default handler