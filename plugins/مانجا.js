/**
 * plugins/مانجا.js
 * مانجا بحث وتحميل PDF - Native Buttons
 * الحقوق: SUKUNA BOT — MOHAB
 */

import axios from 'axios'
import { sendList as sendNativeList } from '../lib/buttons.js'

const SITE = 'https://mangatime.org'
const TRPC = SITE + '/api/trpc'
const UA = 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/127 Mobile Safari/537.36'

const MAX_RESULTS = 10                      // أقصى عدد نتايج بحث في القايمة
const MENU_ROWS = 30                        // أقصى عدد فصول في القايمة (الباقي بالأمر .مانجا_فصل <رقم>)
const MAX_TOTAL_BYTES = 150 * 1024 * 1024   // أقصى حجم صور للفصل (بنبني الـ PDF في الرامات من غير ما نكتب على الديسك)
const CONCURRENCY = 4                       // عدد الصور اللي بتتحمل مع بعض
const CACHE_TTL = 30 * 60 * 1000

if (!global.mangaCache) global.mangaCache = new Map()   // id الزرار → بيانات
if (!global.mangaUser) global.mangaUser = new Map()     // المستخدم → آخر مانجا اختارها
const handledMsgs = new Set()

const http = axios.create({
    timeout: 30000,
    maxContentLength: 100 * 1024 * 1024,
    maxBodyLength: 100 * 1024 * 1024,
    headers: {
        accept: 'application/json,text/plain,*/*',
        'accept-language': 'ar,en;q=0.8',
        'user-agent': UA,
        referer: SITE + '/browse'
    }
})

// ─── الزخرفة (SUKUNA) ───
const HEADER = `╔══════════════════════════════════════╗
      ≪  ❪ 🍎 𝑻𝑯𝑬 𝑶𝑵𝑬 𝑨𝑩𝑶𝑽𝑬 𝑨𝑳𝑳 🍏 ❫  ≫
             ❪ 𝑺𝑼𝑲𝑼𝑵𝑨 ♦️ 𝑩𝑶𝑻 ❫
   ≪ ━ ❪ 🍎 𝑴𝑨𝑵𝑮𝑨 🍏 ❫ ━ ≫
╚══════════════════════════════════════╝`
const FOOTER = `╰─── ≪ ❪ 🍎 👑 🍏 ❫ ≫ ───╯
◜⏤͟͟͞͞ 𝑺𝑼𝑲𝑼𝑵𝑨 ⚡ 𝑩𝑶𝑻 ˖࣪⃟🍎 ◞`
const SMALL_FOOTER = '🍎 𝑺𝑼𝑲𝑼𝑵𝑨 ✦ 𝑩𝑶𝑻 🍏'

const card = (lines) => `${HEADER}\n\n${lines.map(l => '  ' + l).join('\n')}\n\n${FOOTER}`

const genId = () => Math.random().toString(36).slice(2, 10)
const getUserId = (m) => m.sender || m.key?.participant || m.key?.remoteJid

// ════════════ أدوات مساعدة ════════════
function absolute(value) {
    if (!value) return null
    try { return new URL(value, SITE).href } catch { return null }
}

async function react(conn, m, emoji) {
    try {
        if (typeof m?.react === 'function') return await m.react(emoji)
        await conn.sendMessage(m.chat, { react: { text: emoji, key: m?.key } })
    } catch {}
}

async function deleteMessage(conn, chat, message) {
    if (!message?.key) return
    try { await conn.sendMessage(chat, { delete: message.key }) } catch {}
}

async function editStatus(conn, chat, status, text) {
    if (!status?.key) return
    try { await conn.sendMessage(chat, { text, edit: status.key }) } catch {}
}

function putCache(data) {
    const id = genId()
    global.mangaCache.set(id, { ...data, createdAt: Date.now() })
    return id
}

function getButtonId(m) {
    try {
        const inner = m.message?.viewOnceMessage?.message || m.message?.viewOnceMessageV2?.message || m.message || {}
        const nf = inner.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson
        if (nf) return JSON.parse(nf)?.id || null
        if (inner.buttonsResponseMessage?.selectedButtonId) return inner.buttonsResponseMessage.selectedButtonId
        if (inner.listResponseMessage?.singleSelectReply?.selectedRowId) return inner.listResponseMessage.singleSelectReply.selectedRowId
        if (m.text?.startsWith('mg_')) return m.text
    } catch {}
    return null
}

