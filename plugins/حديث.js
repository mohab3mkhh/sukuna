/**
 * plugins/حديث.js
 * ⛩️ SUKUNA BOT - .حديث <موضوع / كلمة>
 * بيدور في الدرر السنية → حديث واحد (نص فقط) + هل هو من البخاري/مسلم + موكد ولا لأ
 */

import axios from 'axios'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36'
const API = 'https://dorar.net/dorar_api.json'

const MAX_HADITH_CHARS = 1800
const PICK_FROM = 5            // بيختار عشوائي من أول كام حديث صحيح عشان النتيجة تتنوع
const CACHE_TTL = 30 * 60 * 1000

if (!global.hadithCache) global.hadithCache = new Map()

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

const norm = s => String(s || '').replace(/[\u064B-\u065F\u0670\u0640]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه')

// ════════════════════════════════════════════
//             تصنيف المصدر والحكم
// ════════════════════════════════════════════

function detectSource(sourceText) {
    const s = norm(sourceText)
    if (s.includes('صحيح البخاري')) return { key: 'bukhari', label: '📗 من صحيح البخاري' }
    if (s.includes('صحيح مسلم')) return { key: 'muslim', label: '📘 من صحيح مسلم' }
    return { key: 'other', label: `📚 مش من الصحيحين${sourceText ? ` (${sourceText})` : ''}` }
}

function detectGrade(gradeText, sourceKey) {
    const g = norm(gradeText)
    // الأول نشوف النفي والتضعيف
    const weak = /(ضعيف|موضوع|منكر|باطل|لا يصح|ليس بصحيح|لم يصح|لا اصل|مكذوب|واه)/.test(g)
    if (weak) return { sure: false, label: '⚠️ *غير موكد* (ضعيف)' }
    if (sourceKey === 'bukhari' || sourceKey === 'muslim') return { sure: true, label: '✅ *موكد* (صحيح)' }
    if (/صحيح/.test(g)) return { sure: true, label: '✅ *موكد* (صحيح)' }
    if (/حسن/.test(g)) return { sure: true, label: '✅ *موكد* (حسن)' }
    return { sure: false, label: '⚠️ *غير موكد* (الحكم مش واضح)' }
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

async function searchHadith(query) {
    const key = query.toLowerCase()
    const cached = global.hadithCache.get(key)
    if (cached && Date.now() - cached.time < CACHE_TTL) return cached.results

    const r = await axios.get(API, {
        params: { skey: query },
        headers: { 'User-Agent': UA, 'Accept-Language': 'ar,en;q=0.8' },
        timeout: 25000
    })

    const html = r.data?.ahadith?.result
    if (!html) throw new Error('الموقع ماردش بنتايج')

    const results = parseResults(html).map(h => {
        const src = detectSource(h.source)
        return { ...h, src, grd: detectGrade(h.grade, src.key) }
    })

    global.hadithCache.set(key, { results, time: Date.now() })
    if (global.hadithCache.size > 50) global.hadithCache.delete(global.hadithCache.keys().next().value)
    return results
}

// الأولوية: الصحيحين → أي صحيح/حسن → أي حاجة
function pickHadith(results) {
    const sahihayn = results.filter(h => h.src.key !== 'other')
    const sure = results.filter(h => h.grd.sure)
    const pool = sahihayn.length ? sahihayn : sure.length ? sure : results
    const top = pool.slice(0, PICK_FROM)
    return top[Math.floor(Math.random() * top.length)]
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
    text += `${h.src.label}${h.page ? ` (${h.page})` : ''}\n`
    text += `${h.grd.label}\n`
    if (h.scholar) text += `🎓 *المحدّث:* ${h.scholar}\n`
    if (h.grade) text += `📝 *الحكم:* ${h.grade}\n`
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