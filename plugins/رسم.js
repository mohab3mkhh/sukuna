// plugins/draw.js
/**
 * .ارسم / .رسم <وصف>
 * بيرسم الصورة عن طريق بوت تليجرام @GPT4Telegrambot بحسابك انت (نفس ربط أمر numbers).
 *
 * الخطوات:
 *  1) المستخدم يبعت  .ارسم <وصف>  ← البوت يبعتله 3 أزرار نماذج
 *  2) يختار النموذج ← يظهر له أزرار الجودة 1k / 2k / 4k
 *  3) يختار الجودة ← البوت يدوس على الأزرار في تليجرام ويبعت الوصف ويرجّع الصورة
 *
 * النموذج الشغّال دلوقتي: Nano Banana Pro  (GPT Image و Recraft جايين في الخطوة الجاية)
 *
 * متغيرات اختيارية في Railway:
 *   TG_IMG_BTN         نص زرار "إنشاء الصور" لو البوت ماقدرش يلاقيه لوحده
 *   DRAW_COOLDOWN_SEC  الانتظار بين طلب وطلب لنفس الشخص (الافتراضي 60 ثانية)
 */

import { TelegramClient } from 'telegram'
import { StringSession } from 'telegram/sessions/index.js'
import { sendList } from '../lib/buttons.js'

const BOT = 'GPT4Telegrambot'
const MENU_FALLBACK = process.env.TG_IMG_BTN || '🎨 إنشاء الصور'
const COOLDOWN_MS = (Number(process.env.DRAW_COOLDOWN_SEC) || 60) * 1000
const MAX_PENDING = 5                 // أقصى عدد طلبات واقفة في الطابور
const JOB_TTL = 30 * 60 * 1000        // صلاحية الأزرار
const GEN_TIMEOUT = 180 * 1000        // أقصى وقت لانتظار الصورة
const FOOTER = '⛩️ SUKUNA BOT ⛩️'

const MODELS = {
    nano:    { label: 'Nano Banana Pro', tg: /nano\s*banana\s*pro/i, ready: true },
    gpt:     { label: 'GPT Image 2.6',   tg: /gpt\s*image/i,        ready: false },
    recraft: { label: 'Recraft',         tg: /recraft/i,            ready: false },
}
const QUALITIES = ['1k', '2k', '4k']

if (!global.drawJobs) global.drawJobs = new Map()   // token → طلب
if (!global.drawLast) global.drawLast = new Map()   // المستخدم → وقت آخر رسم

// نفس طريقة الربط اللي في numbers.js (متغيرات TG_API_ID / TG_API_HASH / TG_SESSION من Railway)
// بنحفظ الاتصال في global عشان لو الأمر اتعمله reload ما يفتحش اتصال جديد
async function getClient() {
    if (global._drawTgClient?.connected) return global._drawTgClient
    const apiId = parseInt(process.env.TG_API_ID)
    const apiHash = process.env.TG_API_HASH
    if (!apiId || !apiHash || !process.env.TG_SESSION) throw new Error('ENV_MISSING')
    const client = new TelegramClient(new StringSession(process.env.TG_SESSION), apiId, apiHash, { connectionRetries: 5 })
    await client.connect()
    console.log('[TG] ✅ Connected (draw)')
    global._drawTgClient = client
    return client
}

const log = (...a) => console.log('[رسم]', ...a)
const sleep = ms => new Promise(r => setTimeout(r, ms))
const tgErr = (code, extra) => Object.assign(new Error(code), { extra })

// بينضّف نص الزرار من الإيموجي والرموز عشان المقارنة تبقى سهلة: "✅ 2k" ← "2k"
const norm = s => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}\s.]/gu, ' ').replace(/\s+/g, ' ').trim()

const buttonsOf = msg => msg?.replyMarkup?.rows?.flatMap(r => r.buttons || []) || []

