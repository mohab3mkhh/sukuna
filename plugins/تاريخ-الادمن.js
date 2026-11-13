/**
 * plugins/تاريخ-الادمن.js
 * يسجل كل عمليات تعيين/إزالة الأدمن في الجروب
 */

import fs from 'fs'
import path from 'path'

const DB_PATH = path.join(process.cwd(), 'adminHistory.json')

function loadDB() {
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'))
  } catch {
    return {}
  }
}

function saveDB(db) {
  try { fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2)) } catch (e) {
    console.error('[AdminHistory] save fail:', e.message)
  }
}

// ══════════════════════════════════════════════════
//  مستمع لتحديثات الأعضاء
// ══════════════════════════════════════════════════
function attachListener(conn) {
  if (!conn || conn._adminHistoryAttached) return
  conn._adminHistoryAttached = true

  conn.ev.on('group-participants.update', async (update) => {
    try {
      const { id: groupId, participants, action, author } = update
      if (action !== 'promote' && action !== 'demote') return

      const db = loadDB()
      if (!db[groupId]) db[groupId] = []

      for (const p of participants) {
        db[groupId].push({
          target: p,
          action,
          by: author || null,
          time: Date.now()
        })
      }

      if (db[groupId].length > 200) db[groupId] = db[groupId].slice(-200)
      saveDB(db)
      console.log(`[AdminHistory] Saved ${action} for ${groupId}`)
    } catch (e) {
      console.error('[AdminHistory] listener error:', e.message)
    }
  })
}

// ✅ ربط الـ listener بـ conn الحالي
if (global.conn) {
  attachListener(global.conn)
}

// ✅ التحقق كل 5 ثواني لو conn اتغير
setInterval(() => {
  if (global.conn && !global.conn._adminHistoryAttached) {
    attachListener(global.conn)
  }
}, 5000)

// ══════════════════════════════════════════════════
//  الأمر
// ══════════════════════════════════════════════════
const handler = async (m, { conn, isAdmin, isROwner }) => {
  // ✅ ربط الـ listener لو لسه مش مربوط
  if (conn && !conn._adminHistoryAttached) {
    attachListener(conn)
  }

  if (!isAdmin && !isROwner) {
    return m.reply(`╔═══━━━══━━━❪🚫❫━━━══━━━═══╗
║  ❪⛔️❫ *هَذَا الأَمْرُ لِلْمُشْرِفِينَ فَقَط* ║
╚═══━━━══━━━❪🚫❫━━━══━━━═══╝

╔═══━━━══━━━❪⚡️❫━━━══━━━═══╗
║  ❪🔥❫ *𝑺𝑼𝑲𝑼𝑵𝑨 𝑩𝑶𝑻*        ║
╚═══━━━══━━━❪⚡️❫━━━══━━━═══╝`)
  }

  if (!m.isGroup) {
    return m.reply(`╔═══━━━══━━━❪🚫❫━━━══━━━═══╗
║  ❪👥❫ *هَذَا الأَمْرُ لِلْمَجْمُوعَاتِ فَقَط* ║
╚═══━━━══━━━❪🚫❫━━━══━━━═══╝`)
  }

  const groupId = m.chat
  const db = loadDB()
  const history = db[groupId] || []

  if (!history.length) {
    return m.reply(`╔═══━━━══━━━❪📭❫━━━══━━━═══╗
║  ❪📭❫ *لَا يُوجَدُ سِجِلٌّ بَعْدُ* ║
║  ❪📜❫ *السِّجِلُ يَبْدَأُ مِنْ لَحْظَةِ تَشْغِيلِ النِّظَامِ* ║
╚═══━━━══━━━❪📭❫━━━══━━━═══╝

╔═══━━━══━━━❪⚡️❫━━━══━━━═══╗
║  ❪🔥❫ *𝑺𝑼𝑲𝑼𝑵𝑨 𝑩𝑶𝑻*        ║
╚═══━━━══━━━❪⚡️❫━━━══━━━═══╝`)
  }

  const recent = history.slice(-30).reverse()
  const mentions = new Set()

  const lines = recent.map(entry => {
    const date = new Date(entry.time)
    const dateStr = date.toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' })
    const actionText = entry.action === 'promote' ? '✅ *تَمَّ تَعْيِينُهُ أَدْمِن*' : '❌ *تَمَّ إِزَالَتُهُ مِنَ الأَدْمِن*'

    mentions.add(entry.target)
    let byText = '❓ غَيْرُ مَعْرُوف'
    if (entry.by) {
      mentions.add(entry.by)
      byText = `@${entry.by.split('@')[0]}`
    }

    return `┏━━━━━━━━━━━━━━━━━━━┓
${actionText}
┣━━━━━━━━━━━━━━━━━━━┫
👤 *الشَّخْصُ:* @${entry.target.split('@')[0]}
👮 *بِوَاسِطَةِ:* ${byText}
🕐 *الوَقْتُ:* ${dateStr}
┗━━━━━━━━━━━━━━━━━━━┛`
  })

  return conn.sendMessage(groupId, {
    text: `╔═══━━━══━━━❪👑❫━━━══━━━═══╗
║  ❪📜❫ *سِجِلُّ التَّعْدِيلَاتِ* ║
╚═══━━━══━━━❪👑❫━━━══━━━═══╝

╔═══━━━══━━━❪📊❫━━━══━━━═══╗
║  ❪📊❫ *آخِر ${recent.length} تَعْدِيل* ║
╚═══━━━══━━━❪📊❫━━━══━━━═══╝

${lines.join('\n\n')}

╔═══━━━══━━━❪⚡️❫━━━══━━━═══╗
║  ❪🔥❫ *𝑺𝑼𝑲𝑼𝑵𝑨 𝑩𝑶𝑻*        ║
║  ❪👹❫ *𝑲𝑰𝑵𝑮 𝑶𝑭 𝑪𝑼𝑹𝑺𝑬𝑺*     ║
╚═══━━━══━━━❪⚡️❫━━━══━━━═══╝`,
    mentions: [...mentions]
  }, { quoted: m })
}

handler.help = ['تاريخ-الادمن']
handler.tags = ['group']
handler.command = /^(تاريخ-الادمن|تاريخ_الادمن|سجل-الادمن|adminhistory)$/i

export default handler