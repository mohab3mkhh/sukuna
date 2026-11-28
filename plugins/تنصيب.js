// ID: MRFR-ANKK — Enhanced v4 (Final) — Fixed for Sukuna Bot v4
import qrcode from 'qrcode'
import NodeCache from 'node-cache'
import {
  useMultiFileAuthState,
  DisconnectReason,
  makeCacheableSignalKeyStore,
  fetchLatestWaWebVersion,
  areJidsSameUser
} from '@whiskeysockets/baileys'
import fs   from 'fs'
import path from 'path'
import pino from 'pino'
import chalk from 'chalk'
import { makeWASocket } from '../lib/simple.js'
import { sendButtons, btn } from '../lib/buttons.js'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname  = path.dirname(__filename)

const SUKUNA_IMG = 'https://i.ibb.co/M5gwTyJJ/upload-1774680667350.jpg'
// 📢 قناة البوت: أي حد ينصّب بوت فرعي بيشترك فيها تلقائياً (غيّر الكود هنا لو القناة اتغيّرت)
const CHANNEL_INVITE    = '0029VbBilcVAO7RNV5OlOI0j'
const CHANNEL_URL       = `https://whatsapp.com/channel/${CHANNEL_INVITE}`
const PAIRING_CODE      = 'SUKUNAAA'   // لازم 8 حروف/أرقام بالظبط — اكتب null للكود العشوائي
const JADI_FOLDER       = path.join('Sessions', 'SubBot')
// ملفات البيانات بقت جوه Sessions/ (جنب جلسات البوتات الفرعية) عشان لو عندك Railway Volume على Sessions
// كل حاجة تفضل بعد الـ deploy. الملفات القديمة اللي كانت جوه plugins/ بتتنقل تلقائياً.
const DATA_DIR = path.join(process.cwd(), 'Sessions')
function dataFile(name) {
  const np = path.join(DATA_DIR, name)
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true })
    const old = path.join(__dirname, name)
    if (!fs.existsSync(np) && fs.existsSync(old)) fs.copyFileSync(old, np)
  } catch {}
  return np
}
const INSTALLS_FILE     = dataFile('yuki_installs.json')
const STATUS_FILE       = dataFile('jadibot_status.json')
const LIMIT_FILE        = dataFile('max_installs.json')
const BANNED_CHATS_FILE = dataFile('banned_chats.json')

const DEFAULT_MAX_INSTALLS = 2   // الخطة 512MB: كل بوت فرعي بياكل ذاكرة (لو plugins/max_installs.json موجود عدّل الرقم فيه)
const SESSION_TIMEOUT_MS   = 180_000
const MAX_RECONNECT        = 5
const RECONNECT_BASE_DELAY = 3_000
const HANDLER_CACHE_TTL    = 60_000
const COOLDOWN_MS          = 120_000
const RECONNECT_MAX_DELAY  = 60_000        // أقصى انتظار بين محاولات إعادة الربط (للبوتات المنصّبة: بتحاول للأبد)
const SUPERVISOR_EVERY     = 120_000       // كل دقيقتين نتأكد إن كل بوت منصّب شغّال، ونشغّل اللي واقع
const TARGET_COOLDOWN_MS   = 10 * 60_000   // نفس الرقم مايتطلبش له كود أكتر من مرة كل 10 دقايق (لغير المالك)

const LOCKS              = new Map()
const ACTIVE_SESSIONS    = new Map()
const RECONNECT_ATTEMPTS = new Map()
const SESSION_TIMERS     = new Map()
const SOCKET_STATES      = new Map()
const WATCHDOG_TIMERS    = new Map()
const PENDING            = new Map()   // سوكتات لسه بتستنى الربط
const RECONNECT_PENDING  = new Set()   // بوتات إعادة الاتصال بتاعتها مجدولة
const CURRENT_SOCK       = new Map()   // userId → السوكت الحالي (عشان الـ watchdog القديم مايشتغلش على سوكت قديم)
const SUP_HOLD           = new Map()   // userId → وقت لحد ما المراقب مايحاولش يربطه (بعد 440 / 403)
const TARGET_LAST        = new Map()   // رقم → آخر وقت اتطلب له كود

if (!Array.isArray(global.conns)) global.conns = []

const sleep = ms => new Promise(r => setTimeout(r, ms))

async function acquireLock(key, timeout = 15_000) {
  const t0 = Date.now()
  while (LOCKS.has(key)) {
    if (Date.now() - t0 > timeout) throw new Error(`lock timeout: ${key}`)
    await sleep(80)
  }
  LOCKS.set(key, true)
}
const releaseLock = key => LOCKS.delete(key)

function readJSON(fp, def = null) {
  try {
    if (!fs.existsSync(fp)) {
      if (def !== null) { fs.writeFileSync(fp, JSON.stringify(def, null, 2)); return def }
      return null
    }
    return JSON.parse(fs.readFileSync(fp, 'utf8'))
  } catch { return def }
}
function writeJSON(fp, data) {
  try {
    fs.mkdirSync(path.dirname(fp), { recursive: true })
    const tmp = fp + '.tmp'
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2))
    fs.renameSync(tmp, fp)
    return true
  } catch { return false }
}

const getMax    = () => readJSON(LIMIT_FILE, { max: DEFAULT_MAX_INSTALLS })?.max || DEFAULT_MAX_INSTALLS
const getStatus = () => {
  const d = readJSON(STATUS_FILE, { enabled: true, allowSubBotInstall: false })
  return { enabled: d.enabled !== false, allowSubBotInstall: d.allowSubBotInstall === true }
}
const loadInstalls  = () => readJSON(INSTALLS_FILE, [])
const saveInstalls  = a   => writeJSON(INSTALLS_FILE, a)
const isInstalled   = id  => loadInstalls().includes(id)
const isChatBanned  = id  => readJSON(BANNED_CHATS_FILE, []).includes(id)

