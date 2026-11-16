/**
 * plugins/حديث.js
 * ⛩️ SUKUNA BOT - .حديث <موضوع / كلمة>
 * البوت بيدور في الدرر السنية ويجيب أول حديث بالأولوية:
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

// اختياري: لو الموقع رافض IP السيرفر، حط رابط API وسيط في متغير البيئة
// مثال: DORAR_PROXY=https://your-proxy.vercel.app/v1/site/hadith/search
// (لازم يرجّع { data: [{ hadith, rawi, mohdith, book, numberOrPage, grade }] })
const PROXY = process.env.DORAR_PROXY || ''

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

// ════════════════════════════════════════════
//          تصنيف المصدر (جابو منين)
// ════════════════════════════════════════════

function detectSource(sourceText) {
    const s = norm(sourceText)
    const bukhari = s.includes('صحيح البخاري')
    const muslim = s.includes('صحيح مسلم')
    if (bukhari && muslim) return { key: 'both', name: 'متفق عليه (البخاري ومسلم)', icon: '📗📘' }
    if (bukhari) return { key: 'bukhari', name: 'صحيح البخاري', icon: '📗' }
    if (muslim) return { key: 'muslim', name: 'صحيح مسلم', icon: '📘' }
    return { key: 'other', name: sourceText || 'مصدر غير معروف', icon: '📚' }
}

// ════════════════════════════════════════════
//     تصنيف الحكم (مستقل عن المصدر تماماً)
// ════════════════════════════════════════════

// tier أقل = أقوى
function detectGrade(gradeText) {
    const g = norm(gradeText)

    const weak = /(ضعيف|موضوع|منكر|باطل|لا يصح|ليس بصحيح|لم يصح|لا اصل|مكذوب|واه|متروك)/.test(g)
    const disputed = /(اختلف|مختلف|مقال|لين|فيه ضعف|تفرد|مرسل|منقطع|مجهول|لا يثبت|شاذ)/.test(g)

    if (weak) return { tier: 4, label: '❌ غير متأكدين منه (ضعيف)' }
    if (disputed) return { tier: 3, label: '⚠️ مختلف عليه (العلماء اختلفوا في صحته)' }
    if (/صحيح/.test(g)) return { tier: 1, label: '✅ متأكدين منه (صحيح)' }
    if (/حسن/.test(g)) return { tier: 2, label: '✅ متأكدين منه (حسن)' }
    return { tier: 3, label: '⚠️ مش متأكدين منه (الحكم مش واضح)' }
}

// ════════════════════════════════════════════
//                   البحث
// ════════════════════════════════════════════

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

        if (text) out.push({
            text,
            narrator: info['الراوي'] || '',
            scholar: info['المحدث'] || '',
            source: info['المصدر'] || '',
            page: info['الصفحة أو الرقم'] || '',
            grade: info['خلاصة حكم المحدث'] || ''
        })
    }
    return out
}

// الموقع الرسمي: بيجرب أكتر من User-Agent ولو اترفض (403/429) بيستنى ويعيد
async function fetchFromDorar(query) {
    let lastErr
    for (let i = 0; i < UAS.length; i++) {
        try {
            const r = await axios.get(API, {
                params: { skey: query },
                headers: {
                    'User-Agent': UAS[i],
                    'Accept': 'application/json, text/plain, */*',
                    'Accept-Language': 'ar,en;q=0.8',
                    'Referer': 'https://dorar.net/',
                    'Origin': 'https://dorar.net'
                },
                timeout: 25000
            })
            const html = r.data?.ahadith?.result
            if (!html) throw new Error('الموقع ماردش بنتايج')
            return parseResults(html)
        } catch (e) {
            lastErr = e
            const st = e.response?.status
            console.log(`[hadith] dorar محاولة ${i + 1} فشلت:`, st || e.message)
            if (st === 403 || st === 429) await sleep(1200)
            else break
        }
    }
    throw lastErr
}

// الـ API الوسيط (اختياري)
async function fetchFromProxy(query) {
    const r = await axios.get(PROXY, {
        params: { value: query },
        headers: { 'User-Agent': UAS[0], 'Accept': 'application/json' },
        timeout: 25000
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

async function searchHadith(query) {
    const key = query.toLowerCase()
    const cached = global.hadithCache.get(key)
    if (cached && Date.now() - cached.time < CACHE_TTL) return cached.results

    let raw
    try {
        raw = await fetchFromDorar(query)
    } catch (e) {
        if (!PROXY) {
            const st = e.response?.status
            throw new Error(st === 403
                ? 'الدرر السنية رافضة الطلب من السيرفر (403)'
                : e.message)
        }
        console.log('[hadith] بجرب الـ API الوسيط...')
        raw = await fetchFromProxy(query)
    }

    const results = raw.map(h => ({
        ...h,
        src: detectSource(h.source),
        grd: detectGrade(h.grade)
    }))

    global.hadithCache.set(key, { results, time: Date.now() })
    if (global.hadithCache.size > 50) global.hadithCache.delete(global.hadithCache.keys().next().value)
    return results
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
        text += `\n💡 مالقيناش حديث متأكد منه، ده أقرب حاجة لقيناها والعلماء مختلفين فيه.\n`
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
            text: `📜 *الحديث الشريف*\n\n${usedPrefix}${command} <الموضوع>\n\n💡 *أمثلة:*\n${usedPrefix}${command} الصبر\n${usedPrefix}${command} بر الوالدين\n${usedPrefix}${command} الصدق\n\n⛩️ SUKUNA BOT ⛩️`
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