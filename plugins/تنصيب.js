// ID: MRFR-ANKK — Enhanced v4 (Final) — Fixed for Sukuna Bot v4
import qrcode from 'qrcode'
import NodeCache from 'node-cache'
import {
  useMultiFileAuthState,
  DisconnectReason,
  makeCacheableSignalKeyStore,
  fetchLatestWaWebVersion,
  areJidsSameUser,
  generateWAMessageFromContent,
  proto,
  prepareWAMessageMedia
} from '@whiskeysockets/baileys'
import fs   from 'fs'
import path from 'path'
import pino from 'pino'
import chalk from 'chalk'
import { makeWASocket } from '../lib/simple.js'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname  = path.dirname(__filename)

const SUKUNA_IMG = 'https://i.ibb.co/M5gwTyJJ/upload-1774680667350.jpg'
const JADI_FOLDER       = path.join('Sessions', 'SubBot')
const INSTALLS_FILE     = path.join(__dirname, 'yuki_installs.json')
const STATUS_FILE       = path.join(__dirname, 'jadibot_status.json')
const LIMIT_FILE        = path.join(__dirname, 'max_installs.json')
const BANNED_CHATS_FILE = path.join(__dirname, 'banned_chats.json')

const DEFAULT_MAX_INSTALLS = 6
const SESSION_TIMEOUT_MS   = 120_000
const MAX_RECONNECT        = 5
const RECONNECT_BASE_DELAY = 3_000
const HANDLER_CACHE_TTL    = 60_000
const COOLDOWN_MS          = 120_000

const LOCKS              = new Map()
const ACTIVE_SESSIONS    = new Map()
const RECONNECT_ATTEMPTS = new Map()
const SESSION_TIMERS     = new Map()
const SOCKET_STATES      = new Map()
const WATCHDOG_TIMERS    = new Map()

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

function cancelSessionTimer(userId) {
  const t = SESSION_TIMERS.get(userId)
  if (t) { clearTimeout(t); SESSION_TIMERS.delete(userId) }
}