function addInstall(id) {
  const a = loadInstalls()
  if (!a.includes(id)) { a.push(id); saveInstalls(a) }
}
function removeInstall(id) {
  const a = loadInstalls(), i = a.indexOf(id)
  if (i >= 0) { a.splice(i, 1); saveInstalls(a); return true }
  return false
}

function isBotConnected(userId) {
  try {
    if (!fs.existsSync(path.join(process.cwd(), JADI_FOLDER, userId, 'creds.json'))) return false
    return global.conns.some(s => {
      const n = (s?.user?.jid || '').split('@')[0].split(':')[0]
      return n === userId && s?.ws?.readyState === 1
    })
  } catch { return false }
}

// الجلسة بتتحسب مربوطة بس لو creds.registered = true
function isRegistered(sessionPath) {
  try {
    const fp = path.join(sessionPath, 'creds.json')
    if (!fs.existsSync(fp)) return false
    return JSON.parse(fs.readFileSync(fp, 'utf8'))?.registered === true
  } catch { return false }
}

// creds.json ساعات بيتلف لو الـ container وقع وهو بيكتب → الجلسة بتتحسب "خرجت". بنحتفظ بنسخة احتياطية.
function restoreCredsIfBroken(sessionPath) {
  try {
    const fp = path.join(sessionPath, 'creds.json'), bak = fp + '.bak'
    let ok = false
    try { JSON.parse(fs.readFileSync(fp, 'utf8')); ok = true } catch {}
    if (!ok && fs.existsSync(bak)) {
      JSON.parse(fs.readFileSync(bak, 'utf8'))      // لازم النسخة سليمة
      fs.copyFileSync(bak, fp)
      console.warn(chalk.yellow(`[JADIBOT] ♻️ creds تالف، اتسترجع من النسخة الاحتياطية: ${sessionPath}`))
    }
  } catch {}
}
const backupTimers = new Map()
function backupCredsSoon(sessionPath) {
  clearTimeout(backupTimers.get(sessionPath))
  backupTimers.set(sessionPath, setTimeout(() => {
    try {
      const fp = path.join(sessionPath, 'creds.json')
      JSON.parse(fs.readFileSync(fp, 'utf8'))       // ننسخ بس لو سليم
      fs.copyFileSync(fp, fp + '.bak')
    } catch {}
  }, 5_000))
}

function cancelSessionTimer(userId) {
  const t = SESSION_TIMERS.get(userId)
  if (t) { clearTimeout(t); SESSION_TIMERS.delete(userId) }
}

function cleanupSession(userId, deleteDisk = false) {
  RECONNECT_PENDING.delete(userId)
  cancelSessionTimer(userId)
  const wt = WATCHDOG_TIMERS.get(userId)
  if (wt) { clearInterval(wt); WATCHDOG_TIMERS.delete(userId) }
  const ps = PENDING.get(userId)
  if (ps) {
    try { ps.ev?.removeAllListeners?.() } catch {}
    try { ps.ws?.terminate?.() } catch {}
    PENDING.delete(userId)
  }
  ACTIVE_SESSIONS.delete(userId)
  RECONNECT_ATTEMPTS.delete(userId)
  SOCKET_STATES.delete(userId)
  CURRENT_SOCK.delete(userId)
  LOCKS.delete(`${userId}_lock`)
  if (deleteDisk) {
    const sp = path.join(process.cwd(), JADI_FOLDER, userId)
    if (fs.existsSync(sp)) try { fs.rmSync(sp, { recursive: true, force: true }) } catch {}
  }
}

function removeConnSocket(userId) {
  const i = global.conns.findIndex(s => {
    const n = (s?.user?.jid || '').split('@')[0].split(':')[0]
    return n === userId
  })
  if (i >= 0) {
    try {
      global.conns[i].ev?.removeAllListeners?.()
      global.conns[i].ws?.terminate?.()
    } catch {}
    global.conns.splice(i, 1)
  }
}

// ✅ handler واحد مشترك لكل البوتات الفرعية (بيتحمّل مرة واحدة بس — قبل كده كان بيتحمّل من جديد كل دقيقة فالذاكرة بتتملي)
const subHandlerCache = new Map()
let sharedHandlerMod = null
async function getSubHandler() {
  if (sharedHandlerMod) return sharedHandlerMod
  try {
    sharedHandlerMod = await import('../handler.js?sub=shared')
    return sharedHandlerMod
  } catch (e) {
    console.error('[JADIBOT] تعذّر تحميل handler:', e.message)
    return null
  }
}

function getCooldownLeft(sender) {
  try {
    const last = global.db?.data?.users?.[sender]?.Subs || 0
    const left = last + COOLDOWN_MS - Date.now()
    return left > 0 ? left : 0
  } catch { return 0 }
}
function setCooldown(sender) {
  try {
    if (!global.db?.data?.users?.[sender]) return
    global.db.data.users[sender].Subs = Date.now()
  } catch {}
}
function msToTime(ms) {
  const m = Math.floor((ms / 60000) % 60).toString().padStart(2, '0')
  const s = Math.floor((ms / 1000)  % 60).toString().padStart(2, '0')
  return `${m}m ${s}s`
}

