/**
 * plugins/قران.js
 * ⛩️ SUKUNA BOT - .قران <اسم السورة> [اسم القارئ]
 * بحث يوتيوب عن تلاوة السورة → صوت فقط (بحد أقصى عشان السرعة) + نص السورة كامل
 */

import axios from 'axios'
import nodeFetch from 'node-fetch'
import { sendButtons, btn, getButtonId } from '../lib/buttons.js'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36'
const HEADERS = {
    'User-Agent': UA,
    'Origin': 'https://iframe.y2meta-uk.com',
    'Referer': 'https://iframe.y2meta-uk.com/'
}

const PREFIX = 'quran_'
const MAX_RESULTS = 8
const MAX_VIDEO_MIN = 40          // نفضّل التلاوات الأقصر من 40 دقيقة عشان التحويل ميطولش
const MAX_AUDIO_MB = 9            // حد الصوت (~10 دقايق بجودة 128) عشان ميعلقش
const DOWNLOAD_TIME_LIMIT = 90000 // لو التحميل عدّى 90 ثانية نبعت اللي نزل
const TEXT_CHUNK = 3500
const CACHE_TTL = 30 * 60 * 1000

if (!global.quranBtnCache) global.quranBtnCache = new Map()
if (!global.quranSearchCache) global.quranSearchCache = new Map()

const sleep = ms => new Promise(r => setTimeout(r, ms))
const genId = () => Math.random().toString(36).slice(2, 10)

// ════════════════════════════════════════════
//                قايمة السور
// ════════════════════════════════════════════

const SURAHS = ['الفاتحة', 'البقرة', 'آل عمران', 'النساء', 'المائدة', 'الأنعام', 'الأعراف', 'الأنفال', 'التوبة', 'يونس',
    'هود', 'يوسف', 'الرعد', 'إبراهيم', 'الحجر', 'النحل', 'الإسراء', 'الكهف', 'مريم', 'طه',
    'الأنبياء', 'الحج', 'المؤمنون', 'النور', 'الفرقان', 'الشعراء', 'النمل', 'القصص', 'العنكبوت', 'الروم',
    'لقمان', 'السجدة', 'الأحزاب', 'سبأ', 'فاطر', 'يس', 'الصافات', 'ص', 'الزمر', 'غافر',
    'فصلت', 'الشورى', 'الزخرف', 'الدخان', 'الجاثية', 'الأحقاف', 'محمد', 'الفتح', 'الحجرات', 'ق',
    'الذاريات', 'الطور', 'النجم', 'القمر', 'الرحمن', 'الواقعة', 'الحديد', 'المجادلة', 'الحشر', 'الممتحنة',
    'الصف', 'الجمعة', 'المنافقون', 'التغابن', 'الطلاق', 'التحريم', 'الملك', 'القلم', 'الحاقة', 'المعارج',
    'نوح', 'الجن', 'المزمل', 'المدثر', 'القيامة', 'الإنسان', 'المرسلات', 'النبأ', 'النازعات', 'عبس',
    'التكوير', 'الانفطار', 'المطففين', 'الانشقاق', 'البروج', 'الطارق', 'الأعلى', 'الغاشية', 'الفجر', 'البلد',
    'الشمس', 'الليل', 'الضحى', 'الشرح', 'التين', 'العلق', 'القدر', 'البينة', 'الزلزلة', 'العاديات',
    'القارعة', 'التكاثر', 'العصر', 'الهمزة', 'الفيل', 'قريش', 'الماعون', 'الكوثر', 'الكافرون', 'النصر',
    'المسد', 'الإخلاص', 'الفلق', 'الناس']

const ALIASES = { 'ياسين': 36, 'تبارك': 67, 'عم': 78, 'الاخلاص': 112, 'قل هو الله احد': 112, 'ال عمران': 3, 'الكرسي': 2 }

function normalize(s) {
    return String(s || '')
        .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
        .replace(/[أإآٱ]/g, 'ا')
        .replace(/ى/g, 'ي')
        .replace(/ة/g, 'ه')
        .replace(/\s+/g, ' ')
        .trim()
}

// بيرجّع { number, name, rest } — rest = اسم القارئ (لو اتكتب)
function parseQuery(args) {
    let text = normalize(args.join(' ')).replace(/^سوره\s+/, '')
    if (!text) return null

    const num = text.match(/^(\d{1,3})(?:\s+(.*))?$/)
    if (num && +num[1] >= 1 && +num[1] <= 114) {
        return { number: +num[1], name: SURAHS[+num[1] - 1], rest: (num[2] || '').trim() }
    }

    let best = null
    const consider = (key, number) => {
        const k = normalize(key)
        if (!k) return
        if (text === k || text.startsWith(k + ' ')) {
            if (!best || k.length > best.len) best = { number, len: k.length, rest: text.slice(k.length).trim() }
        }
    }
    SURAHS.forEach((name, i) => {
        consider(name, i + 1)
        if (name.startsWith('ال')) consider(name.slice(2), i + 1)
    })
    for (const [k, n] of Object.entries(ALIASES)) consider(k, n)

    if (!best) return null
    return { number: best.number, name: SURAHS[best.number - 1], rest: best.rest }
}

