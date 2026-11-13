/**
 * plugins/تاريخ-الادمن.js
 * يسجل كل عمليات تعيين/إزالة الأدمن في الجروب
 * ويعرضها بالأمر .تاريخ-الادمن (للأدمنية فقط)
 *
 * v2: يدعم Baileys 7 (participants ممكن تبقى objects) + حماية من البيانات التالفة
 */

import fs from 'fs'
import path from 'path'

const DB_PATH = path.join(process.cwd(), 'adminHistory.json')

function loadDB() {
  try {
    const data = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'))
    return data && typeof data === 'object' ? data : {}
  } catch {
    return {}
  }
}

function saveDB(db) {
  try { fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2)) } catch (e) {
    console.error('[AdminHistory] save fail:', e.message)
  }
}

// يحوّل أي شكل (string / object) لـ JID نصي
const jidOf = (x) => {
  if (!x) return null
  if (typeof x === 'string') return x
  if (typeof x === 'object') {
    const v = x.id || x.jid || x.phoneNumber || x.lid || null
    return typeof v === 'string' ? v : null
  }
  return null
}

const numOf = (jid) => String(jid || '').split('@')[0].split(':')[0]

// ══════════════════════════════════════════════════
//  مستمع لتحديثات الأعضاء (تعيين/إزالة أدمن)
// ══════════════════════════════════════════════════
function attachListener(conn) {
  if (!conn?.ev || conn._adminHistoryAttached) return
  conn._adminHistoryAttached = true

  conn.ev.on('group-participants.update', async (update) => {
    try {
      const { id: groupId, participants = [], action, author } = update
      if (action !== 'promote' && action !== 'demote') return

      const db = loadDB()
      if (!Array.isArray(db[groupId])) db[groupId] = []

      const by = jidOf(author)

      for (const p of participants) {
        const target = jidOf(p)
        if (!target) continue
        db[groupId].push({ target, action, by, time: Date.now() })
      }

      if (db[groupId].length > 200) db[groupId] = db[groupId].slice(-200)
      saveDB(db)
    } catch (e) {
      console.error('[AdminHistory] listener error:', e.message)
    }
  })
}

// مؤقت واحد فقط حتى مع إعادة تحميل الإضافة
if (global._adminHistoryTimer) clearInterval(global._adminHistoryTimer)
global._adminHistoryTimer = setInterval(() => {
  if (global.conn) attachListener(global.conn)
}, 5000)

if (global.conn) attachListener(global.conn)

// ══════════════════════════════════════════════════
//  الأمر - للأدمنية فقط
// ══════════════════════════════════════════════════
const FOOTER = `╔═══━━━══━━━❪⚡️❫━━━══━━━═══╗
║  ❪🔥❫ *𝑺𝑼𝑲𝑼𝑵𝑨 𝑩𝑶𝑻*        ║
║  ❪👹❫ *𝑲𝑰𝑵𝑮 𝑶𝑭 𝑪𝑼𝑹𝑺𝑬𝑺*     ║
╚═══━━━══━━━❪⚡️❫━━━══━━━═══╝`