// ════════════ tRPC (موقع MangaTime) ════════════
async function queryTrpc(path, input) {
    const params = new URLSearchParams({
        batch: '1',
        input: JSON.stringify({ 0: { json: input } })
    })
    const { data } = await http.get(`${TRPC}/${path}?${params.toString()}`)
    const payload = Array.isArray(data) ? data[0] : data
    const result = payload?.result?.data?.json
    if (!result) throw new Error('استجابة MangaTime غير متوقعة')
    return result
}

async function searchManga(query) {
    const result = await queryTrpc('search.searchSeries', {
        query,
        filters: {
            genres: [], status: undefined, type: undefined,
            sortBy: 'popularity-desc', rating: {}, yearRange: {}, chapterCount: {}
        },
        limit: 50, page: 1, sortBy: 'popularity', sortOrder: 'desc'
    })
    const list = Array.isArray(result?.results) ? result.results : []

    const seen = new Set()
    const out = []
    for (const item of list) {
        if (!item?.id || !item?.slug) continue
        const key = String(item.id)
        if (seen.has(key)) continue
        seen.add(key)
        out.push({
            id: item.id,
            title: item.title || item.slug || 'Unknown',
            slug: item.slug,
            type: item.type || 'manhwa',
            status: item.status || 'مش معروف',
            rating: item.rating ?? 'مش معروف',
            chapters: item.chapterCount ?? 'مش معروف',
            cover: absolute(item.coverUrl),
            url: SITE + '/' + (item.type === 'manga' ? 'manga' : 'manhwa') + '/' + item.slug
        })
        if (out.length >= MAX_RESULTS) break
    }
    return out
}

async function fetchSeries(selected) {
    const series = await queryTrpc('content.getSeriesBySlug', { slug: selected.slug })
    const chaptersData = await queryTrpc('content.getChapters', { seriesId: selected.id, limit: -1 })

    const type = selected.type || series.type || 'manhwa'
    const pathType = type === 'manga' ? 'manga' : 'manhwa'

    const chapters = (chaptersData.chapters || [])
        .filter(c => !c.isBlocked && c.isUnlocked !== false)
        .map(c => ({
            number: String(c.number),
            title: c.title || ('الفصل ' + c.number),
            pageCount: c.pageCount,
            url: `${SITE}/${pathType}/${selected.slug}/chapter/${c.number}`
        }))
        .sort((a, b) => Number(b.number) - Number(a.number))

    return { title: series.title || selected.title, slug: selected.slug, type, chapters }
}

async function fetchChapterImages(slug, chapterNumber) {
    const data = await queryTrpc('content.getChapterPages', { seriesSlug: slug, chapterNumber: Number(chapterNumber) })
    return (data.pages || []).map(absolute).filter(Boolean)
}

// ════════════ الصور و PDF ════════════
function detectImageType(buffer) {
    if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg'
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'png'
    if (buffer.slice(0, 4).toString('ascii') === 'RIFF' && buffer.slice(8, 12).toString('ascii') === 'WEBP') return 'webp'
    const h = buffer.slice(0, 6).toString('ascii')
    if (h === 'GIF87a' || h === 'GIF89a') return 'gif'
    return null
}

async function downloadImage(url, referer) {
    const response = await http.get(url, {
        responseType: 'arraybuffer',
        validateStatus: s => s >= 200 && s < 400,
        headers: {
            accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
            referer: referer || SITE,
            origin: SITE
        }
    })
    const buffer = Buffer.from(response.data)
    if (!buffer.length) throw new Error('EMPTY_IMAGE')
    return { buffer, type: detectImageType(buffer), url }
}