// ════════════════════════════════════════════
//                نص السورة
// ════════════════════════════════════════════

const toArabicDigits = n => String(n).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[d])

async function getSurahAyahs(number) {
    try {
        const r = await axios.get(`https://api.alquran.cloud/v1/surah/${number}/quran-uthmani`, { timeout: 25000 })
        const ayahs = r.data?.data?.ayahs
        if (ayahs?.length) return ayahs.map(a => ({ n: a.numberInSurah, text: a.text.trim() }))
    } catch (e) {
        console.log('[quran text] alquran.cloud فشل:', e.message)
    }

    const r = await axios.get(`https://api.quran.com/api/v4/quran/verses/uthmani?chapter_number=${number}`, { timeout: 25000 })
    const verses = r.data?.verses
    if (!verses?.length) throw new Error('فشل جلب نص السورة')
    return verses.map(v => ({ n: +String(v.verse_key).split(':')[1], text: v.text_uthmani.trim() }))
}

// بيقسّم النص لرسايل (عند حدود الآيات) عشان واتساب ميرفضش الرسالة الطويلة
function buildTextChunks(surahName, ayahs, header) {
    const chunks = []
    let cur = header + `📖 *سورة ${surahName}*\n\n`
    for (const a of ayahs) {
        const line = `${a.text} ﴿${toArabicDigits(a.n)}﴾ `
        if (cur.length + line.length > TEXT_CHUNK) {
            chunks.push(cur.trim())
            cur = ''
        }
        cur += line
    }
    if (cur.trim()) chunks.push(cur.trim())
    return chunks
}

// ════════════════════════════════════════════
//                بحث يوتيوب
// ════════════════════════════════════════════

function durationToSec(str) {
    if (!str) return 0
    return str.split(':').reverse().reduce((s, p, i) => s + (parseInt(p) || 0) * 60 ** i, 0)
}

async function searchYouTube(query) {
    const key = query.toLowerCase().trim()
    const cached = global.quranSearchCache.get(key)
    if (cached && Date.now() - cached.time < CACHE_TTL) return cached.results

    const res = await nodeFetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, {
        headers: { 'User-Agent': UA, 'Accept-Language': 'ar,en;q=0.8', 'Cookie': 'SOCS=CAI' },
        timeout: 20000
    })
    if (!res.ok) throw new Error('HTTP ' + res.status)
    const html = await res.text()

    const match = html.match(/var ytInitialData = ({.+?});<\/script>/)
    if (!match) throw new Error('ما لقيناش بيانات البحث')

    const data = JSON.parse(match[1])
    const contents = data.contents?.twoColumnSearchResultsRenderer?.primaryContents
        ?.sectionListRenderer?.contents || []

    const all = []
    for (const section of contents) {
        for (const item of section.itemSectionRenderer?.contents || []) {
            const v = item.videoRenderer
            if (!v) continue
            const thumbs = v.thumbnail?.thumbnails || []
            all.push({
                id: v.videoId,
                title: v.title?.runs?.[0]?.text || '',
                author: v.ownerText?.runs?.[0]?.text || '',
                duration: v.lengthText?.simpleText || '',
                seconds: durationToSec(v.lengthText?.simpleText),
                views: v.viewCountText?.simpleText || '',
                thumbnail: thumbs[thumbs.length - 1]?.url || `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`
            })
        }
    }

    // نفضّل التلاوات الأقصر عشان التحويل ميعلقش، ولو كلها طويلة ناخد الأقصر
    const maxSec = MAX_VIDEO_MIN * 60
    const short = all.filter(v => v.seconds > 0 && v.seconds <= maxSec)
    const results = (short.length >= 3
        ? short
        : [...all].filter(v => v.seconds > 0).sort((a, b) => a.seconds - b.seconds)
    ).slice(0, MAX_RESULTS)

    global.quranSearchCache.set(key, { results, time: Date.now() })
    if (global.quranSearchCache.size > 50) global.quranSearchCache.delete(global.quranSearchCache.keys().next().value)
    return results
}

