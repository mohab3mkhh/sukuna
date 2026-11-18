// plugins/number.js
/**
 * .رقم / .ارقام
 * بيجيب أرقام واتساب مصرية (+20) عبر تليجرام بنفس ربط الجلسات (TG_SESSION / TG_SESSION_2).
 *
 * الخطوات:
 *  1) إرسال /start ثم Get Number
 *  2) اختيار خدمة WhatsApp (لو ظهرت)
 *  3) البحث عن زر مصر (مع تقليب الصفحات لو لزم)
 *  4) التقاط الأرقام المصرية (+20) وإرسالها في نفس الجروب، ثم متابعة الأكواد
 */

import { TelegramClient } from 'telegram'
import { StringSession } from 'telegram/sessions/index.js'

const BOT = 'MJNumbersBot'
const GET_NUMBER_TEXT = 'Get Number'
const CODE_WAIT = 300 * 1000
const STEP_TIMEOUT = 25000
const MAX_PAGES = 12
const MAX_NUMBERS = 4
const MAX_PENDING = 5
const COUNTRY_CODE = '20'
const FOOTER = '⛩️ SUKUNA BOT ⛩️'

const SERVICE_RE = /whats\s*app|واتساب/i
const COUNTRY_RE = /egypt|مصر/i

const OWNERS = ['201036547166', '201016855501', '201066036607']
const numOf = jid => String(jid || '').split('@')[0].split(':')[0].replace(/\D/g, '')
const isOwner = m => {
    const extra = (global.owner || []).map(o => numOf(Array.isArray(o) ? o[0] : o))
    const n = numOf(m.sender)
    return !!m.fromMe || OWNERS.includes(n) || extra.includes(n)
}

const sessions = () => [process.env.TG_SESSION, process.env.TG_SESSION_2].filter(Boolean)

// بنحفظ الاتصالات في global عشان لو الأمر اتعمله reload ما يفتحش اتصال جديد
async function getClient(i = 0) {
    if (!global._numTgClients) global._numTgClients = {}
    if (global._numTgClients[i]?.connected) return global._numTgClients[i]
    const apiId = parseInt(process.env.TG_API_ID)
    const apiHash = process.env.TG_API_HASH
    const session = sessions()[i]
    if (!apiId || !apiHash || !session) throw new Error('ENV_MISSING')
    const client = new TelegramClient(new StringSession(session), apiId, apiHash, { connectionRetries: 5 })
    await client.connect()
    console.log(`[TG] ✅ Connected (number) account ${i + 1}`)
    global._numTgClients[i] = client
    return client
}

const log = (...a) => console.log('[رقم]', ...a)
const sleep = ms => new Promise(r => setTimeout(r, ms))
const tgErr = (code, extra) => Object.assign(new Error(code), { extra })

const norm = s => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}\s.]/gu, ' ').replace(/\s+/g, ' ').trim()
const msgText = m => String(m?.message || m?.text || '')
const buttonsOf = msg => msg?.replyMarkup?.rows?.flatMap(r => r.buttons || []) || []
const inlineOf = msg => buttonsOf(msg).filter(b => b.data)
const sigOf = msg => inlineOf(msg).map(b => b.text).join('|')

const fullMsgContent = m => {
    const btnTexts = buttonsOf(m).map(b => b.text || '').join('\n')
    return `${msgText(m)}\n${btnTexts}`.trim()
}

async function waitFor(fn, { timeout = 25000, every = 900 } = {}) {
    const end = Date.now() + timeout
    while (Date.now() < end) {
        const r = await fn()
        if (r) return r
        await sleep(every)
    }
    return null
}

async function clickBtn(msg, btn) {
    try {
        await msg.click({ data: btn.data })
    } catch (e) {
        if (!/timeout/i.test(String(e?.message || e))) throw e
    }
}

const PHONE_RE = /\+?\d[\d\s\-()]{8,18}\d/g
const extractPhones = t => {
    const out = []
    for (const x of String(t || '').matchAll(PHONE_RE)) {
        const digits = x[0].replace(/\D/g, '')
        if (digits.startsWith(COUNTRY_CODE) && digits.length >= 11 && digits.length <= 13) {
            const formatted = '+' + digits
            if (!out.includes(formatted)) out.push(formatted)
        }
    }
    return out
}

const extractCode = (t, phones) => {
    const s = String(t || '')
    if (!s.trim()) return null
    const hasKeyword = /code|كود|رمز|otp|sms|verification|whatsapp|login|تفعيل/i.test(s)
    const pds = phones.map(p => p.replace(/\D/g, ''))

    const candidates = [...s.matchAll(/\b\d{3}[-\s]?\d{3}\b|\b\d{4,8}\b/g)]
        .map(x => x[0].trim())
        .filter(c => {
            const d = c.replace(/\D/g, '')
            if (!d || d.length < 4 || d.length > 8) return false
            if (pds.some(p => p.includes(d) || d.includes(p))) return false
            return true
        })

    if (!candidates.length) return null
    if (!hasKeyword && candidates.length > 1) return null
    return candidates[0]
}