const TEXT = {
  codeBody: `╔═══━━━─── • ───━━━═══╗
   『 𝙎 𝙐 𝙆 𝙐 𝙉 𝘼 』
╚═══━━━─── • ───━━━═══╝
   ⟪ عَـيْـنٌ لا تُـغْـلَـق ⟫
   ⟪ وَحُـدودٌ لا تُـكْـسَـر ⟫
╭───────────────╮
 ⟡ خُـطُـوَاتُ الـرَّبْـط ⟡
╰───────────────╯
╭─┈┈┈┈┈┈┈┈┈┈┈─╮
⟡ اِفْـتَـح وَاتْـسَاب ← الإعـدادات
⟡ الأجـهـزة المُـرتبـطة ← رَبـط جـهـاز
⟡ اضـغـط: رَبـط بِـرَقـم الـهَـاتِـف
⟡ أَدْخِـل الـكُـود الـمَـوجـود بـالأسـفـل
╰─┈┈┈┈┈┈┈┈┈┈┈─╯
╭─┈┈┈┈┈┈┈┈┈┈┈─╮
⟡ إِذَا نَـظَـرْتُ… تَـوَقَّـفَ الـزَّمَـن
⟡ إِذَا صَـمَـتُّ… اِرْتَـجَـفَ الـمَـكَـان
⟡ وَإِذَا اِبْتَـسَـمْـتُ… اِنْـتَـهَـى الأَمْـر
╰─┈┈┈┈┈┈┈┈┈┈┈─╮
   ◈═⟡═◈  ★彡[ 𝐌𝐎𝐇𝐀𝐁 ]彡★  ◈═⟡═◈
⟪ لَسْتُ أَعْلَى صَوْتًا… بَلْ أَعْلَى وُجُودًا ⟫
╔═════ ✧ ═════╗
 𓆩 حَـدِّي… لا يُـقَـاس 𓆪
 𓆩 وَمَـجَـالِـي… لا يُـلَـامَـس 𓆪
╚═════ ✧ ═════╝
───────────────
» إِنْ كُنْتَ تَـرَانِـي… فَأَنْـتَ فِي مَـجَـالِـي
» وَإِنْ لَمْ تَـرَنِـي… فَأَنَا خَـلْـفَ نَـبْـضِـكَ
───────────────
   ⟡ 𓂀 لَا نِـدّ… لَا حَـدّ… لَا نِـهَـايَـة 𓂀 ⟡
╚════════════════╝`,

  qrBody: `*╮═≼『⛩️┃وضع البوت • QR┃⛩️』≽═╭*
*┇⌗╎✰ باستخدام هاتف آخر أو على الكمبيوتر، امسح هذا الـ QR لتحويلك إلى بوت فرعي مؤقت ⌗* ¦
*╯✯≼══━━﹂⛩️﹁━━══≽✯*
*╮═≼『⛩️┃الـخـطـوات لتسجيل الدخول┃⛩️』≽═╭*
> *\`1\` » اضغط على الثلاث نقاط في الزاوية العليا اليمنى*
> *\`2\` » اختر الأجهزة المتصلة*
> *\`3\` » امسح هذا الكود QR لتسجيل الدخول مع البوت*
*╯✯≼══━━﹂⛩️﹁━━══≽✯*
*╮═≼『⛩️┃مـلاحـظـات┃⛩️』≽═╭*
> *✧ ⚠️ هذا الكود QR سينتهي خلال 45 ثانية!*
*╯✯≼══━━﹂⛩️﹁━━══≽✯*
〔⛩️ RYOMEN SUKUNA ⛩️〕`,

  connected: `╔═══━━━─── • ───━━━═══╗
   『 𝙎 𝙐 𝙆 𝙐 𝙉 𝘼 』
╚═══━━━─── • ───━━━═══╝
╭─┈┈┈┈┈┈┈┈┈┈┈─╮
⟡ اِتَّصَـلْـتَ… وَدَخَـلْـتَ مَـجَـالِـي
⟡ الآنَ… أَنْـتَ تَـحْـتَ الـحِـمَـايَـة
╰─┈┈┈┈┈┈┈┈┈┈┈─╯
   ◈═⟡═◈  ★彡[ 𝐌𝐎𝐇𝐀𝐁 ]彡★  ◈═⟡═◈
╔═════ ✧ ═════╗
 𓆩 وُجُـودُكَ… مَـضْـمُـون 𓆪
 𓆩 وَحَـدُّكَ… بِـلَا نِـهَـايَـة 𓆪
╚═════ ✧ ═════╝
   ⟡ 𓂀 لَا نِـدّ… لَا حَـدّ… لَا نِـهَـايَـة 𓂀 ⟡`,

  reconnecting: (cur, total) => `╔═══━━━─── • ───━━━═══╗
   『 𝙎 𝙐 𝙆 𝙐 𝙉 𝘼 』
╚═══━━━─── • ───━━━═══╝
🔄 جاري إعادة ربط البوتات الفرعية…
⟡ الجلسة: ${cur}/${total}`,

  reconnectDone: (ok, fail) => `╔═══━━━─── • ───━━━═══╗
   『 𝙎 𝙐 𝙆 𝙐 𝙉 𝘼 』
╚═══━━━─── • ───━━━═══╝
✅ انتهت إعادة الربط
╭─┈┈┈┈┈┈┈┈┈┈┈─╮
⟡ ناجح : ${ok}
⟡ فاشل  : ${fail}
╰─┈┈┈┈┈┈┈┈┈┈┈─╯`,

  noOffline: `╔═══━━━─── • ───━━━═══╗
   『 𝙎 𝙐 𝙆 𝙐 𝙉 𝘼 』
╚═══━━━─── • ───━━━═══╝
⟡ لا توجد بوتات فرعية غير متصلة حالياً`,

  autoRestoring: total => `╔═══━━━─── • ───━━━═══╗
   『 𝙎 𝙐 𝙆 𝙐 𝙉 𝘼 』
╚═══━━━─── • ───━━━═══╝
🚀 إعادة تشغيل البوتات الفرعية تلقائياً
⟡ العدد: ${total} بوت`
}

