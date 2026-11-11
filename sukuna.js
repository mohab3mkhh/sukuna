// ════════════════════════════════════════════════════════
//   ⛩️ sukuna bot v4 — index.js
//   متلعبش في الكود ده، ممكن تبوظ البوت
// ════════════════════════════════════════════════════════
process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '1'


// ━━━ Config أولاً — تحميل كل الـ globals ━━━
import './config.js'
import './plugins/_allfake.js'

import { createRequire }      from 'module'
import { fileURLToPath, pathToFileURL } from 'url'
import { platform }           from 'process'
import * as wsLib             from 'ws'

import fs, {
  readdirSync, statSync, unlinkSync, existsSync,
  mkdirSync, readFileSync, writeFileSync, watch
} from 'fs'

import path, { join, dirname } from 'path'
import chalk                  from 'chalk'
import pino                   from 'pino'
import Pino                   from 'pino'
import NodeCache              from 'node-cache'
import { Low, JSONFile }      from 'lowdb'
import pkg from 'lodash';

const { chain } = pkg;
import readline               from 'readline'
import util                   from 'util'
import { spawn }              from 'child_process'
import { Boom }               from '@hapi/boom'

import {
  makeWASocket,
  protoType,
  serialize
} from './lib/simple.js'

import {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  jidNormalizedUser,
  fetchLatestWaWebVersion
} from '@whiskeysockets/baileys'   // ← تم التغيير من angularsockets

import store from './lib/store.js'

import {
  handler,
  loadPlugins,
  watchPlugins,
  participantsUpdate,
  groupsUpdate,
  callUpdate
} from './handler.js'

const { yukiJadiBot } = await import('./plugins/sockets-serbot.js').catch(() => ({ yukiJadiBot: null }))

// ════════════════════════════════════════════════════════
// 🔧 Helpers
// ════════════════════════════════════════════════════════
const format = util.format

global.__filename = (pathURL = import.meta.url, rmPrefix = platform !== 'win32') =>
  rmPrefix ? (/file:\/\/\//.test(pathURL) ? fileURLToPath(pathURL) : pathURL) : pathToFileURL(pathURL).toString()

global.__dirname = (pathURL) => dirname(global.__filename(pathURL, true))

global.__require = (dir = import.meta.url) => createRequire(dir)

const __dirname = global.__dirname(import.meta.url)

global.timestamp = { start: new Date() }
global.opts      = {}
global.prems     = global.prems || []
global.conns     = Array.isArray(global.conns) ? global.conns : []
global.ch        = global.ch || {}   // قنوات الانضمام

// alias عشان البلاجنات القديمة تشتغل
global.owner     = global.owners || []
global.botname   = global.botName

// ════════════════════════════════════════════════════════
// 📁 المجلدات الضرورية
// ════════════════════════════════════════════════════════
const AUTH_DIR   = join(__dirname, 'session')
const PLUGIN_DIR = join(__dirname, 'plugins')
const SUBBOT_DIR = join(__dirname, global.subbotDir || 'Sessions/SubBot')
const TMP_DIR    = join(__dirname, 'tmp')

;[AUTH_DIR, PLUGIN_DIR, SUBBOT_DIR, TMP_DIR].forEach(d => {
  if (!existsSync(d)) mkdirSync(d, { recursive: true })
})

// ════════════════════════════════════════════════════════
// 💾 قاعدة البيانات — lowdb
// ════════════════════════════════════════════════════════
global.db      = new Low(new JSONFile(join(__dirname, 'database.json')))
global.DATABASE = global.db

global.loadDatabase = async function loadDatabase() {
  // لو بيُقرأ حالياً، انتظر
  if (global.db.READ) {
    return new Promise(resolve =>
      setInterval(function () {
        if (!global.db.READ) {
          clearInterval(this)
          resolve(global.db.data == null ? global.loadDatabase() : global.db.data)
        }
      }, 1000)
    )
  }
  if (global.db.data !== null) return

  global.db.READ = true
  await global.db.read().catch(console.error)
  global.db.READ = null

  global.db.data = {
    users:    {},
    chats:    {},
    settings: {},
    ...(global.db.data || {})
  }
  global.db.chain = chain(global.db.data)
}
await global.loadDatabase()

// ════════════════════════════════════════════════════════
// 🔄 استعادة Session من BASE64
// ════════════════════════════════════════════════════════
const credsPath = join(AUTH_DIR, 'creds.json')

if (global.sessionId && !existsSync(credsPath)) {
  try {
    let data
    try   { data = JSON.parse(Buffer.from(global.sessionId, 'base64').toString('utf-8')) }
    catch { data = JSON.parse(global.sessionId) }
    writeFileSync(credsPath, JSON.stringify(data, null, 2))
    console.log(chalk.green.bold('🔱 Session restored from SESSION_ID'))
  } catch (e) {
    console.error(chalk.red('[Session Restore]'), e.message)
  }
}

// ════════════════════════════════════════════════════════
// 📱 إعداد الاتصال (QR أو Pairing Code)
// ════════════════════════════════════════════════════════
const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
const question = txt => new Promise(res => rl.question(txt, res))

const methodQR   = process.argv.includes('qr')
const methodCode = process.argv.includes('code') || !!global.pairing

// اختيار الطريقة لو مافيش session
let opcion
if (methodQR) {
  opcion = '1'
} else if (!existsSync(credsPath)) {
  if (methodCode || global.pairing) {
    opcion = '2'
  } else {
    do {
      opcion = await question(
        chalk.bold.white('اختر طريقة الاتصال:\n') +
        chalk.bold.cyan('1. كود QR\n') +
        chalk.bold.green('2. كود ربط (Pairing Code)\n') +
        chalk.bold.white('--> ')
      )
      if (!/^[1-2]$/.test(opcion))
        console.log(chalk.bold.red('اختر 1 أو 2 فقط'))
    } while (opcion !== '1' && opcion !== '2')
  }
}

console.info = () => {}   // كبح رسائل baileys المزعجة

// ════════════════════════════════════════════════════════
// 🔌 إنشاء الـ Socket
// ════════════════════════════════════════════════════════
protoType()
serialize()

const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR)
const { version }          = await fetchLatestWaWebVersion().catch(() => ({ version: [2, 3000, 0] }))
const msgRetryCounterCache = new NodeCache({ stdTTL: 0, checkperiod: 0 })
const userDevicesCache     = new NodeCache({ stdTTL: 0, checkperiod: 0 })

