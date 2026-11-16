/**
 * plugins/حديث.js
 * ⛩️ SUKUNA BOT - .حديث <موضوع / كلمة>
 * البوت بيدور في الدرر السنية (عدة صفحات + صيغ مختلفة للكلمة) ويجيب أول حديث بالأولوية:
 * صحيح → حسن → مختلف عليه → ضعيف (وجوه نفس الدرجة الصحيحين الأول)
 * وبيكتب جنب المصدر هو متأكد منه ولا لأ (حسب حكم المحدّث مش حسب الكتاب)
 */

import axios from 'axios'

const UAS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
]
const API = 'https://dorar.net/dorar_api.json'

// اختياري: API وسيط لو الموقع رافض IP السيرفر
// مثال: DORAR_PROXY=https://your-proxy.vercel.app/v1/site/hadith/search
const PROXY = process.env.DORAR_PROXY || ''

const MAX_PAGES = 8            // أقصى عدد صفحات بيفحصها لكل صيغة بحث
const DEBUG = true             // يطبع الحكم الخام في الكونسول (قفله بعد ما تتأكد)
const MAX_HADITH_CHARS = 1800
const CACHE_TTL = 30 * 60 * 1000

if (!global.hadithCache) global.hadithCache = new Map()

const sleep = ms => new Promise(r => setTimeout(r, ms))

// ════════════════════════════════════════════
//                  أدوات النص
// ════════════════════════════════════════════

function cleanQuery(s) {
    return String(s || '')
        .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
}

function decodeEntities(s) {
    return s
        .replace(/&nbsp;/g, ' ')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
}

function stripHtml(s) {
    return decodeEntities(String(s || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ''))
        .replace(/[ \t]+/g, ' ')
        .trim()
}

const norm = s => String(s || '')
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')

// صيغ البحث: الكلمة زي ما هي، وبعدها من غير "ال" (الصبر ← صبر)
function queryVariants(q) {
    const out = [q]
    const stripped = q.split(' ').map(w => w.replace(/^(وال|بال|لل|ال)(?=.{2,})/, '')).join(' ').trim()
    if (stripped && stripped !== q) out.push(stripped)
    return out
}

// ════════════════════════════════════════════
//          تصنيف المصدر (جابو منين)
// ════════════════════════════════════════════

function detectSource(sourceText) {
    const s = norm(sourceText)
    const bukhari = s.includes('صحيح البخاري') || s.includes('الجامع الصحيح')
    const muslim = s.includes('صحيح مسلم')
    if (bukhari && muslim) return { key: 'both', name: 'متفق عليه (البخاري ومسلم)', icon: '📗📘' }
    if (bukhari) return { key: 'bukhari', name: 'صحيح البخاري', icon: '📗' }
    if (muslim) return { key: 'muslim', name: 'صحيح مسلم', icon: '📘' }
    return { key: 'other', name: sourceText || 'مصدر غير معروف', icon: '📚' }
}

// ════════════════════════════════════════════
//     تصنيف الحكم (من حكم المحدّث نفسه)
// ════════════════════════════════════════════

// tier أقل = أقوى
function detectGrade(gradeText) {
    const g = norm(gradeText)

    if (!g) return { tier: 3, label: '⚠️ مش متأكدين منه (مفيش حكم مكتوب)' }

    const weak = /(ضعيف|موضوع|منكر|باطل|لا يصح|ليس بصحيح|لم يصح|لا اصل له|مكذوب|متروك)/.test(g)
    const disputed = /(اختلف|مختلف|فيه مقال|لين|فيه ضعف|تفرد|مرسل|منقطع|مجهول|لا يثبت|شاذ)/.test(g)
    // "أخرجه في صحيحه" / "متفق عليه" = حكم البخاري/مسلم نفسه بالصحة
    const inSahih = /(اخرجه في صحيحه|خرجه في صحيحه|رواه في صحيحه|في صحيحه|متفق عليه|اخرجه البخاري ومسلم|رواه البخاري ومسلم)/.test(g)

    if (weak) return { tier: 4, label: '❌ غير متأكدين منه (ضعيف)' }
    if (inSahih) return { tier: 1, label: '✅ متأكدين منه (صحيح)' }
    if (disputed) return { tier: 3, label: '⚠️ مختلف عليه (العلماء اختلفوا في صحته)' }
    if (/صحيح/.test(g) || /اسناده جيد|اسناده قوي/.test(g)) return { tier: 1, label: '✅ متأكدين منه (صحيح)' }
    if (/حسن/.test(g)) return { tier: 2, label: '✅ متأكدين منه (حسن)' }
    return { tier: 3, label: '⚠️ مش متأكدين منه (الحكم مش واضح)' }
}

