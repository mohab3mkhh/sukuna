// plugins/حالة.js — حالة البوت: مدة التشغيل، الرام، السرعة، عدد الجروبات والأوامر
import os from 'os'

const OWNER_ONLY = true   // خليها false لو عايزه للكل

const fmtDur = s => {
    s = Math.floor(s)
    const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60), sec = s % 60
    return [d && `${d} يوم`, h && `${h} ساعة`, m && `${m} دقيقة`, `${sec} ثانية`].filter(Boolean).join(' و ')
}
const mb = b => (b / 1048576).toFixed(0)

let handler = async (m, { conn, isROwner, isOwner }) => {
    if (OWNER_ONLY && !isROwner && !isOwner) return conn.sendMessage(m.chat, { text: '❌ الأمر ده للمطور فقط.' }, { quoted: m })

    // قياس السرعة: وقت إرسال رسالة
    const t0 = Date.now()
    let sent
    try { sent = await conn.sendMessage(m.chat, { text: '⏳ جاري القياس...' }, { quoted: m }) } catch {}
    const ping = Date.now() - t0

    const db = global.db?.data || {}
    const chats = Object.keys(db.chats || {})
    const groups = chats.filter(j => j.endsWith('@g.us')).length
    const privates = chats.length - groups
    const users = Object.values(db.users || {})
    const cmds = users.reduce((s, u) => s + (u?.commands || 0), 0)
    const mem = process.memoryUsage()
    const load = os.loadavg()
    const now = new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' })

    const text =
`╭━━━〔 📊 *حالة البوت* 〕━━━⬣
┃ 🟢 *الحالة:* شغّال
┃ ⏱️ *مدة التشغيل:* ${fmtDur(process.uptime())}
┃ ⚡ *السرعة:* ${ping}ms
┃
┃ 💾 *الرام (البوت):* ${mb(mem.rss)}MB
┃ 🧠 *Heap:* ${mb(mem.heapUsed)} / ${mb(mem.heapTotal)}MB
┃ 🖥️ *المعالج:* ${os.cpus().length} نواة | حمل ${load[0].toFixed(2)}
┃
┃ 👥 *الجروبات:* ${groups}
┃ 💬 *الخاص:* ${privates}
┃ 🙋 *المستخدمين:* ${users.length}
┃ ⌨️ *الأوامر المنفذة:* ${cmds}
┃ 🧩 *البلجنز:* ${Object.keys(global.plugins || {}).length}
┃
┃ 🟩 *Node:* ${process.version}
┃ 🕒 *الوقت:* ${now}
╰━━━━━━━━━━━━━━⬣
> ⛩️ SUKUNA BOT ⛩️`

    // نعدّل الرسالة الأولى لو أمكن، وإلا نبعت جديدة
    try {
        if (!sent?.key) throw new Error('no key')
        await conn.sendMessage(m.chat, { text, edit: sent.key })
    } catch {
        await conn.sendMessage(m.chat, { text }, { quoted: m })
    }
}

handler.help = ['حالة']
handler.tags = ['main']
handler.command = /^(حالة|حاله|status|ping|بينج)$/i

export default handler