const handler = async (m, { conn, isAdmin, isROwner }) => {
  try {
    if (!isAdmin && !isROwner) {
      return m.reply(`╔═══━━━══━━━❪🚫❫━━━══━━━═══╗
║  ❪⛔️❫ *هَذَا الأَمْرُ*        ║
║  ❪👑❫ *لِلْمُشْرِفِينَ فَقَط* ║
╚═══━━━══━━━❪🚫❫━━━══━━━═══╝

╔═══━━━══━━━❪🩸❫━━━══━━━═══╗
║  ❪👹❫ *أَنْتَ لَسْتَ مُشْرِفًا* ║
║  ❪🔥❫ *لَا تَقْرَبْ مِمَّا لَا يَخُصُّكَ* ║
╚═══━━━══━━━❪🩸❫━━━══━━━═══╝

${FOOTER}`)
    }

    if (!m.isGroup) {
      return m.reply(`╔═══━━━══━━━❪🚫❫━━━══━━━═══╗
║  ❪⛔️❫ *هَذَا الأَمْرُ*        ║
║  ❪👥❫ *لِلْمَجْمُوعَاتِ فَقَط* ║
╚═══━━━══━━━❪🚫❫━━━══━━━═══╝

${FOOTER}`)
    }

    const groupId = m.chat
    const db = loadDB()
    const history = Array.isArray(db[groupId]) ? db[groupId] : []

    if (!history.length) {
      return m.reply(`╔═══━━━══━━━❪📭❫━━━══━━━═══╗
║  ❪📭❫ *لَا يُوجَدُ سِجِلٌّ*    ║
║  ❪📜❫ *بَعْدُ لِهَذَا الجَّرُوبِ* ║
╚═══━━━══━━━❪📭❫━━━══━━━═══╝

╔═══━━━══━━━❪🩸❫━━━══━━━═══╗
║  ❪👹❫ *السِّجِلُ يَبْدَأُ*      ║
║  ❪🔥❫ *مِنْ لَحْظَةِ تَشْغِيلِ هَذَا الأَمْرِ* ║
╚═══━━━══━━━❪🩸❫━━━══━━━═══╝

${FOOTER}`)
    }

    const recent = history.slice(-30).reverse()
    const mentions = new Set()
    const lines = []

    for (const entry of recent) {
      // تخطّي أي سجل تالف (قديم محفوظ كـ object مثلاً)
      const target = jidOf(entry?.target)
      if (!target) continue

      const by = jidOf(entry.by)
      const date = new Date(entry.time)
      const dateStr = date.toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' })
      const actionText = entry.action === 'promote'
        ? '✅ *تَمَّ تَعْيِينُهُ أَدْمِن*'
        : '❌ *تَمَّ إِزَالَتُهُ مِنَ الأَدْمِن*'

      mentions.add(target)
      let byText = '❓ غَيْرُ مَعْرُوف (تَحْدِيثٌ تِلْقَائِيٌّ مِنْ وَاتسَاب)'
      if (by) {
        mentions.add(by)
        byText = `@${numOf(by)}`
      }

      lines.push(`┏━━━━━━━━━━━━━━━━━━━┓
${actionText}
┣━━━━━━━━━━━━━━━━━━━┫
👤 *الشَّخْصُ:* @${numOf(target)}
👮 *بِوَاسِطَةِ:* ${byText}
🕐 *الوَقْتُ:* ${dateStr}
┗━━━━━━━━━━━━━━━━━━━┛`)
    }

    if (!lines.length) {
      return m.reply('📭 السجل موجود بس بياناته قديمة/تالفة. هيتسجل من جديد مع أول تعيين أو إزالة أدمن.')
    }

    return await conn.sendMessage(groupId, {
      text: `╔═══━━━══━━━❪👑❫━━━══━━━═══╗
║  ❪📜❫ *𝑨𝑫𝑴𝑰𝑵𝑺*              ║
║  ❪⚔️❫ *سِجِلُّ التَّعْدِيلَات*   ║
╚═══━━━══━━━❪👑❫━━━══━━━═══╝

╔═══━━━══━━━❪🩸❫━━━══━━━═══╗
║  ❪👑❫ *لِلْمُشْرِفِينَ فَقَط* ║
║  ──━━━══━━━──                  ║
║  ❪📊❫ *آخِر ${lines.length} تَعْدِيل* ║
║  ❪⏳❫ *مِنْذُ تَشْغِيلِ النِّظَامِ* ║
╚═══━━━══━━━❪🩸❫━━━══━━━═══╝

${lines.join('\n\n')}

╔═══━━━══━━━❪👑❫━━━══━━━═══╗
║  ❪🩸❫ *اَلْقُوَّةُ لَا تَأْتِي* ║
║  ❪🔥❫ *إِلَّا بِالسَّيْطَرَةِ*  ║
╚═══━━━══━━━❪👑❫━━━══━━━═══╝

${FOOTER}`,
      mentions: [...mentions]
    }, { quoted: m })

  } catch (e) {
    console.error('[AdminHistory] command error:', e?.stack || e)
    return m.reply(`⚠️ حصل خطأ في الأمر: ${String(e?.message || e).slice(0, 120)}`).catch(() => {})
  }
}

handler.help    = ['تاريخ-الادمن']
handler.tags    = ['group']
handler.command = /^(تاريخ-الادمن|تاريخ_الادمن|سجل-الادمن|adminhistory)$/i

export default handler