// ════════════════════════════════════════════
//                   جلب الصفحات
// ════════════════════════════════════════════

function pickInfo(info, ...needles) {
    for (const [k, v] of Object.entries(info)) {
        const nk = norm(k)
        if (needles.every(n => nk.includes(norm(n)))) return v
    }
    return ''
}

function parseResults(html) {
    const out = []
    const re = /<div class="hadith"[^>]*>([\s\S]*?)<\/div>\s*<div class="hadith-info">([\s\S]*?)<\/div>/g
    let m
    while ((m = re.exec(html)) !== null) {
        let text = stripHtml(m[1]).replace(/^\d+\s*-\s*/, '')

        const info = {}
        const infoRe = /<span class="info-subtitle">([^<]*)<\/span>\s*([^<]*)/g
        let im
        while ((im = infoRe.exec(m[2])) !== null) {
            const label = im[1].replace(/:/g, '').trim()
            info[label] = decodeEntities(im[2]).trim()
        }

        let grade = pickInfo(info, 'حكم') || pickInfo(info, 'خلاصه')
        if (!grade) {
            for (const v of Object.values(info)) {
                if (/(صحيح|حسن|ضعيف|موضوع)/.test(norm(v))) { grade = v; break }
            }
        }

        if (text) out.push({
            text,
            narrator: pickInfo(info, 'الراوي'),
            scholar: Object.entries(info).find(([k]) => norm(k).includes('المحدث') && !norm(k).includes('حكم') && !norm(k).includes('خلاصه'))?.[1] || '',
            source: pickInfo(info, 'المصدر'),
            page: pickInfo(info, 'الصفحه') || pickInfo(info, 'الرقم'),
            grade
        })
    }
    return out
}

async function fetchFromDorar(query, page) {
    let lastErr
    for (let i = 0; i < UAS.length; i++) {
        try {
            const r = await axios.get(API, {
                params: { skey: query, page },
                headers: {
                    'User-Agent': UAS[i],
                    'Accept': 'application/json, text/plain, */*',
                    'Accept-Language': 'ar,en;q=0.8',
                    'Referer': 'https://dorar.net/',
                    'Origin': 'https://dorar.net'
                },
                timeout: 20000
            })
            const html = r.data?.ahadith?.result
            if (!html) return []
            return parseResults(html)
        } catch (e) {
            lastErr = e
            const st = e.response?.status
            console.log(`[hadith] dorar (${query} | ص${page}) محاولة ${i + 1} فشلت:`, st || e.message)
            if (st === 403 || st === 429) await sleep(1200)
            else break
        }
    }
    throw lastErr
}

async function fetchFromProxy(query, page) {
    const r = await axios.get(PROXY, {
        params: { value: query, page },
        headers: { 'User-Agent': UAS[0], 'Accept': 'application/json' },
        timeout: 20000
    })
    const list = r.data?.data
    if (!Array.isArray(list) || !list.length) return []
    return list.map(h => ({
        text: stripHtml(h.hadith),
        narrator: h.rawi || '',
        scholar: h.mohdith || '',
        source: h.book || '',
        page: h.numberOrPage || '',
        grade: h.grade || ''
    })).filter(h => h.text)
}

async function fetchPage(query, page) {
    try {
        return await fetchFromDorar(query, page)
    } catch (e) {
        if (!PROXY) {
            const st = e.response?.status
            throw new Error(st === 403 ? 'الدرر السنية رافضة الطلب من السيرفر (403)' : e.message)
        }
        return await fetchFromProxy(query, page)
    }
}

const enrich = h => ({ ...h, src: detectSource(h.source), grd: detectGrade(h.grade) })
const isStrong = h => h.grd.tier === 1 && h.src.key !== 'other'

