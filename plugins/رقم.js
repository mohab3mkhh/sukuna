// plugins/number.js
/**
 * .رقم / .ارقام
 * بيجيب أرقام واتساب مصرية بس (+20) بحساب تليجرام منفصل (رقم المطور 6607)
 * ويبعت الأرقام والأكواد في نفس الجروب كرد على اللي طلب.
 * أي دولة تانية بيتجاهلها حتى لو اتكتبت.
 *
 * متغيرات Railway:
 *   TG_API_ID / TG_API_HASH   (نفس اللي عندك)
 *   TG_NUM_SESSION            سيشن حساب 6607 (من gen-session.js)
 *   NUM_TARGET                اليوزر المستهدف (من غير @)
 *   NUM_CODE_WAIT             أقصى انتظار للأكواد بالثواني (الافتراضي 300)
 */

import { TelegramClient } from 'telegram'
import { StringSession } from 'telegram/sessions/index.js'

const TARGET = String(process.env.NUM_TARGET || '').replace(/^@/, '')
const FOOTER = '⛩️ SUKUNA BOT ⛩️'
const GET_NUMBER_TEXT = 'Get Number'
const COUNTRY_RE = /egypt/i          // زرار الدولة: مصر بس
const COUNTRY_CODE = '20'            // الأرقام لازم تبدأ بـ +20
const CODE_WAIT = (Number(process.env.NUM_CODE_WAIT) || 300) * 1000
const STEP_TIMEOUT = 25000
const MAX_PAGES = 10
const MAX_NUMBERS = 4
const MAX_PENDING = 3
const OWNER_ONLY = true   // خليها false لو عايز أي حد يستخدم الأمر

const OWNERS = ['201036547166', '201016855501', '201066036607']
const numOf = jid => String(jid || '').split('@')[0].split(':')[0].replace(/\D/g, '')
const isOwner = m => {
    const extra = (global.owner || []).map(o => numOf(Array.isArray(o) ? o[0] : o))
    const n = numOf(m.sender)
    return !!m.fromMe || OWNERS.includes(n) || extra.includes(n)
}

// بنحفظ الاتصال في global عشان الـ reload ما يفتحش اتصال جديد
async function getClient() {
    if (global._numTgClient?.connected) return global._numTgClient
    const apiId = parseInt(process.env.TG_API_ID)
    const apiHash = process.env.TG_API_HASH
    const session = process.env.TG_NUM_SESSION
    if (!apiId || !apiHash || !session || !TARGET) throw new Error('ENV_MISSING')
    const client = new TelegramClient(new StringSession(session), apiId, apiHash, { connectionRetries: 5 })
    await client.connect()
    console.log('[TG] ✅ Connected (number) account 6607')
    global._numTgClient = client
    return client
}

const log = (...a) => console.log('[رقم]', ...a)
const sleep = ms => new Promise(r => setTimeout(r, ms))
const tgErr = (code, extra) => Object.assign(new Error(code), { extra })
const buttonsOf = msg => msg?.replyMarkup?.rows?.flatMap(r => r.buttons || []) || []
const inlineOf = msg => buttonsOf(msg).filter(b => b.data)
const sigOf = msg => inlineOf(msg).map(b => b.text).join('|')

