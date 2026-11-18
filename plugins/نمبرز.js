// plugins/نمبرز.js
/**
 * .نمبرز  ← أرقام من بوت تليجرام @MJnumbers_bot بحسابك (نفس ربط TG_API_ID / TG_API_HASH / TG_SESSION)
 *
 * الخطوات (كلها قوايم في واتساب):
 *   1) .نمبرز                ← واتساب ولا فيسبوك؟
 *   2) يختار الخدمة          ← قايمة الدول المتاحة
 *   3) يختار الدولة          ← قايمة الأرقام
 *   4) يختار رقم             ← البوت يستنى الكود ويبعته في الجروب أول ما يوصل
 *
 * ملاحظة: بيبعت بس الكود الخاص بالرقم اللي صاحب الطلب اختاره، مش أي كود بيوصل البوت.
 *
 * متغيرات اختيارية (Railway):
 *   MJ_BOT            يوزر البوت (الافتراضي MJnumbers_bot)
 *   MJ_GET_BTN        نص زرار الأرقام (الافتراضي "Get Number")
 *   MJ_OTP_WAIT_SEC   أقصى وقت لانتظار الكود (الافتراضي 300)
 *   MJ_COOLDOWN_SEC   الانتظار بين طلب وطلب لنفس الشخص (الافتراضي 20)
 */

import { TelegramClient } from 'telegram'
import { StringSession } from 'telegram/sessions/index.js'
import { sendList } from '../lib/buttons.js'

const BOT = process.env.MJ_BOT || 'MJnumbers_bot'
const GET_BTN = process.env.MJ_GET_BTN || 'Get Number'
const OTP_WAIT = (Number(process.env.MJ_OTP_WAIT_SEC) || 300) * 1000
const COOLDOWN = (Number(process.env.MJ_COOLDOWN_SEC) || 20) * 1000
const MAX_PENDING = 5
const MAX_PAGES = 10
const JOB_TTL = 30 * 60 * 1000
const FOOTER = '⛩️ SUKUNA BOT ⛩️'
const PER_PAGE = 8                                   // دول في كل صفحة قايمة واتساب (الحد 10 صفوف)

const SERVICES = { wa: { label: 'WhatsApp', emoji: '🟢', match: 'whatsapp' }, fb: { label: 'Facebook', emoji: '🔵', match: 'facebook' } }

if (!global.mjJobs) global.mjJobs = new Map()
if (!global.mjLast) global.mjLast = new Map()
if (!global.mjWatch) global.mjWatch = new Map()      // sender → true (متابعة كود شغالة)

const log = (...a) => console.log('[نمبرز]', ...a)
const sleep = ms => new Promise(r => setTimeout(r, ms))
const tgErr = (code, extra) => Object.assign(new Error(code), { extra })
const norm = s => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}\s.]/gu, ' ').replace(/\s+/g, ' ').trim()
const digits = s => String(s || '').replace(/\D/g, '')
const buttonsOf = msg => msg?.replyMarkup?.rows?.flatMap(r => r.buttons || []) || []
const phoneOf = t => (String(t || '').match(/\+?\d[\d\s\-]{8,16}\d/) || [])[0]

async function getClient() {
    if (global._drawTgClient?.connected) return global._drawTgClient
    if (global._mjTgClient?.connected) return global._mjTgClient
    const apiId = parseInt(process.env.TG_API_ID), apiHash = process.env.TG_API_HASH
    if (!apiId || !apiHash || !process.env.TG_SESSION) throw tgErr('ENV_MISSING')
    const c = new TelegramClient(new StringSession(process.env.TG_SESSION), apiId, apiHash, { connectionRetries: 5 })
    await c.connect()
    console.log('[TG] ✅ Connected (numbers)')
    global._mjTgClient = c
    return c
}

async function waitFor(fn, { timeout = 20000, every = 900 } = {}) {
    const end = Date.now() + timeout
    while (Date.now() < end) { const r = await fn(); if (r) return r; await sleep(every) }
    return null
}
async function clickBtn(msg, btn) {
    try { await msg.click({ data: btn.data }) } catch (e) { if (!/timeout/i.test(String(e?.message || e))) throw e }
}

// ════════════ التنفيذ على تليجرام ════════════
const sig = msg => buttonsOf(msg).map(b => b.text).join('|')
const isNav = t => /^(next|prev|previous|back|home|menu)\b|»|«/.test(t)

