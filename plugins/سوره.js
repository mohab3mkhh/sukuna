/**
 * plugins/قران.js
 * ⛩️ SUKUNA BOT - .قران <اسم السورة> [اسم القارئ]
 * بحث يوتيوب عن التلاوة → صوت عالي الجودة مقسّم كرسائل صوتية عادية + نص السورة كملف PDF واحد
 */

import axios from 'axios'
import fs from 'fs'
import os from 'os'
import path from 'path'
import nodeFetch from 'node-fetch'
import PDFDocument from 'pdfkit'
import { sendButtons, btn, getButtonId } from '../lib/buttons.js'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36'
const HEADERS = {
    'User-Agent': UA,
    'Origin': 'https://iframe.y2meta-uk.com',
    'Referer': 'https://iframe.y2meta-uk.com/'
}

const PREFIX = 'quran_'
const MAX_RESULTS = 8
const MAX_VIDEO_MIN = 40          // نفضّل التلاوات الأقصر من 40 دقيقة في الوضع العادي
const DOWNLOAD_TIME_LIMIT = 90000 
const FULL_TIME_LIMIT = 30 * 60 * 1000   // وضع "كامل": لحد 30 دقيقة تحميل (للبقرة وغيرها)
const FULL_MAX_HOURS = 3                 
const TMP = os.tmpdir()
const CACHE_TTL = 30 * 60 * 1000

if (!global.quranBtnCache) global.quranBtnCache = new Map()
if (!global.quranSearchCache) global.quranSearchCache = new Map()

const sleep = ms => new Promise(r => setTimeout(r, ms))
const genId = () => Math.random().toString(36).slice(2, 10)

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

async function createSurahPDF(surahName, ayahs, reciter, filePath) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ margin: 50, size: 'A4' })
        const stream = fs.createWriteStream(filePath)
        doc.pipe(stream)

        doc.fontSize(20).text(`سورة ${surahName}`, { align: 'center' })
        if (reciter) {
            doc.fontSize(12).text(`القارئ: ${reciter}`, { align: 'center' })
        }
        doc.moveDown(1.5)

        let fullSurahText = ''
        for (let i = 0; i < ayahs.length; i++) {
            fullSurahText += `${ayahs[i].text} ﴿${toArabicDigits(ayahs[i].n)}﴾ `
        }

        doc.fontSize(14).text(fullSurahText, {
            align: 'justify',
            lineGap: 8
        })

        doc.moveDown(2)
        doc.fontSize(10).text('⛩️ SUKUNA BOT ⛩️', { align: 'center' })

        doc.end()
        stream.on('finish', () => resolve(filePath))
        stream.on('error', reject)
    })
}

function durationToSec(str) {
    if (!str) return 0
    return str.split(':').reverse().reduce((s, p, i) => s + (parseInt(p) || 0) * 60 ** i, 0)
}