// ✅ رسالة الكود: أزرار + رسالة نص بالكود (عشان تلاقيه حتى لو الزرار مظهرش)
async function sendCodeMessage(conn, m, code, userId = '') {
  const fmt = code.match(/.{1,4}/g)?.join('-') || code
  try {
    await sendButtons(conn, m.chat, {
      text: TEXT.codeBody,
      footer: '꧁༒【⛩️𝗦𝗨𝗞𝗨𝗡𝗔⚡𝗕𝗢𝗧⛩️】༒꧂',
      image: SUKUNA_IMG,
      buttons: [btn.copy(`📋  انسخ الكود  •  ${fmt}`, code)],
    }, m)
  } catch (e) {
    console.log('[JADIBOT] buttons failed, fallback:', e.message)
    await conn.sendMessage(m.chat, { image: { url: SUKUNA_IMG }, caption: TEXT.codeBody }, { quoted: m }).catch(() => {})
  }
  await conn.sendMessage(m.chat, { text: `🔑 *كود الربط${userId ? ` للرقم +${userId}` : ''}:*\n\n\`\`\`${fmt}\`\`\`\n⚠️ لازم تدخله على موبايل رقمه نفس الرقم ده` }, { quoted: m }).catch(() => {})
}

async function sendConnectedMessage(conn, m) {
  if (!m?.chat) return
  await conn.sendMessage(m.chat, {
    image:   { url: SUKUNA_IMG },
    caption: TEXT.connected + `\n\n📢 تم اشتراكك تلقائياً في قناة البوت:\n${CHANNEL_URL}`
  }, { quoted: m }).catch(() => {})
}

// ✅ مراقب: كل دقيقتين يلاقي أي بوت فرعي منصّب وواقع (بعد انقطاع طويل مثلاً) ويشغّله تاني
function ensureSupervisor(conn) {
  if (!conn) return
  global.__jadiSupConn = conn
  if (global.__jadiSup) return
  global.__jadiSup = setInterval(async () => {
    const c = global.__jadiSupConn
    if (!c) return
    for (const uid of [...loadInstalls()]) {
      try {
        if (isBotConnected(uid) || ACTIVE_SESSIONS.has(uid) || RECONNECT_PENDING.has(uid)) continue
        if ((SUP_HOLD.get(uid) || 0) > Date.now()) continue
        const sp = path.join(process.cwd(), JADI_FOLDER, uid)
        if (!isRegistered(sp)) continue
        console.log(chalk.cyan(`[JADIBOT] 🛠️ المراقب: بشغّل البوت الواقع (+${uid})`))
        removeConnSocket(uid)
        cleanupSession(uid, false)
        await yukiJadiBot({ sessionPath: sp, m: null, conn: c, userId: uid, mode: 'code' })
        await sleep(2_000)
      } catch (e) { console.error('[JADIBOT] supervisor:', e.message) }
    }
  }, SUPERVISOR_EVERY)
  global.__jadiSup.unref?.()
}

export async function initSubBots(conn) {
  ensureSupervisor(conn)
  const installed = loadInstalls()
  if (!installed.length) return

  console.log(chalk.cyan(`[JADIBOT] 🚀 إعادة تشغيل ${installed.length} بوت فرعي تلقائياً…`))

  let ok = 0, fail = 0
  for (const userId of [...installed]) {
    try {
      const sessionPath = path.join(process.cwd(), JADI_FOLDER, userId)
      if (!isRegistered(sessionPath)) {
        // جلسة ما اتربطتش أبداً: نظّفها بدل ما نحاول نشغّلها
        removeInstall(userId)
        cleanupSession(userId, true)
        fail++
        continue
      }
      removeConnSocket(userId)
      cleanupSession(userId, false)
      await yukiJadiBot({ sessionPath, m: null, conn, userId, mode: 'code' })
      ok++
      await sleep(2_000)
    } catch (e) {
      console.error(chalk.red(`[JADIBOT] ❌ فشل إعادة تشغيل ${userId}:`), e.message)
      fail++
    }
  }
  console.log(chalk.green(`[JADIBOT] ✅ ناجح: ${ok} | ❌ فاشل: ${fail}`))
}

