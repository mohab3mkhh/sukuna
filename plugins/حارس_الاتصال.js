// plugins/حارس_الاتصال.js
// 🩺 حارس اتصال البوت الرئيسي
// بيكشف "الاتصال الميت" (السوكت شكله مفتوح بس واتساب بطّل يبعتله رسايل ومفيش event close)
// وبيعيد الاتصال تلقائي. محتاج السطر ده في index.js بعد دالة scheduleReconnect:
//     global.scheduleReconnect = scheduleReconnect

const EVERY_MS      = 60_000        // فحص كل دقيقة
const PING_TIMEOUT  = 20_000        // مهلة رد واتساب على الـ ping
const MAX_FAILS     = 3             // 3 فحوصات فاشلة ورا بعض = اتصال ميت
const MAX_NOT_OPEN  = 4 * 60_000    // لو فضل مش "open" 4 دقايق = أعد الاتصال

const sleep = ms => new Promise(r => setTimeout(r, ms))
const stamp = () => new Date().toISOString().slice(11, 19)

async function ping(conn) {
  if (typeof conn?.query !== 'function') return true   // مش قادرين نفحص، نعتبره سليم
  try {
    await Promise.race([
      conn.query({ tag: 'iq', attrs: { to: 's.whatsapp.net', type: 'get', xmlns: 'w:p' }, content: [{ tag: 'ping', attrs: {} }] }, PING_TIMEOUT),
      sleep(PING_TIMEOUT + 2000).then(() => { throw new Error('ping timeout') }),
    ])
    return true
  } catch { return false }
}

function force(why) {
  console.log(`[الحارس ${stamp()}] 🔴 ${why} — بعيد الاتصال`)
  global.stopped = 'connecting'
  if (typeof global.scheduleReconnect === 'function') global.scheduleReconnect(1000)
  else if (typeof global.reloadHandler === 'function' && !global.__guardReloading) {
    global.__guardReloading = true
    global.reloadHandler(true).catch(e => console.error('[الحارس] reload:', e?.message)).finally(() => { global.__guardReloading = false })
  }
}

if (global.__connGuard) clearInterval(global.__connGuard)
let lastOpen = Date.now()
let fails = 0
let ticks = 0

global.__connGuard = setInterval(async () => {
  try {
    const conn = global.conn
    if (!conn) return
    ticks++

    if (global.stopped === 'open') {
      lastOpen = Date.now()
      const ok = await ping(conn)
      if (ok) { fails = 0 }
      else {
        fails++
        console.log(`[الحارس ${stamp()}] ⚠️ ping فشل (${fails}/${MAX_FAILS})`)
        if (fails >= MAX_FAILS) { fails = 0; lastOpen = Date.now(); force('الاتصال ميت (واتساب مش بيرد)') }
      }
      if (ticks % 30 === 0) console.log(`[الحارس ${stamp()}] ✅ الاتصال سليم`)
    } else if (Date.now() - lastOpen > MAX_NOT_OPEN) {
      lastOpen = Date.now(); fails = 0
      force(`الحالة "${global.stopped || '?'}" بقالها أكتر من 4 دقايق`)
    }
  } catch (e) { console.error('[الحارس]', e?.message || e) }
}, EVERY_MS)
global.__connGuard.unref?.()

const handler = async () => {}
handler.command = /^__حارس_الاتصال__$/i   // مش بيتنادى فعلياً
export default handler