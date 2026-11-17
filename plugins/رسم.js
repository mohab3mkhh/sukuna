/**
 * plugins/رسم.js
 * توليد الصور عبر @GPT4Telegrambot على تليجرام
 * النماذج: Nano Banana Pro / GPT Image / Recraft
 */

import { TelegramClient } from 'telegram'
import { StringSession } from 'telegram/sessions/index.js'
import { NewMessage } from 'telegram/events/index.js'

const API_ID   = parseInt(process.env.TG_API_ID)
const API_HASH = process.env.TG_API_HASH
const BOT_USER = 'GPT4Telegrambot'

// النماذج المسموح بيها بس
const ALLOWED_MODELS = ['Nano Banana Pro', 'GPT Image 2.6', 'Recraft']

// الجودات
const QUALITY_LABELS = { '1': '1k', '2': '2k', '3': '4k' }

let _client = null

// ══════════════════════════════════════════════════
// اتصال بتليجرام
// ══════════════════════════════════════════════════
async function getClient() {
  if (_client?.connected) return _client
  const session = new StringSession(process.env.TG_SESSION || '')
  const client  = new TelegramClient(session, API_ID, API_HASH, { connectionRetries: 5 })
  await client.connect()
  console.log('[رسم] ✅ TG Connected')
  _client = client
  return client
}

// ══════════════════════════════════════════════════
// انتظر رد من البوت (نص أو صورة)
// ══════════════════════════════════════════════════
function waitForReply(client, timeout = 60000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      client.removeEventHandler(h)
      reject(new Error('انتهى الوقت — مفيش رد من تليجرام'))
    }, timeout)

    const h = async (event) => {
      const msg = event.message
      if (!msg) return
      try {
        const sender = await msg.getSender()
        if (sender?.username?.toLowerCase() === BOT_USER.toLowerCase()) {
          clearTimeout(timer)
          client.removeEventHandler(h)
          resolve(msg)
        }
      } catch {}
    }
    client.addEventHandler(h, new NewMessage({}))
  })
}

async function sendAndWait(client, message, timeout = 30000) {
  const p = waitForReply(client, timeout)
  await client.sendMessage(BOT_USER, { message })
  return p
}

async function clickAndWait(client, msg, btnData, timeout = 60000) {
  const p = waitForReply(client, timeout)
  await msg.click({ data: btnData })
  return p
}

// ══════════════════════════════════════════════════
// استخرج الأزرار من رسالة
// ══════════════════════════════════════════════════
function getButtons(msg) {
  return msg?.replyMarkup?.rows?.flatMap(r => r.buttons) || []
}

// ══════════════════════════════════════════════════
// حالة كل مستخدم
// ══════════════════════════════════════════════════
if (!global._rsmState) global._rsmState = {}