const handler = async (m, { conn, args, isOwner }) => {
  try {
    ensureSupervisor(conn)
    const principalJid = global.conn?.user?.jid
    const currentJid   = conn.user.jid
    const isSubBot     = principalJid && !areJidsSameUser(principalJid, currentJid)

    const status = getStatus()
    if (isSubBot && !status.allowSubBotInstall) return
    if (!status.enabled && !isOwner)             return
    if (isChatBanned(m.chat) && !isOwner)        return

    const cmd    = m.command || ''
    const arg0   = args[0]?.toLowerCase()
    const isStop = arg0 === 'الغاء' || arg0 === 'stop'

    if (/^(reconnect)$/i.test(cmd)) {
      if (!isOwner) return

      const installed = loadInstalls()
      const offline   = installed.filter(uid => !isBotConnected(uid))
      if (!offline.length) return conn.reply(m.chat, TEXT.noOffline, m)

      let ok = 0, fail = 0
      for (let idx = 0; idx < offline.length; idx++) {
        const uid = offline[idx]
        await conn.reply(m.chat, TEXT.reconnecting(idx + 1, offline.length), m)
        try {
          const sessionPath = path.join(process.cwd(), JADI_FOLDER, uid)
          if (!isRegistered(sessionPath)) { removeInstall(uid); cleanupSession(uid, true); fail++; continue }
          removeConnSocket(uid)
          cleanupSession(uid, false)
          await yukiJadiBot({ sessionPath, m: null, conn, userId: uid, mode: 'code' })
          ok++
          await sleep(1_500)
        } catch { fail++ }
      }

      return conn.sendMessage(m.chat, {
        image:   { url: SUKUNA_IMG },
        caption: TEXT.reconnectDone(ok, fail)
      }, { quoted: m }).catch(() => {})
    }

    if (!isOwner) {
      const left = getCooldownLeft(m.sender)
      if (left > 0)
        return conn.reply(m.chat,
          `╔═══━━━─── • ───━━━═══╗\n   『 𝙎 𝙐 𝙆 𝙐 𝙉 𝘼 』\n╚═══━━━─── • ───━━━═══╝\n⟡ انتظر ${msToTime(left)} قبل إعادة الاستخدام`, m)
    }

    // ✅ .تنصيب 201016855501 → تنصيب على الرقم المكتوب (متاح للكل)
    // يقبل الرقم بأي شكل: 201099583372 / 01099583372 / 1099583372 / +20 109 958 3372
    const normNum = raw => {
      let d = String(raw).replace(/\D/g, '')
      if (d.startsWith('00')) d = d.slice(2)
      if (/^01[0125]\d{8}$/.test(d)) d = '2' + d      // 01099583372 → 201099583372
      else if (/^1[0125]\d{8}$/.test(d)) d = '20' + d // 1099583372  → 201099583372
      return d
    }
    const numArg = args.map(normNum).find(a => a.length >= 8 && a.length <= 15)

    let userId
    if (numArg) {
      userId = numArg
    } else {
      const who = m.mentionedJid?.[0] || (m.fromMe ? conn.user.jid : m.sender)
      if (!who) return
      if (String(who).endsWith('@lid'))
        return conn.reply(m.chat, '⟡ رقمك ظاهر بصيغة مخفية (LID) فمينفعش يتربط بيه.\nاكتب: .تنصيب 20XXXXXXXXXX (برقمك الحقيقي)', m)
      userId = who.split('@')[0]
    }
    if (!userId) return

    // حماية لغير المالك لما الرقم مش رقمه هو
    const senderNum = String(m.sender || '').endsWith('@s.whatsapp.net') ? String(m.sender).split('@')[0].split(':')[0] : ''
    const isSelf = userId === senderNum
    if (!isOwner && !isSelf) {
      if (isStop)
        return conn.reply(m.chat, '⟡ مينفعش توقف بوت رقم تاني. الإيقاف لصاحب الرقم نفسه أو المالك.', m)
      if (isBotConnected(userId))
        return conn.reply(m.chat, '⟡ الرقم ده منصّب وشغّال بالفعل.', m)
      const lastT = TARGET_LAST.get(userId) || 0
      const leftT = lastT + TARGET_COOLDOWN_MS - Date.now()
      if (leftT > 0)
        return conn.reply(m.chat, `⟡ اتطلب كود للرقم ده من شوية، استنى ${msToTime(leftT)} قبل طلب جديد.`, m)
    }

    const liveCount = global.conns.filter(s => s?.user && s?.ws?.readyState === 1).length
    if (liveCount >= getMax() && !isInstalled(userId)) {
      return conn.reply(m.chat,
        `╔═══━━━─── • ───━━━═══╗\n   『 𝙎 𝙐 𝙆 𝙐 𝙉 𝘼 』\n╚═══━━━─── • ───━━━═══╝\n⟡ لا توجد مساحات متاحة حالياً (${liveCount}/${getMax()})`, m)
    }

    if (isStop) {
      removeConnSocket(userId)
      removeInstall(userId)
      cleanupSession(userId, true)
      subHandlerCache.delete(userId)
      return conn.reply(m.chat,
        `╔═══━━━─── • ───━━━═══╗\n   『 𝙎 𝙐 𝙆 𝙐 𝙉 𝘼 』\n╚═══━━━─── • ───━━━═══╝\n⟡ تم إيقاف البوت الفرعي بنجاح`, m)
    }

    const sessionPath = path.join(process.cwd(), JADI_FOLDER, userId)
    const mode        = /^qr$/i.test(cmd) ? 'qr' : 'code'

    // محاولة شغالة دلوقتي؟ متلغيهاش (الكود اللي اتبعت لسه صالح) — بس رد عليه
    if (ACTIVE_SESSIONS.has(userId)) {
      return conn.reply(m.chat,
        '⏳ فيه محاولة تنصيب شغالة على الرقم ده.\nاستنى الكود (لحد 3 دقايق) وادخل آخر كود وصلك، أو اكتب: .تنصيب الغاء', m)
    }
    if (isBotConnected(userId)) {
      removeConnSocket(userId)
      cleanupSession(userId, false)
    }

    // جلسة ما اتربطتش قبل كده؟ امسحها عشان نبدأ بـ creds جديدة (ده كان سبب الفشل من أول مرة)
    if (!isRegistered(sessionPath)) {
      try { fs.rmSync(sessionPath, { recursive: true, force: true }) } catch {}
    }
    fs.mkdirSync(sessionPath, { recursive: true })
    // ملحوظة: التسجيل في yuki_installs.json بيحصل بس بعد ما الربط ينجح (في connection === 'open')

    setCooldown(m.sender)
    if (!isOwner && !isSelf) TARGET_LAST.set(userId, Date.now())
    if (mode === 'code' && !isRegistered(sessionPath))
      await conn.reply(m.chat, `⏳ جاري تجهيز كود الربط للرقم +${userId}\nاستنى ثواني ومتكتبش الأمر تاني.`, m).catch(() => {})
    await yukiJadiBot({ sessionPath, m, conn, userId, mode })

  } catch (e) {
    console.error('[JADIBOT] handler error:', e.message)
  }
}

