/**
 * plugins/ترجم.js — ترجمة النصوص لأي لغة
 * سبب العطل: جوجل بيرجّع صفحة HTML (حظر/كابتشا على IP السيرفر) بدل JSON، والكود كان بيعمل .json() على طول.
 * الحل: بنتأكد إن الرد JSON، ولو لأ بنجرّب مصدر تاني تلقائي (4 مصادر).
 * كمان: النص بقى محفوظ في الذاكرة وID الزرار قصير (بدل ما النص كله يتحط في الـ ID).
 */

import { sendButtons, btn, getButtonId } from '../lib/buttons.js'

const GROUPS = [
    ['🔥 الأكثر استخدامًا', { ar: 'العربية', en: 'الإنجليزية', fr: 'الفرنسية', es: 'الإسبانية', de: 'الألمانية', it: 'الإيطالية', ru: 'الروسية', tr: 'التركية', pt: 'البرتغالية', 'zh-CN': 'الصينية', ja: 'اليابانية', ko: 'الكورية', hi: 'الهندية', fa: 'الفارسية', ur: 'الأردية' }],
    ['🇪🇺 لغات أوروبا', { nl: 'الهولندية', sv: 'السويدية', pl: 'البولندية', uk: 'الأوكرانية', ro: 'الرومانية', el: 'اليونانية', cs: 'التشيكية', hu: 'المجرية', fi: 'الفنلندية', da: 'الدنماركية', no: 'النرويجية', sk: 'السلوفاكية', bg: 'البلغارية', sr: 'الصربية', hr: 'الكرواتية', sl: 'السلوفينية', lt: 'الليتوانية', lv: 'اللاتفية', et: 'الإستونية', is: 'الأيسلندية', ga: 'الأيرلندية', ca: 'الكتالونية', sq: 'الألبانية', mk: 'المقدونية', be: 'البيلاروسية', mt: 'المالطية', cy: 'الويلزية', eu: 'الباسكية', gl: 'الجاليكية', bs: 'البوسنية', lb: 'اللوكسمبورجية' }],
    ['🌏 آسيا والشرق الأوسط', { he: 'العبرية', th: 'التايلاندية', vi: 'الفيتنامية', id: 'الإندونيسية', ms: 'الماليزية', fil: 'الفلبينية', 'zh-TW': 'الصينية التقليدية', bn: 'البنغالية', ta: 'التاميلية', te: 'التيلوجو', ml: 'المالايالامية', kn: 'الكانادا', mr: 'المراثية', gu: 'الغوجاراتية', pa: 'البنجابية', ne: 'النيبالية', si: 'السنهالية', my: 'البورمية', km: 'الخميرية', lo: 'اللاوية', mn: 'المنغولية', ka: 'الجورجية', hy: 'الأرمينية', az: 'الأذرية', kk: 'الكازاخية', uz: 'الأوزبكية', ky: 'القيرغيزية', tg: 'الطاجيكية', ps: 'البشتو', ku: 'الكردية', sd: 'السندية', ug: 'الأويغورية', tk: 'التركمانية' }],
    ['🌍 أفريقيا ولغات أخرى', { sw: 'السواحيلية', af: 'الأفريكانية', am: 'الأمهرية', so: 'الصومالية', ha: 'الهوسا', yo: 'اليوروبا', ig: 'الإيجبو', zu: 'الزولو', xh: 'الخوسا', sn: 'الشونا', st: 'السوتو', ny: 'التشيشيوا', mg: 'المالاغاشية', rw: 'الكينيارواندا', eo: 'الإسبرانتو', la: 'اللاتينية', yi: 'اليديشية', ht: 'الكريولية الهايتية', haw: 'الهاوايية', mi: 'الماورية', sm: 'الساموية', jw: 'الجاوية', su: 'السوندانية', ceb: 'السيبوانو', gd: 'الغيلية الإسكتلندية', fy: 'الفريزية', co: 'الكورسيكية', hmn: 'الهمونغ' }],
]
const LANGUAGES = Object.assign({}, ...GROUPS.map(g => g[1]))

const IMAGE_URL = 'https://files.catbox.moe/hm0l6b.jpg'
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36' }

if (!global.transJobs) global.transJobs = new Map()
const JOB_TTL = 60 * 60 * 1000

async function getJson(url) {
    const ctl = new AbortController()
    const t = setTimeout(() => ctl.abort(), 12000)
    try {
        const r = await fetch(url, { headers: UA, signal: ctl.signal })
        const body = await r.text()
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        try { return JSON.parse(body) } catch { throw new Error('الرد مش JSON (حظر)') }
    } finally { clearTimeout(t) }
}

