// plugins/تذكير.js
// .تذكير 10د اشتري خبز          ← بعد 10 دقايق
// .تذكير 2س اتصل بأحمد          ← بعد ساعتين
// .تذكير 1س 30د الاجتماع        ← بعد ساعة ونص
// .تذكير 45ث شوف الأكل          ← بعد 45 ثانية
// .تذكير 1ي ادفع الفاتورة       ← بعد يوم
// .تذكير 18:30 المذاكرة         ← الساعة 6:30 مساءً بتوقيت القاهرة (24 ساعة)
// .تذكير 6:30م المذاكرة         ← أو بـ ص/م
// .تذكيراتي                     ← تذكيراتك الجاية
// .الغاء_تذكير 2                ← إلغاء تذكير برقمه
//
// التذكيرات بتتحفظ في الداتابيس فبتفضل شغالة حتى بعد Restart.

const TZ = 'Africa/Cairo'
const MAX_PER_USER = 10
const MAX_MS = 30 * 86400000
const digits = j => String(j || '').split('@')[0].split(':')[0].replace(/\D/g, '')

const UNITS = [
    [/^(ثانية|ثانيه|ثواني|ثانيتين|ث|s|sec|secs)$/i, 1000],
    [/^(دقيقة|دقيقه|دقايق|دقائق|دقيقتين|د|m|min|mins)$/i, 60000],
    [/^(ساعة|ساعه|ساعات|ساعتين|س|h|hr|hrs)$/i, 3600000],
    [/^(يوم|ايام|أيام|يومين|ي|d)$/i, 86400000],
]
const unitMs = u => { for (const [re, ms] of UNITS) if (re.test(u)) return ms; return 0 }

// يقرأ مدة مركبة من أول النص: "1س 30د نص التذكير"
function parseDuration(text) {
    let rest = text.trim(), total = 0, got = false
    const re = /^(\d+(?:\.\d+)?)\s*([^\s\d]+)\s*/
    for (;;) {
        const m = rest.match(re)
        if (!m) break
        const ms = unitMs(m[2])
        if (!ms) break
        total += parseFloat(m[1]) * ms
        rest = rest.slice(m[0].length)
        got = true
    }
    return got ? { ms: Math.round(total), text: rest.trim() } : null
}

// وقت محدد بتوقيت القاهرة: 18:30 أو 6:30م
function parseClock(text) {
    const m = text.trim().match(/^(\d{1,2}):(\d{2})\s*(ص|م|am|pm)?\s*(.*)$/i)
    if (!m) return null
    let h = +m[1], min = +m[2]
    const ap = (m[3] || '').toLowerCase()
    if (min > 59 || h > 23) return null
    if (ap === 'م' || ap === 'pm') { if (h < 12) h += 12 }
    else if (ap === 'ص' || ap === 'am') { if (h === 12) h = 0 }
    // نحسب وقت القاهرة من غير ما نعتمد على توقيت السيرفر (Railway = UTC)
    const wallMs = d => {
        const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }).formatToParts(d).map(x => [x.type, x.value]))
        return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second)
    }
    const now = new Date()
    const offset = wallMs(now) - Math.floor(now.getTime() / 1000) * 1000   // فرق القاهرة عن UTC
    const w = new Date(wallMs(now))
    let at = Date.UTC(w.getUTCFullYear(), w.getUTCMonth(), w.getUTCDate(), h, min, 0) - offset
    if (at <= Date.now()) at += 86400000
    return { ms: at - Date.now(), text: m[4].trim(), at }
}

const fmtLeft = ms => {
    const s = Math.max(0, Math.round(ms / 1000))
    const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60), sec = s % 60
    return [d && `${d} يوم`, h && `${h} ساعة`, m && `${m} دقيقة`, (!d && !h && !m || (sec && !d && !h && m < 2)) && `${sec} ثانية`].filter(Boolean).join(' و ')
}
const fmtAt = t => new Date(t).toLocaleString('ar-EG', { timeZone: TZ, hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })

const list = () => (global.db?.data ? (global.db.data.reminders ||= []) : [])
const save = () => { try { global.db?.write?.().catch(() => {}) } catch {} }