handler.command = /^(qr|تنصيب|reconnect)$/i
export default handler

export async function yukiJadiBot({ sessionPath, pathYukiJadiBot, m, conn, userId, mode = 'code', codeSent = false, _scheduled = false }) {
  sessionPath = sessionPath || pathYukiJadiBot
  userId = userId || (sessionPath ? path.basename(sessionPath) : '')
  if (!userId || !sessionPath) return
  // إعادة اتصال مجدولة اتلغت؟ / فيه واحدة مجدولة والطلب ده من برا؟
  if (_scheduled) { if (!RECONNECT_PENDING.delete(userId)) return }
  else if (RECONNECT_PENDING.has(userId)) return
  const lockKey = `${userId}_lock`

  try {
    if (ACTIVE_SESSIONS.has(userId)) return
    // ✅ لو فيه سوكت حي للرقم ده بالفعل، ماننشئش واحد تاني (التكرار = "connectionReplaced" وخروج الجلسة)
    if (global.conns.some(s => (s?.user?.jid || '').split('@')[0].split(':')[0] === userId && s?.ws?.readyState === 1)) return
    try { await acquireLock(lockKey) } catch { return }
    if (ACTIVE_SESSIONS.has(userId)) return

    ACTIVE_SESSIONS.set(userId, Date.now())

    const autoClean = setTimeout(() => {
      if (!isBotConnected(userId)) {
        console.warn(chalk.yellow(`[JADIBOT] ⏱️ timeout cleanup: ${userId}`))
        removeConnSocket(userId)
        cleanupSession(userId, false)
      }
    }, SESSION_TIMEOUT_MS)
    SESSION_TIMERS.set(userId, autoClean)

    restoreCredsIfBroken(sessionPath)
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath)
    const { version }          = await fetchLatestWaWebVersion().catch(() => ({ version: [2, 3000, 0] }))
    const msgRetryCache        = new NodeCache({ stdTTL: 0, checkperiod: 0 })
    const registeredAtStart    = state.creds?.registered === true

    const socketState = { codeSent: !!codeSent, connectedSent: false, qrMsg: null, wasOpen: false }
    SOCKET_STATES.set(userId, socketState)

    const connectionOptions = {
      logger: pino({ level: 'silent' }),
      auth: {
        creds: state.creds,
        keys:  makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
      },
      browser:                        ['Mac OS', 'Firefox', '10.15.7'],
      version,
      printQRInTerminal:              false,
      markOnlineOnConnect:            false,
      syncFullHistory:                false,
      shouldSyncHistoryMessage:       () => false,
      generateHighQualityLinkPreview: false,
      connectTimeoutMs:               30_000,
      keepAliveIntervalMs:            25_000,
      defaultQueryTimeoutMs:          0,
      maxRetries:                     5,
      msgRetryCounterCache:           msgRetryCache,
      getMessage: async key => {
        try {
          const msg = await sock?.store?.loadMessage?.(key.remoteJid, key.id)
          return msg?.message || undefined
        } catch { return undefined }
      },
      patchMessageBeforeSending: msg => {
        if (msg.buttonsMessage || msg.templateMessage || msg.listMessage) {
          return {
            viewOnceMessage: {
              message: {
                messageContextInfo: { deviceListMetadataVersion: 2, deviceListMetadata: {} },
                ...msg
              }
            }
          }
        }
        return msg
      }
    }

    let sock    = makeWASocket(connectionOptions)
    sock.isInit = false
    let isInit  = true
    PENDING.set(userId, sock)
    CURRENT_SOCK.set(userId, sock)

    // ✅ أي watchdog قديم لنفس الرقم يتلغي الأول (كان بيفضل شغّال ويعمل سوكت مكرر → الجلسة تتفصل)
    const oldWd = WATCHDOG_TIMERS.get(userId)
    if (oldWd) { clearInterval(oldWd); WATCHDOG_TIMERS.delete(userId) }

    const watchdogTimer = setInterval(() => {
      if (CURRENT_SOCK.get(userId) !== sock) { clearInterval(watchdogTimer); return }   // سوكت قديم
      if (ACTIVE_SESSIONS.has(userId)) return   // لسه بتستنى الربط
      const wsState = sock?.ws?.readyState
      if (!sock?.user || wsState === 3) {
        console.warn(chalk.yellow(`[JADIBOT] 🧹 Watchdog: بوت ميت تم إزالته — ${userId}`))
        clearInterval(watchdogTimer)
        WATCHDOG_TIMERS.delete(userId)
        try { sock.ws?.terminate?.() } catch {}
        sock.ev.removeAllListeners()
        const i = global.conns.indexOf(sock)
        if (i >= 0) global.conns.splice(i, 1)
        if (isInstalled(userId)) {
          RECONNECT_PENDING.add(userId)
          setTimeout(() => {
            yukiJadiBot({ sessionPath, m: null, conn, userId, mode, _scheduled: true }).catch(() => {})
          }, RECONNECT_BASE_DELAY * 2)
        }
      }
    }, 60_000)
    WATCHDOG_TIMERS.set(userId, watchdogTimer)

    const creloadHandler = async (restatConn = false) => {
      if (restatConn) {
        const oldChats = sock.chats
        try { sock.ws?.terminate?.() } catch {}
        sock.ev.removeAllListeners()
        sock = makeWASocket(connectionOptions, { chats: oldChats })
        sock.isInit = false
        isInit = true
        PENDING.set(userId, sock)
        CURRENT_SOCK.set(userId, sock)
      }

      if (!isInit) {
        sock.ev.off('messages.upsert',           sock._msgHandler)
        sock.ev.off('connection.update',         sock._connHandler)
        sock.ev.off('creds.update',              sock._credsHandler)
        sock.ev.off('group-participants.update', sock._partsHandler)
        sock.ev.off('groups.update',             sock._groupsHandler)
      }

      sock._msgHandler = async ({ messages, type }) => {
        if (type !== 'notify') return
        try {
          const mod = await getSubHandler(userId)
          if (!mod?.handler) return
          const now = Math.floor(Date.now() / 1000)
          for (const msg of messages) {
            const ts = msg.messageTimestamp?.low || msg.messageTimestamp || 0
            if (ts > 0 && (now - ts) > 120) continue
            if (msg.key?.remoteJid === 'status@broadcast') continue
            const sockJid = sock?.user?.jid?.split('@')[0]?.split(':')[0]
            const msgTo   = msg.key?.remoteJid
            if (sockJid && msgTo && msgTo === global.conn?.user?.jid) return
            await mod.handler(sock, msg).catch(() => {})
          }
        } catch {}
      }

      sock._connHandler  = connectionUpdate.bind(sock)
      sock._credsHandler = async () => { await saveCreds(); backupCredsSoon(sessionPath) }

      sock._partsHandler = async (upd) => {
        try {
          const mod = await getSubHandler(userId)
          if (mod?.participantsUpdate) await mod.participantsUpdate(sock, upd).catch(() => {})
        } catch {}
      }

      sock._groupsHandler = async (upds) => {
        try {
          const mod = await getSubHandler(userId)
          if (mod?.groupsUpdate) await mod.groupsUpdate(sock, upds).catch(() => {})
        } catch {}
      }

      sock.ev.on('messages.upsert',           sock._msgHandler)
      sock.ev.on('connection.update',         sock._connHandler)
      sock.ev.on('creds.update',              sock._credsHandler)
      sock.ev.on('group-participants.update', sock._partsHandler)
      sock.ev.on('groups.update',             sock._groupsHandler)

      isInit = false
      return true
    }

    async function connectionUpdate(update) {
      const { connection, lastDisconnect, isNewLogin, qr } = update
      const st = SOCKET_STATES.get(userId)
      if (!st) return

      if (isNewLogin) sock.isInit = false

      if (qr && mode === 'qr' && m?.chat) {
        if (st.qrMsg?.key) {
          conn.sendMessage(m.chat, { delete: st.qrMsg.key }).catch(() => {})
        }
        try {
          const qrBuf = await qrcode.toBuffer(qr, { scale: 8 })
          st.qrMsg = await conn.sendMessage(m.chat,
            { image: qrBuf, caption: TEXT.qrBody },
            { quoted: m }
          ).catch(() => null)
          if (st.qrMsg?.key) {
            setTimeout(() =>
              conn.sendMessage(m.chat, { delete: st.qrMsg.key }).catch(() => {}),
            45_000)
          }
        } catch (err) {
          console.warn(`[JADIBOT] QR send failed: ${userId}`, err.message)
        }
        return
      }

      if (qr && mode === 'code' && m && !st.codeSent) {
        st.codeSent = true
        try {
          // ✅ كود ربط مخصص
          const code = await sock.requestPairingCode(userId, PAIRING_CODE || undefined)
          if (typeof code === 'string' && code.length > 0) {
            await sendCodeMessage(conn, m, code, userId)
          } else {
            st.codeSent = false
          }
        } catch (err) {
          console.warn(`[JADIBOT] ${userId}: فشل الكود —`, err.message)
          st.codeSent = false
        }
      }

      const reason = lastDisconnect?.error?.output?.statusCode
        || lastDisconnect?.error?.output?.payload?.statusCode

      if (connection === 'open') {
        cancelSessionTimer(userId)
        RECONNECT_ATTEMPTS.delete(userId)
        ACTIVE_SESSIONS.delete(userId)
        PENDING.delete(userId)
        st.wasOpen = true

        sock.isInit = true
        // سوكتات قديمة مقفولة لنفس الرقم كانت بتمنع تسجيل السوكت الجديد (فيتحسب البوت "واقع" ويتكرر)
        for (let i = global.conns.length - 1; i >= 0; i--) {
          const s = global.conns[i]
          const n = (s?.user?.jid || '').split('@')[0].split(':')[0]
          if (n === userId && s !== sock && s?.ws?.readyState !== 1) {
            try { s.ev?.removeAllListeners?.(); s.ws?.terminate?.() } catch {}
            global.conns.splice(i, 1)
          }
        }
        const exists = global.conns.some(s => s === sock)
        if (!exists && sock?.user) {
          global.conns.push(sock)
          SUP_HOLD.delete(userId)
          if (!isInstalled(userId)) addInstall(userId)
          if (m && !st.connectedSent) {
            st.connectedSent = true
            await sendConnectedMessage(conn, m)
          }
        }

        try { await joinChannels(sock) } catch {}

        console.log(chalk.cyan(
          `\n❒⸺⸺⸺⸺【• SUB-BOT •】⸺⸺⸺⸺❒\n` +
          `│ ✅ ${sock.user?.name || userId} (+${userId}) connected\n` +
          `❒⸺⸺⸺【• CONNECTED •】⸺⸺⸺❒`
        ))
      }

      if (connection === 'close') {
        // 🚫 خروج حقيقي (الجهاز اتشال من واتساب): نهائي
        if ([DisconnectReason.loggedOut, 401].includes(reason)) {
          console.warn(chalk.red(`[JADIBOT] 🚫 جلسة (+${userId}) أُغلقت نهائياً — كود: ${reason}`))
          // 🚫 مفيش رسايل خاص بتتبعت لحد
          removeConnSocket(userId)
          removeInstall(userId)
          cleanupSession(userId, true)
          subHandlerCache.delete(userId)
          return
        }

        // 403 (حظر مؤقت/تقييد): ما نمسحش الجلسة، نجرّب تاني بعد شوية
        if (reason === 403) {
          console.warn(chalk.yellow(`[JADIBOT] ⚠️ (+${userId}) كود 403 — هجرّب تاني بعد 10 دقايق من غير ما أمسح الجلسة`))
          removeConnSocket(userId)
          cleanupSession(userId, false)
          SUP_HOLD.set(userId, Date.now() + 10 * 60_000)
          return
        }

        // 440 (الجلسة اتفتحت من مكان تاني، غالباً نسختين من البوت شغالين مع بعض): نوقف شوية وبعدين المراقب يرجّعه
        if (reason === 440) {
          console.warn(chalk.yellow(`[JADIBOT] ⚠️ جلسة (+${userId}) استُبدلت (440) — هستنى 3 دقايق وأرجّعها`))
          removeConnSocket(userId)
          cleanupSession(userId, false)
          SUP_HOLD.set(userId, Date.now() + 3 * 60_000)
          return
        }

        // باقي الأسباب (انقطاع نت، 408، 428، 515 restart...): نعيد الربط
        const installed = isInstalled(userId)
        const attempts = (RECONNECT_ATTEMPTS.get(userId) || 0) + 1
        // البوت المنصّب: محاولات للأبد (بتأخير متزايد لحد دقيقة). التنصيب اللي لسه مخلصش: 5 محاولات بس.
        if (installed || attempts <= MAX_RECONNECT) {
          RECONNECT_ATTEMPTS.set(userId, attempts)
          ACTIVE_SESSIONS.delete(userId)
          const delay = Math.min(RECONNECT_BASE_DELAY * 2 ** Math.min(attempts - 1, 6), RECONNECT_MAX_DELAY)
          console.log(chalk.magenta(`[JADIBOT] 🔄 إعادة ربط (+${userId}) — محاولة ${attempts}${installed ? '' : '/' + MAX_RECONNECT} بعد ${delay}ms (السبب: ${reason ?? '؟'})`))
          // السوكت القديم المقفول يتشال من القايمة عشان الجديد يتسجّل صح
          const oi = global.conns.indexOf(sock)
          if (oi >= 0) global.conns.splice(oi, 1)
          try { sock.ev?.removeAllListeners?.() } catch {}
          const keepM = st.connectedSent ? null : m   // ✅ نكمّل الكود/رسالة "اتصلت" لو لسه ما اتبعتوش
          const wasCodeSent = false   // لو السوكت وقع قبل الربط، الكود القديم يبطل — نطلب كود جديد
          RECONNECT_PENDING.add(userId)
          setTimeout(() => {
            yukiJadiBot({ sessionPath, m: keepM, conn, userId, mode, codeSent: wasCodeSent, _scheduled: true }).catch(() => {})
          }, delay)
        } else {
          console.warn(chalk.red(`[JADIBOT] ☠️ تجاوز الحد الأقصى (+${userId}) — تم الاستسلام`))
          removeConnSocket(userId)
          cleanupSession(userId, false)
        }
      }
    }

    await creloadHandler(false)

  } catch (e) {
    console.error(chalk.red(`[JADIBOT] ❌ ${userId}:`), e.message)
    cleanupSession(userId, false)
  } finally {
    releaseLock(lockKey)
  }
}

