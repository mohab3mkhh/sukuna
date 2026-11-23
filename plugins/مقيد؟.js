// plugins/restricted-check.js
import fs from 'fs'
import path from 'path'

const DEVS = ['201036547166', '201066036607']
const DB_PATH = path.join(process.cwd(), 'database', 'bot-restriction.json')

function load() {
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'))
  } catch {
    return { restricted: false, reasons: [] }
  }
}

function save(data) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true })
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2))
}

// استدعيها من أي بلجن لما يفشل الانضمام بلينك أو إضافة عضو
export function markRestricted(reason = 'فشل عملية مقيدة') {
  const db = load()
  const reasons = Array.from(new Set([...(db.reasons || []), reason]))
  save({ restricted: true, reasons })
}

function isDev(m) {
  if (m.fromMe) return true
  const sender = (m.sender || '').split('@')[0].split(':')[0]
  return DEVS.includes(sender)
}

let handler = async (m, { conn, command }) => {
  if (!isDev(m)) return m.reply('❌ الأمر ده للمطورين بس.')

  // تسجيل يدوي
  if (/^تقييد$/i.test(command)) {
    save({ restricted: true, reasons: ['تسجيل يدوي'] })
    return m.reply('🚫 تم تسجيل إن البوت مقيد.')
  }
  if (/^فك_التقييد$/i.test(command)) {
    save({ restricted: false, reasons: [] })
    return m.reply('✅ تم تسجيل إن البوت غير مقيد.')
  }

  try {
    await conn.sendMessage(m.chat, { react: { text: '⏳', key: m.key } })

    // فحص خفيف: هل الاتصال شغال وبيرد؟ (من غير إنشاء جروب)
    let connectionOk = true
    try {
      await conn.fetchPrivacySettings(true)
    } catch {
      connectionOk = false
    }

    const botNumber = conn.user.id.split(':')[0].split('@')[0]
    const { restricted, reasons = [] } = load()

    if (!connectionOk) {
      await conn.sendMessage(m.chat, { react: { text: '⚠️', key: m.key } })
      return conn.sendMessage(m.chat, {
        text: `⚠️ *مقدرتش أفحص الحالة*\n\nالاتصال بواتساب مش مستقر. جرب تاني بعد شوية.`
      }, { quoted: m })
    }

    if (restricted) {
      await conn.sendMessage(m.chat, { react: { text: '🚫', key: m.key } })
      await conn.sendMessage(m.chat, {
        text: `╔═══━━━━━━━━━━━━━━━╗
║  🚫 *حالة التقييد*  ║
╚═══━━━━━━━━━━━━━━━╝

📱 *الرقم:* +${botNumber}

❌ *الحالة:* مقيد

⚠️ *التفاصيل:*
${reasons.map(d => `• ${d}`).join('\n') || '• تسجيل يدوي'}

📋 *ماذا يعني هذا:*
• ✅ يقدر يتكلم في الجروبات الموجود فيها
• ✅ يقدر يرد على اللي كلمهم قبل كدا
• ❌ لا يمكن الانضمام للجروبات عبر الروابط
• ❌ لا يمكن تشغيل واتساب على برامج خارجية

💡 *الحل:* انتظر رفع التقييد من واتساب تلقائياً
🔁 لما يتفك اكتب *.فك_التقييد*`
      }, { quoted: m })
    } else {
      await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } })
      await conn.sendMessage(m.chat, {
        text: `╔═══━━━━━━━━━━━━━━━╗
║  ✅ *حالة التقييد*  ║
╚═══━━━━━━━━━━━━━━━╝

📱 *الرقم:* +${botNumber}

✅ *الحالة:* غير مقيد

🟢 *الصلاحيات:*
• ✅ يمكن الانضمام للجروبات عبر الروابط
• ✅ يمكن بدء محادثات جديدة
• ✅ يمكن إضافة أشخاص للمجموعات`
      }, { quoted: m })
    }
  } catch (err) {
    console.error('[Restrict Check Error]', err)
    await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } })
    await conn.sendMessage(m.chat, {
      text: `❌ *فشل فحص التقييد*\n\n📝 ${err.message}`
    }, { quoted: m })
  }
}

handler.help = ['مقيد؟', 'تقييد', 'فك_التقييد']
handler.tags = ['owner']
handler.command = /^(مقيد\?|مقيد؟|مقيد|restricted|تقييد|فك_التقييد)$/i

export default handler