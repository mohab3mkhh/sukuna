// plugins/ريستارت.js — للمطور فقط: .ريستارت
// بيحفظ الداتابيس، يبعت رسالة، وبعدين يقفل العملية بـ exit(1)
// Railway بيرفع البوت تاني تلقائي (بالـ restart policy). ولما يرجع بيبعتلك "✅ رجعت".
//
// ⚠️ لو البوت عندك مش بيرجع بعد الأمر: في Railway → Settings → Deploy → Restart Policy خليها "Always" أو "On Failure".

const MARK = '__restartMark'

let handler = async (m, { conn, isROwner, isOwner }) => {
    if (!isROwner && !isOwner) return conn.sendMessage(m.chat, { text: '❌ الأمر ده للمطور فقط.' }, { quoted: m })

    await conn.sendMessage(m.chat, { text: '♻️ جاري إعادة تشغيل البوت... هرجعلك خلال ثواني.' }, { quoted: m })
    try {
        if (global.db?.data) {
            global.db.data[MARK] = { chat: m.chat, t: Date.now() }
            if (typeof global.db.write === 'function') await global.db.write()
        }
    } catch (e) { console.error('[ريستارت] فشل حفظ الداتابيس:', e.message) }

    console.log('[ريستارت] بأمر من', m.sender)
    setTimeout(() => process.exit(1), 1500)
}

// بعد الرجوع: أول رسالة/تحميل بيبعت إشعار الرجوع
async function notifyBack(conn) {
    try {
        const mark = global.db?.data?.[MARK]
        if (!mark || !conn?.sendMessage) return
        delete global.db.data[MARK]
        if (Date.now() - mark.t < 10 * 60 * 1000) {
            const secs = Math.round((Date.now() - mark.t) / 1000)
            await conn.sendMessage(mark.chat, { text: `✅ رجعت! (أخد ${secs} ثانية)` })
        }
        if (typeof global.db.write === 'function') await global.db.write().catch(() => {})
    } catch {}
}

handler.all = async function () { await notifyBack(this) }

// محاولة مبكرة بدون انتظار أول رسالة (لو global.conn متاح)
if (global.__restartPoll) clearInterval(global.__restartPoll)
let tries = 0
global.__restartPoll = setInterval(async () => {
    if (++tries > 60) return clearInterval(global.__restartPoll)
    const c = global.conn
    if (c?.user && global.db?.data?.[MARK]) { await notifyBack(c); clearInterval(global.__restartPoll) }
}, 5000)

handler.help = ['ريستارت']
handler.tags = ['owner']
handler.command = /^(ريستارت|restart|اعادة_تشغيل)$/i
handler.owner = true

export default handler