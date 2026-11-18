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

const TARGET = String(process.env.NUM_TARGET || '').replace(/^@/, '').trim()
const FOOTER = '⛩️ SUKUNA BOT ⛩️'
const GET_NUMBER_TEXT = process.env.NUM_GET_TEXT || 'Get Number'
const SERVICE_RE = /whats\s*app|واتساب/i
const COUNTRY_RE = /egypt|مصر/i
const COUNTRY_CODE = '20'
const CODE_WAIT = (Number(process.env.NUM_CODE_WAIT) || 300) * 1000
const STEP_TIMEOUT = 25000
const MAX_PAGES = 12
const MAX_NUMBERS = 4
const MAX_PENDING = 3
const OWNER_ONLY = true

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
    const apiId = parseInt(process.env.TG_API_ID, 10)
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
const msgText = m => String(m?.message || m?.text || '')
const buttonsOf = msg => msg?.replyMarkup?.rows?.flatMap(r => r.buttons || []) || []
const inlineOf = msg => buttonsOf(msg).filter(b => b.data)
const sigOf = msg => inlineOf(msg).map(b => b.text).join('|')

const fullMsgContent = m => {
    const btnTexts = buttonsOf(m).map(b => b.text || '').join('\n')
    return `${msgText(m)}\n${btnTexts}`.trim() }  async function waitFor(fn, { timeout = STEP_TIMEOUT, every = 1000 } = {}) { const end = Date.now() + timeout while (Date.now() < end) { const r = await fn() if (r) return r await sleep(every) } return null }  async function clickBtn(msg, btn) { try { await msg.click({ data: btn.data }) } catch (e) { if (!/timeout/i.test(String(e?.message \vert{}\vert{} e))) throw e } }  // الأرقام المصرية بس: +20 وبعدها من 11 لـ 13 رقم const PHONE_RE = /\+?\d[\d\s\-()]{8,18}\d/g const extractPhones = t => { const out = [] for (const x of String(t \vert{}\vert{} '').matchAll(PHONE_RE)) { const digits = x[0].replace(/\D/g, '') if (digits.startsWith(COUNTRY_CODE) && digits.length >= 11 && digits.length <= 13) { const formatted = '+' + digits if (!out.includes(formatted)) out.push(formatted) } } return out }  // استخراج الكود مع استبعاد أي أرقام تشكل جزءاً من رقم الموبايل const extractCode = (t, phones) => { const s = String(t \vert{}\vert{} '') if (!s.trim()) return null const hasKeyword = /code\vert{}كود\vert{}رمز\vert{}otp\vert{}sms\vert{}verification\vert{}whatsapp\vert{}login\vert{}تفعيل/i.test(s) const pds = phones.map(p => p.replace(/\D/g, ''))  const candidates = [...s.matchAll(/\b\d{3}[-\s]?\d{3}\b\vert{}\b\d{4,8}\b/g)] .map(x => x[0].trim()) .filter(c => { const d = c.replace(/\D/g, '') if (!d \vert{}\vert{} d.length < 4 \vert{}\vert{} d.length > 8) return false if (pds.some(p => p.includes(d) \vert{}\vert{} d.includes(p))) return false return true })  if (!candidates.length) return null if (!hasKeyword && candidates.length > 1) return null return candidates[0] }  // ════════════ التنفيذ على تليجرام ════════════ async function run(client, { onNumbers, onCode }) { const recent = async () => Array.from(await client.getMessages(TARGET, { limit: 30 })) const startSec = Math.floor(Date.now() / 1000) const baseId = (await recent())[0]?.id \vert{}\vert{} 0 const fresh = m => !m.out && (m.id > baseId \vert{}\vert{} (typeof m.editDate === 'number' && m.editDate >= startSec - 5))  const visible = async () => { const msgs = await recent() const btns = [...new Set(msgs.flatMap(inlineOf).map(b => b.text))].slice(0, 25) return btns.length ? btns.join(' \vert{} ') : 'لا توجد أزرار' }  const newestInline = async () => { const msgs = await recent() return msgs.find(m => fresh(m) && inlineOf(m).length) \vert{}\vert{} msgs.find(m => inlineOf(m).length) }  // 1) إرسال /start ثم Get Number log('إرسال /start...') await client.sendMessage(TARGET, { message: '/start' }) await waitFor(async () => (await recent()).some(fresh), { timeout: 8000, every: 700 }) await sleep(1000)  log('إرسال Get Number...') await client.sendMessage(TARGET, { message: GET_NUMBER_TEXT })  let menuMsg = await waitFor(newestInline, { timeout: 15000, every: 800 }) if (!menuMsg) throw tgErr('NO_LIST', await visible())  // 2) اختيار خدمة WhatsApp تلقائياً عند ظهورها const menuBtns = inlineOf(menuMsg) const hasCountriesAlready = menuBtns.some(b => COUNTRY_RE.test(b.text) \vert{}\vert{} /next\vert{}»/i.test(b.text))  if (!hasCountriesAlready) { const waBtn = menuBtns.find(b => SERVICE_RE.test(b.text)) if (!waBtn) throw tgErr('NO_SERVICE', await visible())  log('اختيار الخدمة:', waBtn.text) const sig = sigOf(menuMsg) await clickBtn(menuMsg, waBtn)  const countriesMsg = await waitFor(async () => { const n = await newestInline() return n && sigOf(n) !== sig ? n : null }, { timeout: 15000, every: 800 })  if (!countriesMsg) throw tgErr('NO_LIST', await visible()) }  // 3) البحث عن زر مصر وتقليب الصفحات لو لزم الأمر let hit = null for (let page = 0; page < MAX_PAGES && !hit; page++) { const msg = await newestInline() if (!msg) break const btns = inlineOf(msg)  const b = btns.find(btn => COUNTRY_RE.test(btn.text)) if (b) { hit = { msg, btn: b }; break }  const next = btns.find(btn => /next\vert{}»\vert{}التالي\vert{}▶\vert{}›/i.test(btn.text)) if (!next) break  log(`تقليب صفحة الدول (${page + 1})...`)
        const sig = sigOf(msg)
        await clickBtn(msg, next)
        const changed = await waitFor(async () => {
            const n = await newestInline()
            return n && sigOf(n) !== sig ? n : null
        }, { timeout: 10000, every: 800 })
        if (!changed) break
    }

    if (!hit) throw tgErr('NO_COUNTRY', await visible())

    log('الضغط على زر الدولة:', hit.btn.text)
    await clickBtn(hit.msg, hit.btn)

    // 4) التقاط الأرقام المصرية (من النص والأزرار)
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

    // 5) استقبال الأكواد خلال فترة الانتظار المحددة
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

