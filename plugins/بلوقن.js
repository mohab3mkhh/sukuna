// plugins/ملف.js — مدير ملفات آمن، متاح لمالك البوت فقط.
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { fileURLToPath } from 'url'
import pkg from 'angularsockets'


// بديل بسيط لـ theme.js: يبني نص من مصفوفة "كروت"
const theme = {
  build(cards) {
    return cards.map(c => {
      if (c.type === 'title') return `*${c.text}*`
      if (c.type === 'divider') return '───────────────'
      if (c.type === 'info') return `• *${c.label}:* ${c.value}`
      if (c.type === 'warning') return `⚠️ ${c.text}`
      if (c.type === 'line') return c.text
      return ''
    }).filter(Boolean).join('\n')
  }
}

const { downloadContentFromMessage, generateWAMessageFromContent, generateMessageIDV2 } = pkg

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const BACKUP_DIR = path.join(ROOT, '.file-manager-backups')
const MAX_FILE_SIZE = 10 * 1024 * 1024
const TEXT_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.json', '.txt', '.md', '.yml', '.yaml', '.html', '.css', '.xml', '.csv'])
const CODE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.json'])
const BLOCKED_DIRS = new Set([
  '.git', '.npm', '.cache', 'node_modules', 'tmp', 'temp', 'logs',
  '.file-manager-backups', 'data', 'database', 'session', 'sessions', 'auth_info_baileys',
  'backupsession', '2bsession', 'ares-nomainsession', '2bsubbot',
  'chososubbot', 'gatajadibot', 'jadibots', 'g_assubbot',
  '𝑪𝑯𝑶𝑺𝑶subbot'.toLowerCase(), 'mb-𝑪𝑯𝑶𝑺𝑶subbot'.toLowerCase()
])
function insideRoot(target) {
  const rel = path.relative(ROOT, target)
  return rel === '' || (!rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel))
}

function relativeName(target) {
  return path.relative(ROOT, target).split(path.sep).join('/')
}

function isBlockedRelative(rel) {
  const parts = rel.split(/[\\/]+/).filter(Boolean)
  if (!parts.length) return true
  if (parts.some(part => part.startsWith('.') || BLOCKED_DIRS.has(part.toLowerCase()) || /auth|session|credential|creds|secret|token/i.test(part))) return true
  const base = parts[parts.length - 1].toLowerCase()
  if (base === '.env' || base.startsWith('.env.') || /(^|[._-])(creds?|credentials?|secrets?|tokens?)([._-]|$)/i.test(base)) return true
  if (/\.(pem|key|p12|pfx)$/i.test(base)) return true
  return false
}

function resolveSafePath(raw, { mustExist = true, mutate = false } = {}) {
  const rel = String(raw || '').trim().replace(/^['"]|['"]$/g, '')
  if (!rel || path.isAbsolute(rel)) throw new Error('اكتب مسارًا نسبيًا داخل مجلد البوت.')
  let target = path.resolve(ROOT, rel)
  if (mustExist && !fs.existsSync(target) && !path.extname(target) && fs.existsSync(`${target}.js`)) {
    target = `${target}.js`
  } else if (!mustExist && !path.extname(target)) {
    target = `${target}.js`
  }
  if (!insideRoot(target) || target === ROOT) throw new Error('المسار خارج مجلد البوت أو غير مسموح.')
  const cleanRel = relativeName(target)
  if (isBlockedRelative(cleanRel)) throw new Error('هذا المسار محمي لأنه قد يحتوي على أسرار أو بيانات جلسات.')
  if (mustExist) {
    if (!fs.existsSync(target)) throw new Error('الملف أو المجلد غير موجود.')
    const st = fs.lstatSync(target)
    if (st.isSymbolicLink()) throw new Error('روابط الملفات الرمزية غير مسموحة.')
  } else {
    const parent = path.dirname(target)
    if (!fs.existsSync(parent) || !fs.statSync(parent).isDirectory()) {
      throw new Error('المجلد الأب غير موجود؛ أنشئ المجلد أولًا.')
    }
    const parentReal = fs.realpathSync(parent)
    if (!insideRoot(parentReal)) throw new Error('المجلد الأب خارج مجلد البوت.')
    if (fs.existsSync(target) && fs.lstatSync(target).isSymbolicLink()) {
      throw new Error('روابط الملفات الرمزية غير مسموحة.')
    }
  }
  return target
}

function makeBackup(target) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true })
  const rel = relativeName(target)
  const hash = crypto.createHash('sha256').update(rel).digest('hex').slice(0, 16)
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = path.join(BACKUP_DIR, `${stamp}-${hash}.bak`)
  fs.copyFileSync(target, backupPath)
  fs.writeFileSync(`${backupPath}.json`, JSON.stringify({ originalPath: rel, createdAt: new Date().toISOString() }, null, 2))
  return backupPath
}

