// plugins/marid.js — لعبة المارد (Akinator)
// المزوّد 1: حزمة akinator-client (بتستخدم got-scraping عشان تعدّي حظر Cloudflare)
// المزوّد 2: الـ API القديم (obito) احتياطي
// لتثبيت الحزمة: ضيف  "akinator-client": "latest"  في dependencies بتاع package.json
// لو لسه 403: ضيف متغير AKI_PROXY في Railway  (مثال: http://user:pass@host:port)
// الأزرار بتتبعت عن طريق lib/buttons.js

import axios from 'axios'
import fs from 'fs'
import path from 'path'
import { sendButtons } from '../lib/buttons.js'

const api_obito = 'https://mr-obito-api.vercel.app/api'
const ANSWERS = { 'نعم': 0, 'لا': 1, 'لا أعرف': 2, 'ربما': 3, 'ربما لا': 4 }
const ANSWER_NAMES = ['YES', 'NO', 'DONT_KNOW', 'PROBABLY', 'PROBABLY_NOT']
const PROXY = process.env.AKI_PROXY || process.env.YT_PROXY || undefined

// صورة المارد: بنحاول ناخدها من الحزمة، ولو مفيش بنستخدم الصورة الافتراضية دي
// تقدر تغيّرها من Railway بمتغير MARID_IMG (رابط صورة مباشر)
const DEFAULT_IMG = process.env.MARID_IMG || 'https://en.akinator.com/assets/img/akitudes_523x850/defi.png'

function clientImg(aki) {
    const v = aki.akitude ?? aki.akitudeUrl ?? aki.akitude_url ?? aki.image ?? aki.imageUrl ?? aki.img
    if (typeof v === 'string' && v) {
        if (/^https?:/i.test(v)) return v
        return `https://en.akinator.com/assets/img/akitudes_523x850/${v.replace(/\.png$/i, '')}.png`
    }
    return DEFAULT_IMG
}

const shortErr = e => e?.response?.status
    ? `HTTP ${e.response.status}${e.response.data?.message ? ' - ' + String(e.response.data.message).slice(0, 60) : ''}`
    : String(e?.code || e?.message || e).slice(0, 100)

// ───────── المزوّد 1: akinator-client ─────────
async function clientStart() {
    let mod
    try { mod = await import('akinator-client') } catch { throw new Error('akinator-client مش متثبتة') }
    const lib = mod.AkinatorClient ? mod : (mod.default?.AkinatorClient ? mod.default : mod)
    const { AkinatorClient, Languages, Themes, Answers } = lib
    if (!AkinatorClient) throw new Error('akinator-client: شكل الحزمة مختلف عن المتوقع')

    // نطبع اللي موجود في الحزمة عشان نعرف أسماء الثيمات الحقيقية لو فشل
    console.log('[مارد] exports:', Object.keys(lib).join(','))
    console.log('[مارد] Languages:', JSON.stringify(Languages))
    console.log('[مارد] Themes:', JSON.stringify(Themes))

    const langs = [...new Set([Languages?.AR, Languages?.ar, 'ar'].filter(v => v !== undefined))]
    const themeVals = Themes && typeof Themes === 'object' ? Object.values(Themes) : []
    // نجرّب كل ثيم متاح، وآخر محاولة من غير ثيم أصلاً
    const themes = [...new Set([Themes?.CHARACTERS, Themes?.Characters, ...themeVals, 'characters'].filter(v => v !== undefined))]
    themes.push(undefined)

    let lastErr
    for (const language of langs) {
        for (const theme of themes) {
            try {
                const aki = new AkinatorClient({
                    language,
                    ...(theme !== undefined ? { theme, themeName: theme } : {}),
                    ...(PROXY ? { proxy: PROXY } : {}),
                    retries: 2,
                })
                await aki.start()
                console.log(`[مارد] akinator-client اشتغل: language=${language} theme=${theme}`)
                return { provider: 'client', aki, Answers, first: { question: aki.question, img: clientImg(aki) } }
            } catch (e) {
                lastErr = e
                console.error(`[مارد] language=${language} theme=${theme}:`, e?.message || e)
                // لو الخطأ مش خطأ إعدادات (مثلاً 403 أو شبكة) مفيش فايدة نكمل نجرّب
                if (!/not available|invalid|unsupported/i.test(String(e?.message))) throw e
            }
        }
    }
    throw lastErr || new Error('akinator-client: مفيش إعداد شغّال')
}

const j = v => { try { return JSON.stringify(v)?.slice(0, 300) } catch { return String(v) } }