// ══════════════════════════════════════════════════
// Handler الرئيسي
// ══════════════════════════════════════════════════
const handler = async (m, { conn, text, usedPrefix, command }) => {
  const jid    = m.chat
  const sender = m.sender
  const input  = (text || '').trim()

  const reply = async (txt) =>
    conn.sendMessage(jid, { text: txt }, { quoted: m })

  const sendBtns = async (txt, btns) => {
    // بعت زراير كـ list
    const sections = [{
      title: '🎨 اختار',
      rows: btns.map((b, i) => ({
        title: b.label,
        rowId: `${usedPrefix}${command} _btn_${i}_${sender}`,
        description: ''
      }))
    }]
    try {
      await conn.sendMessage(jid, {
        text: txt,
        buttonText: '🎨 اختار',
        sections,
        listType: 1
      }, { quoted: m })
    } catch {
      // fallback نص عادي لو list مش شغال
      const nums = btns.map((b, i) => `*${i + 1}.* ${b.label}`).join('\n')
      await reply(`${txt}\n\n${nums}\n\nابعت الرقم`)
    }
  }

  const state = global._rsmState[sender] || {}

  try {
    const client = await getClient()

    // ══════════════════════════════════════════════
    // مرحلة 1: بداية — اضغط "إنشاء الصور"
    // ══════════════════════════════════════════════
    if (!state.step) {
      await m.react('⏳')

      // بعت /start للبوت
      const startMsg = await sendAndWait(client, '/start', 30000)
      const startBtns = getButtons(startMsg)

      // دور على زرار "إنشاء الصور"
      const createBtn = startBtns.find(b =>
        b.text?.includes('إنشاء الصور') || b.text?.includes('صور') || b.text?.toLowerCase().includes('image')
      )

      if (!createBtn) {
        await m.react('❌')
        return reply('❌ مش لاقي زرار "إنشاء الصور" — جرب تاني')
      }

      // اضغط الزرار
      const modelsMsg = await clickAndWait(client, startMsg, createBtn.data, 30000)
      const modelBtns = getButtons(modelsMsg)

      // فلتر النماذج المسموح بيها بس
      const filtered = modelBtns.filter(b =>
        ALLOWED_MODELS.some(m => b.text?.includes(m))
      )

      if (!filtered.length) {
        await m.react('❌')
        return reply('❌ مش لاقي النماذج — جرب تاني')
      }

      // احفظ الحالة
      global._rsmState[sender] = {
        step: 'choose_model',
        modelBtns: filtered.map(b => ({ label: b.text, data: b.data })),
        tgMsg: modelsMsg
      }

      await m.react('✅')
      await sendBtns(
        `🎨 *اختار النموذج:*`,
        filtered.map(b => ({ label: b.text }))
      )
      return
    }

    // ══════════════════════════════════════════════
    // مرحلة 2: اختار النموذج
    // ══════════════════════════════════════════════
    if (state.step === 'choose_model') {
      const { modelBtns, tgMsg } = state

      let chosen = null
      const idx = parseInt(input) - 1
      if (!isNaN(idx) && modelBtns[idx]) {
        chosen = modelBtns[idx]
      } else {
        chosen = modelBtns.find(b => b.label?.toLowerCase().includes(input.toLowerCase()))
      }

      if (!chosen) {
        return reply(`❌ اختار رقم من 1 لـ ${modelBtns.length}`)
      }

      await m.react('⏳')

      // اضغط النموذج
      const afterModel = await clickAndWait(client, tgMsg, chosen.data, 30000)
      const afterBtns  = getButtons(afterModel)

      const isNanoPro = chosen.label?.includes('Nano Banana Pro')

      if (isNanoPro && afterBtns.length > 0) {
        // في خيارات جودة
        const qualityBtns = afterBtns.filter(b =>
          b.text?.match(/\d[kK]/) || b.text?.match(/^[1234]$/)
        )

        if (qualityBtns.length > 0) {
          global._rsmState[sender] = {
            step: 'choose_quality',
            model: chosen.label,
            qualityBtns: qualityBtns.map(b => ({ label: b.text, data: b.data })),
            tgMsg: afterModel
          }

          await m.react('✅')
          await sendBtns(
            `✅ اخترت *${chosen.label}*\n\n📊 *اختار الجودة:*`,
            qualityBtns.map(b => ({ label: b.text }))
          )
          return
        }
      }

      // مفيش جودة — اطلب الوصف مباشرة
      global._rsmState[sender] = {
        step: 'waiting_prompt',
        model: chosen.label,
        tgMsg: afterModel
      }

      await m.react('✅')
      await reply(
        `✅ اخترت *${chosen.label}*\n\n` +
        `✏️ *اكتب وصف الصورة:*\n` +
        `مثال: \`${usedPrefix}${command} قطة نائمة على القمر\``
      )
      return
    }

    // ══════════════════════════════════════════════
    // مرحلة 3: اختار الجودة (Nano Banana Pro فقط)
    // ══════════════════════════════════════════════
    if (state.step === 'choose_quality') {
      const { qualityBtns, tgMsg, model } = state

      let chosen = null
      const idx = parseInt(input) - 1
      if (!isNaN(idx) && qualityBtns[idx]) {
        chosen = qualityBtns[idx]
      } else {
        chosen = qualityBtns.find(b => b.label?.toLowerCase().includes(input.toLowerCase()))
      }

      if (!chosen) {
        return reply(`❌ اختار رقم من 1 لـ ${qualityBtns.length}`)
      }

      await m.react('⏳')

      // اضغط الجودة
      const afterQuality = await clickAndWait(client, tgMsg, chosen.data, 30000)

      global._rsmState[sender] = {
        step: 'waiting_prompt',
        model,
        quality: chosen.label,
        tgMsg: afterQuality
      }

      await m.react('✅')
      await reply(
        `✅ اخترت *${model}* — جودة *${chosen.label}*\n\n` +
        `✏️ *اكتب وصف الصورة:*\n` +
        `مثال: \`${usedPrefix}${command} قطة نائمة على القمر\``
      )
      return
    }

    // ══════════════════════════════════════════════
    // مرحلة 4: استقبل الوصف وبعته، انتظر الصورة
    // ══════════════════════════════════════════════
    if (state.step === 'waiting_prompt') {
      if (!input) return reply('✏️ اكتب وصف الصورة')

      const { model, quality, tgMsg } = state

      await m.react('⏳')
      await reply(`⏳ جاري توليد الصورة...\n📝 ${input}\n🎨 ${model}${quality ? ` — ${quality}` : ''}`)

      // بعت الوصف للبوت
      const imgMsg = await sendAndWait(client, input, 120000)

      // امسح الحالة
      delete global._rsmState[sender]

      // جيب الصورة
      let imgBuffer = null
      if (imgMsg.media) {
        try {
          imgBuffer = await client.downloadMedia(imgMsg.media, {})
        } catch (e) {
          console.error('[رسم] download error:', e.message)
        }
      }

      if (!imgBuffer) {
        await m.react('❌')
        return reply(`❌ مش قادر أجيب الصورة\n\n${imgMsg.text || 'مفيش نص'}`)
      }

      await conn.sendMessage(jid, {
        image: imgBuffer,
        caption:
          `╭━━━〔 ✅ *تـم تـولـيـد الـصـورة* 〕━━━⬣\n` +
          `┃ 📝 *الوصف:* ${input}\n` +
          `┃ 🎨 *النموذج:* ${model}${quality ? `\n┃ 📊 *الجودة:* ${quality}` : ''}\n` +
          `╰━━━━━━━━━━━━━━⬣\n\n` +
          `> ⛩️ SUKUNA BOT ⛩️`
      }, { quoted: m })

      await m.react('✅')
      return
    }

  } catch (e) {
    console.error('[رسم]', e.message)
    delete global._rsmState[sender]
    await m.react('❌')
    await reply(`❌ *فشل*\n⚠️ ${e.message}`)
  }
}

handler.help    = ['رسم <وصف الصورة>']
handler.tags    = ['ai']
handler.command = /^(رسم|ارسم|draw|رسمه|صميم)$/i

export default handler