function getQuotedDocument(message) {
  const quoted = message?.quoted
  const doc = quoted?.message?.documentMessage ||
    quoted?.message?.documentWithCaptionMessage?.message?.documentMessage || null
  return { quoted, doc }
}

async function readQuotedBuffer(quoted, doc) {
  try {
    if (typeof quoted?.download === 'function') return await quoted.download()
  } catch {}
  const stream = await downloadContentFromMessage(doc, 'document')
  const chunks = []
  for await (const chunk of stream) chunks.push(chunk)
  return Buffer.concat(chunks)
}

async function sendCodePreview(conn, chat, quoted, relativePath, code) {
  const lines = code.split('\n')
  const blocks = []
  let current = ''
  let type = 1
  for (const line of lines) {
    const isComment = /^\s*(\/\/|\/\*|\*)/.test(line)
    const isDeclaration = /handler\.|\bexport\b/.test(line)
    const nextType = isComment ? 3 : isDeclaration ? 2 : (line.trim() ? 4 : 1)
    if (current && nextType !== type) {
      blocks.push({ highlightType: type, codeContent: current })
      current = ''
    }
    type = nextType
    current += line + '\n'
  }
  if (current) blocks.push({ highlightType: type, codeContent: current })

  const richMessage = {
    richResponseMessage: {
      messageType: 1,
      submessages: [
        { messageType: 2, messageText: `\n📄 *${relativePath}*\n📦 ${(Buffer.byteLength(code, 'utf8') / 1024).toFixed(2)} KB | 📝 ${lines.length} سطر\n` },
        { messageType: 2, messageText: '\n💻 *الكود:*\n' },
        { messageType: 5, codeMetadata: { codeLanguage: path.extname(relativePath).slice(1) || 'javascript', codeBlocks: blocks } }
      ],
      contextInfo: { isForwarded: true, forwardingScore: 1, forwardOrigin: 4 }
    }
  }
  try {
    const sent = await generateWAMessageFromContent(chat, { botForwardedMessage: { message: richMessage } }, {
      senderId: conn.user.id,
      userJid: conn.user.id,
      messageId: generateMessageIDV2(conn.user.id)
    })
    await conn.relayMessage(chat, sent.message, { messageId: sent.key.id })
  } catch {
    await conn.sendMessage(chat, {
      document: Buffer.from(code, 'utf8'),
      fileName: path.basename(relativePath),
      mimetype: 'text/plain'
    }, quoted ? { quoted } : {})
  }
}

const navigation = new Map()

function userKey(message) {
  const sender = message?.sender || message?.key?.participant || message?.key?.remoteJid || ''
  return `${message?.chat || message?.key?.remoteJid || ''}:${sender}`
}

async function showDirectory(conn, message, folder = '.') {
  const target = folder === '.' ? ROOT : resolveSafePath(folder)
  if (!fs.statSync(target).isDirectory()) throw new Error('المسار المحدد ليس مجلدًا.')
  const entries = fs.readdirSync(target, { withFileTypes: true })
    .filter(entry => !isBlockedRelative(relativeName(path.join(target, entry.name))))
    .filter(entry => !entry.isSymbolicLink())
    .slice(0, 100)
    .map(entry => ({
      name: entry.name,
      isDirectory: entry.isDirectory(),
      relativePath: relativeName(path.join(target, entry.name))
    }))
  const cards = [
    { type: 'title', text: `📂 مدير الملفات — ${folder === '.' ? 'مجلد البوت الرئيسي' : folder}` },
    { type: 'divider' }
  ]
  if (folder !== '.') cards.push({ type: 'info', label: '0', value: 'رجوع للمجلد السابق' })
  if (!entries.length) cards.push({ type: 'line', text: 'المجلد فارغ.' })
  entries.forEach((entry, index) => cards.push({
    type: 'line',
    text: `${index + 1}. ${entry.isDirectory ? '📁' : '📄'} ${entry.name}${entry.isDirectory ? '/' : ''}`
  }))
  cards.push({ type: 'divider' }, { type: 'line', text: 'ردّ على هذه الرسالة برقم العنصر لفتحه.' })
  const sent = await conn.sendMessage(message.chat, { text: theme.build(cards) }, { quoted: message })
  const key = userKey(message)
  navigation.set(key, { chat: message.chat, folder, entries, messageId: sent?.key?.id })
  if (navigation.size > 100) navigation.delete(navigation.keys().next().value)
  return sent
}