const connectionOptions = {
  version,
  logger:  pino({ level: 'silent' }),
  printQRInTerminal: opcion === '1' || methodQR,
  auth: {
    creds: state.creds,
    keys:  makeCacheableSignalKeyStore(state.keys, Pino({ level: 'fatal' }).child({ level: 'fatal' }))
  },
  browser:                       ['MacOs', 'Safari', '17.0'],
  markOnlineOnConnect:           true,
  generateHighQualityLinkPreview: true,
  syncFullHistory:               false,
  keepAliveIntervalMs:           55_000,
  maxIdleTimeMs:                 60_000,
  defaultQueryTimeoutMs:         undefined,
  msgRetryCounterCache,
  userDevicesCache,
  getMessage: async key => {
    try {
      const jid = jidNormalizedUser(key.remoteJid)
      const msg = await store.loadMessage(jid, key.id)
      return msg?.message || ''
    } catch { return '' }
  },
  cachedGroupMetadata: jid => global.conn?.chats?.[jid] ?? {},
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

global.conn = makeWASocket(connectionOptions)
global.conn.isInit = false

// ════════════════════════════════════════════════════════
// 📲 Pairing Code
// ════════════════════════════════════════════════════════
if (!existsSync(credsPath) && (opcion === '2' || methodCode)) {
  if (!global.conn.authState.creds.registered) {
    let pNum = global.pairing

    if (!pNum) {
      let raw
      do {
        raw = await question(chalk.bgBlack(chalk.bold.green(
          `أدخل رقم الواتساب مع كود الدولة:\n${chalk.bold.magenta('---> ')}`
        )))
        raw = raw.replace(/\D/g, '')
        if (!raw) console.log(chalk.bold.red('⚠️ الرقم فارغ'))
      } while (!raw)
      pNum = raw
    }

    rl.close()

    setTimeout(async () => {
      try {
        let code = await global.conn.requestPairingCode(pNum.replace(/\D/g, ''))
        code = code?.match(/.{1,4}/g)?.join('-') || code
        console.log('\n\n╔══════════════════════════╗\n║  PAIRING CODE: ' + code + '  ║\n╚══════════════════════════╝\n\n')
      } catch (e) {
        console.error(chalk.red('[Pairing]'), e.message)
      }
    }, 3000)
  }
}

// ════════════════════════════════════════════════════════
// 🔃 reloadHandler — يُعيد تحميل handler + conn
// ════════════════════════════════════════════════════════
let isInit   = true
let _handler = { handler, loadPlugins, watchPlugins, participantsUpdate, groupsUpdate, callUpdate }

global.reloadHandler = async function reloadHandler(restatConn = false) {
  try {
    const newH = await import(`./handler.js?t=${Date.now()}`).catch(console.error)
    if (newH && Object.keys(newH).length) _handler = newH
  } catch (e) { console.error('[reloadHandler]', e.message) }

  if (restatConn) {
    const oldChats = global.conn.chats
    try { global.conn.ws.close() } catch {}
    global.conn.ev.removeAllListeners()
    global.conn = makeWASocket(connectionOptions, { chats: oldChats })
    isInit = true
  }

  // إزالة المستمعين القدامى
  if (!isInit) {
    global.conn.ev.off('messages.upsert',          global.conn._handlerUpsert)
    global.conn.ev.off('connection.update',        global.conn._handlerConnUpd)
    global.conn.ev.off('creds.update',             global.conn._handlerCreds)
    global.conn.ev.off('group-participants.update', global.conn._handlerParts)
    global.conn.ev.off('groups.update',            global.conn._handlerGroups)
    global.conn.ev.off('call',                     global.conn._handlerCall)
  }

  // ━━━ ربط الأحداث ━━━
  // cache للـ groupMetadata عشان منكررش الـ call لكل رسالة
  if (!global._groupMetaCache) global._groupMetaCache = new Map()
  const getCachedGroupMeta = async (jid) => {
    const now = Date.now()
    const cached = global._groupMetaCache.get(jid)
    if (cached && (now - cached.ts) < 5 * 60 * 1000) return cached.data
    const data = await global.conn.groupMetadata(jid).catch(() => null)
    if (data) global._groupMetaCache.set(jid, { data, ts: now })
    return data
  }

  global.conn._handlerUpsert = async ({ messages, type }) => {
    if (type !== 'notify') return
    const now = Math.floor(Date.now() / 1000)
    for (let msg of messages) {
      const ts = msg.messageTimestamp?.low || msg.messageTimestamp || 0
      if (ts > 0 && (now - ts) > 120) continue

      // ━━━ LID Fix: بس لو في lid فعلاً ━━━
      try {
        const isGroup = msg.key?.remoteJid?.endsWith('@g.us')
        if (isGroup && msg.message) {
          const senderRaw = msg.key?.participant || msg.participant || ''
          const mentionedJid = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || []
          const hasLid = senderRaw.endsWith('@lid') || mentionedJid.some(j => j.endsWith('@lid'))

          // نجيب الـ metadata بس لو في lid فعلاً
          if (hasLid) {
            const groupMetadata = await getCachedGroupMeta(msg.key.remoteJid)
            if (groupMetadata) {

              // 1. إصلاح الـ sender
              if (senderRaw.endsWith('@lid')) {
                const match = groupMetadata.participants.find(p => p.id === senderRaw || p.lid === senderRaw)
                if (match?.jid && !match.jid.endsWith('@lid')) {
                  msg.key.participant = match.jid
                }
              }

              // 2. إصلاح الـ mentionedJid
              if (Array.isArray(mentionedJid) && mentionedJid.some(j => j.endsWith('@lid'))) {
                const lidMap = {}
                mentionedJid.forEach(originalLid => {
                  if (originalLid.endsWith('@lid')) {
                    const match = groupMetadata.participants.find(p => p.id === originalLid || p.lid === originalLid)
                    if (match?.jid && !match.jid.endsWith('@lid')) {
                      lidMap[originalLid.split('@')[0]] = match.jid.split('@')[0]
                    }
                  }
                })
                const resolvedMentions = mentionedJid.map(jid => {
                  if (jid.endsWith('@lid')) {
                    const match = groupMetadata.participants.find(p => p.id === jid || p.lid === jid)
                    return (match?.jid && !match.jid.endsWith('@lid')) ? match.jid : jid
                  }
                  return jid
                })
                if (msg.message?.extendedTextMessage?.contextInfo) {
                  msg.message.extendedTextMessage.contextInfo.mentionedJid = resolvedMentions
                }
                const replaceLid = (text) => {
                  if (!text) return text
                  Object.entries(lidMap).forEach(([lidNum, jidNum]) => {
                    text = text.replace(new RegExp(`@${lidNum}\b`, 'g'), `@${jidNum}`)
                  })
                  return text
                }
                if (msg.message?.conversation) msg.message.conversation = replaceLid(msg.message.conversation)
                if (msg.message?.extendedTextMessage?.text) msg.message.extendedTextMessage.text = replaceLid(msg.message.extendedTextMessage.text)
              }
            }
          }
        }
      } catch {}
      // ━━━ نهاية LID Fix ━━━

      ;(_handler.handler || handler)(global.conn, msg).catch(e =>
        console.error(chalk.red('[messages.upsert]'), e.message)
      )
    }
  }

  global.conn._handlerConnUpd = connectionUpdate.bind(global.conn)
  global.conn._handlerCreds   = saveCreds
  global.conn._handlerParts   = upd => (_handler.participantsUpdate || participantsUpdate)(global.conn, upd).catch(() => {})
  global.conn._handlerGroups  = upds => (_handler.groupsUpdate || groupsUpdate)(global.conn, upds).catch(() => {})
  global.conn._handlerCall    = calls => calls.forEach(c =>
    (_handler.callUpdate || callUpdate)(global.conn, c).catch(() => {})
  )

  global.conn.ev.on('messages.upsert',           global.conn._handlerUpsert)
  global.conn.ev.on('connection.update',         global.conn._handlerConnUpd)
  global.conn.ev.on('creds.update',              global.conn._handlerCreds)
  global.conn.ev.on('group-participants.update', global.conn._handlerParts)
  global.conn.ev.on('groups.update',             global.conn._handlerGroups)
  global.conn.ev.on('call',                      global.conn._handlerCall)

  if (!global.conn.contacts) global.conn.contacts = {}

  global.conn.ev.on('contacts.upsert', (contacts) => {
    if (!global.conn.contacts) global.conn.contacts = {}
    for (const c of contacts) {
      if (c.id) global.conn.contacts[c.id] = c
    }
  })

  global.conn.ev.on('contacts.update', (updates) => {
    if (!global.conn.contacts) global.conn.contacts = {}
    for (const c of updates) {
      if (c.id) global.conn.contacts[c.id] = { ...(global.conn.contacts[c.id] || {}), ...c }
    }
  })

  isInit = false
  return true
}

// ════════════════════════════════════════════════════════
// 📡 connectionUpdate
// ════════════════════════════════════════════════════════
async function connectionUpdate(update) {
  const conn = global.conn
  const { connection, lastDisconnect, isNewLogin, qr } = update
  global.stopped = connection

  if (isNewLogin) conn.isInit = true

  const code = lastDisconnect?.error?.output?.statusCode
    || lastDisconnect?.error?.output?.payload?.statusCode

  // إعادة تحميل عند قطع الاتصال من الخادم
  if (code && code !== DisconnectReason.loggedOut && conn?.ws?.socket == null) {
    await global.reloadHandler(true).catch(console.error)
    global.timestamp.connect = new Date()
  }

  if (global.db.data == null) await global.loadDatabase()

  if (qr && (opcion === '1' || methodQR)) {
    console.log(chalk.green.bold(`\n[ ]  امسح كود الـ QR`))
  }

  if (connection === 'connecting') {
    console.log(chalk.hex('#9400FF').bold('⚡ جاري الاتصال...'))
  }

  if (connection === 'open') {
    const jid  = jidNormalizedUser(conn.user?.id || '')
    const name = conn.user?.name || conn.user?.verifiedName || 'SUKUNA BOT'
    if (conn.user) conn.user.jid = jid

    global.timestamp.connect = new Date()

    console.log(chalk.hex('#00FFFF').bold(
      `\n╔══════════════════════════════════╗\n` +
      `║  ✅ متصل: ${name.slice(0, 20).padEnd(20)} ║\n` +
      `║  📱 JID: ${jid.slice(0, 21).padEnd(21)} ║\n` +
      `╚══════════════════════════════════╝\n`
    ))

    // لود مجموعات الـ cache
    conn.insertAllGroup().catch(() => {})

    // انضمام للقنوات
    await joinChannels(conn).catch(() => {})
  }

  if (connection === 'close') {
    const reason = new Boom(lastDisconnect?.error)?.output?.statusCode

    console.log(chalk.red(`🔴 انقطع الاتصال — كود: ${reason || '?'}`))

    if (reason === DisconnectReason.loggedOut || reason === 401) {
      console.log(chalk.red.bold('🔴 تم تسجيل الخروج — أعد الربط بـ Pairing Code'))
      try { fs.unlinkSync(credsPath) } catch {}
      setTimeout(() => global.reloadHandler(true).catch(console.error), 5000)
      return
    }

    if (reason === DisconnectReason.badSession || reason === 405) {
      console.log(chalk.yellow('⚠️ جلسة تالفة — جاري المسح...'))
      try { fs.unlinkSync(credsPath) } catch {}
    }

    if (reason === DisconnectReason.connectionReplaced || reason === 440) {
      console.log(chalk.yellow('⚠️ الجلسة استُبدلت بجهاز آخر'))
      return
    }

    console.log(chalk.yellow('♻️ إعادة الاتصال بعد 5 ثوانٍ...'))
    setTimeout(() => global.reloadHandler(true).catch(console.error), 5000)
  }
}

// ════════════════════════════════════════════════════════
// 📦 تحميل البلاجنات — global.plugins + hot-reload
// ════════════════════════════════════════════════════════
await loadPlugins(PLUGIN_DIR)
watchPlugins(PLUGIN_DIR)

// Hot-reload فردي مع فحص syntax
global.reload = async (_ev, filename) => {
  if (!filename?.endsWith('.js')) return
  const filePath = join(PLUGIN_DIR, filename)

  if (!existsSync(filePath)) {
    console.log(chalk.yellow(`[Plugin] 🗑️ حُذف: ${filename}`))
    delete global.plugins[filename]
    return
  }

  console.log(chalk.cyan(`[Plugin] 🔄 تحديث: ${filename}`))

  try {
    const src = readFileSync(filePath, 'utf8')
    // فحص syntax بسيط
    try { new Function(src) } catch (synErr) {
      console.error(chalk.red(`[Plugin] ❌ Syntax في ${filename}:`), synErr.message)
      return
    }
  } catch {}

  try {
    const url = pathToFileURL(filePath).href + `?t=${Date.now()}`
    const mod = await import(url)
    global.plugins[filename] = mod.default || mod
    console.log(chalk.green(`[Plugin] ✅ ${filename}`))
  } catch (e) {
    console.error(chalk.red(`[Plugin] ❌ ${filename}:`), e.message)
  }

  // إعادة ترتيب أبجدي
  global.plugins = Object.fromEntries(
    Object.entries(global.plugins).sort(([a], [b]) => a.localeCompare(b))
  )
}
Object.freeze(global.reload)
watch(PLUGIN_DIR, global.reload)

// ════════════════════════════════════════════════════════
// 🚀 تشغيل الاتصال الأولي
// ════════════════════════════════════════════════════════
await global.reloadHandler()

// ════════════════════════════════════════════════════════
// 💾 حفظ DB كل 30 ثانية + تنظيف tmp
// ════════════════════════════════════════════════════════
setInterval(async () => {
  if (global.db?.data) {
    await global.db.write().catch(e => console.error('[DB Write]', e.message))
  }
}, 30_000)

setInterval(() => {
  try {
    readdirSync(TMP_DIR).forEach(f => {
      try { unlinkSync(join(TMP_DIR, f)) } catch {}
    })
  } catch {}
}, 60_000)

// ════════════════════════════════════════════════════════
// 🤖 Sub-Bots — إعادة تشغيل عند البدء
// ════════════════════════════════════════════════════════
function getInstalledIds() {
  const f = join(PLUGIN_DIR, 'yuki_installs.json')
  try { return JSON.parse(readFileSync(f, 'utf8')) || [] } catch { return [] }
}

function isSubBotAlive(uid) {
  return global.conns.some(s => {
    const n = (s?.user?.jid || s?.user?.id || '').split('@')[0].split(':')[0]
    return n === uid && s?.ws?.readyState === 1
  })
}

async function reviveSubBot(uid) {
  const bPath = join(SUBBOT_DIR, uid)
  if (!existsSync(join(bPath, 'creds.json'))) return
  if (!yukiJadiBot) return
  try {
    await yukiJadiBot({ pathYukiJadiBot: bPath, m: null, conn: global.conn, args: [], fromCommand: false })
    await new Promise(r => setTimeout(r, 3000))
  } catch (e) {
    console.error(chalk.red(`[SubBot] Failed ${uid}:`), e.message)
  }
}

// revival عند البدء (بعد 12 ثانية)
setTimeout(async () => {
  const ids = getInstalledIds()
  if (!ids.length) return
  console.log(chalk.cyan(`[SubBot] 🔄 إعادة تشغيل ${ids.length} بوت فرعي...`))
  for (const uid of ids) await reviveSubBot(uid)
}, 12_000)

// Watchdog كل دقيقتين (يبدأ بعد 15 ثانية)
setTimeout(() => {
  setInterval(async () => {
    try {
      const before = global.conns.length
      global.conns = global.conns.filter(s => {
        const ws  = s?.ws?.readyState
        const dead = !s || ws === 3 || (!s.isInit && !s.user && ws !== 0 && ws !== 1)
        if (dead) {
          try { s?.ws?.close() }          catch {}
          try { s?.ev?.removeAllListeners() } catch {}
        }
        return !dead
      })

      if (global.conns.length < before)
        console.log(chalk.yellow(`[Watchdog] 🧹 أزال ${before - global.conns.length} بوت ميت`))

      for (const uid of getInstalledIds()) {
        if (!isSubBotAlive(uid)) await reviveSubBot(uid)
      }
    } catch (e) { console.error('[Watchdog]', e.message) }
  }, 2 * 60_000)
}, 15_000)

// ════════════════════════════════════════════════════════
// 📡 joinChannels — انضمام للقنوات
// ════════════════════════════════════════════════════════
async function joinChannels(conn) {
  if (!global.ch || typeof global.ch !== 'object') return
  for (const value of Object.values(global.ch)) {
    if (typeof value === 'string' && value.endsWith('@newsletter')) {
      await conn.newsletterFollow(value).catch(() => {})
    }
  }
}

// ════════════════════════════════════════════════════════
// 🔍 quickTest — فحص الأدوات المتاحة
// ════════════════════════════════════════════════════════
async function _quickTest() {
  const tools = await Promise.all([
    spawn('ffmpeg'),
    spawn('ffprobe'),
    spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-filter_complex', 'color', '-frames:v', '1', '-f', 'webp', '-']),
    spawn('convert'),
    spawn('magick'),
    spawn('gm'),
    spawn('find', ['--version'])
  ].map(p =>
    Promise.race([
      new Promise(r => p.on('close', code => r(code !== 127))),
      new Promise(r => p.on('error', () => r(false)))
    ])
  ))
  const [ffmpeg, ffprobe, ffmpegWebp, convert, magick, gm, find] = tools
  global.support = Object.freeze({ ffmpeg, ffprobe, ffmpegWebp, convert, magick, gm, find })
  console.log(chalk.hex('#9400FF')(
    `[Tools] ffmpeg:${ffmpeg?'✅':'❌'} | convert:${convert?'✅':'❌'} | magick:${magick?'✅':'❌'}`
  ))
}
_quickTest().catch(() => {})

// ════════════════════════════════════════════════════════
// 🛡️ Crash Protection
// ════════════════════════════════════════════════════════
process.on('uncaughtException',  e => console.error(chalk.red('[CRASH]'),     e?.message || e))
process.on('unhandledRejection', r => console.error(chalk.red('[REJECTION]'), r?.message || r))

// ════════════════════════════════════════════════════════
// 🖼️ Startup Banner
// ════════════════════════════════════════════════════════
console.log(chalk.hex('#FFD700').bold(`
╔══════════════════════════════════════╗
║  ꧁༒【⛩️sukuna⛩️bot】༒꧂      ║
║  v${global.botVer}  —  Powered by simple.js    ║
║  ⛩️ Node ${process.version.padEnd(10)} | ${new Date().toLocaleDateString('ar-EG')}  ║
╚══════════════════════════════════════╝
`))