// بيدور على زرار (inline له data) نصه يطابق الاختبار، في أحدث الرسايل الأول
function findBtn(msgs, test) {
    for (const msg of msgs) {
        for (const btn of buttonsOf(msg)) {
            if (btn.data && test(norm(btn.text))) return { msg, btn }
        }
    }
    return null
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

async function clickBtn(hit) {
    try {
        await hit.msg.click({ data: hit.btn.data })
    } catch (e) {
        // تليجرام ساعات مابيردش على الضغطة في الوقت، ده مش خطأ
        if (!/timeout/i.test(String(e?.message || e))) throw e
    }
}

// ════════════ التنفيذ على تليجرام ════════════
async function generate(client, job, quality) {
    const model = MODELS[job.model]
    const startSec = Math.floor(Date.now() / 1000)
    const recent = async () => Array.from(await client.getMessages(BOT, { limit: 15 }))
    const latestId = async () => (await recent())[0]?.id || 0
    const baseId = await latestId()
    // رسالة "جديدة" = اتبعتت بعد ما بدأنا، أو اتعدّلت بعد ما بدأنا (البوت ساعات بيعدّل نفس الرسالة)
    const fresh = m => m.id > baseId || (m.editDate && m.editDate >= startSec - 3)
    const visible = async () => [...new Set((await recent()).flatMap(buttonsOf).map(b => b.text))].slice(0, 20).join(' | ')

    // 1) زرار "إنشاء الصور" في لوحة المفاتيح السفلية
    const findLabel = ms => {
        for (const msg of ms) {
            for (const b of buttonsOf(msg)) {
                if (!b.data && /نشاء\s*الصور/.test(norm(b.text))) return b.text
            }
        }
        return null
    }
    let label = global._tgImgLabel || findLabel(await recent())
    if (!label) {
        await client.sendMessage(BOT, { message: '/start' })
        label = await waitFor(async () => findLabel((await recent()).filter(fresh)), { timeout: 12000 })
    }
    if (label) global._tgImgLabel = label
    label = label || MENU_FALLBACK
    log('بدوس على:', label)
    await client.sendMessage(BOT, { message: label })

    // 2) قايمة النماذج ← نضغط على النموذج المطلوب
    const modelHit = await waitFor(async () => findBtn((await recent()).filter(fresh), t => model.tg.test(t)), { timeout: 25000 })
    if (!modelHit) throw tgErr('NO_MODEL', await visible())
    log('بدوس على النموذج:', modelHit.btn.text)
    await clickBtn(modelHit)

    // 3) أزرار الجودة ← نضغط على الجودة (نموذج 2.1 / Pro جوه نفس الشاشة بنسيبه زي ما هو)
    const qHit = await waitFor(async () => findBtn((await recent()).filter(fresh), t => t === quality), { timeout: 20000 })
    if (!qHit) throw tgErr('NO_QUALITY', await visible())
    log('بدوس على الجودة:', qHit.btn.text)
    await clickBtn(qHit)
    await sleep(1000)

    // 4) نبعت الوصف ونستنى الصورة
    const before = await latestId()
    const t0 = Math.floor(Date.now() / 1000)
    await client.sendMessage(BOT, { message: job.prompt })
    log('بعتّ الوصف، مستني الصورة...')

    const isNew = m => !m.out && (m.id > before || (m.editDate && m.editDate >= t0 - 3))
    const images = ms => ms.filter(m => isNew(m) && (m.photo || String(m.document?.mimeType || '').startsWith('image/')))

    let found = await waitFor(async () => {
        const c = images(await recent())
        return c.length ? c : null
    }, { timeout: GEN_TIMEOUT, every: 2500 })

    if (!found) {
        const texts = (await recent()).filter(m => isNew(m) && m.message).map(m => m.message).join('\n---\n')
        throw tgErr('NO_IMAGE', texts)
    }

    // البوت بيبعت الملف الكامل (PNG تقيل) وبعده الصورة العادية، فنفضّل الصورة العادية
    if (!found.some(m => m.photo)) {
        const more = await waitFor(async () => {
            const c = images(await recent())
            return c.some(m => m.photo) ? c : null
        }, { timeout: 12000, every: 2000 })
        if (more) found = more
    }

    const target = found.find(m => m.photo) || found[0]
    const buffer = await client.downloadMedia(target)
    if (!Buffer.isBuffer(buffer) || !buffer.length) throw tgErr('DOWNLOAD')
    return buffer
}

// ════════════ طابور (حساب تليجرام واحد = طلب واحد في نفس الوقت) ════════════
let chain = Promise.resolve()
let pending = 0
function enqueue(fn) {
    if (pending >= MAX_PENDING) return Promise.reject(new Error('BUSY'))
    pending++
    const run = chain.then(() => fn())
    chain = run.catch(() => {})
    return run.finally(() => { pending-- })
}

function explain(e) {
    const c = e?.message
    const x = e?.extra ? `\n\n🔎 ${String(e.extra).slice(0, 400)}` : ''
    if (c === 'ENV_MISSING') return 'متغيرات TG_API_ID / TG_API_HASH / TG_SESSION ناقصة في Railway'
    if (c === 'BUSY') return 'فيه طلبات كتير شغالة دلوقتي، جرّب بعد شوية'
    if (c === 'NO_MODEL') return `مقدرتش ألاقي زرار النموذج في بوت تليجرام (ممكن شكل البوت اتغيّر).\nالأزرار اللي ظهرت: ${e.extra || 'ولا حاجة'}`
    if (c === 'NO_QUALITY') return `مقدرتش ألاقي أزرار الجودة في بوت تليجرام.\nالأزرار اللي ظهرت: ${e.extra || 'ولا حاجة'}`
    if (c === 'NO_IMAGE') return `البوت ماريّحش بصورة في الوقت المحدد.${x ? '\nآخر رد منه:' + x : ''}`
    if (c === 'DOWNLOAD') return 'الصورة وصلت بس مقدرتش أنزّلها من تليجرام'
    return String(c || e).slice(0, 200)
}

// ════════════ واتساب ════════════
const reply = (conn, m, text) => conn.sendMessage(m.chat, { text }, { quoted: m })

async function onChoice(m, conn, usedPrefix, text) {
    const [token, action = ''] = text.split(/\s+/)
    const job = global.drawJobs.get(token)
    if (!job) return reply(conn, m, `⚠️ الطلب ده انتهت صلاحيته، ابعت ${usedPrefix}ارسم <الوصف> من جديد`)
    if (job.sender !== m.sender) return reply(conn, m, '⚠️ الأزرار دي لصاحب الطلب بس')

    // اختيار النموذج
    if (action.startsWith('m_')) {
        const model = MODELS[action.slice(2)]
        if (!model) return
        if (!model.ready) return reply(conn, m, `🚧 نموذج *${model.label}* لسه مش متفعّل، جرّب *Nano Banana Pro* دلوقتي`)
        job.model = action.slice(2)
        return sendList(conn, m.chat, {
            text: `🎨 *${model.label}*\n\nاختار الجودة 👇`,
            footer: FOOTER,
            title: '🎨 جودة الصورة',
            buttonText: 'اختار الجودة',
            sections: [{
                title: 'الجودة',
                rows: QUALITIES.map(q => ({ header: '', title: q, description: '', id: `${usedPrefix}رسم_خيار ${token} q_${q}` })),
            }],
            quoted: m,
        })
    }

    // اختيار الجودة ← نبدأ الرسم
    if (action.startsWith('q_')) {
        const quality = action.slice(2)
        if (!QUALITIES.includes(quality) || !job.model) return
        if (job.running) return
        job.running = true
        global.drawLast.set(job.sender, Date.now())

        const model = MODELS[job.model]
        await reply(conn, m, `⏳ جاري الرسم بـ *${model.label}* (${quality})...\nممكن ياخد لحد دقيقتين.`)
        try {
            const buffer = await enqueue(async () => generate(await getClient(), job, quality))
            const caption =
                `╭━━━〔 🎨 𝑫𝑹𝑨𝑾 〕━━━⬣\n` +
                `┃ ✦ 𝑴𝒐𝒅𝒆𝒍 ↬ ${model.label}\n` +
                `┃ ✦ 𝑸𝒖𝒂𝒍𝒊𝒕𝒚 ↬ ${quality}\n` +
                `┃ ✦ 𝑷𝒓𝒐𝒎𝒑𝒕 ↬ ${job.prompt.slice(0, 200)}\n` +
                `╰━━━━━━━━━━━━━━⬣\n\n> ${FOOTER}`
            await conn.sendMessage(job.chat, { image: buffer, caption }, { quoted: job.m })
        } catch (e) {
            console.error('[رسم] فشل:', e?.message || e, e?.extra || '')
            await reply(conn, m, `❌ *فشل الرسم*\n\n⚠️ ${explain(e)}`)
        } finally {
            global.drawJobs.delete(token)
        }
    }
}

let handler = async (m, { conn, text, usedPrefix = '.', command }) => {
    const cmd = String(command || '').replace(/^[.!#/]/, '')
    const now = Date.now()
    for (const [k, v] of global.drawJobs) if (now - v.createdAt > JOB_TTL) global.drawJobs.delete(k)

    // ضغطة زرار
    if (/^رسم_خيار$/i.test(cmd)) return onChoice(m, conn, usedPrefix, String(text || '').trim())

    // .ارسم / .رسم <وصف>
    const prompt = String(text || '').trim()
    if (!prompt) {
        return reply(conn, m, `🎨 *الرسم بالذكاء الاصطناعي*\n\nاكتب:\n*${usedPrefix}${cmd} <وصف الصورة>*\n\nمثال:\n*${usedPrefix}${cmd} فتاة نائمة على سرير أسود*\n\n> ${FOOTER}`)
    }

    const left = COOLDOWN_MS - (now - (global.drawLast.get(m.sender) || 0))
    if (left > 0) return reply(conn, m, `⏳ استنى ${Math.ceil(left / 1000)} ثانية قبل الرسمة الجاية`)

    const token = Math.random().toString(36).slice(2, 8)
    global.drawJobs.set(token, { token, chat: m.chat, sender: m.sender, prompt, m, createdAt: now })

    try {
        await sendList(conn, m.chat, {
            text: `🎨 *الوصف:* ${prompt.slice(0, 200)}\n\nاختار النموذج 👇`,
            footer: FOOTER,
            title: '🎨 رسم بالذكاء الاصطناعي',
            buttonText: 'اختار النموذج',
            sections: [{
                title: 'النماذج',
                rows: Object.entries(MODELS).map(([key, mod]) => ({ header: '', title: mod.label, description: '', id: `${usedPrefix}رسم_خيار ${token} m_${key}` })),
            }],
            quoted: m,
        })
    } catch (e) {
        global.drawJobs.delete(token)
        console.error('[رسم] الأزرار فشلت:', e?.message || e)
        await reply(conn, m, `❌ مقدرتش أبعت الأزرار: ${e?.message || e}`)
    }
}

handler.help = ['ارسم <وصف>']
handler.tags = ['ai']
handler.command = /^(ارسم|رسم|رسم_خيار)$/i
export default handler