// ════════════ طابور الطلبات ════════════
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
    const x = e?.extra ? String(e.extra).slice(0, 500) : 'لا يوجد تفاصيل'
    if (c === 'ENV_MISSING') return '⚠️ متغيرات البيئة TG_API_ID / TG_API_HASH / TG_NUM_SESSION / NUM_TARGET ناقصة في Railway'
    if (c === 'BUSY') return '⏳ فيه طلبات كتير شغالة دلوقتي، جرّب بعد شوية'
    if (c === 'NO_SERVICE') return `❌ ملقيتش زرار WhatsApp في قائمة الخدمات.\nالأزرار الظاهرة:\n${x}` if (c === 'NO_LIST') return `❌ مفيش رد بقائمة الدول.\nالأزرار:\n${x}`
    if (c === 'NO_COUNTRY') return `❌ مقدرتش ألاقي زرار مصر.\nالأزرار:\n${x}` if (c === 'NO_NUMBER') return `❌ مجاش أرقام مصرية.\nآخر رد:\n${x}`
    return `❌ خطأ: ${String(c \vert{}\vert{} e).slice(0, 250)}` }  // ════════════ واتساب ════════════ const reply = (conn, m, text) => conn.sendMessage(m.chat, { text }, { quoted: m })  let handler = async (m, { conn }) => { if (OWNER_ONLY && !isOwner(m)) return reply(conn, m, '❌ الأمر ده للمطور بس')  await reply(conn, m, '⏳ جاري جلب أرقام واتساب مصرية...') try { const res = await enqueue(async () => run(await getClient(), { onNumbers: async phones => { const list = phones.map((p, i) => `┃ ✦ ${i + 1} ↬ ${p}`).join('\n') await reply(conn, m, `╭━━━〔 📱 𝑵𝑼𝑴𝑩𝑬𝑹𝑺 〕━━━⬣\n┃ ✦ 𝑪𝒐𝒖𝒏𝒕𝒓𝒚 ↬ مصر 🇪🇬 (WhatsApp)\n${list}\n╰━━━━━━━━━━━━━━⬣\n\n⌛ مستني الأكواد...\n\n> ${FOOTER}`) }, onCode: async (code, phone) => { await reply(conn, m, `╭━━━〔 🔑 𝑪𝑶𝑫𝑬 〕━━━⬣\n${phone ? `┃ ✦ 𝑵𝒖𝒎𝒃𝒆𝒓 ↬ ${phone}\n` : ''}┃