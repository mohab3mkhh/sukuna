/**
 * plugins/تاريخ-الادمن.js
 * سجل تعديلات الأدمن
 */

import fs from 'fs'
import path from 'path'

const DB_PATH = path.join(process.cwd(), 'adminHistory.json')

// ✅ تخزين في الذاكرة عشان يشتغل حتى لو الملف فشل
if (!global._adminHistoryCache) global._adminHistoryCache = {}

function loadDB() {
  // ✅ استخدم الكاش الأول
  if (Object.keys(global._adminHistoryCache).length > 0) {
    return global._adminHistoryCache
  }
  
  try {
    const data = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'))
    global._adminHistoryCache = data
    return data
  } catch {
    return {}
  }
}

function saveDB(db) {
  // ✅ احفظ في الكاش
  global._adminHistoryCache = db
  
  // ✅ احفظ في الملف
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2))
  } catch (e) {
    console.error('[AdminHistory] save fail:', e.message)
  }
}

// ══════════════════════════════════════════════════
//  مستمع لتحديثات الأعضاء
// ══════════════════════════════════════════════════
function attachListener(conn) {
  if (!conn) return
  if (conn._adminHistoryAttached) return
  conn._adminHistoryAttached = true

  console.log('[AdminHistory] ✅ Listener attached')

  conn.ev.on('group-participants.update', async (update) => {
    try {
      console.log('[AdminHistory] 📥 Event received:', JSON.stringify(update))
      
      const { id: groupId, participants, action, author } = update
      
      if (action !== 'promote' && action !== 'demote') {
        console.log('[AdminHistory] ⏭️ Skipping action:', action)
        return
      }

      const db = loadDB()
      if (!db[groupId]) db[groupId] = []

      for (const p of participants) {
        db[groupId].push({
          target: p,
          action,
          by: author || null,
          time: Date.now()
        })
        console.log(`[AdminHistory] ✅ Saved: ${action} for ${p}`)
      }

      if (db[groupId].length > 200) db[groupId] = db[groupId].slice(-200)
      saveDB(db)
      
      console.log(`[AdminHistory] 📊 Total events in group: ${db[groupId].length}`)
    } catch (e) {
      console.error('[AdminHistory] ❌ Listener error:', e.message)
    }
  })
}

// ✅ ربط الـ listener
if (global.conn) attachListener(global.conn)
setInterval(() => {
  if (global.conn && !global.conn._adminHistoryAttached) {
    attachListener(global.conn)
  }
}, 5000)

// ══════════════════════════════════════════════════
//  الأمر
// ══════════════════════════════════════════════════
const handler = async (m, { conn, isAdmin, isROwner }) => {
  // ✅ تأكد إن الـ listener مربوط
  if (conn && !conn._adminHistoryAttached) {
    attachListener(conn)
  }

  if (!isAdmin && !isROwner) {
    return m.reply(`╔═══━━━══━━━❪🚫❫━━━══━━━═══╗
║  ❪⛔️❫ *هَذَا الأَمْرُ لِلْمُشْرِفِينَ فَقَط* ║
╚═══━━━══━━━❪🚫❫━━━══━━━═══╝`)
  }

  if (!m.isGroup) {
    return m.reply(`╔═══━━━══━━━❪🚫❫━━━══━━━═══╗
║  ❪👥❫ *هَذَا الأَمْرُ لِلْمَجْمُوعَاتِ فَقَط* ║
╚═══━━━══━━━❪🚫❫━━━══━━━═══╝`)
  }

  const groupId = m.chat
  const db = loadDB()
  const history = db[groupId] || []

  console.log(`[AdminHistory] 📋 Showing history for ${groupId}, events: ${history.length}`)

  if (!history.length) {
    return m.reply(`╔═══━━━══━━━❪📭❫━━━══━━━═══╗
║  ❪📭❫ *لَا يُوجَدُ سِجِلٌّ بَعْدُ* ║
╚═══━━━══━━━❪📭❫━━━══━━━═══╝

💡 *جرب:*
• ارفع حد أدمن
• انزل حد من الأدمن
• ثم اكتب الأمر تاني

╔═══━━━══━━━❪⚡️❫━━━══━━━═══╗
║  ❪🔥❫ *𝑺𝑼𝑲𝑼𝑵𝑨 𝑩𝑶𝑻*        ║
╚═══━━━══━━━❪⚡️❫━━━══━━━═══╝`)
  }

  const recent = history.slice(-30).reverse()
  const mentions = new Set()

  const lines = recent.map((entry, i) => {
    const date = new Date(entry.time)
    const dateStr = date.toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' })
    const actionText = entry.action === 'promote' ? '✅ *تَمَّ تَعْيِينُهُ أَدْمِن*' : '❌ *تَمَّ إِزَالَتُهُ مِنَ الأَدْمِن*'

    mentions.add(entry.target)
    let byText = '❓ غَيْرُ مَعْرُوف'
    if (entry.by) {
      mentions.add(entry.by)
      byText = `@${entry.by.split('@')[0]}`
    }

    return `┏━ ${i + 1} ━━━━━━━━━━━━━━┓
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

📊 *عَدَدُ التَّعْدِيلَاتِ:* ${history.length}
📋 *يُعْرَضُ:* آخِر ${recent.length}

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