async function session(client) {
    const recent = async () => Array.from(await client.getMessages(BOT, { limit: 20 }))
    const baseId = (await recent())[0]?.id || 0

    // 1) زرار Get Number (كيبورد عادي تحت الشات)
    let label = global._mjGetLabel
    if (!label) {
        const find = ms => ms.flatMap(buttonsOf).find(b => /get\s*number/.test(norm(b.text)))?.text
        label = find(await recent())
        if (!label) {
            await client.sendMessage(BOT, { message: '/start' })
            label = await waitFor(async () => find(await recent()), { timeout: 8000 })
        }
        label = label || GET_BTN
        global._mjGetLabel = label
    }
    await client.sendMessage(BOT, { message: label })

    const fresh = async test => waitFor(async () => {
        for (const m of await recent()) if (m.id > baseId && !m.out && test(m)) return m
        return null
    })
    const visible = async () => (await recent()).filter(m => m.id > baseId && !m.out).flatMap(buttonsOf).map(b => b.text).join(' | ') || 'ولا حاجة'
    return { recent, baseId, fresh, visible }
}

async function pressService(S, key) {
    const want = SERVICES[key].match
    const hit = await S.fresh(m => buttonsOf(m).some(b => b.data && norm(b.text).includes(want)))
    if (!hit) throw tgErr('NO_SERVICE', await S.visible())
    await clickBtn(hit, buttonsOf(hit).find(b => b.data && norm(b.text).includes(want)))
    // شاشة الدول
    const screen = await S.fresh(m => buttonsOf(m).some(b => /back to service/.test(norm(b.text))) || /select country/.test(norm(m.message)))
    if (!screen) throw tgErr('NO_COUNTRIES', await S.visible())
    return screen.id
}

const getMsg = async (S, id) => (await S.recent()).find(m => m.id === id)
const countryBtns = msg => buttonsOf(msg).filter(b => b.data && !isNav(norm(b.text)) && norm(b.text))
const nextBtn = msg => buttonsOf(msg).find(b => b.data && /^next|»/.test(norm(b.text)))

async function goNext(S, id) {
    const cur = await getMsg(S, id)
    const nb = nextBtn(cur)
    if (!nb) return null
    const before = sig(cur)
    await clickBtn(cur, nb)
    return waitFor(async () => { const m = await getMsg(S, id); return m && sig(m) !== before ? m : null }, { timeout: 10000 })
}

// بيجيب كل الدول من كل الصفحات
async function listCountries(client, service) {
    const S = await session(client)
    const id = await pressService(S, service)
    const out = []
    let msg = await getMsg(S, id)
    for (let page = 0; page < MAX_PAGES && msg; page++) {
        for (const b of countryBtns(msg)) out.push({ text: b.text, page })
        msg = await goNext(S, id)
    }
    if (!out.length) throw tgErr('NO_COUNTRIES', await S.visible())
    return out
}

// بيختار الدولة ويرجّع الأرقام
async function getNumbers(client, service, country) {
    const S = await session(client)
    const id = await pressService(S, service)
    let msg = await getMsg(S, id)
    for (let p = 0; p < country.page; p++) msg = (await goNext(S, id)) || msg
    const btn = countryBtns(msg).find(b => norm(b.text) === norm(country.text))
    if (!btn) throw tgErr('NO_COUNTRY', country.text)
    await clickBtn(msg, btn)

    const screen = await S.fresh(m => /waiting for otp|otp/.test(norm(m.message)) && buttonsOf(m).some(b => phoneOf(b.text)))
    if (!screen) throw tgErr('NO_NUMBERS', await S.visible())
    const nums = [...new Set(buttonsOf(screen).map(b => phoneOf(b.text)).filter(Boolean).map(x => '+' + digits(x)))]
    return { numbers: nums, startId: S.baseId }
}

// بيجيب كود الرقم ده بس
function extractCode(msg, number) {
    const n = digits(number).slice(-8)
    const text = String(msg.message || '')
    const all = digits(text)
    if (!/otp|code|recei/i.test(text) && !buttonsOf(msg).length) return null
    if (!all.includes(n)) return null
    const fromBtn = buttonsOf(msg).map(b => String(b.text || '').trim()).find(t => /^\d[\d\s\-]{3,10}$/.test(t))
    if (fromBtn) return fromBtn
    const stripped = text.replace(/\+?\d[\d\s\-]{8,16}\d/g, ' ')
    return (stripped.match(/\b\d{3}[-\s]?\d{3}\b|\b\d{4,8}\b/) || [])[0] || null
}

async function watchOtp(client, number, startId) {
    return waitFor(async () => {
        for (const m of await client.getMessages(BOT, { limit: 25 })) {
            if (m.id > startId && !m.out) { const c = extractCode(m, number); if (c) return c }
        }
        return null
    }, { timeout: OTP_WAIT, every: 3000 })
}