// ════════════ التنفيذ على تليجرام ════════════
async function run(client, { onNumbers, onCode }) {
    const startSec = Math.floor(Date.now() / 1000)
    const recent = async () => Array.from(await client.getMessages(BOT, { limit: 25 }))
    const baseId = (await recent())[0]?.id || 0
    const fresh = m => !m.out && (m.id > baseId || (m.editDate && m.editDate >= startSec - 3))
    const visible = async () => [...new Set((await recent()).flatMap(buttonsOf).map(b => b.text))].slice(0, 20).join(' | ')

    const newestInline = async () => {
        const msgs = await recent()
        return msgs.find(m => fresh(m) && inlineOf(m).length) || msgs.find(m => inlineOf(m).length)
    }

    // 1) إرسال /start ثم Get Number
    await client.sendMessage(BOT, { message: '/start' })
    await waitFor(async () => (await recent()).some(fresh), { timeout: 8000, every: 700 })
    await sleep(1000)

    log('بدوس على:', GET_NUMBER_TEXT)
    await client.sendMessage(BOT, { message: GET_NUMBER_TEXT })

    const menuMsg = await waitFor(newestInline, { timeout: 25000 })
    if (!menuMsg) throw tgErr('NO_LIST', await visible())

    // 2) اختيار خدمة WhatsApp لو ظهرت
    const menuBtns = inlineOf(menuMsg)
    const hasCountriesAlready = menuBtns.some(b => COUNTRY_RE.test(norm(b.text)) || /next|»/i.test(norm(b.text)))

    if (!hasCountriesAlready) {
        const waBtn = menuBtns.find(b => SERVICE_RE.test(norm(b.text)))
        if (!waBtn) throw tgErr('NO_SERVICE', await visible())

        log('بدوس على الخدمة:', waBtn.text)
        const sig = sigOf(menuMsg)
        await clickBtn(menuMsg, waBtn)

        const countriesMsg = await waitFor(async () => {
            const n = await newestInline()
            return n && sigOf(n) !== sig ? n : null
        }, { timeout: 20000 })

        if (!countriesMsg) throw tgErr('NO_LIST', await visible())
    }

    // 3) زرار مصر (مع تقليب الصفحات لو لزم)
    let hit = null
    for (let page = 0; page < MAX_PAGES && !hit; page++) {
        const msg = await newestInline()
        if (!msg) break
        const btns = inlineOf(msg)

        const b = btns.find(btn => COUNTRY_RE.test(norm(btn.text)))
        if (b) { hit = { msg, btn: b }; break }

        const next = btns.find(btn => /next|»|التالي|▶|›/i.test(norm(btn.text)))
        if (!next) break

        log(`تقليب صفحة الدول (${page + 1})...`)
        const sig = sigOf(msg)
        await clickBtn(msg, next)
        const changed = await waitFor(async () => {
            const n = await newestInline()
            return n && sigOf(n) !== sig ? n : null
        }, { timeout: 15000 })
        if (!changed) break
    }

    if (!hit) throw tgErr('NO_COUNTRY', await visible())

    log('بدوس على الدولة:', hit.btn.text)
    await clickBtn(hit.msg, hit.btn)

    // 4) التقاط الأرقام المصرية
    const phones = []
    const grab = async () => {
        const msgs = (await recent()).filter(fresh)
        for (const m of msgs) {
            const content = fullMsgContent(m)
            for (const p of extractPhones(content)) {
                if (!phones.includes(p) && phones.length < MAX_NUMBERS) {
                    phones.push(p)
                }
            }
        }
        return phones.length > 0
    }

    const gotAny = await waitFor(grab, { timeout: 30000, every: 1200 })
    if (!gotAny) {
        const texts = (await recent()).filter(fresh).map(fullMsgContent).filter(Boolean).join('\n---\n')
        throw tgErr('NO_NUMBER', texts || (await visible()))
    }

    if (phones.length < MAX_NUMBERS) {
        await sleep(3000)
        await grab()
    }

    log('الأرقام:', phones.join(' , '))
    await onNumbers(phones)

    // 5) استقبال الأكواد
    const sent = new Set()
    let count = 0
    const end = Date.now() + CODE_WAIT

    while (Date.now() < end && count < MAX_NUMBERS) {
        const msgs = (await recent()).filter(fresh)
        for (const m of msgs) {
            const content = fullMsgContent(m)
            const c = extractCode(content, phones)
            if (!c) continue
            const key = `${m.id}:${c}`
            if (sent.has(key)) continue
            sent.add(key)
            count++

            const cleanMsgDigits = content.replace(/\D/g, '')
            const forPhone = phones.find(p => cleanMsgDigits.includes(p.replace(/\D/g, ''))) || null
            log('الكود:', c)
            await onCode(c, forPhone)
        }
        await sleep(3000)
    }

    return { phones, codes: count }
}

