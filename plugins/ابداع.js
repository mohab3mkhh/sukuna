// plugins/ابداع.js
// 🫧 ابداع - احفظ ملصق، والبوت يتفاعل بيه مع رسايلك العادية
//
//   .ابداع          (ردّ على ملصق)  ← يحفظ الملصق
//   .ابداع حذف                      ← يمسح الملصق ويوقف التفاعل
//   .ابداع                          ← يعرض حالتك
//
// الملف ده فيه الأمر + التفاعل التلقائي (handler.before) في ملف واحد.

import fs from 'fs'
import path from 'path'
import * as _baileys from '@whiskeysockets/baileys'

const B = _baileys.generateWAMessageFromContent ? _baileys : (_baileys.default || _baileys)
const { generateWAMessageFromContent } = B

const DB_DIR = path.join(process.cwd(), 'database')
const DB_FILE = path.join(DB_DIR, 'ibdaa.json')
const LINE = '≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋'
const COOLDOWN_MS = 15 * 1000 // أقل وقت بين تفاعلين لنفس الشخص

/* ═══════════ التخزين (مع كاش عشان القراءة مع كل رسالة) ═══════════ */

let cache = null

function loadDB() {
  if (cache) return cache
  try {
    cache = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) : {}
  } catch {
    cache = {}
  }
  return cache
}

function saveDB(db) {
  cache = db
  fs.mkdirSync(DB_DIR, { recursive: true })
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2))
}

/* ═══════════ الملصق ═══════════ */

const SKIP_KEYS = new Set(['key', 'chat', 'sender', 'conn', 'client', 'sock'])

function findSticker(obj, depth = 0, seen = new Set()) {
  if (!obj || typeof obj !== 'object' || depth > 7) return null
  if (seen.has(obj)) return null
  seen.add(obj)

  if (obj.stickerMessage) return obj.stickerMessage
  if (obj.mtype === 'stickerMessage' && obj.msg) return obj.msg
  if (obj.mimetype === 'image/webp' && obj.fileSha256 && obj.mediaKey) return obj

  for (const key of Object.keys(obj)) {
    if (SKIP_KEYS.has(key)) continue
    let child
    try { child = obj[key] } catch { continue }
    const found = findSticker(child, depth + 1, seen)
    if (found) return found
  }
  return null
}

const toBase64 = v => {
  if (!v) return v
  if (Buffer.isBuffer(v)) return v.toString('base64')
  if (v instanceof Uint8Array) return Buffer.from(v).toString('base64')
  return v
}

const fromBase64 = v => (typeof v === 'string' ? Buffer.from(v, 'base64') : v)

function prepareSticker(s) {
  return {
    url: s.url,
    fileSha256: toBase64(s.fileSha256),
    fileEncSha256: toBase64(s.fileEncSha256),
    mediaKey: toBase64(s.mediaKey),
    mimetype: s.mimetype || 'image/webp',
    height: s.height || 512,
    width: s.width || 512,
    directPath: s.directPath,
    fileLength: s.fileLength,
    mediaKeyTimestamp: s.mediaKeyTimestamp,
    firstFrameLength: s.firstFrameLength,
    firstFrameSidecar: toBase64(s.firstFrameSidecar),
    isAnimated: s.isAnimated || false
  }
}

async function sendSticker(conn, chat, saved) {
  const stickerMessage = {
    ...saved,
    fileSha256: fromBase64(saved.fileSha256),
    fileEncSha256: fromBase64(saved.fileEncSha256),
    mediaKey: fromBase64(saved.mediaKey),
    firstFrameSidecar: fromBase64(saved.firstFrameSidecar),
    stickerSentTs: Date.now()
  }
  const msg = generateWAMessageFromContent(chat, { stickerMessage }, { userJid: conn.user?.id || conn.user?.jid })
  await conn.relayMessage(chat, msg.message, { messageId: msg.key.id })
}

/* ═══════════ الردود ═══════════ */

const card = (title, lines = []) => [`🫧 ⟪ ${title} ⟫ 🫧`, LINE, ...lines, LINE].join('\n')

/* ═══════════ الأمر ═══════════ */

let handler = async (m, { conn, args = [] }) => {
  const say = text => conn.sendMessage(m.chat, { text })
  const sender = m.sender
  if (!sender) return

  const db = loadDB()
  const arg = String(args[0] || '').trim()

  /* ─── حذف ─── */
  if (/^(حذف|مسح|ايقاف|إيقاف|delete|off)$/i.test(arg)) {
    if (!db[sender]) return say(card('𝓘𝓫𝓭𝓪𝓪', ['🚫 لا يوجد ملصق محفوظ على رقمك.']))
    delete db[sender]
    saveDB(db)
    return say(card('𝓘𝓫𝓭𝓪𝓪', ['☑️ مسحت الملصق.', '🐚 التفاعل التلقائي وقف.']))
  }

  /* ─── حفظ (ردّ على ملصق) ─── */
  if (m.quoted) {
    const sticker = findSticker(m.quoted)
    if (!sticker) return say(card('𝓘𝓫𝓭𝓪𝓪', ['🚫 الرسالة اللي رديت عليها مش ملصق.']))

    const prepared = prepareSticker(sticker)
    if (!prepared.url || !prepared.mediaKey) {
      return say(card('𝓘𝓫𝓭𝓪𝓪', ['🚫 معرفتش أقرأ بيانات الملصق، جرب ملصق تاني.']))
    }

    db[sender] = { sticker: prepared, updated: Date.now() }
    saveDB(db)

    return say(card('𝓘𝓫𝓭𝓪𝓪', [
      '☑️ الملصق اتحفظ.',
      '',
      '> 🐚 مش هبعته دلوقتي',
      '> 🐚 هتفاعل بيه مع رسايلك العادية',
      '> 🐚 للإلغاء اكتب: .ابداع حذف'
    ]))
  }

  /* ─── مفيش ردّ: نعرض الحالة والشرح ─── */
  return say(card('𝓘𝓫𝓭𝓪𝓪', [
    db[sender] ? '🐟 حالتك ‹ شغّال ☑️ (عندك ملصق محفوظ)' : '🐟 حالتك ‹ مفيش ملصق محفوظ',
    '',
    '🪸 *.ابداع* (ردّ على ملصق) ‹ يحفظه',
    '🪸 *.ابداع حذف* ‹ يمسحه'
  ]))
}

/* ═══════════ التفاعل التلقائي مع الرسايل العادية ═══════════ */

const lastReact = new Map()

handler.before = async function (m, { conn }) {
  try {
    if (m.fromMe || m.isBaileys) return false
    const text = String(m.text || '').trim()
    if (!text) return false
    if (/^[./!#$]/.test(text)) return false // الأوامر متتفاعلش معاها

    const entry = loadDB()[m.sender]
    if (!entry?.sticker) return false

    const now = Date.now()
    if (now - (lastReact.get(m.sender) || 0) < COOLDOWN_MS) return false
    lastReact.set(m.sender, now)

    await sendSticker(conn, m.chat, entry.sticker)
  } catch (e) {
    console.error('[ابداع] تفاعل فشل:', e?.message)
  }
  return false
}

handler.help = ['ابداع']
handler.tags = ['fun']
handler.command = /^(ابداع|إبهار|ibdaa|ابداع_ملصق)$/i

export default handler