async function getThumbBuffer(url, fallback) {
    for (const u of [url, fallback].filter(Boolean)) {
        try {
            const r = await axios.get(u, { headers: { 'User-Agent': UA }, responseType: 'arraybuffer', timeout: 15000 })
            if (r.data?.length > 1000) return Buffer.from(r.data)
        } catch {}
    }
    return null
}

// ════════════════════════════════════════════
//            تحويل وتحميل الصوت (بحد أقصى)
// ════════════════════════════════════════════

async function getDownloadKey(videoId) {
    const r = await axios.get(`https://cnv.cx/v2/sanity/key?id=${videoId}`, { headers: HEADERS, timeout: 20000 })
    if (!r.data?.key) throw new Error('فشل جلب المفتاح')
    return r.data.key
}

async function convertToMp3(videoId) {
    const key = await getDownloadKey(videoId)
    await sleep(1500)

    const params = new URLSearchParams({
        link: `https://youtu.be/${videoId}`,
        format: 'mp3',
        videoQuality: '720',
        audioBitrate: '128',
        filenameStyle: 'pretty',
        vCodec: 'h264'
    })

    const r = await axios.post('https://cnv.cx/v2/converter', params.toString(), {
        headers: { ...HEADERS, 'Content-Type': 'application/x-www-form-urlencoded', 'accept': '*/*', 'key': key },
        timeout: 120000,
        validateStatus: () => true
    })

    if (r.status === 200 && r.data?.url) return r.data
    if (r.data?.errorMsg) throw new Error(r.data.errorMsg)
    throw new Error('فشل التحويل: ' + r.status)
}

// بيحمّل لحد الحد الأقصى بس ويقطع (MP3 بيشتغل عادي حتى لو اتقطع)
async function downloadCapped(url, maxBytes = MAX_AUDIO_MB * 1024 * 1024) {
    const r = await axios.get(url, {
        headers: { 'User-Agent': UA, 'Referer': 'https://cnv.cx/', 'Origin': 'https://cnv.cx' },
        responseType: 'stream',
        timeout: 60000,
        maxRedirects: 5,
        validateStatus: () => true
    })
    if (r.status !== 200 && r.status !== 206) throw new Error('فشل تحميل الصوت: ' + r.status)

    return await new Promise((resolve, reject) => {
        const chunks = []
        let size = 0
        let done = false

        const finish = (truncated) => {
            if (done) return
            done = true
            clearTimeout(timer)
            try { r.data.destroy() } catch {}
            if (size < 10000) return reject(new Error('الملف فاضي'))
            resolve({ buffer: Buffer.concat(chunks), truncated })
        }

        const timer = setTimeout(() => finish(true), DOWNLOAD_TIME_LIMIT)

        r.data.on('data', c => {
            chunks.push(c)
            size += c.length
            if (size >= maxBytes) finish(true)
        })
        r.data.on('end', () => finish(false))
        r.data.on('error', e => {
            if (done) return
            done = true
            clearTimeout(timer)
            reject(e)
        })
    })
}

// ════════════════════════════════════════════
//                  الإرسال
// ════════════════════════════════════════════

function cacheBtn(data) {
    const id = genId()
    global.quranBtnCache.set(id, { ...data, createdAt: Date.now() })
    return PREFIX + id
}

async function sendResultsList(conn, m, surah, reciter, videos) {
    const rows = videos.map((v, i) => ({
        title: `${i + 1}. ${v.title.slice(0, 50)}`,
        description: `🎙️ ${v.author} | ⏱️ ${v.duration}`,
        id: cacheBtn({ videoId: v.id, title: v.title, author: v.author, surah })
    }))

    const thumb = await getThumbBuffer(videos[0].thumbnail, `https://i.ytimg.com/vi/${videos[0].id}/hqdefault.jpg`)

    await sendButtons(conn, m.chat, {
        title: '📖 القرآن الكريم',
        subtitle: `سورة ${surah.name}`,
        text: `📖 *سورة ${surah.name}*${reciter ? `\n🎙️ ${reciter}` : ''}\n📊 *النتائج:* ${videos.length}\n\n👇 اختار التلاوة:`,
        footer: '⛩️ SUKUNA BOT',
        image: thumb || `https://i.ytimg.com/vi/${videos[0].id}/hqdefault.jpg`,
        buttons: [btn.list('🎧 اختر التلاوة', [{ title: 'التلاوات', rows }])]
    }, m)
}

