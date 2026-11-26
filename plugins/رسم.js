// plugins/رسم.js — توليد الصور بالذكاء الاصطناعي مع ترجمة تلقائية للإنجليزية

import axios from 'axios'
import { join } from 'path'
import { tmpdir } from 'os'
import { createWriteStream, unlinkSync, statSync } from 'fs'
import { pipeline } from 'stream/promises'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

function isAlreadyEnglish(str = '') {
  const s = String(str).trim()
  if (!s) return true
  return !/[^\u0000-\u007F]/.test(s)
}

async function getJson(url) {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), 12000)
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': UA },
      signal: ctl.signal
    })
    const body = await r.text()
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    try { return JSON.parse(body) } catch { throw new Error('الرد مش JSON') }
  } finally {
    clearTimeout(t)
  }
}

const TRANSLATE_PROVIDERS = [
  ['google-gtx', async (q, tl = 'en') => {
    const d = await getJson(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${tl}&dt=t&q=${encodeURIComponent(q)}`)
    const text = (d?.[0] || []).map(x => x?.[0]).filter(Boolean).join('')
    if (!text) throw new Error('رد فاضي')
    return text.trim()
  }],
  ['google-chrome', async (q, tl = 'en') => {
    const d = await getJson(`https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=auto&tl=${tl}&q=${encodeURIComponent(q)}`)
    const text = d?.sentences
      ? d.sentences.map(s => s.trans).filter(Boolean).join('')
      : (Array.isArray(d) ? (Array.isArray(d[0]) ? d[0][0] : d[0]) : '')
    if (!text) throw new Error('رد فاضي')
    return String(text).trim()
  }],
  ['google-package', async (q, tl = 'en') => {
    const mod = await import('@vitalets/google-translate-api')
    const fn = mod.translate || mod.default?.translate || mod.default
    const r = await fn(q, { to: tl })
    if (!r?.text) throw new Error('رد فاضي')
    return String(r.text).trim()
  }],
  ['lingva', async (q, tl = 'en') => {
    if (q.length > 1500) throw new Error('النص طويل')
    const d = await getJson(`https://lingva.ml/api/v1/auto/${tl}/${encodeURIComponent(q)}`)
    if (!d?.translation) throw new Error('رد فاضي')
    return String(d.translation).trim()
  }]
]

async function translateToEnglish(prompt) {
  if (isAlreadyEnglish(prompt)) return prompt

  for (const [name, fn] of TRANSLATE_PROVIDERS) {
    try {
      const translated = await fn(prompt, 'en')
      if (translated) {
        console.log('[رسم] 🌐 translated via', name, '->', translated)
        return translated
      }
    } catch (e) {
      console.error('[رسم] ❌ translate', name, e?.message || e)
    }
  }

  return prompt
}

let handler = async (m, { conn, text, usedPrefix, command }) => {
  const react = async (emoji) => {
    try { await conn.sendMessage(m.chat, { react: { text: emoji, key: m.key } }) } catch {}
  }

  if (!text) {
    await react('❌')
    return m.reply(
      `╭━━━〔 🎨 *تـولـيـد الـرسـم* 〕━━━⬣\n` +
      `┃ ✦ الاستخدام: ${usedPrefix}${command} [وصف الرسم]\n` +
      `┃\n` +
      `┃ 📝 *أمثلة:*\n` +
      `┃ ✦ ${usedPrefix}${command} قطة لطيفة في حديقة\n` +
      `┃ ✦ ${usedPrefix}${command} غروب الشمس على البحر\n` +
      `┃ ✦ ${usedPrefix}${command} مدينة مستقبلية\n` +
      `╰━━━━━━━━━━━━━━⬣\n\n` +
      `> ⛩️ SUKUNA BOT ⛩️`
    )
  }

  await react('🎨')
  await m.reply(`⏳ جاري ترجمة الوصف وتوليد الرسم...\n📝 الوصف: ${text}`)

  try {
    const englishText = await translateToEnglish(text)
    const fullPrompt = `${englishText}, high quality, highly detailed`
    const encoded = encodeURIComponent(fullPrompt)
    const imageUrl = `https://image.pollinations.ai/prompt/${encoded}?width=1024&height=1024&nologo=true&enhance=true`

    const filePath = join(tmpdir(), `sukuna_draw_${Date.now()}.jpg`)
    const imgRes = await axios({
      method: 'GET',
      url: imageUrl,
      responseType: 'stream',
      timeout: 120000,
      headers: {
        'User-Agent': UA
      }
    })
    await pipeline(imgRes.data, createWriteStream(filePath))

    const size = statSync(filePath).size
    if (size < 5000) {
      try { unlinkSync(filePath) } catch {}
      throw new Error('فشل توليد الرسم — جرب وصف مختلف')
    }

    const promptInfo = englishText !== text
      ? `┃ 📝 *الوصف:* ${text}\n┃ 🌐 *بالإنجليزية:* ${englishText}`
      : `┃ 📝 *الوصف:* ${text}`

    await conn.sendMessage(m.chat, {
      image: { url: filePath },
      caption:
        `╭━━━〔 ✅ *تـم تـولـيـد الـرسـم* 〕━━━⬣\n` +
        `${promptInfo}\n` +
        `┃ 📁 *الحجم:* ${(size / 1024).toFixed(2)} KB\n` +
        `╰━━━━━━━━━━━━━━⬣\n\n` +
        `> ⛩️ SUKUNA BOT ⛩️`
    }, { quoted: m })

    await react('✅')
    try { unlinkSync(filePath) } catch {}

  } catch (err) {
    await react('❌')
    console.error('[رسم] Error:', err.message)
    m.reply(
      `╭━━━〔 ❌ *فـشـل الـتـولـيـد* 〕━━━⬣\n` +
      `┃ ⚠️ ${err.message}\n` +
      `┃ 💡 جرب وصف مختلف\n` +
      `╰━━━━━━━━━━━━━━⬣`
    )
  }
}

handler.help    = ['رسم <الوصف>']
handler.tags    = ['ai']
handler.command = /^(رسم|draw|توليد|imagine|img|imag)$/i

export default handler