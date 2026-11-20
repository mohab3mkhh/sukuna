//امر يصيد يوزرات 
//كدا (.صيد-يوزر 3 يجيب لك يوزر ثلاثي، و اذا غيرت رقم 3 إلا 4 يجيبلك رباعي ايزي) 
// ⛩️ SUKUNA BOT — by Mohab
import fetch from 'node-fetch'
import fs from 'fs'
import path from 'path'

const FOOTER = '\n> ⛩️ SUKUNA BOT • by Mohab ⛩️'

const sessions = new Map()
const BATCH_SIZE = 15      // عدد اليوزرات في كل فحص
const RATE_RETRIES = 3                // كام مرة نستنى ونكمّل لما واتساب يحدد السرعة قبل ما نقف
const RATE_BACKOFF_S = [60, 180, 420]  // مدة الانتظار بالثواني في كل مرة
const COOLDOWN_MS = 30 * 60 * 1000     // بعد الإيقاف بسبب الحد، الأمر بيرفض يبدأ قبل 30 دقيقة
const HUNT_DELAY_MS = 4000 // الفاصل بين كل دفعتين (قلّله لسرعة أكتر، وزوّده لو جالك Rate Limit)
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


// ═══════════ 🧠 وضع المميز: يوزرات ليها معنى / شكل حلو (زي gemi / aiai / tom1 / egy_) ═══════════
const WORDS = ['gemi','gpt','neo','nova','zen','kai','leo','tom','max','ace','ray','sky','fox','wolf','lion','king','boss','dark','moon','star','fire','ice','ninja','ghost','alpha','beta','delta','omega','pixel','cyber','robo','bot','data','code','byte','hack','egy','cairo','nile','ali','omar','nour','sara','mido','zizo','koko','gojo','sukuna','itachi','naruto','luffy','zoro','anime','otaku','wave','storm','blaze','shadow','night','dawn','sun','sol','lux','vex','rex','zed','jin','ryu','kira','nami','yuki','hana','miku','sora','riku','haru','aya','ian','eli','ash','dev','pro','gamer','player','swift','rapid','flash','turbo','hero','titan','atlas','apex','orion','vega','luna','astro','comet','cosmo','echo','ember','frost','onyx','jade','ruby','coral','amber','tiger','eagle','hawk','raven','cobra','viper','panda','bear','shark','dragon','demon','angel','saint','royal','prince','duke','lord','chief','smart','logic','mind','brain','think','bolt','spark','glow','neon','retro','lofi','vibe','chill','cool','epic','magic','mystic','fable','myth','saga','quest','arcane','rune','claude','grok','llama','bard','siri','alexa']
const VOW = 'aeiou', CON = 'bcdfghjklmnprstvzxk'
const pick = a => a[Math.floor(Math.random() * a.length)]
const cvcv = () => pick(CON) + pick(VOW) + pick(CON) + pick(VOW)

function smartCandidate() {
  const w = pick(WORDS)
  switch (Math.floor(Math.random() * 10)) {
    case 0: case 1: return [w, 'كلمة']
    case 2: case 3: return [w + Math.floor(Math.random() * 10), 'كلمة + رقم']
    case 4: return [w + '_', 'كلمة + _']
    case 5: return ['ai' + w, 'بادئة ai']
    case 6: return [w + 'ai', 'لاحقة ai']
    case 7: { const p = pick(CON) + pick(VOW) ; return [p + p, 'تكرار'] }                       // koko / zizo
    case 8: { const a = pick(CON), b = pick(VOW); return [a + b + a + b, 'نمط متكرر'] }
    default: { const a = pick(CON), b = pick(VOW); return [a + b + b + a, 'متماثل'] } // abba
  }
}

function smartBatch(n, length, seen) {
  const out = []
  let guard = 0
  while (out.length < n && guard++ < 5000) {
    const [u, kind] = smartCandidate()
    if (length && u.length !== length) continue
    if (u.length < 3 || u.length > 15) continue
    if (seen.has(u)) continue
    seen.add(u)
    out.push({ u, kind })
  }
  return out
}

