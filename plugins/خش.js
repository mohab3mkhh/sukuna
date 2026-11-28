// plugins/join-group.js
// .خش <رابط_الجروب|كود_الدعوة>
// SUKUNA BOT — انضمام للجروب بدون رسائل محاولات متكررة

import fs from 'fs'
import path from 'path'

const INVITE_RE = /(?:https?:\/\/)?(?:chat\.whatsapp\.com\/|whatsapp(?:\.com)?\/invite\/)?([0-9A-Za-z_-]{15,})/i
const WELCOME_IMAGE_PATH = path.join(process.cwd(), 'media', 'welcome.jpg')
const DATA_DIR = path.join(process.cwd(), 'data')
const LOG_FILE = path.join(DATA_DIR, 'join-attempts.json')
const MAX_RETRIES = 3          // لأخطاء الشبكة المؤقتة فقط، وبصمت
const BASE_DELAY_MS = 2000

const sleep = ms => new Promise(r => setTimeout(r, ms))

function log(entry) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true })
    let arr = []
    try { arr = JSON.parse(fs.readFileSync(LOG_FILE, 'utf8') || '[]') } catch {}
    arr.push(entry)
    if (arr.length > 200) arr = arr.slice(-200)
    fs.writeFileSync(LOG_FILE, JSON.stringify(arr, null, 2))
  } catch {}
}

function toGjid(x) {
  if (!x || typeof x !== 'string') return null
  if (x.endsWith('@g.us')) return x
  if (/^\d{10,}(-\d+)?$/.test(x)) return `${x}@g.us`
  return null
}

function extractJid(res) {
  if (!res) return null
  if (typeof res === 'string') return toGjid(res)
  for (const k of ['gid', 'id', 'jid', 'groupJid', 'groupId']) {
    const j = toGjid(res?.[k]); if (j) return j
  }
  try { const f = JSON.stringify(res).match(/(\d{10,}(?:-\d+)?@g\.us)/); if (f) return f[1] } catch {}
  return null
}

// أول دالة موجودة تنجح — لو اتنفذت من غير خطأ يبقى انضمّ
async function accept(conn, code) {
  let lastErr = null
  for (const m of ['groupAcceptInvite', 'acceptGroupInvite', 'acceptInvite']) {
    if (typeof conn[m] !== 'function') continue
    try {
      const res = await conn[m](code)
      return { res, method: m }
    } catch (e) { lastErr = e; if (classify(e) !== 'retry') throw e }
  }
  throw lastErr || new Error('no-accept-method')
}

// تصنيف الخطأ عشان نعرف نعيد ولا لأ
function classify(e) {
  const s = `${e?.message || ''} ${e?.data || ''} ${e?.output?.statusCode || ''}`.toLowerCase()
  if (/already|conflict|409/.test(s)) return 'already'
  if (/gone|expired|not-found|404|410|revoked|invalid/.test(s)) return 'invalid'
  if (/forbidden|not-authorized|401|403|removed|banned/.test(s)) return 'forbidden'
  if (/approval|request-sent|pending|membership/.test(s)) return 'pending'
  return 'retry'
}

const handler = async (m, { conn, text }) => {
  const reply = t => conn.sendMessage(m.chat, { text: t }, { quoted: m }).catch(() => {})
  const base = { time: new Date().toISOString(), requester: m.sender }

  if (!text?.trim())
    return reply('✳️ أرسل رابط الدعوة أو كودها بعد الأمر.\nمثال: .خش https://chat.whatsapp.com/AbCdEfGhIjKlMnO')

  const match = text.trim().match(INVITE_RE)
  if (!match) return reply('❌ مش قادر أستخرج كود الدعوة، تأكد من الرابط.')
  const code = match[1]

  await reply('⏳ سوكونا بيدخل الجروب...')

  let lastErr = null
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const { res, method } = await accept(conn, code)
      const jid = extractJid(res)
      log({ ...base, code, attempt, result: 'joined', method, jid })

      // رسالة الترحيب داخل الجروب
      if (jid) {
        const welcome = 'تم اضافه العظمه فجروبك'
        try {
          if (fs.existsSync(WELCOME_IMAGE_PATH))
            await conn.sendMessage(jid, { image: fs.readFileSync(WELCOME_IMAGE_PATH), caption: welcome })
          else await conn.sendMessage(jid, { text: welcome })
        } catch (e) { console.error('[خش] فشل إرسال الترحيب:', e.message) }
      }
      return reply('✅ تم الدخول للجروب.')
    } catch (e) {
      lastErr = e
      const kind = classify(e)
      log({ ...base, code, attempt, result: kind, error: e?.message || String(e) })

      if (kind === 'already') return reply('⚠️ البوت موجود بالفعل في الجروب ده.')
      if (kind === 'invalid') return reply('❌ الرابط منتهي أو غير صحيح، ابعت رابط جديد.')
      if (kind === 'forbidden') return reply('❌ البوت ممنوع من دخول الجروب ده (اتشال منه قبل كده أو الرابط مش متاح له).')
      if (kind === 'pending') return reply('📨 الجروب بيحتاج موافقة الأدمن، اتبعت طلب الانضمام.')

      if (attempt < MAX_RETRIES) await sleep(BASE_DELAY_MS * attempt)   // إعادة صامتة
    }
  }
  return reply(`❌ فشل الدخول بعد ${MAX_RETRIES} محاولات.\nالسبب: ${lastErr?.message || lastErr}\nجرّب رابط جديد أو ضيف البوت يدويًا.`)
}

handler.help = ['خش <رابط_الجروب>']
handler.tags = ['group']
handler.command = /^خش$/i

export default handler