// ════════════ طابور ════════════
let chain = Promise.resolve(), pending = 0
function enqueue(fn) {
    if (pending >= MAX_PENDING) return Promise.reject(tgErr('BUSY'))
    pending++
    const run = chain.then(fn, fn)
    chain = run.catch(() => {}).finally(() => { pending-- })
    return run
}

function explain(e) {
    const c = e?.message
    if (c === 'ENV_MISSING') return 'متغيرات TG_API_ID / TG_API_HASH / TG_SESSION مش متظبطة.'
    if (c === 'BUSY') return 'فيه طلبات كتير شغالة دلوقتي، جرّب بعد شوية.'
    if (c === 'NO_SERVICE') return `مقدرتش ألاقي زرار الخدمة في البوت.\nالأزرار اللي ظهرت: ${e.extra}`
    if (c === 'NO_COUNTRIES') return `مقدرتش أجيب قايمة الدول.\nالأزرار اللي ظهرت: ${e.extra}`
    if (c === 'NO_COUNTRY') return `الدولة "${e.extra}" مابقتش موجودة، اعمل .نمبرز من الأول.`
    if (c === 'NO_NUMBERS') return `البوت ماجابش أرقام للدولة دي (يمكن مفيش أرقام متاحة).\nالأزرار اللي ظهرت: ${e.extra}`
    return String(c || e).slice(0, 300)
}

const reply = (conn, m, text) => conn.sendMessage(m.chat, { text }, { quoted: m })

// ════════════ الاختيارات من واتساب ════════════
function countriesList(conn, m, job, usedPrefix, page) {
    const total = Math.max(1, Math.ceil(job.countries.length / PER_PAGE))
    page = Math.min(Math.max(page, 0), total - 1)
    const rows = job.countries.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE)
        .map((c, i) => ({ header: '', title: c.text.slice(0, 24), description: '', id: `${usedPrefix}نمبرز_خيار ${job.token} c_${page * PER_PAGE + i}` }))
    if (page < total - 1) rows.push({ header: '', title: 'التالي »', description: `صفحة ${page + 2} من ${total}`, id: `${usedPrefix}نمبرز_خيار ${job.token} p_${page + 1}` })
    if (page > 0) rows.push({ header: '', title: '« السابق', description: `صفحة ${page} من ${total}`, id: `${usedPrefix}نمبرز_خيار ${job.token} p_${page - 1}` })
    return sendList(conn, m.chat, {
        text: `🌍 *الدول المتاحة — ${SERVICES[job.service].label}*\n\nاختار الدولة 👇${total > 1 ? `\nصفحة ${page + 1} من ${total}` : ''}`,
        footer: FOOTER, title: '🌍 الدول', buttonText: 'اختار الدولة',
        sections: [{ title: 'الدول', rows }], quoted: m,
    })
}