// ═══════════ 🎯 الصيد العشوائي المحسّن (للأطوال القصيرة) ═══════════
// الفكرة: اليوزرات "الحلوة" (حروف عادية / كلمات) بتتحجز الأول، فبنميل لتركيبات أقل احتمال إنها اتحجزت
// (أرقام، _ ، حروف نادرة زي q x z j v)، وما بنكررش يوزر اتجرب قبل كده (حتى بين الجلسات لحد الـ Restart).
if (!global.__huntTried) global.__huntTried = new Set()
const COMMON = 'abcdefghijklmnopqrstuvwxyz'
const RARE = 'qxzjvkwy'
const DIGITS = '0123456789'

function generateRandomUsername(minLen = 3, maxLen = 4, bias = true) {
  const len = Math.floor(Math.random() * (maxLen - minLen + 1)) + minLen
  const pickFrom = str => str[Math.floor(Math.random() * str.length)]
  const mustHaveLetter = pickFrom(bias ? RARE + COMMON : COMMON)
  let result = ''
  for (let i = 0; i < len; i++) {
    if (i === 0) { result += mustHaveLetter; continue }
    if (!bias) { result += pickFrom(COMMON + DIGITS); continue }
    const r = Math.random()
    if (r < 0.35) result += pickFrom(DIGITS)
    else if (r < 0.60) result += pickFrom(RARE)
    else if (r < 0.70 && i < len - 0) result += '_'
    else result += pickFrom(COMMON)
  }
  return result.replace(/_{2,}/g, '_')
}