// كل مصدر بيرجّع { text, from }
const PROVIDERS = [
    ['google-gtx', async (q, tl) => {
        const d = await getJson(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${tl}&dt=t&q=${encodeURIComponent(q)}`)
        const text = (d?.[0] || []).map(x => x?.[0]).filter(Boolean).join('')
        if (!text) throw new Error('رد فاضي')
        return { text, from: d?.[2] }
    }],
    ['google-chrome', async (q, tl) => {
        const d = await getJson(`https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=auto&tl=${tl}&q=${encodeURIComponent(q)}`)
        const text = d?.sentences ? d.sentences.map(s => s.trans).filter(Boolean).join('') : (Array.isArray(d) ? (Array.isArray(d[0]) ? d[0][0] : d[0]) : '')
        if (!text) throw new Error('رد فاضي')
        return { text, from: d?.src || (Array.isArray(d?.[0]) ? d[0][1] : undefined) }
    }],
    ['google-package', async (q, tl) => {
        const mod = await import('@vitalets/google-translate-api')
        const fn = mod.translate || mod.default?.translate || mod.default
        const r = await fn(q, { to: tl })
        if (!r?.text) throw new Error('رد فاضي')
        return { text: r.text, from: r.raw?.src || r.from?.language?.iso }
    }],
    ['lingva', async (q, tl) => {
        if (q.length > 1500) throw new Error('النص طويل')
        const d = await getJson(`https://lingva.ml/api/v1/auto/${tl}/${encodeURIComponent(q)}`)
        if (!d?.translation) throw new Error('رد فاضي')
        return { text: d.translation, from: d?.info?.detectedSource }
    }],
]

async function translateText(q, tl) {
    const errs = []
    for (const [name, fn] of PROVIDERS) {
        try { const r = await fn(q, tl); console.log('[ترجم] ✅', name); return r }
        catch (e) { errs.push(`${name}: ${e.message}`); console.error('[ترجم] ❌', name, e.message) }
    }
    throw new Error(errs.join(' | '))
}

const handler = async (m, { conn, text, usedPrefix, command }) => {
    if (!text) return m.reply(`❌ *يرجى إدخال النص الذي تريد ترجمته.*\n\n📌 *مثال:*\n> ${usedPrefix + command} مرحبا`)

    const now = Date.now()
    for (const [k, v] of global.transJobs) if (now - v.t > JOB_TTL) global.transJobs.delete(k)
    const token = Math.random().toString(36).slice(2, 8)
    global.transJobs.set(token, { text, t: now })

    const sections = GROUPS.map(([title, langs]) => ({
        title,
        rows: Object.entries(langs).map(([code, name]) => ({ title: `🌍 ${name}`, description: `ترجمة إلى ${name}`, id: `trans_${code}_${token}` })),
    }))

    await sendButtons(conn, m.chat, {
        title: '🌐 الترجمة',
        subtitle: text.slice(0, 50),
        text: `📖 *النص:* ${text}\n\n🌍 *اختر اللغة التي تريد الترجمة إليها:*`,
        footer: '⛩️ SUKUNA BOT',
        image: IMAGE_URL,
        buttons: [btn.list('❲ قائمة اللغات ❳', sections)],
    }, m)

    try { await m.react('✔️') } catch {}
}

handler.before = async function (m, { conn }) {
    const buttonId = getButtonId(m)
    if (!buttonId || !buttonId.startsWith('trans_')) return false

    const [, langCode, token] = buttonId.split('_')
    const job = global.transJobs.get(token)
    const langName = LANGUAGES[langCode] || langCode
    if (!job) { await m.reply('⚠️ الطلب انتهت صلاحيته، ابعت *.ترجم <النص>* من جديد'); return true }
    const text = job.text

    try { await m.react('⏳') } catch {}
    try {
        const { text: translated, from } = await translateText(text, langCode)
        const detected = from ? (LANGUAGES[from] || from) : 'تلقائي'

        await sendButtons(conn, m.chat, {
            title: '✅ الترجمة',
            subtitle: langName,
            text: `📖 *النص الأصلي:*\n${text}\n\n🌐 *الترجمة (${langName}):*\n${translated}\n\n🔍 *اللغة المكتشفة:* ${detected}`,
            footer: '⛩️ SUKUNA BOT',
            buttons: [
                btn.reply('🔄 ترجمة تانية', `.ترجم ${text}`.slice(0, 200)),
                btn.copy('📋 نسخ الترجمة', translated),
            ],
        }, m)
        try { await m.react('✅') } catch {}
    } catch (e) {
        console.error('[ترجم]', e.message)
        try { await m.react('❌') } catch {}
        await m.reply(`❌ فشلت الترجمة في كل المصادر:\n${e.message}`)
    }
    return true
}

handler.command = /^(ترجم|translate)$/i
handler.tags = ['tools']
handler.help = ['ترجم <نص>']

export default handler