async function sendSurah(m, conn, data) {
    const { surah, videoId, title, author } = data
    const react = async e => { try { await conn.sendMessage(m.chat, { react: { text: e, key: m.key } }) } catch {} }

    await react('⏳')
    const status = await conn.sendMessage(m.chat, { text: `⏳ *جاري تحضير سورة ${surah.name}...*` }, { quoted: m })

    // النص بيتجاب مع الصوت في نفس الوقت
    const textPromise = getSurahAyahs(surah.number).catch(e => {
        console.error('[quran text]', e.message)
        return null
    })

    let audio = null
    let audioError = null
    try {
        const conv = await convertToMp3(videoId)
        audio = await downloadCapped(conv.url)
    } catch (e) {
        console.error('[quran audio]', e.message)
        audioError = e.message
    }

    const ayahs = await textPromise
    try { await conn.sendMessage(m.chat, { delete: status.key }) } catch {}

    if (!audio && !ayahs) {
        await react('❌')
        return conn.sendMessage(m.chat, { text: `❌ فشل تحميل السورة\n\n${audioError || ''}\n\n💡 جرب تلاوة تانية` }, { quoted: m })
    }

    if (audio) {
        await conn.sendMessage(m.chat, {
            audio: audio.buffer,
            mimetype: 'audio/mpeg',
            fileName: `سورة ${surah.name} - ${author}.mp3`,
            ptt: false
        }, { quoted: m })
    }

    // الهيدر + النص كامل حتى لو الصوت مش كامل
    let header = `🎙️ *${author}*\n`
    if (audio?.truncated) header += `⚠️ الصوت جزء من السورة (عشان السرعة)، والنص تحت كامل\n`
    if (!audio) header += `⚠️ تعذّر تحميل الصوت، دي السورة مكتوبة\n`
    header += '\n'

    if (ayahs) {
        const chunks = buildTextChunks(surah.name, ayahs, header)
        for (let i = 0; i < chunks.length; i++) {
            await conn.sendMessage(m.chat, { text: chunks[i] + (i === chunks.length - 1 ? '\n\n⛩️ SUKUNA BOT ⛩️' : '') }, { quoted: i === 0 ? m : undefined })
            if (i < chunks.length - 1) await sleep(700)
        }
    } else {
        await conn.sendMessage(m.chat, { text: `📖 *سورة ${surah.name}*\n${header}⚠️ تعذّر جلب النص` }, { quoted: m })
    }

    await react('✅')
}

// ════════════════════════════════════════════
//             معالج الأزرار + الأمر
// ════════════════════════════════════════════

let before = async (m, { conn }) => {
    try {
        const buttonId = getButtonId(m)
        if (!buttonId || !buttonId.startsWith(PREFIX)) return false

        const key = buttonId.slice(PREFIX.length)
        const data = global.quranBtnCache.get(key)
        if (!data) return false
        global.quranBtnCache.delete(key)

        await sendSurah(m, conn, data)
        return true
    } catch (e) {
        console.error('[quran before]', e.message)
        return false
    }
}

let handler = async (m, { conn, args, usedPrefix, command }) => {
    const react = async e => { try { await conn.sendMessage(m.chat, { react: { text: e, key: m.key } }) } catch {} }

    if (!args[0]) {
        return conn.sendMessage(m.chat, {
            text: `📖 *القرآن الكريم*\n\n${usedPrefix}${command} <اسم السورة> [اسم القارئ]\n\n💡 *أمثلة:*\n${usedPrefix}${command} الكهف\n${usedPrefix}${command} الملك مشاري العفاسي\n${usedPrefix}${command} 36\n\n⛩️ SUKUNA BOT ⛩️`
        }, { quoted: m })
    }

    const parsed = parseQuery(args)
    if (!parsed) {
        await react('❌')
        return conn.sendMessage(m.chat, { text: `❌ مش لاقي السورة دي\n\n💡 اكتب اسمها صح أو رقمها، مثال: ${usedPrefix}${command} الكهف` }, { quoted: m })
    }

    const surah = { number: parsed.number, name: parsed.name }
    await react('🔍')

    try {
        const videos = await searchYouTube(`سورة ${surah.name} ${parsed.rest || 'تلاوة'}`)
        if (!videos.length) {
            await react('❌')
            return conn.sendMessage(m.chat, { text: '❌ مفيش نتايج' }, { quoted: m })
        }
        await sendResultsList(conn, m, surah, parsed.rest, videos)
        await react('✅')
    } catch (e) {
        console.error('[quran search]', e.message)
        await react('❌')
        await conn.sendMessage(m.chat, { text: '❌ ' + e.message }, { quoted: m })
    }
}

setInterval(() => {
    const now = Date.now()
    for (const [k, v] of global.quranBtnCache.entries()) {
        if (now - v.createdAt > CACHE_TTL) global.quranBtnCache.delete(k)
    }
}, 5 * 60 * 1000)

handler.before = before
handler.help = ['قران <اسم السورة>']
handler.tags = ['islamic', 'downloader']
handler.command = /^(قران|قرآن|سورة|سوره|quran|surah)$/i

export default handler