async function handleNumberedReply(message, conn) {
  const numberText = String(message?.text || message?.body || '').trim()
  if (!/^\d+$/.test(numberText)) return false
  const quotedId = message?.quoted?.key?.id || message?.message?.extendedTextMessage?.contextInfo?.stanzaId
  if (!quotedId) return false
  const key = userKey(message)
  const state = navigation.get(key)
  if (!state || state.messageId !== quotedId || state.chat !== message.chat) return false
  const number = Number(numberText)
  if (number === 0 && state.folder !== '.') {
    const parent = path.dirname(state.folder)
    await showDirectory(conn, message, parent === '.' ? '.' : parent)
    return true
  }
  const selected = state.entries[number - 1]
  if (!selected) {
    await conn.sendMessage(message.chat, { text: '❌ الرقم غير موجود في القائمة. ردّ على آخر قائمة برقم صحيح.' }, { quoted: message })
    return true
  }
  if (selected.isDirectory) {
    await showDirectory(conn, message, selected.relativePath)
    return true
  }
  const target = resolveSafePath(selected.relativePath)
  const st = fs.statSync(target)
  if (!st.isFile()) throw new Error('العنصر المحدد ليس ملفًا.')
  if (st.size > MAX_FILE_SIZE) throw new Error('الملف أكبر من الحد المسموح (10 ميجابايت).')
  const data = fs.readFileSync(target)
  navigation.delete(key)
  const ext = path.extname(target).toLowerCase()
  if (CODE_EXTENSIONS.has(ext) && data.length <= 100000) {
    await sendCodePreview(conn, message.chat, message, selected.relativePath, data.toString('utf8'))
  } else if (TEXT_EXTENSIONS.has(ext) && data.length <= 6000) {
    await conn.sendMessage(message.chat, { text: `📄 *${selected.relativePath}*\n\n${data.toString('utf8')}` }, { quoted: message })
  } else {
    await conn.sendMessage(message.chat, { document: data, fileName: path.basename(target), mimetype: 'application/octet-stream' }, { quoted: message })
  }
  return true
}

const helpText = (prefix = '.') => theme.build([
  { type: 'title', text: '🗂️ مدير ملفات البوت' },
  { type: 'divider' },
  { type: 'info', label: '📂 التصفح', value: `${prefix}ملف لست — عرض الملفات مرقمة؛ ردّ برقم للدخول أو الفتح` },
  { type: 'info', label: '📁 فتح مجلد', value: `${prefix}ملف عرض core — عرض محتوياته` },
  { type: 'info', label: '💻 عرض كود', value: `${prefix}ملف عرض index` },
  { type: 'info', label: '📥 تنزيل', value: `${prefix}ملف تحميل index` },
  { type: 'info', label: '✏️ حفظ/استبدال', value: `ردّ على الملف أو الكود: ${prefix}ملف حفظ index تأكيد` },
  { type: 'info', label: '🗑️ حذف', value: `${prefix}ملف حذف index تأكيد` },
  { type: 'info', label: '↩️ استعادة نسخة', value: `${prefix}ملف استعادة <معرّف النسخة> تأكيد` },
  { type: 'divider' },
  { type: 'warning', text: 'المالك فقط. امتداد .js اختياري. ملفات الأسرار والجلسات محمية.' }
])