async function onChoice(m, conn, usedPrefix, text) {
    const [token, action] = String(text || '').trim().split(/\s+/)
    const job = global.mjJobs.get(token)
    if (!job) return reply(conn, m, '⌛ الطلب ده انتهى، اكتب .نمبرز من الأول.')
    if (job.sender !== m.sender) return reply(conn, m, '⛔ الأزرار دي لصاحب الطلب بس.')

    // الخدمة
    if (action === 's_wa' || action === 's_fb') {
        if (job.busy) return
        job.busy = true
        job.service = action.slice(2)
        await reply(conn, m, `⏳ بجيب الدول المتاحة لـ *${SERVICES[job.service].label}*...`)
        try {
            job.countries = await enqueue(async () => listCountries(await getClient(), job.service))
            return await countriesList(conn, m, job, usedPrefix, 0)
        } catch (e) {
            console.error('[نمبرز] فشل:', e?.message, e?.extra || '')
            global.mjJobs.delete(token)
            return reply(conn, m, `❌ *فشل*\n\n⚠️ ${explain(e)}`)
        } finally { job.busy = false }
    }

    // صفحة دول
    if (action?.startsWith('p_')) return countriesList(conn, m, job, usedPrefix, Number(action.slice(2)))

    // دولة ← أرقام
    if (action?.startsWith('c_')) {
        if (job.busy) return
        const country = job.countries?.[Number(action.slice(2))]
        if (!country) return
        job.busy = true
        await reply(conn, m, `⏳ بجيب أرقام *${country.text}*...`)
        try {
            const r = await enqueue(async () => getNumbers(await getClient(), job.service, country))
            job.numbers = r.numbers.slice(0, 10); job.startId = r.startId; job.country = country.text
            return await sendList(conn, m.chat, {
                text: `📱 *${country.text}*\n\nاختار الرقم اللي هتستخدمه، وبعدها اطلب الكود من ${SERVICES[job.service].label}، وأنا هبعتلك الكود أول ما يوصل 👇`,
                footer: FOOTER, title: '📱 الأرقام', buttonText: 'اختار الرقم',
                sections: [{ title: 'الأرقام المتاحة', rows: job.numbers.map((n, i) => ({ header: '', title: n, description: '', id: `${usedPrefix}نمبرز_خيار ${token} n_${i}` })) }],
                quoted: m,
            })
        } catch (e) {
            console.error('[نمبرز] فشل:', e?.message, e?.extra || '')
            return reply(conn, m, `❌ *فشل*\n\n⚠️ ${explain(e)}`)
        } finally { job.busy = false }
    }

    // رقم ← استنى الكود
    if (action?.startsWith('n_')) {
        const number = job.numbers?.[Number(action.slice(2))]
        if (!number || job.watching) return
        if (global.mjWatch.get(job.sender)) return reply(conn, m, '⏳ عندك رقم شغال بالفعل، استنى الكود بتاعه أو انتظر انتهاء المهلة.')
        job.watching = true
        global.mjWatch.set(job.sender, true)
        global.mjLast.set(job.sender, Date.now())
        await reply(conn, m, `✅ *رقمك:* ${number}\n🌍 ${job.country} — ${SERVICES[job.service].label}\n\n📲 استخدمه واطلب الكود دلوقتي.\n⏳ مستني الكود (لحد ${Math.round(OTP_WAIT / 60000)} دقايق)...`)
        try {
            const code = await watchOtp(await getClient(), number, job.startId)
            if (code) {
                await conn.sendMessage(job.chat, {
                    text: `╭━━━〔 🔐 𝑶𝑻𝑷 〕━━━⬣\n┃ ✦ 𝑺𝒆𝒓𝒗𝒊𝒄𝒆 ↬ ${SERVICES[job.service].label}\n┃ ✦ 𝑵𝒖𝒎𝒃𝒆𝒓 ↬ ${number}\n┃ ✦ 𝑪𝒐𝒅𝒆 ↬ *${code}*\n╰━━━━━━━━━━━━━━⬣\n\n> ${FOOTER}`,
                }, { quoted: job.m })
            } else {
                await reply(conn, m, `⌛ الكود ماوصلش للرقم ${number} في المهلة. جرّب رقم تاني (.نمبرز).`)
            }
        } catch (e) {
            console.error('[نمبرز] OTP فشل:', e?.message)
            await reply(conn, m, `❌ *فشل انتظار الكود*\n\n⚠️ ${explain(e)}`)
        } finally {
            global.mjWatch.delete(job.sender)
            global.mjJobs.delete(token)
        }
    }
}

// ════════════ الأمر ════════════
let handler = async (m, { conn, text, usedPrefix = '.', command }) => {
    for (const [k, j] of global.mjJobs) if (Date.now() - j.createdAt > JOB_TTL) global.mjJobs.delete(k)

    if (/^نمبرز_خيار$/i.test(command)) return onChoice(m, conn, usedPrefix, text)

    const wait = COOLDOWN - (Date.now() - (global.mjLast.get(m.sender) || 0))
    if (wait > 0) return reply(conn, m, `⏳ استنى ${Math.ceil(wait / 1000)} ثانية قبل طلب جديد.`)

    const token = Math.random().toString(36).slice(2, 8)
    const job = { token, chat: m.chat, sender: m.sender, m, createdAt: Date.now() }
    global.mjJobs.set(token, job)
    try {
        await sendList(conn, m.chat, {
            text: '📱 *أرقام الاستقبال*\n\nاختار الخدمة 👇',
            footer: FOOTER, title: '📱 𝑵𝒖𝒎𝒃𝒆𝒓𝒔', buttonText: 'اختار الخدمة',
            sections: [{ title: 'الخدمة', rows: Object.entries(SERVICES).map(([k, s]) => ({ header: '', title: `${s.emoji} ${s.label}`, description: '', id: `${usedPrefix}نمبرز_خيار ${token} s_${k}` })) }],
            quoted: m,
        })
    } catch (e) {
        global.mjJobs.delete(token)
        console.error('[نمبرز] قايمة:', e?.message)
        await reply(conn, m, `❌ فشل إرسال القايمة: ${e?.message || e}`)
    }
}

handler.help = ['نمبرز']
handler.tags = ['tools']
handler.command = /^(نمبرز|mjnumbers|نمبرز_خيار)$/i
export default handler