function cleanupSession(userId, deleteDisk = false) {
  cancelSessionTimer(userId)
  const wt = WATCHDOG_TIMERS.get(userId)
  if (wt) { clearInterval(wt); WATCHDOG_TIMERS.delete(userId) }
  ACTIVE_SESSIONS.delete(userId)
  RECONNECT_ATTEMPTS.delete(userId)
  SOCKET_STATES.delete(userId)
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

// ✅ الإصلاح الرئيسي — بدل الكاش المشترك، كل بوت فرعي عنده handler منفصل
const subHandlerCache = new Map()
async function getSubHandler(userId) {
  try {
    const now = Date.now()
    const cached = subHandlerCache.get(userId)
    if (cached && now - cached.time < HANDLER_CACHE_TTL) return cached.mod

    // dynamic import مع cache busting عشان يكون منفصل
    const mod = await import(`../handler.js?sub=${userId}&t=${Math.floor(now / HANDLER_CACHE_TTL)}`)
    subHandlerCache.set(userId, { mod, time: now })
    return mod
  } catch { return null }
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

async function sendCodeMessage(conn, m, code) {
  const fmt = code.match(/.{1,4}/g)?.join('-') || code
  try {
    let imageMessage = null
    try {
      const prepared = await prepareWAMessageMedia(
        { image: { url: SUKUNA_IMG } },
        { upload: conn.waUploadToServer }
      )
      imageMessage = prepared.imageMessage
    } catch {}

    const built = generateWAMessageFromContent(
      m.chat,
      proto.Message.fromObject({
        interactiveMessage: {
          ...(imageMessage ? { header: { hasMediaAttachment: true, imageMessage } } : {}),
          body:   { text: TEXT.codeBody },
          footer: { text: '꧁༒【⛩️𝗦𝗨𝗞𝗨𝗡𝗔⚡𝗕𝗢𝗧⛩️】༒꧂' },
          nativeFlowMessage: {
            buttons: [{
              name: 'cta_copy',
              buttonParamsJson: JSON.stringify({
                display_text: `📋  انسخ الكود  •  ${fmt}`,
                copy_code:    fmt
              })
            }],
            messageParamsJson: ''
          }
        }
      }),
      { userJid: conn.user?.jid, quoted: m }
    )
    await conn.relayMessage(m.chat, built.message, { messageId: built.key.id })
  } catch {
    await conn.sendMessage(m.chat, {
      image:   { url: SUKUNA_IMG },
      caption: `${TEXT.codeBody}\n\n📋 *الكود:* ${fmt}`
    }, { quoted: m }).catch(() => {})
  }
}

async function sendConnectedMessage(conn, m) {
  if (!m?.chat) return
  await conn.sendMessage(m.chat, {
    image:   { url: SUKUNA_IMG },
    caption: TEXT.connected
  }, { quoted: m }).catch(() => {})
}

export async function initSubBots(conn) {
  const installed = loadInstalls()
  if (!installed.length) return

  console.log(chalk.cyan(`[JADIBOT] 🚀 إعادة تشغيل ${installed.length} بوت فرعي تلقائياً…`))

  let ok = 0, fail = 0
  for (const userId of [...installed]) {
    try {
      const sessionPath = path.join(process.cwd(), JADI_FOLDER, userId)
      if (!fs.existsSync(path.join(sessionPath, 'creds.json'))) { fail++; continue }
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
          if (!fs.existsSync(path.join(sessionPath, 'creds.json'))) { fail++; continue }
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

    const who    = m.mentionedJid?.[0] || (m.fromMe ? conn.user.jid : m.sender)
    if (!who) return
    const userId = who.split('@')[0]
    if (!userId) return

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

    if (isBotConnected(userId)) {
      removeConnSocket(userId)
      cleanupSession(userId, false)
    }

    if (!isInstalled(userId)) addInstall(userId)
    if (ACTIVE_SESSIONS.has(userId)) return
    if (!fs.existsSync(sessionPath)) fs.mkdirSync(sessionPath, { recursive: true })

    setCooldown(m.sender)
    await yukiJadiBot({ sessionPath, m, conn, userId, mode })

  } catch (e) {
    console.error('[JADIBOT] handler error:', e.message)
  }
}

handler.command = /^(qr|تنصيب|reconnect)$/i
export default handler

export async function yukiJadiBot({ sessionPath, m, conn, userId, mode = 'code' }) {
  if (!userId) return
  const lockKey = `${userId}_lock`

  try {
    if (ACTIVE_SESSIONS.has(userId)) return
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

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath)
    const { version }          = await fetchLatestWaWebVersion().catch(() => ({ version: [2, 3000, 0] }))
    const msgRetryCache        = new NodeCache({ stdTTL: 0, checkperiod: 0 })

    const socketState = { codeSent: false, connectedSent: false, qrMsg: null }
    SOCKET_STATES.set(userId, socketState)

    const connectionOptions = {
      logger: pino({ level: 'silent' }),
      auth: {
        creds: state.creds,
        keys:  makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
      },
      browser:                        ['Ubuntu', 'Chrome', '120.0'],
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

    const watchdogTimer = setInterval(() => {
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
          setTimeout(() => {
            yukiJadiBot({ sessionPath, m: null, conn, userId, mode }).catch(() => {})
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
      }

      if (!isInit) {
        sock.ev.off('messages.upsert',           sock._msgHandler)
        sock.ev.off('connection.update',         sock._connHandler)
        sock.ev.off('creds.update',              sock._credsHandler)
        sock.ev.off('group-participants.update', sock._partsHandler)
        sock.ev.off('groups.update',             sock._groupsHandler)
      }

      // ✅ الإصلاح الرئيسي — كل بوت فرعي بيجيب handler منفصل بـ userId
      sock._msgHandler = async ({ messages, type }) => {
        if (type !== 'notify') return
        try {
          const mod = await getSubHandler(userId)
          if (!mod?.handler) return
          const now = Math.floor(Date.now() / 1000)
          for (const msg of messages) {
            const ts = msg.messageTimestamp?.low || msg.messageTimestamp || 0
            if (ts > 0 && (now - ts) > 120) continue
            // ✅ تجاهل status broadcast عشان ميأثرش على الأساسي
            if (msg.key?.remoteJid === 'status@broadcast') continue
            // ✅ تأكد إن الرسالة للساب بوت ده مش للأساسي
            const sockJid = sock?.user?.jid?.split('@')[0]?.split(':')[0]
            const msgTo   = msg.key?.remoteJid
            if (sockJid && msgTo && msgTo === global.conn?.user?.jid) return
            await mod.handler(sock, msg).catch(() => {})
          }
        } catch {}
      }

      sock._connHandler  = connectionUpdate.bind(sock)
      sock._credsHandler = saveCreds

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
          const code = await sock.requestPairingCode(userId)
          if (typeof code === 'string' && code.length > 0) {
            await sendCodeMessage(conn, m, code)
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

        sock.isInit = true
        const exists = global.conns.some(s => {
          const n = (s?.user?.jid || '').split('@')[0].split(':')[0]
          return n === userId
        })
        if (!exists && sock?.user) {
          global.conns.push(sock)
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
        if ([DisconnectReason.loggedOut, 401, 403, 405].includes(reason)) {
          console.warn(chalk.red(`[JADIBOT] 🚫 جلسة (+${userId}) أُغلقت نهائياً — كود: ${reason}`))
          try {
            await conn.sendMessage(`${userId}@s.whatsapp.net`,
              { text: '⚠️ تم قطع جلستك في البوت. أعد التنصيب للاستمرار.' })
          } catch {}
          removeConnSocket(userId)
          removeInstall(userId)
          cleanupSession(userId, true)
          subHandlerCache.delete(userId)
          return
        }

        if (reason === 440) {
          console.warn(chalk.yellow(`[JADIBOT] ⚠️ جلسة (+${userId}) استُبدلت بجهاز آخر`))
          try {
            await conn.sendMessage(`${userId}@s.whatsapp.net`,
              { text: '⚠️ تم اكتشاف جلسة جديدة. احذف الجلسة القديمة وأعد الربط.' })
          } catch {}
          return
        }

        const attempts = (RECONNECT_ATTEMPTS.get(userId) || 0) + 1
        if (attempts <= MAX_RECONNECT) {
          RECONNECT_ATTEMPTS.set(userId, attempts)
          ACTIVE_SESSIONS.delete(userId)
          const delay = RECONNECT_BASE_DELAY * attempts
          console.log(chalk.magenta(`[JADIBOT] 🔄 إعادة ربط (+${userId}) — محاولة ${attempts}/${MAX_RECONNECT} بعد ${delay}ms`))
          setTimeout(() => {
            yukiJadiBot({ sessionPath, m: null, conn, userId, mode }).catch(() => {})
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

async function joinChannels(sock) {
  try {
    if (!global.ch || typeof global.ch !== 'object') return
    for (const value of Object.values(global.ch)) {
      if (typeof value === 'string' && value.endsWith('@newsletter')) {
        await sock.newsletterFollow(value).catch(() => {})
      }
    }
  } catch {}
}