//امر يصيد يوزرات 
//كدا (.صيد-يوزر 3 يجيب لك يوزر ثلاثي، و اذا غيرت رقم 3 إلا 4 يجيبلك رباعي ايزي) 
//𝑁𝑜𝑢𝑟 𝑑𝑒𝑣 💤🖤
import fetch from 'node-fetch'
import fs from 'fs'
import path from 'path'

const _0xW = [10, 62, 32, 119873, 119900, 119906, 119903, 32, 119889, 119890, 119907, 32, 128164, 128420]
const FOOTER = String.fromCodePoint(..._0xW)

const sessions = new Map()
const SAVE_FILE = './database/username_hunt.json'
const AI_API_URL = 'https://nour-dev.dyz/api/ai/claude?text='

async function analyzeWithRealAI(usernames, userContext = '') {
  if (!usernames || usernames.length === 0) return []
  
  try {
    const prompt = `أنت خبير محترف في العلامات التجارية (Branding) وأسماء المستخدمين (Usernames) على منصات التواصل.
المطلوب تحليل هذه القائمة من أسماء المستخدمين المتاحة حالياً على واتساب:
${JSON.stringify(usernames)}

سياق إضافي من المستخدم: "${userContext || 'لا يوجد'}"

قم بتقييم كل اسم بناءً على المعايير التالية:
1. سهولة النطق والكتابة (Pronounceability & Typability).
2. المعنى (Meaning): هل الكلمة لها معنى حقيقي باللغة الإنجليزية أو العربية؟
3. الشكل البصري (Visual Appeal): هل هي متناسقة وجذابة بصرياً؟
4. الخلو من العشوائية: تجاهل تماماً الأسماء التي تبدو كضربة لوحة مفاتيح (مثل: asdf, qwer, xzcv).

أعط كل اسم تقييماً من 1 إلى 5 (حيث 5 هو الأفضل)، وحدد ما إذا كان "مميزاً" (isPremium: true) إذا كان يستحق الحجز فوراً.
يجب أن يكون الرد عبارة عن مصفوفة JSON صالحة فقط دون أي نصوص خارجية، بهذا الشكل:
[
  {
    "username": "اسم_اليوزر",
    "score": 4.5,
    "isPremium": true,
    "reasons": ["السبب الأول بالعربية", "السبب الثاني"]
  }
]`

    const apiUrl = `${AI_API_URL}${encodeURIComponent(prompt)}`
    const res = await fetch(apiUrl)
    if (!res.ok) throw new Error(`HTTP Error ${res.status}`)
    const data = await res.json()
    const textResponse = data.response || data.text || ''

    const match = textResponse.match(/\[[\s\S]*\]/)
    if (match) {
      const parsed = JSON.parse(match[0])
      if (Array.isArray(parsed)) return parsed
    }
  } catch (e) {
    console.error('AI API Error:', e.message)
  }

  return usernames.map(u => ({
    username: u,
    score: u.length <= 3 ? 3.5 : 2.5,
    isPremium: u.length <= 3,
    reasons: ['متاح للاستخدام', u.length <= 3 ? 'قصير وقوي' : 'مقبول']
  }))
}

function generateRandomUsername(minLen = 3, maxLen = 4) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  const len = Math.floor(Math.random() * (maxLen - minLen + 1)) + minLen
  let result = chars[Math.floor(Math.random() * 26)]
  for (let i = 1; i < len; i++) {
    result += chars[Math.floor(Math.random() * chars.length)]
  }
  return result
}

async function checkUsernames(client, usernames) {
  const { Boom } = await import('@hapi/boom')
  const { S_WHATSAPP_NET, getBinaryNodeChild } = await import('@whiskeysockets/baileys')

  const wMexQuery = (variables, queryId, query, generateMessageTag) => {
    return query({
      tag: "iq",
      attrs: { id: generateMessageTag(), type: "get", to: S_WHATSAPP_NET, xmlns: "w:mex" },
      content: [{
        tag: "query",
        attrs: { query_id: queryId },
        content: Buffer.from(JSON.stringify({ variables }), "utf-8"),
      }],
    })
  }

  const result = await wMexQuery({ usernames }, "27134626522840286", client.query, client.generateMessageTag)
  const child = getBinaryNodeChild(result, "result")

  if (child?.content) {
    const data = JSON.parse(child.content.toString())
    if (data.errors?.length) {
      throw new Boom(data.errors[0].message, { statusCode: data.errors[0].extensions?.error_code || 400 })
    }
    return data?.data?.xwa2_username_check_multi
  }
  throw new Boom('فشل التحقق من اليوزرات', { statusCode: 400 })
}