// بيجرّب الحسابات بالترتيب، ولو حساب فشل بيروح للتاني
async function runWithFallback(handlers) {
    const n = sessions().length
    if (!n) throw new Error('ENV_MISSING')
    const start = (global._numAcc || 0) % n
    let lastErr
    for (let k = 0; k < n; k++) {
        const i = (start + k) % n
        try {
            const res = await run(await getClient(i), handlers)
            global._numAcc = i
            return res
        } catch (e) {
            lastErr = e
            log(`الحساب ${i + 1} فشل:`, e?.message, e?.extra || '')
            const switchable = ['NO_LIST', 'NO_SERVICE', 'NO_COUNTRY', 'NO_NUMBER'].includes(e?.message)
            if (!switchable) throw e
        }
    }
    throw lastErr
}

// ════════════ طابور ════════════
let chain = Promise.resolve()
let pending = 0
function enqueue(fn) {
    if (pending >= MAX_PENDING) return Promise.reject(new Error('BUSY'))
    pending++
    const r = chain.then(() => fn())
    chain = r.catch(() => {})
    return r.finally(() => { pending-- })
}

function explain(e) {
    const c = e?.message
    const x = e?.extra ? `\n\n🔎 ${String(e.extra).slice(0, 400)}` : ''
    if (c === 'ENV_MISSING') return 'متغيرات TG_API_ID / TG_API_HASH / TG_SESSION ناقصة في Railway'
    if (c === 'BUSY') return 'فيه طلبات كتير شغالة دلوقتي، جرّب بعد شوية'
    if (c === 'NO_SERVICE') return `مقدرتش ألاقي زرار الخدمة.\nالأزرار اللي ظهرت: ${e.extra || 'ولا حاجة'}`
    if (c === 'NO_LIST') return `مفيش رد بقائمة الدول.\nالأزرار اللي ظهرت: ${e.extra || 'ولا حاجة'}`
    if (c === 'NO_COUNTRY') return `مقدرتش ألاقي زرار مصر.\nالأزرار اللي ظهرت: ${e.extra || 'ولا حاجة'}`
    if (c === 'NO_NUMBER') return `مجاش أرقام مصرية (+20).${x ? '\nآخر رد:' + x : ''}`
    return String(c || e).slice(0, 200)
}

// ════════════ واتساب ════════════
const reply = (conn, m, text) => conn.sendMessage(m.chat, { text }, { quoted: m })

let handler = async (m, { conn }) => {
    if (!isOwner(m)) return reply(conn, m, '❌ الأمر ده للمطور بس')

    await reply(conn, m, '⏳ جاري جلب الأرقام...')
    try {
        const res = await enqueue(() =>
            runWithFallback({
                onNumbers: async phones => {
                    const list = phones.map((p, i) => `┃ ✦ ${i + 1} ↬ ${p}`).join('\n')
                    await reply(
                        conn,
                        m,
                        `╭━━━〔 📱 𝑵𝑼𝑴𝑩𝑬𝑹𝑺 〕━━━⬣\n┃ ✦ 𝑪𝒐𝒖𝒏𝒕𝒓𝒚 ↬ مصر 🇪🇬\n${list}\n╰━━━━━━━━━━━━━━⬣\n\n⌛ مستني الأكواد (لحد ${Math.round(CODE_WAIT / 60000)} دقايق)...\n\n> ${FOOTER}`
                    )
                },
                onCode: async (code, phone) => {
                    await reply(
                        conn,
                        m,
                        `╭━━━〔 🔑 𝑪𝑶𝑫𝑬 〕━━━⬣\n${phone ? `┃ ✦ 𝑵𝒖𝒎𝒃𝒆𝒓 ↬ ${phone}\n` : ''}┃ ✦ 𝑪𝒐𝒅𝒆 ↬ *${code}*\n╰━━━━━━━━━━━━━━⬣\n\n> ${FOOTER}`
                    )
                },
            })
        )

        if (!res.codes) {
            await reply(
                conn,
                m,
                `⌛ انتهى وقت انتظار الأكواد ولم يصل كود جديد للأرقام:\n${res.phones.join('\n')}\n\n> ${FOOTER}`
            )
        }
    } catch (e) {
        console.error('[رقم] فشل:', e?.message || e, e?.extra || '')
        await reply(conn, m, `❌ *فشل جلب الأرقام*\n\n⚠️ ${explain(e)}`)
    }
}

handler.help = ['رقم', 'ارقام']
handler.tags = ['tools']
handler.command = /^(رقم|ارقام)$/i

export default handler