async function searchYouTube(query, full = false) {
    const key = query.toLowerCase().trim() + (full ? '|full' : '')
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

    const maxSec = MAX_VIDEO_MIN * 60
    const short = all.filter(v => v.seconds > 0 && v.seconds <= maxSec)
    let results
    if (full) {
        results = all.filter(v => v.seconds > 0 && v.seconds <= FULL_MAX_HOURS * 3600).slice(0, MAX_RESULTS)
    } else {
        results = (short.length >= 3
            ? short
            : [...all].filter(v => v.seconds > 0).sort((a, b) => a.seconds - b.seconds)
        ).slice(0, MAX_RESULTS)
    }

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

async function getDownloadKey(videoId) {
    const r = await axios.get(`https://cnv.cx/v2/sanity/key?id=${videoId}`, { headers: HEADERS, timeout: 20000 })
    if (!r.data?.key) throw new Error('فشل جلب المفتاح')
    return r.data.key
}

async function convertToMp3(videoId, bitrate = '128', timeout = 120000) {
    const key = await getDownloadKey(videoId)
    await sleep(1500)

    const params = new URLSearchParams({
        link: `https://youtu.be/${videoId}`,
        format: 'mp3',
        videoQuality: '720',
        audioBitrate: String(bitrate),
        filenameStyle: 'pretty',
        vCodec: 'h264'
    })

    const r = await axios.post('https://cnv.cx/v2/converter', params.toString(), {
        headers: { ...HEADERS, 'Content-Type': 'application/x-www-form-urlencoded', 'accept': '*/*', 'key': key },
        timeout,
        validateStatus: () => true
    })

    if (r.status === 200 && r.data?.url) return r.data
    if (r.data?.errorMsg) throw new Error(r.data.errorMsg)
    throw new Error('فشل التحويل: ' + r.status)
}

async function downloadToFile(url, file, { maxBytes = Infinity, timeLimit = DOWNLOAD_TIME_LIMIT } = {}) {
    const r = await axios.get(url, {
        headers: { 'User-Agent': UA, 'Referer': 'https://cnv.cx/', 'Origin': 'https://cnv.cx' },
        responseType: 'stream',
        timeout: 60000,
        maxRedirects: 5,
        validateStatus: () => true
    })
    if (r.status !== 200 && r.status !== 206) throw new Error('فشل تحميل الصوت: ' + r.status)

    return await new Promise((resolve, reject) => {
        const ws = fs.createWriteStream(file)
        let size = 0
        let done = false

        const finish = (truncated, err) => {
            if (done) return
            done = true
            clearTimeout(timer)
            try { r.data.unpipe(ws); r.data.destroy() } catch {}
            ws.end(() => {
                if (err) return reject(err)
                if (size < 10000) return reject(new Error('الملف فاضي'))
                resolve({ size, truncated })
            })
        }

        const timer = setTimeout(() => finish(true), timeLimit)

        r.data.on('data', c => {
            size += c.length
            if (size >= maxBytes) finish(true)
        })
        r.data.on('end', () => finish(false))
        r.data.on('error', e => finish(false, e))
        ws.on('error', e => finish(false, e))
        r.data.pipe(ws)
    })
}

async function splitAudioFile(filePath, totalSize) {
    let parts = 1
    if (totalSize > 35 * 1024 * 1024) {
        parts = 4 // السور الكبرى مثل البقرة وآل عمران
    } else if (totalSize > 9 * 1024 * 1024) {
        parts = 2 // السور المتوسطة
    }

    if (parts === 1) return [filePath]

    const buffer = fs.readFileSync(filePath)
    const partSize = Math.floor(totalSize / parts)
    const files = []

    for (let i = 0; i < parts; i++) {
        const partFile = `${filePath}_part${i + 1}.mp3`
        const start = i * partSize
        const end = (i === parts - 1) ? totalSize : (start + partSize)
        fs.writeFileSync(partFile, buffer.slice(start, end))
        files.push(partFile)
    }

    return files
}

function cacheBtn(data) {
    const id = genId()
    global.quranBtnCache.set(id, { ...data, createdAt: Date.now() })
    return PREFIX + id
}

async function sendResultsList(conn, m, surah, reciter, videos, full = false) {
    const rows = videos.map((v, i) => ({
        title: `${i + 1}. ${v.title.slice(0, 50)}`,
        description: `🎙️ ${v.author} | ⏱️ ${v.duration}`,
        id: cacheBtn({ videoId: v.id, title: v.title, author: v.author, surah, full })
    }))

    const thumb = await getThumbBuffer(videos[0].thumbnail, `https://i.ytimg.com/vi/${videos[0].id}/hqdefault.jpg`)

    await sendButtons(conn, m.chat, {
        title: '📖 القرآن الكريم',
        subtitle: `سورة ${surah.name}`,
        text: `📖 *سورة ${surah.name}*${reciter ? `\n🎙️ ${reciter}` : ''}${full ? '\n🎚️ *الوضع:* كامل' : ''}\n📊 *النتائج:* ${videos.length}\n\n👇 اختار التلاوة:`,
        footer: '⛩️ SUKUNA BOT',
        image: thumb || `https://i.ytimg.com/vi/${videos[0].id}/hqdefault.jpg`,
        buttons: [btn.list('🎧 اختر التلاوة', [{ title: 'التلاوات', rows }])]
    }, m)
}

async function sendSurah(m, conn, data) {
    const { surah, videoId, author, full } = data
    const react = async e => { try { await conn.sendMessage(m.chat, { react: { text: e, key: m.key } }) } catch {} }

    await react('⏳')
    const status = await conn.sendMessage(m.chat, {
        text: `⏳ *جاري تحضير سورة ${surah.name}...*${full ? '\n⚠️ وضع كامل: ممكن ياخد كام دقيقة' : ''}`
    }, { quoted: m })

    const textPromise = getSurahAyahs(surah.number).catch(e => {
        console.log('[quran text]', e.message)
        return null
    })

    const file = path.join(TMP, `quran_${Date.now()}.mp3`)
    let audio = null
    let audioError = null
    try {
        let conv
        const convTimeout = full ? 900000 : 120000
        conv = await convertToMp3(videoId, '128', convTimeout)

        if (full) {
            audio = await downloadToFile(conv.url, file, { timeLimit: FULL_TIME_LIMIT })
        } else {
            audio = await downloadToFile(conv.url, file, { maxBytes: 150 * 1024 * 1024 })
        }
    } catch (e) {
        console.error('[quran audio]', e.message)
        audioError = e.message
        try { fs.unlinkSync(file) } catch {}
    }

    const ayahs = await textPromise
    try { await conn.sendMessage(m.chat, { delete: status.key }) } catch {}

    if (!audio && !ayahs) {
        await react('❌')
        return conn.sendMessage(m.chat, { text: `❌ فشل تحميل السورة\n\n${audioError || ''}\n\n💡 جرب تلاوة تانية` }, { quoted: m })
    }

    let sentFiles = []
    if (audio) {
        try {
            sentFiles = await splitAudioFile(file, audio.size)
        } catch {
            sentFiles = [file]
        }

        try {
            for (let i = 0; i < sentFiles.length; i++) {
                const partSuffix = sentFiles.length > 1 ? ` (الجزء ${i + 1} من ${sentFiles.length})` : ''
                const fileName = `سورة ${surah.name} - ${author}${partSuffix}.mp3`
                
                // إرسال الصوت دائماً كرسالة صوتية عادية (audio) وليس مستند (document)
                await conn.sendMessage(m.chat, { 
                    audio: { url: sentFiles[i] }, 
                    mimetype: 'audio/mpeg', 
                    fileName, 
                    ptt: false 
                }, { quoted: m })
            }
        } catch (e) {
            console.error('[quran send audio]', e.message)
            audioError = e.message
            audio = null
        } finally {
            setTimeout(() => { 
                try { fs.unlinkSync(file) } catch {}
                sentFiles.forEach(f => {
                    if (f !== file) { try { fs.unlinkSync(f) } catch {} }
                })
            }, 5 * 60 * 1000)
        }
    }

    let header = `🎙️ *${author}*\n`
    if (audio) header += `📦 ${(audio.size / 1048576).toFixed(1)} MB${sentFiles.length > 1 ? ` (مقسّم على ${sentFiles.length} أجزاء صوتية)` : ''}\n`
    if (audio?.truncated) header += full
        ? `⚠️ التحميل وقف قبل ما يخلص (الوقت طال)، والنص كملف PDF كامل\n`
        : `⚠️ الصوت جزء من السورة (عشان السرعة)، والنص كملف PDF كامل\n`
    if (!audio) header += `⚠️ تعذّر تحميل الصوت، سورة ${surah.name} مرفقة كملف PDF\n`
    header += '\n'

    // إرسال النص كملف PDF واحد
    if (ayahs) {
        const pdfPath = path.join(TMP, `surah_${surah.number}_${Date.now()}.pdf`)
        try {
            await createSurahPDF(surah.name, ayahs, author, pdfPath)
            await conn.sendMessage(m.chat, {
                document: { url: pdfPath },
                mimetype: 'application/pdf',
                fileName: `سورة ${surah.name} - ${author}.pdf`,
                caption: `${header.trim()}\n\n⛩️ SUKUNA BOT ⛩️`
            }, { quoted: m })
            setTimeout(() => { try { fs.unlinkSync(pdfPath) } catch {} }, 5 * 60 * 1000)
        } catch (err) {
            console.error('[quran pdf error]', err)
            await conn.sendMessage(m.chat, { text: `📖 *سورة ${surah.name}*\n${header}⚠️ تعذّر إنشاء ملف الـ PDF` }, { quoted: m })
        }
    } else {
        await conn.sendMessage(m.chat, { text: `📖 *سورة ${surah.name}*\n${header}⚠️ تعذّر جلب النص` }, { quoted: m })
    }

    await react('✅')
}

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
            text: `📖 *القرآن الكريم*\n\n${usedPrefix}${command} <اسم السورة> [اسم القارئ]\n\n💡 *أمثلة:*\n${usedPrefix}${command} الكهف\n${usedPrefix}${command} الملك مشاري العفاسي\n${usedPrefix}${command} البقرة كامل\n${usedPrefix}${command} 36\n\n⛩️ SUKUNA BOT ⛩️`
        }, { quoted: m })
    }

    const full = args.some(a => /^(كامل|كامله|full)$/i.test(normalize(a)))
    const cleanArgs = args.filter(a => !/^(كامل|كامله|full)$/i.test(normalize(a)))

    const parsed = parseQuery(cleanArgs)
    if (!parsed) {
        await react('❌')
        return conn.sendMessage(m.chat, { text: `❌ مش لاقي السورة دي\n\n💡 اكتب اسمها صح أو رقمها، مثال: ${usedPrefix}${command} الكهف` }, { quoted: m })
    }

    const surah = { number: parsed.number, name: parsed.name }
    await react('🔍')

    try {
        const videos = await searchYouTube(`سورة ${surah.name} ${parsed.rest || 'تلاوة'}${full ? ' كاملة' : ''}`, full)
        if (!videos.length) {
            await react('❌')
            return conn.sendMessage(m.chat, { text: '❌ مفيش نتايج' }, { quoted: m })
        }
        await sendResultsList(conn, m, surah, parsed.rest, videos, full)
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