// تحميل الصفحات بالتوازي (CONCURRENCY) مع الحفاظ على الترتيب، ومحاولتين لكل صورة
async function downloadImages(urls, referer, onProgress) {
    const out = new Array(urls.length).fill(null)
    let next = 0, done = 0, ok = 0, total = 0, tooBig = false

    const worker = async () => {
        while (!tooBig) {
            const i = next++
            if (i >= urls.length) return
            let img = null
            for (let attempt = 0; attempt < 2 && !img; attempt++) {
                try { img = await downloadImage(urls[i], referer) }
                catch (e) { if (attempt === 1) console.error('[SUKUNA MANGA IMG]', urls[i], e?.message || e) }
            }
            if (img) {
                total += img.buffer.length
                if (total > MAX_TOTAL_BYTES) { tooBig = true; return }
                out[i] = img
                ok++
            }
            done++
            if (onProgress) await onProgress(done, urls.length, ok)
        }
    }

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, urls.length) }, worker))
    if (tooBig) throw new Error('TOO_BIG')
    return out.filter(Boolean)
}

async function convertImageToPng(buffer) {
    let sharp
    try {
        const mod = await import('sharp')
        sharp = mod.default || mod
    } catch {
        throw new Error('UNSUPPORTED_IMAGE_FORMAT')
    }
    return await sharp(buffer, { animated: false }).png().toBuffer()
}

async function makePdfLib(images) {
    let PDFDocument
    try {
        const mod = await import('pdf-lib')
        PDFDocument = mod.PDFDocument || mod.default?.PDFDocument
    } catch {
        throw new Error('NO_PDFLIB')
    }
    if (!PDFDocument) throw new Error('NO_PDFLIB')

    const pdfDoc = await PDFDocument.create()
    let pages = 0
    let skipped = 0

    for (const item of images) {
        try {
            const buffer = item.buffer
            const type = item.type || detectImageType(buffer)
            let image
            if (type === 'jpg') image = await pdfDoc.embedJpg(buffer)
            else if (type === 'png') image = await pdfDoc.embedPng(buffer)
            else image = await pdfDoc.embedPng(await convertImageToPng(buffer))

            if (!image.width || !image.height) { skipped++; continue }
            const page = pdfDoc.addPage([image.width, image.height])
            page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height })
            pages++
        } catch (e) {
            skipped++
            console.error('[SUKUNA MANGA PDF PAGE]', e?.message || e)
        }
    }

    if (!pages) throw new Error('NO_VALID_IMAGES')
    return { pdf: Buffer.from(await pdfDoc.save()), pages, skipped }
}

// بنستخدم pdfkit (موجودة في package.json بتاعك)، ولو مش منزّلة بنجرّب pdf-lib
async function makePdfKit(images) {
    let PDFDocument
    try {
        const mod = await import('pdfkit')
        PDFDocument = mod.default || mod
    } catch {
        throw new Error('NO_PDFKIT')
    }

    const doc = new PDFDocument({ autoFirstPage: false, margin: 0 })
    const chunks = []
    doc.on('data', c => chunks.push(c))
    const finished = new Promise((resolve, reject) => {
        doc.on('end', resolve)
        doc.on('error', reject)
    })

    let pages = 0
    let skipped = 0
    for (const item of images) {
        try {
            const type = item.type || detectImageType(item.buffer)
            let img
            try {
                img = (type === 'jpg' || type === 'png') ? doc.openImage(item.buffer) : null
            } catch { img = null }
            if (!img) img = doc.openImage(await convertImageToPng(item.buffer))   // webp / jpg غريب ← png

            doc.addPage({ size: [img.width, img.height], margin: 0 })
            doc.image(img, 0, 0, { width: img.width, height: img.height })
            pages++
        } catch (e) {
            skipped++
            console.error('[SUKUNA MANGA PDF PAGE]', e?.message || e)
        }
    }

    if (!pages) throw new Error('NO_VALID_IMAGES')
    doc.end()
    await finished
    return { pdf: Buffer.concat(chunks), pages, skipped }
}

async function makePdf(images) {
    try {
        return await makePdfKit(images)
    } catch (e) {
        if (e?.message !== 'NO_PDFKIT') throw e
    }
    return makePdfLib(images)
}

