// plugins/رسم.js — توليد الصور بالذكاء الاصطناعي

import axios from 'axios'
import { join } from 'path'
import { tmpdir } from 'os'
import { createWriteStream, unlinkSync, statSync } from 'fs'
import { pipeline } from 'stream/promises'

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
  await m.reply(`⏳ جاري توليد الرسم...\n📝 الوصف: ${text}`)

  try {
    // ترجمة للإنجليزية
    let englishText = text
    try {
      const trRes = await axios.get(
        `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(text)}`,
        { timeout: 8000 }
      )
      const translated = trRes.data?.[0]?.map(x => x?.[0]).filter(Boolean).join('') || text
      if (translated) englishText = translated
    } catch { englishText = text }

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
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    })
    await pipeline(imgRes.data, createWriteStream(filePath))

    const size = statSync(filePath).size
    if (size < 5000) {
      try { unlinkSync(filePath) } catch {}
      throw new Error('فشل توليد الرسم — جرب وصف مختلف')
    }

    await conn.sendMessage(m.chat, {
      image: { url: filePath },
      caption:
        `╭━━━〔 ✅ *تـم تـولـيـد الـرسـم* 〕━━━⬣\n` +
        `┃ 📝 *الوصف:* ${text}\n` +
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