// بيحوّل أي شكل رد لتخمين: { name, desc, photo }
const pickWin = o => {
    const name = o?.name ?? o?.name_proposition ?? o?.guess?.name ?? o?.character?.name
    if (!name) return null
    return {
        name,
        desc: o.description ?? o.description_proposition ?? o.guess?.description,
        photo: o.photo ?? o.absolute_picture_path ?? o.picture ?? o.image ?? o.guess?.photo,
    }
}

async function clientGetWin(aki) {
    try {
        const w = await aki.submitWin()
        console.log('[مارد] submitWin ->', j(w))
        return pickWin(w)
    } catch (e) {
        console.error('[مارد] submitWin فشل:', e?.message || e)
        return null
    }
}

async function clientAnswer(s, n, back = false) {
    const aki = s.aki
    let ret
    try {
        ret = back ? await aki.back() : await aki.answer(s.Answers?.[ANSWER_NAMES[n]] ?? n)
    } catch (e) {
        // الحزمة كانت عملت تخمين قبل كده: نجيبه بدل ما نكمل أسئلة
        if (/guess was already made/i.test(String(e?.message))) {
            const w = await clientGetWin(aki)
            if (w) return { win: w }
            try { await aki.continue() } catch {}
            return { question: aki.question, img: clientImg(aki) }
        }
        throw e
    }
    console.log('[مارد] progress:', aki.progress, '| answer ->', j(ret))

    const direct = pickWin(ret)
    if (direct) return { win: direct }

    const flag = aki.guessed ?? aki.isWin ?? aki.hasGuess ?? aki.guessReady ?? aki.isGuess
    if (flag || Number(aki.progress) >= 80) {
        const w = await clientGetWin(aki)
        if (w) return { win: w }
    }
    return { question: aki.question, img: clientImg(aki) }
}

// ───────── المزوّد 2: API القديم ─────────
async function obitoStart() {
    const { data } = await axios.post(`${api_obito}/akinator_start`, {}, { timeout: 20000 })
    if (!data?.session || !data?.signature) throw new Error('رد ناقص من الـ API')
    return { provider: 'obito', session: data.session, signature: data.signature, step: 0, progression: 0, first: { question: data.question, img: data.akitude_url || DEFAULT_IMG } }
}

async function obitoAnswer(s, answer, back = false) {
    const { data } = await axios.post(`${api_obito}/${back ? 'akinator_back' : 'akinator_answer'}`, {
        session: s.session, signature: s.signature, step: s.step, progression: s.progression,
        ...(back ? {} : { answer, sid: 'NaN', question_filter: 'string' }), cm: 'false',
    }, { timeout: 20000 })
    if (data.name_proposition) return { win: { name: data.name_proposition, desc: data.description_proposition, photo: data.photo } }
    s.step = data.step; s.progression = data.progression
    return { question: data.question, img: data.akitude_url || DEFAULT_IMG }
}

const PROVIDERS = [
    { name: 'akinator-client', start: clientStart },
    { name: 'obito-api', start: obitoStart },
]

// ───────── إرسال السؤال ─────────
// لو حطيت ملف marid.jpg (أو .png) في جذر المشروع بيتبعت كصورة مع كل سؤال، وإلا بنستخدم الرابط
function localImg() {
    for (const f of ['marid.jpg', 'marid.jpeg', 'marid.png']) {
        try {
            const p = path.join(process.cwd(), f)
            if (fs.existsSync(p)) return fs.readFileSync(p)
        } catch {}
    }
    return null
}

async function sendQuestion(conn, jid, question, imgUrl, quoted) {
    // الترتيب: نعم ← لا ← لا ربما ← (القايمة) ربما ← مش عارف ← رجوع ← إلغاء
    const other = {
        name: 'single_select',
        buttonParamsJson: JSON.stringify({
            title: '☽✰ ¦ الـمـزيـد 🐤 ¦ ✰☾',
            sections: [{
                title: 'بـاقـي الـخـيـارات',
                rows: [
                    { header: '', title: 'ربـمـا', description: '', id: '.مارد ربما' },
                    { header: '', title: 'مـش عـارف', description: '', id: '.مارد لا أعرف' },
                    { header: '', title: 'رجَـوع خـطـوه', description: '', id: '.مارد رجوع' },
                    { header: '', title: 'الـغـاء الـعـبة', description: '', id: '.مارد حذف' },
                ],
            }],
        }),
    }
    const payload = {
        text: `مارد يـقـول🐤:\n${question}`,
        footer: 'جـاري الـتـخـمـين....🔥',
        title: 'لـعـبه الـمـارد😂',
        buttons: [
            { text: '☽✰ ¦ نـعـم 🐤 ¦ ✰☾', id: '.مارد نعم' },
            { text: '☽✰ ¦ لا 🐤 ¦ ✰☾', id: '.مارد لا' },
            { text: '☽✰ ¦ لا ربـمـا 🐤 ¦ ✰☾', id: '.مارد ربما لا' },
            other,
        ],
        quoted,
    }

    // نجرّب: صورة محلية ← صورة من الرابط ← من غير صورة
    const attempts = []
    const local = localImg()
    if (local) attempts.push(local)
    if (imgUrl) attempts.push({ url: imgUrl })
    attempts.push(null)

    let lastErr
    for (const image of attempts) {
        try {
            const r = await sendButtons(conn, jid, { ...payload, ...(image ? { image } : {}) })
            console.log(`[مارد] الأزرار اتبعتت (${image ? (Buffer.isBuffer(image) ? 'صورة محلية' : 'صورة: ' + image.url) : 'من غير صورة'})`)
            return r
        } catch (e) {
            lastErr = e
            console.error('[مارد] محاولة إرسال فشلت:', e?.message || e)
        }
    }
    return conn.sendMessage(jid, {
        text: `مارد يـقـول🐤:\n${question}\n\n✍️ جاوب بـ:\n.مارد نعم | .مارد لا | .مارد لا أعرف | .مارد ربما | .مارد ربما لا\n.مارد رجوع | .مارد حذف\n\n⚙️ سبب فشل الأزرار: ${String(lastErr?.message || lastErr).slice(0, 150)}`,
    }, { quoted })
}