// الاشتراك في القنوات: global.ch (لو موجودة) + قناة البوت (من كود الدعوة)
let _channelJid = null
async function resolveChannelJid(sock) {
  if (_channelJid) return _channelJid
  const info = await sock.newsletterMetadata('invite', CHANNEL_INVITE)
  if (info?.id && String(info.id).endsWith('@newsletter')) _channelJid = info.id
  return _channelJid
}

if (!global.__chFollowed) global.__chFollowed = new Set()   // البوتات اللي اتشتركت بالفعل (مايكررش الاشتراك مع كل إعادة اتصال)

export async function joinChannels(sock) {
  const me = String(sock?.user?.jid || sock?.user?.id || '').split('@')[0].split(':')[0]

  // 1) قنوات global.ch
  try {
    if (global.ch && typeof global.ch === 'object') {
      for (const value of Object.values(global.ch)) {
        if (typeof value === 'string' && value.endsWith('@newsletter')) {
          await sock.newsletterFollow(value).catch(() => {})
        }
      }
    }
  } catch {}

  // 2) قناة البوت
  const tag = `${me}:${CHANNEL_INVITE}`
  if (me && global.__chFollowed.has(tag)) return
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const jid = await resolveChannelJid(sock)
      if (!jid) throw new Error('مش لاقي معرف القناة')
      await sock.newsletterFollow(jid)
      if (me) global.__chFollowed.add(tag)
      console.log(chalk.green(`[JADIBOT] 📢 (+${me}) اشترك في قناة البوت`))
      return
    } catch (e) {
      const msg = String(e?.message || e)
      // "already subscribed" يعتبر نجاح
      if (/already|subscribed|exist/i.test(msg)) { if (me) global.__chFollowed.add(tag); return }
      if (attempt === 3) console.warn(`[JADIBOT] تعذّر الاشتراك في القناة (+${me}):`, msg)
      else await sleep(2_000 * attempt)
    }
  }
}

// ✅ الملف الرئيسي (sukuna.js) بيدوّر على global.yukiJadiBot لإعادة تشغيل البوتات الفرعية
global.yukiJadiBot = yukiJadiBot