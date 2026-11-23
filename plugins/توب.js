// plugins/توب.js — إحصائيات تفاعل الجروب
// .توب            ← أنشط 10 أعضاء (من أول ما البلجن اشتغل)
// .توب اليوم      ← أنشط النهارده
// .توب اسبوع      ← أنشط آخر 7 أيام
// .توب اقل        ← أقل الأعضاء تفاعلًا (بيشمل اللي ما كتبوش خالص) — مفيد لتنضيف الجروب
// ⚠️ العدّ بيبدأ من وقت تركيب البلجن (مش بيقدر يعرف الرسايل القديمة).

const TZ = 'Africa/Cairo'
const dayKey = (d = new Date()) => d.toLocaleDateString('en-CA', { timeZone: TZ })   // 2026-11-24
const digits = j => String(j || '').split('@')[0].split(':')[0].replace(/\D/g, '')
const MEDALS = ['🥇', '🥈', '🥉']

// ─── العدّاد: بيشتغل على كل رسالة في الجروبات ───
let handler = async (m, { conn, args, command, usedPrefix = '.' }) => {
    const reply = (t, mentions = []) => conn.sendMessage(m.chat, { text: t, mentions }, { quoted: m })
    if (!m.isGroup) return reply('❌ الأمر ده للجروبات بس.')

    const chat = global.db?.data?.chats?.[m.chat]
    const stats = chat?.stats || {}
    if (!Object.keys(stats).length) return reply('📊 لسه مفيش إحصائيات في الجروب ده، العدّ بدأ دلوقتي.')

    const mode = (args[0] || '').toLowerCase()
    const today = dayKey()
    const lastDays = n => Array.from({ length: n }, (_, i) => dayKey(new Date(Date.now() - i * 86400000)))
    const days7 = lastDays(7)

    const countOf = e => {
        if (['اليوم', 'today'].includes(mode)) return e.days?.[today] || 0
        if (['اسبوع', 'أسبوع', 'week'].includes(mode)) return days7.reduce((s, d) => s + (e.days?.[d] || 0), 0)
        return e.n || 0
    }
    const label = ['اليوم', 'today'].includes(mode) ? 'النهارده' : ['اسبوع', 'أسبوع', 'week'].includes(mode) ? 'آخر 7 أيام' : 'الإجمالي'
    const since = chat.statsSince ? new Date(chat.statsSince).toLocaleDateString('ar-EG', { timeZone: TZ }) : ''

    // أقل تفاعلًا
    if (['اقل', 'أقل', 'least', 'low'].includes(mode)) {
        let meta
        try { meta = await conn.groupMetadata(m.chat) } catch { return reply('⚠️ مقدرتش أجيب أعضاء الجروب.') }
        const byNum = new Map()
        for (const [jid, e] of Object.entries(stats)) byNum.set(digits(jid), e)
        const botNum = digits(conn.user?.jid || conn.user?.id)
        const rows = []
        for (const p of meta.participants || []) {
            const nums = [p.id, p.lid, p.phoneNumber, p.jid].map(digits).filter(Boolean)
            if (nums.includes(botNum)) continue
            const e = nums.map(n => byNum.get(n)).find(Boolean)
            rows.push({ jid: p.id, n: e ? e.n : 0, week: e ? days7.reduce((s, d) => s + (e.days?.[d] || 0), 0) : 0 })
        }
        rows.sort((a, b) => a.n - b.n)
        const low = rows.slice(0, 10)
        const text = `📉 *أقل ${low.length} أعضاء تفاعلًا*${since ? ` (من ${since})` : ''}\n\n` +
            low.map((r, i) => `${i + 1}. @${digits(r.jid)} — ${r.n} رسالة${r.n === 0 ? ' 😴' : ''}`).join('\n') +
            `\n\n👥 عدد الأعضاء: ${rows.length}\n💤 ما كتبوش خالص: ${rows.filter(r => r.n === 0).length}`
        return reply(text, low.map(r => r.jid))
    }

    const rows = Object.entries(stats).map(([jid, e]) => ({ jid, n: countOf(e) })).filter(r => r.n > 0).sort((a, b) => b.n - a.n)
    if (!rows.length) return reply(`📊 مفيش رسايل متسجلة (${label}).`)
    const total = rows.reduce((s, r) => s + r.n, 0)
    const top = rows.slice(0, 10)
    const text = `🏆 *أنشط الأعضاء — ${label}*${since && label === 'الإجمالي' ? ` (من ${since})` : ''}\n\n` +
        top.map((r, i) => `${MEDALS[i] || `${i + 1}.`} @${digits(r.jid)} — *${r.n}* رسالة (${Math.round(r.n / total * 100)}%)`).join('\n') +
        `\n\n💬 إجمالي الرسايل: ${total}\n📌 ${usedPrefix}${command} اقل ← الأقل تفاعلًا`
    return reply(text, top.map(r => r.jid))
}

handler.all = async function (m) {
    try {
        if (!m?.isGroup || m.fromMe || !m.sender || !global.db?.data) return
        // الرسايل الفاضية (إشعارات/تفاعلات) ما بتتعدّش
        if (!m.mtype || /protocol|senderKey|reaction/i.test(m.mtype)) return
        const chat = (global.db.data.chats[m.chat] ||= {})
        if (!chat.stats) { chat.stats = {}; chat.statsSince = Date.now() }
        const e = (chat.stats[m.sender] ||= { n: 0, days: {} })
        e.n++
        e.last = Date.now()
        if (m.pushName) e.name = m.pushName
        const d = dayKey()
        e.days[d] = (e.days[d] || 0) + 1
        const keys = Object.keys(e.days)
        if (keys.length > 10) { keys.sort(); for (const k of keys.slice(0, keys.length - 10)) delete e.days[k] }
    } catch {}
}

handler.help = ['توب', 'توب اقل']
handler.tags = ['group']
handler.command = /^(توب|top|التفاعل)$/i
handler.group = true

export default handler