// ════════════ تحويل الأخطاء لرسايل مفهومة ════════════
function explain(error) {
    const msg = String(error?.message || '')
    const status = error?.response?.status
    if (msg === 'NO_PDFLIB') return 'مكتبة PDF مش منزّلة — ضيف "pdfkit": "latest" في dependencies بتاع package.json'
    if (msg === 'TOO_BIG') return `الفصل كبير جداً (أكتر من ${Math.round(MAX_TOTAL_BYTES / 1048576)}MB)`
    if (msg === 'NO_CHAPTER_PAGES') return 'لم يتم العثور على صفحات الفصل'
    if (msg === 'IMAGE_DOWNLOAD_FAILED') return 'تعذر تنزيل صفحات الفصل'
    if (msg === 'EMPTY_IMAGE') return 'تم العثور على صورة صفحة فارغة'
    if (msg === 'NO_VALID_IMAGES') return 'صور الصفحات غير مدعومة (جرّب npm i sharp)'
    if (msg === 'NO_CHAPTERS') return 'لم يتم العثور على فصول متاحة'
    if (msg === 'NO_MANGA_RESULTS') return 'لم يتم العثور على أي نتائج'
    if (/ENOSPC/i.test(msg) || error?.code === 'ENOSPC') return 'مساحة السيرفر ممتلئة'
    if (status === 403 || status === 503) return `الموقع رفض الطلب (HTTP ${status}) — غالباً حاجب IP السيرفر`
    if (status) return `الموقع رجّع HTTP ${status}`
    if (/timeout/i.test(msg)) return 'انتهت مهلة الاتصال بالموقع'
    return msg || 'حصلت مشكلة غير معروفة'
}

// ════════════ إرسال قايمة تفاعلية (Native Flow) ════════════
async function getThumb(url) {
    if (!url) return null
    try {
        const r = await http.get(url, { responseType: 'arraybuffer', timeout: 15000, headers: { referer: SITE } })
        return r.data?.length > 1000 ? Buffer.from(r.data) : null
    } catch { return null }
}

async function sendList(conn, m, { text, buttonTitle, sections, cover }) {
    const thumb = await getThumb(cover)   // null لو فشلت
    const payload = { text, footer: SMALL_FOOTER, buttonText: buttonTitle, sections, quoted: m }
    try {
        return await sendNativeList(conn, m.chat, { ...payload, ...(thumb ? { image: thumb } : {}) })
    } catch (e) {
        if (!thumb) throw e
        console.error('[SUKUNA MANGA] الصورة فشلت، بنبعت القايمة من غير صورة:', e?.message || e)
        return await sendNativeList(conn, m.chat, payload)
    }
}

async function sendResultsMenu(conn, m, results, query) {
    const rows = results.map((item, i) => {
        const id = 'mg_' + putCache({ type: 'series', item })
        return {
            header: `🍎 𝑴𝒂𝒏𝒈𝒂 ${i + 1}`,
            title: String(item.title || 'Manga').slice(0, 50),
            description: `📔 ${item.type} | ⭐ ${item.rating} | 📘 ${item.chapters} فصل`,
            id
        }
    })

    await sendList(conn, m, {
        text: `${HEADER}\n\n  🔍 ⌈ 𝑸𝒖𝒆𝒓𝒚 ⌋ ⇢ *${query.slice(0, 100)}*\n  🍎 ⌈ 𝑹𝒆𝒔𝒖𝒍𝒕𝒔 ⌋ ⇢ *${rows.length}*\n\n  ✦ O Human… Choose Your Manga ✦\n\n  ⇩ اختر المانجا من القائمة بالأسفل ⇩`,
        buttonTitle: '🍎 اختر المانجا 🍏',
        sections: [{ title: `🍏 نتائج البحث (${rows.length}) 🍎`, rows }],
        cover: results[0]?.cover
    })
}