// دفعة من يوزرات جديدة ما اتجربتش قبل كده
function freshBatch(n, length, bias) {
  const out = new Set()
  let guard = 0
  while (out.size < n && guard++ < 20000) {
    const u = generateRandomUsername(length, length, bias)
    if (u.length !== length || global.__huntTried.has(u)) continue
    global.__huntTried.add(u)
    out.add(u)
  }
  if (global.__huntTried.size > 200000) global.__huntTried.clear()
  return [...out]
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

let handler = async (m, { conn, text, command, usedPrefix, isROwner, isOwner }) => {
  // للمطور فقط
  if (!isROwner && !isOwner) return conn.reply(m.chat, '❌ هذا الأمر للمطور فقط.', m)

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
    const cd = (global.__huntCooldownUntil || 0) - Date.now()
    if (cd > 0) return client.reply(m.chat, `🛡️ *واتساب لسه حاطط حد على الطلبات.*\n> استنى ${Math.ceil(cd / 60000)} دقيقة قبل ما تصيد تاني، عشان رقم البوت ميتحظرش.`, m)
    if (sessions.get(m.sender)?.hunting) {
      return client.reply(m.chat, `⏳ *عملية صيد نشطة بالفعل، أرسل ${isPrefix}وقف-صيد للإيقاف.*`, m)
    }

    let args = text?.trim() ? text.split(/\s+/) : []
    const smart = /^(مميز|مميزه|مميزة|ai|smart|ذكي)$/i.test(args[0] || '')
    if (smart) args = args.slice(1)
    let length = parseInt(args[0])

    if (isNaN(length) || length < 3 || length > 15) {
      length = smart ? 0 : 3   // في الوضع المميز: 0 = أي طول
    }

    sessions.set(m.sender, { hunting: true, found: [], tried: 0, aiFiltered: 0, seen: new Set() })
    
    await client.sendMessage(m.chat, { react: { text: '🤖', key: m.key } })
    
    await client.reply(m.chat, 
      `╭─〔 🤖 *بدأ الصيد الآلي* 〕─╮\n` +
      `│ 🔤 *الطول:* ${length ? length + ' أحرف' : 'أي طول (3-6)'}\n` +
      `│ 🧠 *النمط:* ${smart ? 'يوزرات مميزة (كلمات / أنماط)' : 'عشوائي + فلترة'}\n` +
      `│ 🛑 *للإيقاف:* ${isPrefix}وقف-صيد\n` +
      `╰───────────────────────────────╯\n\n` +
      `_جاري البحث عن يوزرات مميزة..._`, m)

    let stoppedByLimit = false
    const maxRounds = smart ? 80 : 50

    for (let i = 0; i < maxRounds; i++) {
      const session = sessions.get(m.sender)
      if (!session?.hunting) break

      let kinds = {}
      let batch
      if (smart) {
        const sb = smartBatch(15, length, session.seen)
        if (!sb.length) break
        batch = sb.map(x => x.u)
        sb.forEach(x => { kinds[x.u] = x.kind })
      } else {
        batch = freshBatch(BATCH_SIZE, length, true)
      }

      try {
        const res = await checkUsernames(client, batch)
        const available = res.results.filter(r => r.response?.result === 'SUCCESS').map(r => r.username)

        if (available.length > 0 && smart) {
          session.found.push(...available)
          session.aiFiltered += available.length
          saveFoundUsernames(available, available.map(u => ({ username: u, score: 4, isPremium: true, reasons: [kinds[u] || 'مميز'] })))
          const msg = `🎉 *تم صيد يوزرات مميزة!*\n\n╭─〔 🏆 *متاح الآن* 〕─╮\n` +
            available.map(u => `│ 🔥 \`${u}\` (${kinds[u] || 'مميز'})`).join('\n') + `\n╰───────────────────────────────╯\n\n`
          await client.sendMessage(m.chat, { text: msg + FOOTER }, { quoted: m })
        } else if (available.length > 0) {
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
        console.error('Hunt Error:', e.message, e.statusCode || '')
        session.lastError = e.message
        const rl = /rate|limit|overlimit|too.?many|429|463/i.test(String(e.message)) || e.statusCode === 429
        if (rl) {
          session.rateHits = (session.rateHits || 0) + 1
          if (session.rateHits > RATE_RETRIES) {
            stoppedByLimit = true
            session.hunting = false
            global.__huntCooldownUntil = Date.now() + COOLDOWN_MS
            break
          }
          const wait = RATE_BACKOFF_S[Math.min(session.rateHits - 1, RATE_BACKOFF_S.length - 1)]
          await client.sendMessage(m.chat, { text: `⏳ واتساب حدّد السرعة (${session.rateHits}/${RATE_RETRIES}). هستنى ${wait} ثانية وأكمل...\n> ${String(e.message).slice(0, 80)}` }, { quoted: m })
          for (let w = 0; w < wait && sessions.get(m.sender)?.hunting; w++) await new Promise(r => setTimeout(r, 1000))
          continue
        }
      }

      await new Promise(r => setTimeout(r, HUNT_DELAY_MS))
    }

    const session = sessions.get(m.sender)
    const foundList = session?.found?.length ? session.found.map(u => `• \`${u}\``).join('\n') : 'لا يوجد'
    
    await client.sendMessage(m.chat, { react: { text: stoppedByLimit ? '⚠️' : '✅', key: m.key } })
    
    let finalMsg = stoppedByLimit
      ? `╭─〔 ⚠️ *تم إيقاف الصيد (حد واتساب)* 〕─╮\n│ 📡 *السبب:* وصل البوت للحد الأقصى من الطلبات (Rate Limit).\n│ ⚠️ *رد واتساب:* ${String(session?.lastError || '-').slice(0, 80)}\n│ 🛡️ *استنى 30 دقيقة على الأقل قبل المحاولة.*\n├───────────────────────────────\n`
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

handler.help = ['صيد-يوزر <الطول>', 'يوزر-جرب <يوزر>', 'تحليل-يوزر <يوزر>', 'وقف-صيد']
handler.tags = ['owner']
handler.command = /^(صيد-يوزر|صيد-يوزرات|وقف-صيد|تحليل-يوزر|يوزر-جرب)$/i
handler.owner = true
handler.group = false
handler.admin = false
handler.limit = false

export default handler