// ─── المُشغّل: بيفحص كل 5 ثواني ───
let lastConn = global.conn
if (global.__remTimer) clearInterval(global.__remTimer)
global.__remTimer = setInterval(async () => {
    try {
        const conn = global.conn?.user ? global.conn : lastConn
        if (!conn?.sendMessage || !global.db?.data) return
        const arr = list()
        const now = Date.now()
        const due = arr.filter(r => r.at <= now)
        if (!due.length) return
        global.db.data.reminders = arr.filter(r => r.at > now)
        save()
        for (const r of due) {
            try {
                await conn.sendMessage(r.chat, {
                    text: `⏰ *تذكير!* @${digits(r.sender)}\n\n📝 ${r.text}`,
                    mentions: [r.sender],
                })
            } catch (e) {
                console.error('[تذكير] فشل الإرسال:', e.message)
                if ((r.tries = (r.tries || 0) + 1) < 5) { r.at = Date.now() + 30000; global.db.data.reminders.push(r); save() }
            }
        }
    } catch (e) { console.error('[تذكير]', e.message) }
}, 5000)

let handler = async (m, { conn, text, command, usedPrefix = '.' }) => {
    lastConn = conn
    const reply = (t, mentions = []) => conn.sendMessage(m.chat, { text: t, mentions }, { quoted: m })
    const cmd = command.toLowerCase()
    const mine = () => list().filter(r => r.sender === m.sender).sort((a, b) => a.at - b.at)

    if (/^(تذكيراتي|reminders)$/i.test(cmd)) {
        const my = mine()
        if (!my.length) return reply('📭 مفيش عندك تذكيرات.')
        return reply('⏰ *تذكيراتك:*\n\n' + my.map((r, i) => `*${i + 1}.* ${r.text}\n   ⏳ بعد ${fmtLeft(r.at - Date.now())} (${fmtAt(r.at)})`).join('\n\n') +
            `\n\n🗑️ للإلغاء: ${usedPrefix}الغاء_تذكير <الرقم>`)
    }

    if (/^(الغاء_تذكير|الغاء-تذكير|الغاء)$/i.test(cmd)) {
        const my = mine()
        const n = parseInt(text)
        if (!n || n < 1 || n > my.length) return reply(`⚠️ اكتب رقم التذكير. شوفهم بـ ${usedPrefix}تذكيراتي`)
        const target = my[n - 1]
        global.db.data.reminders = list().filter(r => r !== target)
        save()
        return reply(`🗑️ تم إلغاء التذكير: ${target.text}`)
    }

    // إنشاء تذكير
    const p = parseDuration(text || '') || parseClock(text || '')
    if (!text || !p) {
        return reply(
            `⏰ *التذكير*\n\n` +
            `• ${usedPrefix}${command} 10د اشتري خبز\n` +
            `• ${usedPrefix}${command} 2س اتصل بأحمد\n` +
            `• ${usedPrefix}${command} 1س 30د الاجتماع\n` +
            `• ${usedPrefix}${command} 18:30 المذاكرة  _(بتوقيت القاهرة)_\n\n` +
            `الوحدات: ث (ثواني) • د (دقايق) • س (ساعات) • ي (أيام)\n` +
            `📋 ${usedPrefix}تذكيراتي  |  🗑️ ${usedPrefix}الغاء_تذكير 1`)
    }
    if (!p.text) return reply('⚠️ اكتب نص التذكير بعد الوقت.\nمثال: ' + usedPrefix + command + ' 10د اشتري خبز')
    if (p.ms < 5000) return reply('⚠️ أقل مدة 5 ثواني.')
    if (p.ms > MAX_MS) return reply('⚠️ أقصى مدة 30 يوم.')
    if (mine().length >= MAX_PER_USER) return reply(`⚠️ وصلت للحد الأقصى (${MAX_PER_USER} تذكيرات). امسح واحد الأول.`)

    const at = Date.now() + p.ms
    list().push({ chat: m.chat, sender: m.sender, text: p.text.slice(0, 300), at })
    save()
    return reply(`✅ تمام، هفكرك بعد *${fmtLeft(p.ms)}*\n🕒 ${fmtAt(at)}\n📝 ${p.text.slice(0, 300)}`)
}

handler.all = async function () { lastConn = this }

handler.help = ['تذكير <المدة> <النص>', 'تذكيراتي', 'الغاء_تذكير <رقم>']
handler.tags = ['tools']
handler.command = /^(تذكير|ذكرني|remind|تذكيراتي|reminders|الغاء_تذكير|الغاء-تذكير)$/i

export default handler