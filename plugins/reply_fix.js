// plugins/0-reply-fix.js
// ⛩️ SUKUNA BOT - إصلاح ظهور الرسائل (m.reply / conn.reply / quoted)
//
// بيبعت الردود من غير quoted عشان تظهر للكل مش واتساب أعمال بس.
// مبيلمسش الأزرار نهائيًا.
// لو حبيت تشيله: امسح الملف وأعد تشغيل البوت.
// اسم الملف بيبدأ بـ 0 عشان يتحمّل قبل باقي البلجنز.

// الردود (m.reply / conn.reply): تتبعت من غير quoted
const FIX_REPLY = true
// أي sendMessage فيه { quoted } يتبعت من غير quoted
const STRIP_QUOTED = true

export function patchConn(conn) {
  if (!conn || conn.__replyFix) return
  conn.__replyFix = true

  const original = conn.sendMessage?.bind(conn)
  if (STRIP_QUOTED && typeof original === 'function') {
    conn.sendMessage = (jid, content, options) => {
      if (options && options.quoted) {
        options = { ...options }
        delete options.quoted
      }
      return original(jid, content, options)
    }
  }

  const originalReply = conn.reply?.bind(conn)
  if (FIX_REPLY && typeof originalReply === 'function') {
    conn.reply = async (jid, text = '', quoted, options = {}) => {
      if (typeof text === 'string' && text) {
        try {
          const content = { text }
          let mentions = options?.mentions || options?.contextInfo?.mentionedJid
          if (!Array.isArray(mentions) || !mentions.length) {
            mentions = [...text.matchAll(/@(\d{5,20})/g)].map(v => v[1] + '@s.whatsapp.net')
          }
          if (mentions.length) content.mentions = mentions
          return await conn.sendMessage(jid, content)
        } catch (e) {
          console.error('[reply-fix] فشل، بنبعت بالطريقة الأصلية:', e?.message)
        }
      }
      return originalReply(jid, text, quoted, options)
    }
  }

  console.log('✅ reply-fix: الردود هتظهر للكل')
}

// لو conn الرئيسي جاهز وقت التحميل
try { if (global.conn) patchConn(global.conn) } catch {}

let handler = m => m

handler.before = async function (m, { conn }) {
  patchConn(conn)
  return false
}

handler.command = /^__reply_fix_never__$/i

export default handler