// plugins/منع_الخاص.js
// 🔕 .منع_الخاص اون  ← البوت مايردش خالص على الرسائل الخاصة (ولا تحذير ولا أي حاجة)
// 🔔 .منع_الخاص اوف  ← يرجع يرد في الخاص عادي
//    .منع_الخاص       ← يعرض الحالة
// المالك بس. المالك نفسه مستثنى (يقدر يستخدم البوت في الخاص حتى لو مفعّل).
// التعطيل الفعلي بيحصل في handler.js (قبل ما أي أمر يشتغل)، وده بس زرار التشغيل والإيقاف.

import fs from 'fs'
import path from 'path'

const FILE = path.join(process.cwd(), 'database', 'privateblock.json')

function save(enabled) {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true })
    fs.writeFileSync(FILE, JSON.stringify({ enabled }, null, 2))
    return true
  } catch (e) { console.error('[منع_الخاص] حفظ:', e.message); return false }
}

if (!global.privateBlock) {
  try { global.privateBlock = { enabled: JSON.parse(fs.readFileSync(FILE, 'utf8')).enabled === true } }
  catch { global.privateBlock = { enabled: false } }
}

const ON = ['on', 'اون', 'تشغيل', 'فعل', '1']
const OFF = ['off', 'اوف', 'ايقاف', 'إيقاف', 'وقف', 'فصل', '0']

const handler = async (m, { conn, args }) => {
  const arg = String(args?.[0] || '').toLowerCase()
  const st = global.privateBlock

  if (ON.includes(arg)) {
    st.enabled = true
    const saved = save(true)
    return conn.sendMessage(m.chat, {
      text: `🔕 *تم تفعيل منع الخاص*\nالبوت مش هيرد على أي حد في الخاص (غيرك).${saved ? '' : '\n⚠️ مقدرتش أحفظ الحالة، هترجع مقفولة بعد الريستارت.'}\n\n> ⛩️ SUKUNA BOT ⛩️`,
    }, { quoted: m })
  }

  if (OFF.includes(arg)) {
    st.enabled = false
    const saved = save(false)
    return conn.sendMessage(m.chat, {
      text: `🔔 *تم إيقاف منع الخاص*\nالبوت هيرد في الخاص عادي.${saved ? '' : '\n⚠️ مقدرتش أحفظ الحالة.'}\n\n> ⛩️ SUKUNA BOT ⛩️`,
    }, { quoted: m })
  }

  return conn.sendMessage(m.chat, {
    text: `🛡️ *منع الخاص*\n\nالحالة: ${st.enabled ? '✅ شغّال (مفيش رد في الخاص)' : '❌ مقفول'}\n\n• .منع_الخاص اون\n• .منع_الخاص اوف\n\n> ⛩️ SUKUNA BOT ⛩️`,
  }, { quoted: m })
}

handler.command = /^(منع_الخاص|منع-الخاص|blockprivate)$/i
handler.rowner = true
handler.tags = ['owner']
handler.help = ['منع_الخاص اون/اوف']

export default handler