const sendWin = (conn, m, w) => conn.sendMessage(m.chat, {
    ...(w.photo ? { image: { url: w.photo } } : {}),
    [w.photo ? 'caption' : 'text']: `🧞 على ما أظن أنك تفكر بـ:\n${w.name}\n${w.desc || 'بدون وصف'}`,
}, { quoted: m })

// ───────── الأمر ─────────
let handler = async function (m, { text, conn }) {
    if (!conn.aki) conn.aki = {}
    const key = `${m.chat}-${m.sender}`
    const session = conn.aki[key]
    text = (text || '').trim()

    if (!text) {
        try {
            return await sendButtons(conn, m.chat, {
                text: '🧞‍هل تريد بدء لعبة مارد؟',
                footer: 'اختر احد الخيارات التالية :',
                title: 'لعبة المارد الازرق..🧞',
                buttons: [
                    { text: '📘 المساعدة', id: '.مارد المساعدة' },
                    { text: '🎮 بدء اللـعبة', id: '.مارد ابدا' },
                ],
                quoted: m,
            })
        } catch (e) {
            console.error('[مارد] القائمة فشلت:', e.message)
            return m.reply('🧞 لعبة المارد\n\n.مارد ابدا → بدء اللعبة\n.مارد المساعدة → الشرح')
        }
    }

    if (text === 'المساعدة') {
        return m.reply(`📘 شرح أوامر لعبة مارد :\n\n-.مارد ابدا → بدء اللعبة\n-.مارد نعم / لا / لا أعرف / ربما / ربما لا → إرسال إجابة\n-.مارد رجوع → الرجوع للسؤال السابق\n-.مارد حذف → حذف الجلسة الحالية`)
    }

    if (text === 'ابدا') {
        const errors = []
        for (const p of PROVIDERS) {
            try {
                const s = await p.start()
                conn.aki[key] = s
                console.log(`[مارد] ✅ ${p.name}`)
                return sendQuestion(conn, m.chat, s.first.question, s.first.img, m)
            } catch (e) {
                errors.push(`${p.name}: ${shortErr(e)}`)
                console.error(`[مارد] ❌ ${p.name}:`, e?.message || e)
            }
        }
        return m.reply(`❌ مقدرتش أبدأ اللعبة.\n\n🔧 السبب:\n${errors.map(e => `• ${e}`).join('\n')}`)
    }

    if (text === 'حذف') {
        if (!session) return m.reply('لا توجد جلسة نشطة')
        delete conn.aki[key]
        return m.reply('تم حذف الجلسة بنجاح')
    }

    const isBack = text === 'رجوع'
    if (isBack || Object.prototype.hasOwnProperty.call(ANSWERS, text)) {
        if (!session) return m.reply(isBack ? 'لا توجد جلسة نشطة' : 'لا توجد جلسه نشطه حاليا،ابدأ جلسه عبر .مارد ابدا')
        try {
            const fn = session.provider === 'client' ? clientAnswer : obitoAnswer
            const r = await fn(session, ANSWERS[text], isBack)
            if (r.win) { delete conn.aki[key]; return sendWin(conn, m, r.win) }
            return sendQuestion(conn, m.chat, r.question, r.img, m)
        } catch (e) {
            console.error('[مارد]', e?.message || e)
            return m.reply(`⚠️ ${isBack ? 'لا يمكن الرجوع حالياً' : 'حدث خطأ أثناء الإجابة'}\n🔧 ${shortErr(e)}`)
        }
    }
}

handler.command = /^مارد$/i
export default handler