let handler = async (m, { conn, args = [], usedPrefix = '.' }) => {
  const action = String(args[0] || '').toLowerCase()
  const input = args.slice(1).join(' ').trim()
  const reply = (text, extra = {}) => conn.sendMessage(m.chat, { text }, { quoted: m, ...extra })

  if (!action || /^(مساعدة|help)$/i.test(action)) return reply(helpText(usedPrefix))

  try {
    if (/^(قائمة|لست|list)$/i.test(action)) {
      return await showDirectory(conn, m, input || '.')
    }

    if (/^(عرض|تحميل|تنزيل|download|show)$/i.test(action)) {
      if (!input) return reply('اكتب المسار، مثال: .ملف تحميل index (امتداد .js اختياري)')
      const target = resolveSafePath(input)
      const targetStat = fs.statSync(target)
      if (targetStat.isDirectory()) return await showDirectory(conn, m, relativeName(target))
      if (!targetStat.isFile()) return reply('❌ المسار ليس ملفًا أو مجلدًا صالحًا.')
      const st = targetStat
      if (st.size > MAX_FILE_SIZE) return reply('❌ الملف أكبر من الحد المسموح (10 ميجابايت).')
      const data = fs.readFileSync(target)
      const fileName = path.basename(target)
      const ext = path.extname(target).toLowerCase()
      if (/^(عرض|show)$/i.test(action) && CODE_EXTENSIONS.has(ext) && data.length <= 100000) {
        return await sendCodePreview(conn, m.chat, m, relativeName(target), data.toString('utf8'))
      }
      if (/^(عرض|show)$/i.test(action) && TEXT_EXTENSIONS.has(ext) && data.length <= 6000) {
        return reply(`📄 *${relativeName(target)}*\n\n${data.toString('utf8')}`)
      }
      return conn.sendMessage(m.chat, {
        document: data,
        fileName,
        mimetype: 'application/octet-stream'
      }, { quoted: m })
    }

    if (/^(حذف|delete|del)$/i.test(action)) {
      const parts = args.slice(1)
      if (parts.at(-1) !== 'تأكيد') return reply('للتأكيد أعد الأمر بهذا الشكل:\n.ملف حذف <المسار> تأكيد')
      const rel = parts.slice(0, -1).join(' ').trim()
      const target = resolveSafePath(rel, { mutate: true })
      if (!fs.statSync(target).isFile()) return reply('❌ الحذف متاح للملفات فقط، وليس للمجلدات.')
      const backup = makeBackup(target)
      fs.unlinkSync(target)
      if (global.plugins) delete global.plugins[path.basename(target)]
      return reply(`✅ تم حذف *${rel}* بعد حفظ نسخة احتياطية.\nمعرّف النسخة: ${path.basename(backup)}`)
    }

    if (/^(حفظ|استبدال|كتابة|save|replace)$/i.test(action)) {
      const parts = args.slice(1)
      if (parts.at(-1) !== 'تأكيد') return reply('للتأكيد أعد الأمر بهذا الشكل:\nردّ على ملف أو كود ثم اكتب: .ملف حفظ <المسار> تأكيد')
      const rel = parts.slice(0, -1).join(' ').trim()
      const target = resolveSafePath(rel, { mustExist: false, mutate: true })
      const { quoted, doc } = getQuotedDocument(m)
      let buffer
      if (doc) {
        buffer = await readQuotedBuffer(quoted, doc)
      } else {
        const code = quoted?.text || quoted?.body || ''
        if (!code.trim()) return reply('❌ لازم ترد على ملف نصي أو رسالة فيها الكود المطلوب حفظه.')
        if (!TEXT_EXTENSIONS.has(path.extname(target).toLowerCase())) {
          return reply('❌ للملفات غير النصية، أرسلها كمستند ثم رد عليها بأمر الحفظ.')
        }
        buffer = Buffer.from(code, 'utf8')
      }
      if (buffer.length > MAX_FILE_SIZE) return reply('❌ الحد الأقصى للحفظ 10 ميجابايت.')
      const hadExisting = fs.existsSync(target)
      const backupPath = hadExisting ? makeBackup(target) : null
      const temp = `${target}.file-manager-${Date.now()}.tmp`
      fs.writeFileSync(temp, buffer, { flag: 'wx' })
      fs.renameSync(temp, target)
      return reply(`✅ تم حفظ *${rel}*${backupPath ? `\nنسخة الاستعادة: .ملف استعادة ${path.basename(backupPath)} تأكيد` : ''}`)
    }

    if (/^(استعادة|restore)$/i.test(action)) {
      const parts = args.slice(1)
      if (parts.at(-1) !== 'تأكيد') return reply('للتأكيد أعد الأمر بهذا الشكل:\n.ملف استعادة <معرّف النسخة> تأكيد')
      const backupName = parts.slice(0, -1).join(' ').trim()
      if (!/^[0-9TZ.\-]+-[a-f0-9]{16}\.bak$/i.test(backupName)) return reply('❌ معرّف النسخة غير صالح.')
      const backupPath = path.join(BACKUP_DIR, backupName)
      const metaPath = `${backupPath}.json`
      if (!fs.existsSync(backupPath) || !fs.existsSync(metaPath)) return reply('❌ النسخة الاحتياطية غير موجودة.')
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
      const target = resolveSafePath(meta.originalPath, { mustExist: false })
      if (fs.existsSync(target)) makeBackup(target)
      fs.copyFileSync(backupPath, target)
      return reply(`✅ تمت استعادة *${meta.originalPath}* من النسخة ${backupName}.`)
    }

    return reply(helpText(usedPrefix))
  } catch (error) {
    return reply(`❌ ${error.message || 'تعذر تنفيذ العملية.'}`)
  }
}

handler.help = ['ملف']
handler.tags = ['owner']
handler.command = /^(ملف|file|files)$/i
handler.owner = true
handler.before = async (m, { conn, isOwner }) => {
  if (!isOwner) return false
  try { return await handleNumberedReply(m, conn) }
  catch (error) {
    await conn.sendMessage(m.chat, { text: `❌ ${error.message || 'تعذر فتح العنصر.'}` }, { quoted: m })
    return true
  }
}
export default handler