async function sendChaptersMenu(conn, m, item, series) {
    const shown = series.chapters.slice(0, MENU_ROWS)
    const sections = []

    for (let s = 0; s < shown.length; s += 10) {
        const chunk = shown.slice(s, s + 10)
        const rows = chunk.map((chapter, j) => {
            const id = 'mg_' + putCache({ type: 'chapter', item, series, chapter })
            return {
                header: `📔 ${s + j + 1}`,
                title: `الفصل ${chapter.number}`,
                description: `📔 ${String(chapter.title).slice(0, 60)}`,
                id
            }
        })
        sections.push({
            title: `📘 ${chunk[0].number} ⇢ ${chunk[chunk.length - 1].number}`,
            rows
        })
    }

    const more = series.chapters.length > shown.length
        ? `\n  💡 ⌈ 𝑴𝒐𝒓𝒆 ⌋ ⇢ *لأي فصل تاني اكتب: .مانجا_فصل <رقم>*`
        : ''

    await sendList(conn, m, {
        text: `${HEADER}\n\n  📘 ⌈ 𝑻𝒊𝒕𝒍𝒆 ⌋ ⇢ *${series.title.slice(0, 100)}*\n  📔 ⌈ 𝑪𝒉𝒂𝒑𝒕𝒆𝒓𝒔 ⌋ ⇢ *${series.chapters.length}*${more}\n\n  ✦ O Human… Choose Your Chapter ✦\n\n  ⇩ اختر الفصل من القائمة بالأسفل ⇩`,
        buttonTitle: '🍎 اختر الفصل 🍏',
        sections,
        cover: item.cover
    })
}

// ════════════ فتح مانجا (جلب الفصول) ════════════
async function openSeries(conn, m, item) {
    let status = null
    try {
        await react(conn, m, '📘')
        status = await conn.sendMessage(m.chat, {
            text: card([`📔 ⌈ 𝑴𝒂𝒏𝒈𝒂 ⌋ ⇢ *${item.title.slice(0, 80)}*`, '', '🕰 جاري تحميل الفصول...', '', '✦ O Human… Please Wait ✦'])
        }, { quoted: m })

        const series = await fetchSeries(item)
        if (!series.chapters?.length) throw new Error('NO_CHAPTERS')

        global.mangaUser.set(getUserId(m), { item, series, createdAt: Date.now() })

        await sendChaptersMenu(conn, m, item, series)
        await deleteMessage(conn, m.chat, status)
        await react(conn, m, '🍏')
    } catch (e) {
        console.error('[SUKUNA MANGA SERIES]', e?.stack || e)
        const body = card(['🚫 *فشلت العملية*', '', `🔶️ ⌈ 𝑬𝒓𝒓𝒐𝒓 ⌋ ⇢ *${explain(e)}*`])
        if (status) await editStatus(conn, m.chat, status, body)
        else await conn.sendMessage(m.chat, { text: body }, { quoted: m })
        await react(conn, m, '❌')
    }
}

