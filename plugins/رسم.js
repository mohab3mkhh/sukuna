// plugins/draw.js
/**
 * .ارسم / .رسم <وصف>
 * بيرسم الصورة عن طريق بوت تليجرام @GPT4Telegrambot بحسابك انت (نفس ربط أمر numbers).
 *
 * الخطوات:
 *  1) المستخدم يبعت  .ارسم <وصف>  ← قايمة النماذج
 *  2) Nano Banana Pro ← يختار الجودة (1k / 2k / 4k)
 *     GPT Image 2.6   ← يختار المقاس (1:1 / 9:16 / 16:9 / 3:4 / 4:3)
 *     Recraft         ← يختار المقاس (دايماً على Flash)
 *  3) البوت بيدوس على الأزرار في تليجرام ويبعت الوصف ويرجّع الصورة
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
const MAX_PENDING = 5
const JOB_TTL = 30 * 60 * 1000
const GEN_TIMEOUT = 180 * 1000
const FOOTER = '⛩️ SUKUNA BOT ⛩️'

const QUALITIES = ['1k', '2k', '4k']
const RATIOS = ['1:1', '9:16', '16:9', '3:4', '4:3']

const MODELS = {
    nano: {
        label: 'Nano Banana Pro', tg: /nano\s*banana\s*pro/i,
        optionName: 'الجودة', optionEn: 'Quality', options: QUALITIES,
    },
    gpt: {
        label: 'GPT Image 2.6', tg: /gpt\s*image/i,
        optionName: 'المقاس', optionEn: 'Ratio', options: RATIOS,
    },
    recraft: {
        label: 'Recraft (Flash)', tg: /recraft/i,
        optionName: 'المقاس', optionEn: 'Ratio', options: RATIOS,
        submodel: /^flash$/,   // دايماً Flash
    },
}

if (!global.drawJobs) global.drawJobs = new Map()
if (!global.drawLast) global.drawLast = new Map()

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

// بينضّف نص الزرار: "✅ 2k" ← "2k" ، "✔ 16:9" ← "16 9"
const norm = s => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}\s.]/gu, ' ').replace(/\s+/g, ' ').trim()

const buttonsOf = msg => msg?.replyMarkup?.rows?.flatMap(r => r.buttons || []) || []

function findBtn(msgs, test) {
    for (const msg of msgs) {
        for (const btn of buttonsOf(msg)) {
            if (btn.data && test(norm(btn.text))) return { msg, btn }
        }
    }
    return null
}

// معرّف الميديا (عشان نفرّق بين صورة الغلاف والصورة المرسومة)
const mediaId = m => String(m?.photo?.id ?? m?.document?.id ?? '')
const isImageMsg = m => !!m.photo || String(m.document?.mimeType || '').startsWith('image/')

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
        if (!/timeout/i.test(String(e?.message || e))) throw e
    }
}

// ════════════ التنفيذ على تليجرام ════════════
async function generate(client, job, option) {
    const model = MODELS[job.model]
    const startSec = Math.floor(Date.now() / 1000)
    const recent = async () => Array.from(await client.getMessages(BOT, { limit: 20 }))
    const latestId = async () => (await recent())[0]?.id || 0
    const baseId = await latestId()
    const fresh = m => m.id > baseId || (m.editDate && m.editDate >= startSec - 3)
    const visible = async () => [...new Set((await recent()).flatMap(buttonsOf).map(b => b.text))].slice(0, 20).join(' | ')

    // 1) زرار "إنشاء الصور"
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

    // 2) النموذج
    const modelHit = await waitFor(async () => findBtn((await recent()).filter(fresh), t => model.tg.test(t)), { timeout: 25000 })
    if (!modelHit) throw tgErr('NO_MODEL', await visible())
    log('بدوس على النموذج:', modelHit.btn.text)
    await clickBtn(modelHit)

    // 2.5) Recraft: نتأكد إن Flash هو المختار
    if (model.submodel) {
        const sub = await waitFor(async () => findBtn((await recent()).filter(fresh), t => model.submodel.test(t)), { timeout: 20000 })
        if (!sub) throw tgErr('NO_SUBMODEL', await visible())
        const selected = /[✅✔☑]/.test(sub.btn.text)
        log('Flash:', selected ? 'مختار أصلاً' : 'بدوس عليه')
        if (!selected) { await clickBtn(sub); await sleep(1200) }
    }

    // 3) الجودة أو المقاس
    const want = norm(option)   // "1k" أو "9 16"
    const optHit = await waitFor(async () => findBtn((await recent()).filter(fresh), t => t === want), { timeout: 20000 })
    if (!optHit) throw tgErr('NO_OPTION', await visible())
    log('بدوس على', model.optionEn + ':', optHit.btn.text)
    await clickBtn(optHit)
    await sleep(2500) // نسيب البوت يخلّص تعديل رسالة الغلاف

    // نسجّل كل الصور الموجودة دلوقتي (صورة الغلاف بتاعة النموذج) عشان ما نرجّعهاش على إنها الصورة المرسومة
    const baseline = await recent()
    const oldMedia = new Set(baseline.filter(isImageMsg).map(mediaId))
    const before = baseline[0]?.id || 0

    // 4) نبعت الوصف ونستنى الصورة
    const t0 = Math.floor(Date.now() / 1000)
    await client.sendMessage(BOT, { message: job.prompt })
    log('بعتّ الوصف، مستني الصورة...')

    const isNew = m => !m.out && isImageMsg(m) && !oldMedia.has(mediaId(m)) &&
        (m.id > before || (m.editDate && m.editDate >= t0 - 3))
    const images = ms => ms.filter(isNew)

    let found = await waitFor(async () => {
        const c = images(await recent())
        return c.length ? c : null
    }, { timeout: GEN_TIMEOUT, every: 2500 })

    if (!found) {
        const texts = (await recent()).filter(m => !m.out && m.id > before && m.message).map(m => m.message).join('\n---\n')
        throw tgErr('NO_IMAGE', texts)
    }

    // نفضّل الصورة العادية على ملف الـ PNG الكامل
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

// ════════════ طابور ════════════
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
    if (c === 'NO_MODEL') return `مقدرتش ألاقي زرار النموذج في بوت تليجرام.\nالأزرار اللي ظهرت: ${e.extra || 'ولا حاجة'}`
    if (c === 'NO_SUBMODEL') return `مقدرتش ألاقي زرار Flash في Recraft.\nالأزرار اللي ظهرت: ${e.extra || 'ولا حاجة'}`
    if (c === 'NO_OPTION') return `مقدرتش ألاقي زرار الجودة/المقاس في بوت تليجرام.\nالأزرار اللي ظهرت: ${e.extra || 'ولا حاجة'}`
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
        const key = action.slice(2)
        const model = MODELS[key]
        if (!model) return
        job.model = key
        return sendList(conn, m.chat, {
            text: `🎨 *${model.label}*\n\nاختار ${model.optionName} 👇`,
            footer: FOOTER,
            title: `🎨 ${model.optionName}`,
            buttonText: `اختار ${model.optionName}`,
            sections: [{
                title: model.optionName,
                rows: model.options.map(o => ({ header: '', title: o, description: '', id: `${usedPrefix}رسم_خيار ${token} o_${o}` })),
            }],
            quoted: m,
        })
    }

    // اختيار الجودة/المقاس ← نبدأ الرسم
    if (action.startsWith('o_')) {
        const option = action.slice(2)
        const model = MODELS[job.model]
        if (!model || !model.options.includes(option)) return
        if (job.running) return
        job.running = true
        global.drawLast.set(job.sender, Date.now())

        await reply(conn, m, `⏳ جاري الرسم بـ *${model.label}* (${option})...\nممكن ياخد لحد دقيقتين.`)
        try {
            const buffer = await enqueue(async () => generate(await getClient(), job, option))
            const caption =
                `╭━━━〔 🎨 𝑫𝑹𝑨𝑾 〕━━━⬣\n` +
                `┃ ✦ 𝑴𝒐𝒅𝒆𝒍 ↬ ${model.label}\n` +
                `┃ ✦ ${model.optionEn} ↬ ${option}\n` +
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

    if (/^رسم_خيار$/i.test(cmd)) return onChoice(m, conn, usedPrefix, String(text || '').trim())

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