async function waitFor(fn, { timeout = STEP_TIMEOUT, every = 1000 } = {}) {
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

// الأرقام المصرية بس: +20 وبعدها 10 أرقام
const PHONE_RE = /\+?\d[\d\s\-()]{7,18}\d/g
const extractPhones = t => {
    const out = []
    for (const x of String(t || '').matchAll(PHONE_RE)) {
        const digits = x[0].replace(/\D/g, '')
        if (digits.startsWith(COUNTRY_CODE) && digits.length >= 11 && digits.length <= 13) out.push('+' + digits)
    }
    return out
}

// الكود: لازم الرسالة تحتوي كلمة كود/OTP، ونستبعد أي رقم جزء من أرقام الموبايل
const extractCode = (t, phones) => {
    const s = String(t || '')
    if (!/code|كود|رمز|otp|sms|verification|whatsapp/i.test(s)) return null
    const pds = phones.map(p => p.replace(/\D/g, ''))
    const all = [...s.matchAll(/\b\d{3}[-\s]?\d{3}\b|\b\d{4,8}\b/g)]
        .map(x => x[0])
        .filter(c => { const d = c.replace(/\D/g, ''); return !pds.some(p => p.includes(d)) })
    return all[0] || null
}

// ════════════ التنفيذ على تليجرام ════════════
async function run(client, { onNumbers, onCode }) {
    const recent = async () => Array.from(await client.getMessages(TARGET, { limit: 25 }))
    const startSec = Math.floor(Date.now() / 1000)
    const baseId = (await recent())[0]?.id || 0
    const fresh = m => !m.out && (m.id > baseId || (m.editDate && m.editDate >= startSec - 3))
    const visible = async () => [...new Set((await recent()).flatMap(inlineOf).map(b => b.text))].slice(0, 25).join(' | ')
    const newestInline = async () => (await recent()).find(m => fresh(m) && inlineOf(m).length)

    // 1) /start ثم Get Number
    await client.sendMessage(TARGET, { message: '/start' })
    await waitFor(async () => (await recent()).some(fresh), { timeout: 10000, every: 700 })
    await sleep(1200)
    await client.sendMessage(TARGET, { message: GET_NUMBER_TEXT })
    const listMsg = await waitFor(newestInline, { timeout: 15000 })
    if (!listMsg) throw tgErr('NO_LIST', await visible())

    // 2) زرار مصر (مع تقليب الصفحات لو لزم)
    let hit = null
    for (let page = 0; page < MAX_PAGES && !hit; page++) {
        const msg = await newestInline()
        if (!msg) break
        const btns = inlineOf(msg)

        // لو لسه بيسأل عن الخدمة، نختار واتساب
        if (/service/i.test(msg.message || '') && !/country/i.test(msg.message || '')) {
            const wa = btns.find(b => /whats\s*app/i.test(b.text))
            if (!wa) break
            log('خدمة:', wa.text)
            const sig = sigOf(msg)
            await clickBtn(msg, wa)
            await waitFor(async () => { const n = await newestInline(); return n && sigOf(n) !== sig }, { timeout: 10000, every: 800 })
            continue
        }

        const b = btns.find(b => COUNTRY_RE.test(b.text))
        if (b) { hit = { msg, btn: b }; break }

        const next = btns.find(b => /next|»/i.test(b.text))
        if (!next) break
        log('صفحة جاية...')
        const sig = sigOf(msg)
        await clickBtn(msg, next)
        const changed = await waitFor(async () => {
            const n = await newestInline()
            return n && sigOf(n) !== sig ? n : null
        }, { timeout: 10000, every: 800 })
        if (!changed) break
    }
    if (!hit) throw tgErr('NO_COUNTRY', await visible())
    log('دولة:', hit.btn.text)
    await clickBtn(hit.msg, hit.btn)

    // 3) الأرقام المصرية (لحد 4)
    const phones = []
    const grab = async () => {
        for (const m of (await recent()).filter(fresh)) {
            if (/select\s*country/i.test(m.message || '')) continue
            for (const p of extractPhones(m.message)) if (!phones.includes(p) && phones.length < MAX_NUMBERS) phones.push(p)
        }
        return phones.length > 0
    }
    if (!(await waitFor(grab, { timeout: 40000, every: 1500 }))) {
        const texts = (await recent()).filter(fresh).map(m => m.message).filter(Boolean).join('\n---\n')
        throw tgErr('NO_NUMBER', texts || (await visible()))
    }
    if (phones.length < MAX_NUMBERS) { await sleep(3000); await grab() }
    log('الأرقام:', phones.join(' , '))
    await onNumbers(phones)

    // 4) الأكواد: أي كود جديد يتبعت على طول لحد ما الوقت يخلص
    const sent = new Set()
    let count = 0
    const end = Date.now() + CODE_WAIT
    while (Date.now() < end && count < MAX_NUMBERS) {
        for (const m of (await recent()).filter(fresh)) {
            const c = extractCode(m.message, phones)
            if (!c) continue
            const k = `${m.id}:${c}`
            if (sent.has(k)) continue
            sent.add(k)
            count++
            const forPhone = phones.find(p => String(m.message || '').replace(/\D/g, '').includes(p.replace(/\D/g, ''))) || null
            log('الكود:', c)
            await onCode(c, forPhone)
        }
        await sleep(3000)
    }
    return { phones, codes: count }
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
    const x = e?.extra ? String(e.extra).slice(0, 400) : 'ولا حاجة'
    if (c === 'ENV_MISSING') return 'متغيرات TG_API_ID / TG_API_HASH / TG_NUM_SESSION / NUM_TARGET ناقصة في Railway'
    if (c === 'BUSY') return 'فيه طلبات كتير شغالة دلوقتي، جرّب بعد شوية'
    if (c === 'NO_LIST') return `مفيش رد بقايمة الدول.\nالأزرار اللي ظهرت: ${x}`
    if (c === 'NO_COUNTRY') return `مقدرتش ألاقي زرار مصر.\nالأزرار اللي ظهرت: ${x}`
    if (c === 'NO_NUMBER') return `مجاش أرقام مصرية.\nآخر رد:\n${x}`
    return String(c || e).slice(0, 200)
}

// ════════════ واتساب ════════════
// كله بيترد على رسالة اللي طلب في نفس الجروب
const reply = (conn, m, text) => conn.sendMessage(m.chat, { text }, { quoted: m })

let handler = async (m, { conn }) => {
    if (OWNER_ONLY && !isOwner(m)) return reply(conn, m, '❌ الأمر ده للمطور بس')

    await reply(conn, m, '⏳ جاري طلب أرقام واتساب مصرية 🇪🇬...')
    try {
        const res = await enqueue(async () => run(await getClient(), {
            onNumbers: async phones => {
                const list = phones.map((p, i) => `┃ ✦ ${i + 1} ↬ ${p}`).join('\n')
                await reply(conn, m, `╭━━━〔 📱 𝑵𝑼𝑴𝑩𝑬𝑹𝑺 〕━━━⬣\n┃ ✦ 𝑪𝒐𝒖𝒏𝒕𝒓𝒚 ↬ مصر 🇪🇬\n${list}\n╰━━━━━━━━━━━━━━⬣\n\n⌛ مستني الأكواد (لحد ${Math.round(CODE_WAIT / 60000)} دقايق)...\n\n> ${FOOTER}`)
            },
            onCode: async (code, phone) => {
                await reply(conn, m, `╭━━━〔 🔑 𝑪𝑶𝑫𝑬 〕━━━⬣\n${phone ? `┃ ✦ 𝑵𝒖𝒎𝒃𝒆𝒓 ↬ ${phone}\n` : ''}┃ ✦ 𝑪𝒐𝒅𝒆 ↬ *${code}*\n╰━━━━━━━━━━━━━━⬣\n\n> ${FOOTER}`)
            },
        }))
        if (!res.codes) await reply(conn