// ════════════ تحميل فصل → PDF ════════════
async function downloadChapter(conn, m, selected, series, chapter) {
    let status = null
    try {
        await react(conn, m, '📔')
        status = await conn.sendMessage(m.chat, {
            text: card([`📘 ⌈ 𝑴𝒂𝒏𝒈𝒂 ⌋ ⇢ *${series.title.slice(0, 80)}*`, `📔 ⌈ 𝑪𝒉𝒂𝒑𝒕𝒆𝒓 ⌋ ⇢ *${chapter.number}*`, '', '🧭 جاري العثور على الصفحات...'])
        }, { quoted: m })

        const pageUrls = await fetchChapterImages(selected.slug, chapter.number)
        if (!pageUrls.length) throw new Error('NO_CHAPTER_PAGES')

        await editStatus(conn, m.chat, status, card([
            `📔 ⌈ 𝑪𝒉𝒂𝒑𝒕𝒆𝒓 ⌋ ⇢ *${chapter.number}*`, `🏞️ ⌈ 𝑷𝒂𝒈𝒆𝒔 ⌋ ⇢ *${pageUrls.length}*`, '', '📬 جاري تحميل الصفحات...'
        ]))
        await react(conn, m, '📬')

        const images = await downloadImages(pageUrls, chapter.url, async (current, total, ok) => {
            if (current === 1 || current === total || current % 5 === 0) {
                await editStatus(conn, m.chat, status, card([
                    `📔 ⌈ 𝑪𝒉𝒂𝒑𝒕𝒆𝒓 ⌋ ⇢ *${chapter.number}*`,
                    `🏞️ ⌈ 𝑷𝒂𝒈𝒆𝒔 ⌋ ⇢ *${current} / ${total}*`,
                    `🎁 ⌈ 𝑫𝒐𝒏𝒆 ⌋ ⇢ *${ok}*`, '', '🕰 جاري تحميل الصفحات...'
                ]))
            }
        })
        if (!images.length) throw new Error('IMAGE_DOWNLOAD_FAILED')

        await editStatus(conn, m.chat, status, card([`🏞️ ⌈ 𝑳𝒐𝒂𝒅𝒆𝒅 ⌋ ⇢ *${images.length} صفحة*`, '', '📃 جاري تجهيز ملف PDF...']))
        const result = await makePdf(images)

        await editStatus(conn, m.chat, status, card([
            `📘 ⌈ 𝑴𝒂𝒏𝒈𝒂 ⌋ ⇢ *${series.title.slice(0, 80)}*`, `📔 ⌈ 𝑪𝒉𝒂𝒑𝒕𝒆𝒓 ⌋ ⇢ *${chapter.number}*`, '', '📮 جاري إرسال PDF...'
        ]))
        await react(conn, m, '📮')

        const safeSlug = String(selected.slug).replace(/[^a-z0-9_-]/gi, '_')
        const lines = [
            `📘 ⌈ 𝑴𝒂𝒏𝒈𝒂 ⌋ ⇢ *${series.title.slice(0, 80)}*`,
            `📔 ⌈ 𝑪𝒉𝒂𝒑𝒕𝒆𝒓 ⌋ ⇢ *${chapter.number}*`,
            `🏞️ ⌈ 𝑷𝒂𝒈𝒆𝒔 ⌋ ⇢ *${result.pages}*`
        ]
        if (result.skipped) lines.push(`⚠️ ⌈ 𝑺𝒌𝒊𝒑𝒑𝒆𝒅 ⌋ ⇢ *${result.skipped} صفحة*`)
        lines.push('', '✦ O Human… Enjoy Your Chapter ✦')

        // ✅ بنبعت الـ PDF كـ Buffer مباشرة (من غير ما نكتب على الديسك)
        await conn.sendMessage(m.chat, {
            document: result.pdf,
            mimetype: 'application/pdf',
            fileName: `SUKUNA_${safeSlug}_Chapter_${chapter.number}.pdf`,
            caption: card(lines)
        }, { quoted: m })

        await deleteMessage(conn, m.chat, status)
        await react(conn, m, '🍏')
        return true
    } catch (e) {
        console.error('[SUKUNA MANGA DOWNLOAD]', e?.stack || e)
        const body = card(['🚫 *فشلت العملية*', '', `🔶️ ⌈ 𝑬𝒓𝒓𝒐𝒓 ⌋ ⇢ *${explain(e)}*`, '', '♻ جرب تاني.'])
        if (status) await editStatus(conn, m.chat, status, body)
        else await conn.sendMessage(m.chat, { text: body }, { quoted: m })
        await react(conn, m, '❌')
        return false
    }
}