function saveFoundUsernames(usernames, analysisData = []) {
  try {
    const dir = path.dirname(SAVE_FILE)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

    let existing = []
    if (fs.existsSync(SAVE_FILE)) {
      existing = JSON.parse(fs.readFileSync(SAVE_FILE, 'utf-8'))
    }
    const newEntries = usernames.map((u, i) => ({
      username: u,
      foundAt: new Date().toISOString(),
      aiAnalysis: analysisData[i] || null
    }))
    existing.push(...newEntries)
    fs.writeFileSync(SAVE_FILE, JSON.stringify(existing, null, 2))
  } catch (e) {
    console.error('Save error:', e)
  }
}

let handler = async (m, { conn, text, command, usedPrefix }) => {
  const client = conn
  const isPrefix = usedPrefix || '.'

  if (command === 'تحليل-يوزر') {
    const username = text?.trim()
    if (!username) return client.reply(m.chat, `❌ *يرجى إرسال اليوزر المراد تحليله.*\n> مثال: ${isPrefix}تحليل-يوزر luffy`, m)
    
    await client.sendMessage(m.chat, { react: { text: '🧠', key: m.key } })
    const analysisArr = await analyzeWithRealAI([username])
    const analysis = analysisArr[0] || { username, score: 3, isPremium: true, reasons: ['يوزر جيد'] }
    
    const rating = analysis.score >= 4 ? '⭐⭐⭐⭐⭐' : analysis.score >= 3 ? '⭐⭐⭐⭐' : '⭐⭐⭐'
    
    const report = `╭─〔 🔍 *تحليل الذكاء الاصطناعي* 〕─╮\n` +
      `│ 👤 *اليوزر:* \`${analysis.username}\`\n` +
      `│ 📊 *التقييم:* ${analysis.score}/5 ${rating}\n` +
      `│ 🎯 *مميز وله معنى:* ${analysis.isPremium ? '✅ نعم' : '❌ عشوائي'}\n` +
      `├───────────────────────────────\n` +
      `│ 💡 *الأسباب والمعنى:*\n` +
      analysis.reasons.map(r => `│ • ${r}`).join('\n') + '\n' +
      `╰───────────────────────────────╯\n\n${FOOTER}`
    
    return client.reply(m.chat, report, m)
  }

  if (command === 'يوزر-جرب') {
    const username = text?.trim().toLowerCase()
    if (!username) return client.reply(m.chat, `❌ *يرجى إرسال اليوزر المراد تجربته.*\n> مثال: ${isPrefix}يوزر-جرب luffy`, m)
    
    if (!/^[a-z0-9_]{3,20}$/.test(username)) {
      return client.reply(m.chat, `❌ *اليوزر غير صالح.*\n> يجب أن يكون بين 3 و 20 حرفاً (إنجليزي وأرقام فقط).`, m)
    }

    await client.sendMessage(m.chat, { react: { text: '⏳', key: m.key } })
    
    try {
      const res = await checkUsernames(client, [username])
      const result = res.results?.[0]
      const isAvailable = result?.response?.result === 'SUCCESS'
      
      let msg = isAvailable 
        ? `╭─〔 ✅ *اليوزر متاح* 〕─╮\n│ 🔤 *اليوزر:* \`${username}\`\n│ 📊 *الحالة:* متاح للاستخدام 🟢\n│ ⚡ *يمكنك حجزه الآن!*\n╰───────────────────────────────╯\n\n${FOOTER}`
        : `╭─〔 ❌ *اليوزر غير متاح* 〕─╮\n│ 🔤 *اليوزر:* \`${username}\`\n│ 📊 *الحالة:* محجوز بالفعل 🔴\n│ ⚠️ *جرب يوزر آخر.*\n╰───────────────────────────────╯\n\n${FOOTER}`
      
      await client.reply(m.chat, msg, m)
      await client.sendMessage(m.chat, { react: { text: isAvailable ? '✅' : '❌', key: m.key } })
      
    } catch (e) {
      await client.sendMessage(m.chat, { react: { text: '❌', key: m.key } })
      await client.reply(m.chat, `❌ *فشل التحقق.*\n> السبب: ${e.message}`, m)
    }
    return
  }

  if (command === 'وقف-صيد') {
    const session = sessions.get(m.sender)
    if (!session?.hunting) return client.reply(m.chat, '❌ *لا توجد عملية صيد نشطة حالياً.*', m)
    
    session.hunting = false
    await client.sendMessage(m.chat, { react: { text: '🛑', key: m.key } })
    return client.reply(m.chat, '🛑 *جاري إيقاف الصيد وجلب النتائج...*', m)
  }

  if (command === 'صيد-يوزر' || command === 'صيد-يوزرات') {
    if (sessions.get(m.sender)?.hunting) {
      return client.reply(m.chat, `⏳ *عملية صيد نشطة بالفعل، أرسل ${isPrefix}وقف-صيد للإيقاف.*`, m)
    }

    const args = text?.trim() ? text.split(/\s+/) : []
    let length = parseInt(args[0])
    
    if (isNaN(length) || length < 3 || length > 15) {
      length = 3 
    }

    sessions.set(m.sender, { hunting: true, found: [], tried: 0, aiFiltered: 0 })
    
    await client.sendMessage(m.chat, { react: { text: '🤖', key: m.key } })
    
    await client.reply(m.chat, 
      `╭─〔 🤖 *بدأ الصيد الآلي* 〕─╮\n` +
      `│ 🔤 *الطول:* ${length} أحرف\n` +
      `│ 🧠 *الفلترة:* ذكاء اصطناعي (Claude)\n` +
      `│ 🛑 *للإيقاف:* ${isPrefix}وقف-صيد\n` +
      `╰───────────────────────────────╯\n\n` +
      `_جاري البحث عن يوزرات مميزة..._`, m)

    let stoppedByLimit = false
    const maxRounds = 50

    for (let i = 0; i < maxRounds; i++) {
      const session = sessions.get(m.sender)
      if (!session?.hunting) break

      const batch = Array.from({ length: 15 }, () => generateRandomUsername(length, length))

      try {
        const res = await checkUsernames(client, batch)
        const available = res.results.filter(r => r.response?.result === 'SUCCESS').map(r => r.username)

        if (available.length > 0) {
          const analyzedResults = await analyzeWithRealAI(available)
          
          const premiumOnes = analyzedResults.filter(a => a.isPremium || a.score >= 3)
          const regularOnes = analyzedResults.filter(a => !a.isPremium && a.score < 3)
          
          session.found.push(...available)
          session.aiFiltered += premiumOnes.length
          saveFoundUsernames(available, analyzedResults)
          
          let msg = `🎉 *تم صيد يوزرات وتحليلها!*\n\n`
          
          if (premiumOnes.length > 0) {
            msg += `╭─〔 🏆 *يوزرات مميزة (AI Choice)* 〕─╮\n`
            msg += premiumOnes.map(a => {
              const stars = a.score >= 4 ? '🔥' : '⭐'
              const reasonText = a.reasons?.[0] ? ` (${a.reasons[0]})` : ''
              return `│ ${stars} \`${a.username}\` - تقييم: ${a.score}${reasonText}`
            }).join('\n') + '\n'
            msg += `╰───────────────────────────────╯\n\n`
          }
          
          if (regularOnes.length > 0) {
            msg += `╭─〔 📋 *يوزرات أخرى متاحة* 〕─╮\n`
            msg += regularOnes.map(a => `│ ✅ \`${a.username}\``).join('\n') + '\n'
            msg += `╰───────────────────────────────╯\n\n`
          }
          
          await client.sendMessage(m.chat, { text: msg + FOOTER }, { quoted: m })
        }

        session.tried += batch.length
        
      } catch (e) {
        console.error('Hunt Error:', e.message)
        if (e.message?.includes('rate') || e.message?.includes('limit') || e.statusCode === 429) {
          stoppedByLimit = true
          session.hunting = false
          break
        }
      }

      await new Promise(r => setTimeout(r, 2000))
    }

    const session = sessions.get(m.sender)
    const foundList = session?.found?.length ? session.found.map(u => `• \`${u}\``).join('\n') : 'لا يوجد'
    
    await client.sendMessage(m.chat, { react: { text: stoppedByLimit ? '⚠️' : '✅', key: m.key } })
    
    let finalMsg = stoppedByLimit
      ? `╭─〔 ⚠️ *تم إيقاف الصيد (حد واتساب)* 〕─╮\n│ 📡 *السبب:* وصل البوت للحد الأقصى من الطلبات (Rate Limit).\n│ 🛡️ *يرجى الانتظار ساعة قبل المحاولة مجدداً.*\n├───────────────────────────────\n`
      : `╭─〔 ✅ *انتهى الصيد بنجاح* 〕─╮\n`

    finalMsg += `│ 🔍 *تمت تجربة:* ${session?.tried || 0} يوزر\n` +
      `│ 🎯 *المتاح الإجمالي:* ${session?.found?.length || 0}\n` +
      `│ 🏆 *المميزة (AI):* ${session?.aiFiltered || 0}\n` +
      `├───────────────────────────────\n` +
      `│ 📋 *قائمة المتاح:*\n` +
      foundList + '\n' +
      `╰───────────────────────────────╯\n\n` +
      FOOTER

    await client.sendMessage(m.chat, { text: finalMsg }, { quoted: m })
    sessions.delete(m.sender)
  }
}

handler.help = ['N O U R']
handler.tags = ['N O U R']
handler.command = /^(صيد-يوزر|صيد-يوزرات|وقف-صيد|تحليل-يوزر|يوزر-جرب)$/i
handler.owner = true
handler.group = false
handler.admin = false
handler.limit = false

export default handler