// بيجمع النتايج من صفحات وصيغ كتير ويقف أول ما يلاقي صحيح من الصحيحين
async function searchHadith(query) {
    const key = query.toLowerCase()
    const cached = global.hadithCache.get(key)
    if (cached && Date.now() - cached.time < CACHE_TTL) return cached.results

    const all = []
    const seen = new Set()
    let done = false

    for (const variant of queryVariants(query)) {
        for (let page = 1; page <= MAX_PAGES; page++) {
            let list
            try {
                list = await fetchPage(variant, page)
            } catch (e) {
                if (!all.length && page === 1) throw e
                break
            }
            if (!list.length) break

            let added = 0
            for (const raw of list) {
                const k = norm(raw.text).slice(0, 100)
                if (seen.has(k)) continue
                seen.add(k)
                all.push(enrich(raw))
                added++
            }
            if (!added) break
            if (all.some(isStrong)) { done = true; break }
        }
        if (done) break
    }

    if (DEBUG) {
        console.log(`[hadith debug] "${query}" → ${all.length} نتيجة`)
        all.slice(0, 8).forEach((h, i) =>
            console.log(`  #${i + 1} | مصدر: "${h.source}" | حكم خام: "${h.grade}" | tier: ${h.grd.tier}`))
    }

    global.hadithCache.set(key, { results: all, time: Date.now() })
    if (global.hadithCache.size > 50) global.hadithCache.delete(global.hadithCache.keys().next().value)
    return all
}

// الأولوية: الحكم الأول، وجوه نفس الحكم الصحيحين قبل غيرهم، وبعدها ترتيب الموقع
function pickHadith(results) {
    const isSahihayn = h => h.src.key !== 'other' ? 0 : 1
    let best = null
    for (const h of results) {
        if (
            !best ||
            h.grd.tier < best.grd.tier ||
            (h.grd.tier === best.grd.tier && isSahihayn(h) < isSahihayn(best))
        ) best = h
    }
    return best
}

// ════════════════════════════════════════════
//                  بناء الرسالة
// ════════════════════════════════════════════

function buildText(query, h) {
    let body = h.text
    if (body.length > MAX_HADITH_CHARS) body = body.slice(0, MAX_HADITH_CHARS).trim() + '...'

    let text = `📜 *حديث عن: ${query}*\n\n`
    text += `${body}\n\n━━━━━━━━━━━━━━━\n`
    if (h.narrator) text += `👤 *الراوي:* ${h.narrator}\n`
    text += `${h.src.icon} *المصدر:* ${h.src.name}${h.page ? ` (${h.page})` : ''}\n`
    text += `🔒 *التأكد:* ${h.grd.label}\n`
    if (h.scholar) text += `🎓 *المحدّث:* ${h.scholar}\n`
    if (h.grade) text += `📝 *حكم المحدّث:* ${h.grade}\n`

    if (h.grd.tier === 4) {
        text += `\n💡 مالقيناش حديث متأكد منه في الموضوع ده، ده أقرب حاجة لقيناها.\n`
    } else if (h.grd.tier === 3) {
        text += `\n💡 مالقيناش حديث متأكد منه، ده أقرب حاجة لقيناها.\n`
    } else if (h.src.key === 'other') {
        text += `\n💡 مالقيناش في الصحيحين، ده أقوى حديث لقيناه من كتب تانية.\n`
    }

    text += '\n⛩️ SUKUNA BOT ⛩️'
    return text
}

// ════════════════════════════════════════════
//                    الأمر
// ════════════════════════════════════════════

let handler = async (m, { conn, args, usedPrefix, command }) => {
    const react = async e => { try { await conn.sendMessage(m.chat, { react: { text: e, key: m.key } }) } catch {} }

    const query = cleanQuery(args.join(' '))

    if (!query) {
        return conn.sendMessage(m.chat, {
            text: `📜 *الحديث الشريف*\n\n${usedPrefix}${command} <الموضوع>\n\n💡 *أمثلة:*\n${usedPrefix}${command} الصبر\n${usedPrefix}${command} الرحمة\n${usedPrefix}${command} السماح\n\n⛩️ SUKUNA BOT ⛩️`
        }, { quoted: m })
    }

    await react('🔍')

    try {
        const results = await searchHadith(query)
        if (!results.length) {
            await react('❌')
            return conn.sendMessage(m.chat, { text: `❌ مفيش حديث عن "${query}"\n\n💡 جرب كلمة تانية أو أبسط` }, { quoted: m })
        }

        const h = pickHadith(results)
        await conn.sendMessage(m.chat, { text: buildText(query, h) }, { quoted: m })
        await react('✅')
    } catch (e) {
        console.error('[hadith]', e.message)
        await react('❌')
        await conn.sendMessage(m.chat, { text: '❌ فشل البحث: ' + e.message }, { quoted: m })
    }
}

handler.help = ['حديث <موضوع>']
handler.tags = ['islamic']
handler.command = /^(حديث|احاديث|أحاديث|hadith)$/i

export default handler