// ════════════ Handler الرئيسي ════════════
let handler = async (m, { conn, text, usedPrefix = '.', command }) => {
    const cmd = String(command || '').replace(/^[.!#/]/, '')

    // .مانجا_فصل <رقم>  → تحميل فصل بالرقم من آخر مانجا اخترتها
    if (/^مانجا_فصل$/i.test(cmd)) {
        const ctx = global.mangaUser.get(getUserId(m))
        const num = String(text || '').trim()
        if (!ctx) {
            return conn.sendMessage(m.chat, { text: card(['⚠️ اختار مانجا الأول:', `*${usedPrefix}مانجا <اسم المانجا>*`]) }, { quoted: m })
        }
        if (!num) {
            return conn.sendMessage(m.chat, { text: card([`🧭 الصيغة: *${usedPrefix}مانجا_فصل <رقم الفصل>*`, `📘 المانجا الحالية: *${ctx.series.title.slice(0, 80)}*`]) }, { quoted: m })
        }
        const chapter = ctx.series.chapters.find(c => c.number === num || Number(c.number) === Number(num))
        if (!chapter) {
            return conn.sendMessage(m.chat, { text: card([`🚫 مفيش فصل رقم *${num}* في *${ctx.series.title.slice(0, 60)}*`]) }, { quoted: m })
        }
        return downloadChapter(conn, m, ctx.item, ctx.series, chapter)
    }

    const query = (text || '').trim()
    if (!query) {
        return conn.sendMessage(m.chat, {
            text: card([
                `🍎 ⌈ 𝑺𝒆𝒂𝒓𝒄𝒉 ⌋ ⇢ *${usedPrefix}${cmd} <اسم المانجا>*`,
                '',
                `📍 مثال: *${usedPrefix}${cmd} Solo Leveling*`,
                `📔 بعدها اختار النتيجة ثم الفصل`,
                `🍏 أو: *${usedPrefix}مانجا_فصل <رقم>*`,
                '',
                '✦ O Human… This Is Your World ✦'
            ])
        }, { quoted: m })
    }

    let status = null
    try {
        await react(conn, m, '🧭')
        status = await conn.sendMessage(m.chat, {
            text: card([`🔍 ⌈ 𝑺𝒆𝒂𝒓𝒄𝒉𝒊𝒏𝒈 ⌋ ⇢ *${query.slice(0, 100)}*`, '', '🕰 يرجى الانتظار...', '', '✦ O Human… Please Wait ✦'])
        }, { quoted: m })

        const results = await searchManga(query)
        if (!results.length) throw new Error('NO_MANGA_RESULTS')

        await sendResultsMenu(conn, m, results, query)
        await deleteMessage(conn, m.chat, status)
        await react(conn, m, '🍏')
    } catch (e) {
        console.error('[SUKUNA MANGA SEARCH]', e?.stack || e)
        const body = card(['🚫 *فشلت العملية*', '', `🔶️ ⌈ 𝑬𝒓𝒓𝒐𝒓 ⌋ ⇢ *${explain(e)}*`, '', '♻ جرب تاني.'])
        if (status) await editStatus(conn, m.chat, status, body)
        else await conn.sendMessage(m.chat, { text: body }, { quoted: m })
        await react(conn, m, '❌')
    }
}

// ════════════ معالج الأزرار ════════════
handler.before = async (m, { conn }) => {
    try {
        const buttonId = getButtonId(m)
        if (!buttonId || !String(buttonId).startsWith('mg_')) return false

        const msgId = m.key?.id || ''
        if (msgId) {                                    // منع تنفيذ نفس الضغطة مرتين
            if (handledMsgs.has(msgId)) return true
            handledMsgs.add(msgId)
            setTimeout(() => handledMsgs.delete(msgId), 60000)
        }

        const data = global.mangaCache.get(String(buttonId).slice(3))
        if (!data) {
            await conn.sendMessage(m.chat, { text: card(['⚠️ انتهت صلاحية القايمة، ابحث تاني بـ *.مانجا*']) }, { quoted: m })
            return true
        }

        if (data.type === 'series') await openSeries(conn, m, data.item)
        else if (data.type === 'chapter') await downloadChapter(conn, m, data.item, data.series, data.chapter)
        return true
    } catch (e) {
        console.error('[SUKUNA MANGA before]', e?.message || e)
        return false
    }
}

// تنظيف الكاش القديم كل 5 دقايق (تايمر واحد حتى لو البلجن اتعمله reload)
if (global.mangaCleanTimer) clearInterval(global.mangaCleanTimer)
global.mangaCleanTimer = setInterval(() => {
    const now = Date.now()
    for (const [k, v] of global.mangaCache.entries()) if (now - v.createdAt > CACHE_TTL) global.mangaCache.delete(k)
    for (const [k, v] of global.mangaUser.entries()) if (now - v.createdAt > CACHE_TTL) global.mangaUser.delete(k)
}, 5 * 60 * 1000)

handler.help = ['مانجا <اسم المانجا>', 'مانجا_فصل <رقم>']
handler.tags = ['downloader']
handler.command = /^(مانجا|manga|مانجا-تايم|مانجا_فصل)$/i

export default handler