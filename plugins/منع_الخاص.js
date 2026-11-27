// plugins/منع_الخاص.js
// 🔕 .اشغل  أو  .منع_الخاص اون  ← البوت يتجاهل الخاص تماماً (مايقراش الرسايل ولا يرد ولا أي حاجة)
// 🔔 .افصل  أو  .منع_الخاص اوف  ← يرجع يرد في الخاص عادي
//    .منع_الخاص                 ← يعرض الحالة
// المالك بس. المالك نفسه مستثنى (يقدر يستخدم البوت في الخاص حتى لو مفعّل).
// الحالة بتتحفظ في database.json (على الـ Volume) فمش بتتصفّر بعد Deploy/Restart، والافتراضي: شغّال.
// التجاهل الفعلي: index.js (global.shouldIgnorePrivate) + handler.js (global.privateBlock)

import fs from 'fs'
import path from 'path'

const FILE = path.join(process.cwd(), 'database', 'privateblock.json')
const OWNER_NUMS = ['201036547166', '201515640916']

// الحالة المحفوظة (افتراضي شغّال)
function loadState() {
  const saved = global.db?.data?.privateBlockEnabled
  if (typeof saved === 'boolean') return saved
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')).enabled === true } catch {}
  return true
}

async function save(enabled) {
  let ok = false
  try { if (global.db?.data) { global.db.data.privateBlockEnabled = enabled; await global.db.write?.(); ok = true } } catch {}
  try { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify({ enabled }, null, 2)) } catch {}
  return ok
}

// handler.js بيقرا global.privateBlock.enabled — بنحدّثه بالحالة المحفوظة
if (!global.privateBlock) global.privateBlock = { enabled: true }
global.privateBlock.enabled = loadState()

// ✅ index.js بيستخدمها: يتجاهل الرسالة قبل ما تتقرا أو تتسجل (خاص من رقم عادي، غير المالك)
global.shouldIgnorePrivate = (msg) => {
  try {
    if (!global.privateBlock?.enabled) return false
    const jid = msg?.key?.remoteJid
    if (!jid || !jid.endsWith('@s.whatsapp.net')) return false   // LID وغيره: handler.js هو اللي يقرر
    if (msg.key.fromMe) return false
    const n = jid.split('@')[0].split(':')[0].replace(/\D/g, '')
    const owners = [...OWNER_NUMS, ...(global.owners || []).map(o => String(Array.isArray(o) ? o[0] : o).replace(/\D/g, ''))]
    return !owners.includes(n)
  } catch { return false }
}

const ON = ['on', 'اون', 'تشغيل', 'فعل', '1']
const OFF = ['off', 'اوف', 'ايقاف', 'إيقاف', 'وقف', 'فصل', '0']

const handler = async (m, { conn, args, command }) => {
  const cmd = String(command || '').toLowerCase()
  const arg = cmd === 'اشغل' ? 'on' : cmd === 'افصل' ? 'off' : String(args?.[0] || '').toLowerCase()
  const st = global.privateBlock

  if (ON.includes(arg)) {
    st.enabled = true
    const saved = await save(true)
    return conn.sendMessage(m.chat, {
      text: `🔕 *تم تفعيل منع الخاص*\nالبوت هيتجاهل الخاص تماماً (مايقراش ولا يرد) — غيرك.${saved ? '' : '\n⚠️ مقدرتش أحفظ الحالة في قاعدة البيانات.'}\n\n> ⛩️ SUKUNA BOT ⛩️`,
    }, { quoted: m })
  }

  if (OFF.includes(arg)) {
    st.enabled = false
    const saved = await save(false)
    return conn.sendMessage(m.chat, {
      text: `🔔 *تم إيقاف منع الخاص*\nالبوت هيرد في الخاص عادي.${saved ? '' : '\n⚠️ مقدرتش أحفظ الحالة في قاعدة البيانات.'}\n\n> ⛩️ SUKUNA BOT ⛩️`,
    }, { quoted: m })
  }

  return conn.sendMessage(m.chat, {
    text: `🛡️ *منع الخاص*\n\nالحالة: ${st.enabled ? '✅ شغّال (مفيش قراءة ولا رد في الخاص)' : '❌ مقفول'}\n\n• .اشغل\n• .افصل\n\n> ⛩️ SUKUNA BOT ⛩️`,
  }, { quoted: m })
}

handler.command = /^(منع_الخاص|منع-الخاص|blockprivate|اشغل|افصل)$/i
handler.rowner = true
handler.tags = ['owner']
handler.help = ['اشغل', 'افصل', 'منع_الخاص اون/اوف']

export default handler