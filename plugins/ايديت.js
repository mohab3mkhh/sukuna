// plugins/ايديت.js
// ⛩️ SUKUNA BOT - بحث ايديتات من (تيك توك / يوتيوب / فيسبوك / انستغرام)
//   .ايديت سوكونا            → بيسألك تختار المنصة (زراير أو رقم 1-4)
//   .ايديت تيك سوكونا        → مباشرة من تيك توك (تيك / يوتيوب / فيس / انستا)
// النتيجة: كاروسيل فيديوهات (ولو فشل بيبعت أول 3 فيديوهات عادي)
// الكروت فيها زراير: فتح الفيديو + نسخ الرابط

import axios from 'axios'
import { execFile } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import https from 'https'
import zlib from 'zlib'
import * as _baileys from '@whiskeysockets/baileys'

const B = _baileys.generateWAMessageFromContent ? _baileys : (_baileys.default || _baileys)
const { proto, generateWAMessageFromContent, generateWAMessageContent } = B

/* ===================== إعدادات ===================== */
const CARD_COUNT = 6
const CONCURRENCY = 3
const MAX_CARD_MB = 25
const MENU_TTL = 2 * 60 * 1000

const TIK_KEY = process.env.TIKWMAPI_KEY || '34ce144ad4984df4fbbc79480a131395'
const TIK_API = 'https://api.tikwmapi.com'
const CSE_CX = 'e500c3a7a523b49df'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const YTDLP = fs.existsSync('/root/.nix-profile/bin/yt-dlp') ? '/root/.nix-profile/bin/yt-dlp' : 'yt-dlp'
const FFMPEG = fs.existsSync('/root/.nix-profile/bin/ffmpeg') ? '/root/.nix-profile/bin/ffmpeg' : 'ffmpeg'
const COOKIES = '/app/cookies.txt'

const sleep = ms => new Promise(r => setTimeout(r, ms))
const isMp4 = buf => buf && buf.length > 12 && buf.subarray(4, 8).toString('latin1') === 'ftyp'
const log = (...a) => console.log('[ايديت]', ...a)
const fmt = n => !n ? '0' : n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : String(n)

/* ===================== المنصات (للاختيار) ===================== */
const PLATFORMS = {
    tiktok:    { n: 1, label: '🎵 تيك توك',  words: ['1', 'تيك', 'تيكتوك', 'تيك توك', 'tiktok', 'tt'] },
    youtube:   { n: 2, label: '▶️ يوتيوب',   words: ['2', 'يوتيوب', 'يوتوب', 'youtube', 'yt'] },
    facebook:  { n: 3, label: '📘 فيسبوك',   words: ['3', 'فيس', 'فيسبوك', 'facebook', 'fb'] },
    instagram: { n: 4, label: '📸 انستغرام', words: ['4', 'انستا', 'انستغرام', 'انستجرام', 'instagram', 'ig'] }
}
function pickPlatform(word) {
    const w = String(word || '').trim().toLowerCase()
    for (const [k, p] of Object.entries(PLATFORMS)) if (p.words.includes(w)) return k
    return null
}

/* ===================== تيك توك (tikwmapi) ===================== */
async function tikGet(pathname, params) {
    const qs = new URLSearchParams(params)
    try {
        const r = await fetch(`${TIK_API}${pathname}?${qs}`, {
            headers: { 'x-tikwmapi-key': TIK_KEY, 'User-Agent': UA },
            signal: AbortSignal.timeout(30000)
        })
        if (!r.ok) throw new Error('tikwmapi HTTP ' + r.status)
        const j = await r.json()
        if (j?.code !== undefined && j.code !== 0) throw new Error(j?.msg || 'tikwmapi failed')
        return j
    } catch (e) {
        log('tikwmapi فشل، بجرب tikwm.com:', e.message)
        await sleep(1200)
        const r = await fetch(`https://www.tikwm.com/api${pathname}?${qs}`, {
            headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30000)
        })
        if (!r.ok) throw new Error('tikwm HTTP ' + r.status)
        const j = await r.json()
        if (j?.code !== undefined && j.code !== 0) throw new Error(j?.msg || 'tikwm failed')
        return j
    }
}

async function fetchVideoBuf(url, headers = {}) {
    const r = await fetch(url, { headers: { 'User-Agent': UA, ...headers }, signal: AbortSignal.timeout(90000) })
    if (!r.ok) throw new Error('HTTP ' + r.status)
    const buf = Buffer.from(await r.arrayBuffer())
    if (buf.length < 10000 || !isMp4(buf)) throw new Error('فيديو غير سليم')
    return buf
}

async function searchTikTok(q) {
    const variants = [`${q} edit`, `${q} ايديت`]
    const all = []
    for (const keywords of variants) {
        try {
            const j = await tikGet('/feed/search', { keywords, count: 20, cursor: 0 })
            all.push(...(j?.data?.videos || []))
        } catch (e) { log('tiktok search:', e.message) }
    }
    const seen = new Set()
    const vids = all.filter(v => {
        const id = v?.video_id || v?.id
        if (!id || seen.has(id)) return false
        seen.add(id); return true
    }).sort((a, b) => ((b.play_count || 0) + (b.digg_count || 0) * 10) - ((a.play_count || 0) + (a.digg_count || 0) * 10))

    return vids.slice(0, 20).map(v => {
        const user = v.author?.unique_id || ''
        const link = user ? `https://www.tiktok.com/@${user}/video/${v.video_id || v.id}` : ''
        return {
            title: v.title || 'TikTok Edit',
            link,
            author: v.author?.nickname || user || 'Unknown',
            stats: `❤️ ${fmt(v.digg_count)} | 💬 ${fmt(v.comment_count)} | 👁️ ${fmt(v.play_count)}`,
            duration: v.duration || 0,
            getBuffer: async () => {
                const direct = v.hdplay || v.play
                if (direct) { try { return await fetchVideoBuf(direct, { Referer: 'https://www.tiktok.com/' }) } catch {} }
                if (!link) throw new Error('مفيش مصدر')
                const j = await tikGet('/', { url: link })
                const u = j?.data?.hdplay || j?.data?.play
                if (!u) throw new Error('No video URL')
                return await fetchVideoBuf(u, { Referer: 'https://www.tiktok.com/' })
            }
        }
    })
}

/* ===================== يوتيوب ===================== */
const CNV_HEADERS = { 'User-Agent': UA, Origin: 'https://iframe.y2meta-uk.com', Referer: 'https://iframe.y2meta-uk.com/' }

async function searchYouTube(q) {
    const mod = await import('yt-search')
    const yts = mod.default || mod
    const res = await yts(`${q} edit`)
    const vids = (res?.videos || []).filter(v => v.seconds > 0 && v.seconds <= 180).slice(0, 12)
    return vids.map(v => ({
        title: v.title,
        link: `https://youtu.be/${v.videoId}`,
        author: v.author?.name || 'YouTube',
        stats: `👁️ ${fmt(v.views)}`,
        duration: v.seconds,
        getBuffer: () => ytDownload(v.videoId)
    }))
}

async function cnvVideo(id) {
    const k = await axios.get(`https://cnv.cx/v2/sanity/key?id=${id}`, { headers: CNV_HEADERS, timeout: 15000 })
    if (!k.data?.key) throw new Error('cnv: لا يوجد مفتاح')
    await sleep(1000)
    const params = new URLSearchParams({
        link: `https://youtu.be/${id}`, format: 'mp4', audioBitrate: '128',
        videoQuality: '480', filenameStyle: 'pretty', vCodec: 'h264'
    })
    const r = await axios.post('https://cnv.cx/v2/converter', params.toString(), {
        headers: { ...CNV_HEADERS, 'Content-Type': 'application/x-www-form-urlencoded', accept: '*/*', key: k.data.key },
        timeout: 120000, validateStatus: () => true
    })
    if (!(r.status === 200 && r.data?.url)) throw new Error(r.data?.errorMsg || `cnv: ${r.status}`)
    const d = await axios.get(r.data.url, {
        headers: { 'User-Agent': UA, Referer: 'https://cnv.cx/', Origin: 'https://cnv.cx' },
        responseType: 'arraybuffer', timeout: 180000,
        maxContentLength: 60 * 1024 * 1024, validateStatus: () => true
    })
    const buf = d.status === 200 ? Buffer.from(d.data) : null
    if (buf && buf.length > 50 * 1024 && isMp4(buf)) return buf
    throw new Error(`cnv: ملف غير صالح (${d.status})`)
}

function ytdlpVideo(id) {
    return new Promise((resolve, reject) => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'edv-'))
        const out = path.join(dir, `${id}.%(ext)s`)
        const args = [
            '-f', 'bv*[height<=480][vcodec^=avc1]+ba[ext=m4a]/b[height<=480][ext=mp4]/b[height<=480]/b',
            '--merge-output-format', 'mp4', '--no-playlist', '--no-warnings',
            '--max-filesize', '60M', '--ffmpeg-location', FFMPEG, '-o', out
        ]
        if (fs.existsSync(COOKIES)) args.push('--cookies', COOKIES)
        args.push(`https://www.youtube.com/watch?v=${id}`)
        execFile(YTDLP, args, { timeout: 180000, maxBuffer: 8 * 1024 * 1024 }, (err, _o, stderr) => {
            try {
                if (err) throw new Error(String(stderr || err.message).trim().split('\n').pop().slice(0, 150))
                const f = fs.readdirSync(dir).find(x => x.endsWith('.mp4'))
                if (!f) throw new Error('yt-dlp: لم ينتج ملف')
                resolve(fs.readFileSync(path.join(dir, f)))
            } catch (e) { reject(e) }
            finally { try { fs.rmSync(dir, { recursive: true, force: true }) } catch {} }
        })
    })
}

async function ytDownload(id) {
    try { return await cnvVideo(id) }
    catch (e1) {
        try { return await ytdlpVideo(id) }
        catch (e2) { throw new Error(`${e1.message} | ${e2.message}`) }
    }
}

/* ===================== فيسبوك ===================== */
const CHROME_CIPHERS = [
    'TLS_AES_128_GCM_SHA256', 'TLS_AES_256_GCM_SHA384', 'TLS_CHACHA20_POLY1305_SHA256',
    'ECDHE-ECDSA-AES128-GCM-SHA256', 'ECDHE-RSA-AES128-GCM-SHA256', 'ECDHE-ECDSA-AES256-GCM-SHA384',
    'ECDHE-RSA-AES256-GCM-SHA384', 'ECDHE-ECDSA-CHACHA20-POLY1305', 'ECDHE-RSA-CHACHA20-POLY1305',
    'ECDHE-RSA-AES128-SHA', 'ECDHE-RSA-AES256-SHA', 'AES128-GCM-SHA256', 'AES256-GCM-SHA384', 'AES128-SHA', 'AES256-SHA'
].join(':')

function fbRequest(url, { maxRedirects = 8, headers = {} } = {}) {
    return new Promise((resolve, reject) => {
        const u = new URL(url)
        const req = https.request({
            hostname: u.hostname, path: u.pathname + u.search, method: 'GET',
            headers: {
                'User-Agent': UA,
                Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate',
                'Sec-Fetch-Dest': 'document', 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Site': 'none',
                'Upgrade-Insecure-Requests': '1', ...headers
            },
            timeout: 30000, ciphers: CHROME_CIPHERS, minVersion: 'TLSv1.2', maxVersion: 'TLSv1.3'
        }, async res => {
            if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && maxRedirects > 0) {
                res.resume()
                let next = res.headers.location
                if (!next.startsWith('http')) next = new URL(next, url).href
                try { return resolve(await fbRequest(next, { maxRedirects: maxRedirects - 1, headers })) } catch (e) { return reject(e) }
            }
            const chunks = []
            res.on('data', c => chunks.push(c))
            res.on('end', () => {
                let buf = Buffer.concat(chunks)
                try {
                    const enc = res.headers['content-encoding'] || ''
                    if (enc.includes('gzip')) buf = zlib.gunzipSync(buf)
                    else if (enc.includes('deflate')) buf = zlib.inflateSync(buf)
                    else if (enc.includes('br')) buf = zlib.brotliDecompressSync(buf)
                } catch {}
                resolve({ status: res.statusCode, text: buf.toString('utf-8') })
            })
        })
        req.on('error', reject)
        req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')) })
        req.end()
    })
}

async function fbVideoUrl(videoId) {
    const r = await fbRequest(`https://www.facebook.com/watch/?v=${videoId}`)
    if (r.status !== 200 || r.text.length < 1000) throw new Error('فشل فتح الفيديو')
    const clean = s => s ? s.replace(/\\u0025/g, '%').replace(/\\u0026/g, '&').replace(/\\\//g, '/').replace(/\\/g, '') : null
    const sd = clean(r.text.match(/browser_native_sd_url":"([^"]+)"/)?.[1])
    const hd = clean(r.text.match(/browser_native_hd_url":"([^"]+)"/)?.[1])
    if (!sd && !hd) throw new Error('ما لقيناش رابط الفيديو')
    return sd || hd   // SD أخف للكاروسيل
}

function fbDownload(url) {
    return new Promise((resolve, reject) => {
        const out = path.join(os.tmpdir(), `fb_${Date.now()}_${Math.random().toString(36).slice(2)}.mp4`)
        const args = ['-y', '-user_agent', UA, '-headers', 'Referer: https://www.facebook.com/\r\n',
            '-i', url, '-c', 'copy', '-movflags', '+faststart', '-t', '60', out]
        execFile(FFMPEG, args, { timeout: 180000, maxBuffer: 8 * 1024 * 1024 }, err => {
            try {
                if (err || !fs.existsSync(out)) throw new Error('فشل تحميل فيسبوك')
                const buf = fs.readFileSync(out)
                if (buf.length < 10000) throw new Error('ملف صغير')
                resolve(buf)
            } catch (e) { reject(e) }
            finally { try { fs.unlinkSync(out) } catch {} }
        })
    })
}

async function searchFacebook(q) {
    const r = await fbRequest(`https://www.facebook.com/watch/search/?q=${encodeURIComponent(`${q} edit`)}`)
    if (r.status !== 200 || r.text.length < 1000) throw new Error('فيسبوك رفض البحث')
    const html = r.text
    const ids = [...new Set([...html.matchAll(/"video_id":"(\d+)"/g)].map(x => x[1]))]
    const titles = [...new Set([...html.matchAll(/"message":\{"text":"([^"]{5,150})"/g)]
        .map(x => x[1].replace(/\\n/g, ' ').replace(/\\"/g, '"').trim()))]
    return ids.slice(0, 12).map((id, i) => ({
        title: titles[i] || titles[0] || `Facebook Edit ${i + 1}`,
        link: `https://www.facebook.com/watch/?v=${id}`,
        author: 'Facebook',
        stats: '',
        duration: 0,
        getBuffer: async () => fbDownload(await fbVideoUrl(id))
    }))
}

/* ===================== انستغرام ===================== */
async function searchInstagram(q) {
    const query = `${q} edit`
    const js = await axios.get(`https://cse.google.com/cse.js?cx=${CSE_CX}`, { headers: { 'User-Agent': UA }, timeout: 20000 }).then(r => r.data)
    const token = js.match(/"cse_token":\s*"([^"]+)"/)?.[1]
    const cselibv = (js.match(/"cselibVersion":\s*"([^"]+)"/) || [])[1]
    if (!token) throw new Error('فشل جلب توكن البحث')

    const url = `https://cse.google.com/cse/element/v1?rsz=filtered_cse&num=10&hl=en&source=gcsc&cselibv=${cselibv}&cx=${CSE_CX}&q=${encodeURIComponent(query)}&safe=off&cse_tok=${encodeURIComponent(token)}&filter=0&callback=cb&rurl=https%3A%2F%2Freelsfinder.satishyadav.com%2F`
    const r = await axios.get(url, {
        headers: { 'User-Agent': UA, Referer: 'https://reelsfinder.satishyadav.com/', Origin: 'https://reelsfinder.satishyadav.com' },
        timeout: 25000, transformResponse: [d => d]
    })
    const t = String(r.data).replace(/^\/\*O_o\*\/\s*cb\(/, '').replace(/\);\s*$/, '')
    const j = JSON.parse(t)
    const items = (j.results || []).map(x => ({
        title: (x.title || '').replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;/g, "'").trim(),
        url: x.url
    })).filter(x => x.url && x.url.includes('instagram.com'))

    return items.map(it => ({
        title: it.title || 'Instagram Edit',
        link: it.url,
        author: 'Instagram',
        stats: '',
        duration: 0,
        getBuffer: async () => {
            const a = await axios.get(`https://igexport.com/api/ig-reels/?url=${encodeURIComponent(it.url)}&videoOnly=1`, {
                headers: { 'User-Agent': UA, Accept: 'application/json', Referer: 'https://igexport.com/ar/video-download/', Origin: 'https://igexport.com' },
                timeout: 30000
            })
            if (!a.data?.ok || !a.data?.media?.videoUrl) throw new Error('فشل جلب الفيديو')
            const d = await axios.get(a.data.media.videoUrl, {
                responseType: 'arraybuffer', timeout: 120000, maxContentLength: 100 * 1024 * 1024,
                headers: { 'User-Agent': UA, Accept: '*/*' }
            })
            const buf = Buffer.from(d.data)
            if (buf.length < 10000) throw new Error('صغير')
            return buf
        }
    }))
}

const SEARCHERS = { tiktok: searchTikTok, youtube: searchYouTube, facebook: searchFacebook, instagram: searchInstagram }

/* ===================== بناء الكاروسيل ===================== */
async function makeCard(item, conn) {
    const buffer = await item.getBuffer()
    if (!buffer || buffer.length > MAX_CARD_MB * 1024 * 1024) throw new Error('الفيديو كبير')
    const media = await generateWAMessageContent({ video: buffer, mimetype: 'video/mp4' }, { upload: conn.waUploadToServer })
    const title = (item.title || 'Edit').replace(/\s+/g, ' ').trim()
    const body = [item.stats, `👤 ${item.author}${item.duration ? ` | ⏱️ ${item.duration}s` : ''}`].filter(Boolean).join('\n')

    // 🔘 زراير الكرت
    const buttons = []
    if (item.link) {
        buttons.push({
            name: 'cta_url',
            buttonParamsJson: JSON.stringify({ display_text: '🔗 فتح الفيديو', url: item.link, merchant_url: item.link })
        })
        buttons.push({
            name: 'cta_copy',
            buttonParamsJson: JSON.stringify({ display_text: '📋 نسخ الرابط', copy_code: item.link })
        })
    }

    return {
        buffer, item,
        card: {
            body: proto.Message.InteractiveMessage.Body.fromObject({ text: body || title.slice(0, 100) }),
            footer: proto.Message.InteractiveMessage.Footer.fromObject({ text: '⛩️ SUKUNA BOT ⛩️' }),
            header: proto.Message.InteractiveMessage.Header.fromObject({
                title: title.slice(0, 40), hasMediaAttachment: true, videoMessage: media.videoMessage
            }),
            nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({ buttons })
        }
    }
}

async function buildCards(items, conn) {
    const results = []
    let idx = 0
    const workers = Array.from({ length: CONCURRENCY }, async () => {
        while (results.length < CARD_COUNT) {
            const i = idx++
            if (i >= items.length) break
            try {
                const c = await makeCard(items[i], conn)
                if (results.length < CARD_COUNT) results.push(c)
            } catch (e) { log(`كارت ${i} فشل:`, e.message) }
        }
    })
    await Promise.all(workers)
    return results
}

/* ===================== التنفيذ ===================== */
async function runSearch(m, conn, platform, name) {
    const chat = m.chat
    const send = t => conn.sendMessage(chat, { text: t }, { quoted: m })
    const react = async e => { try { await conn.sendMessage(chat, { react: { text: e, key: m.key } }) } catch {} }
    const label = PLATFORMS[platform].label

    try {
        await react('🔍')
        await send(`🔍 *جاري البحث عن ايديتات:* ${name}\n📍 ${label}`)

        const items = await SEARCHERS[platform](name)
        if (!items?.length) throw new Error(`ما لقيت نتائج لـ ${name} على ${label}`)

        const built = await buildCards(items, conn)
        if (!built.length) throw new Error('فشل تحميل الفيديوهات')
        const cards = built.map(b => b.card)

        try {
            const msg = generateWAMessageFromContent(chat, {
                viewOnceMessage: {
                    message: {
                        messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
                        interactiveMessage: proto.Message.InteractiveMessage.fromObject({
                            body: proto.Message.InteractiveMessage.Body.create({ text: `🎬 *ايديت ${name}*\n${label} • ${cards.length} فيديو` }),
                            footer: proto.Message.InteractiveMessage.Footer.create({ text: 'SukunaBot' }),
                            header: proto.Message.InteractiveMessage.Header.create({ hasMediaAttachment: false }),
                            carouselMessage: proto.Message.InteractiveMessage.CarouselMessage.fromObject({ cards })
                        })
                    }
                }
            }, { quoted: m })
            await conn.relayMessage(chat, msg.message, { messageId: msg.key.id })
        } catch (err) {
            log('الكاروسيل فشل:', err?.message)
            for (const b of built.slice(0, 3)) {
                await conn.sendMessage(chat, {
                    video: b.buffer, mimetype: 'video/mp4',
                    caption: `🎬 *${b.item.title.slice(0, 80)}*\n👤 ${b.item.author}${b.item.link ? `\n🔗 ${b.item.link}` : ''}\n\n⛩️ SUKUNA BOT ⛩️`
                }, { quoted: m })
            }
        }
        await react('✅')
    } catch (err) {
        console.error('[ايديت:ERR]', err?.message)
        await react('❌')
        await send('❌ ' + String(err?.message || err).slice(0, 200))
    }
}

/* ===================== الأمر + قائمة الاختيار ===================== */
const PENDING = new Map() // "chat:sender" -> { name, exp }
const keyOf = m => `${m.chat}:${m.sender}`

const handler = async (m, { conn, text, usedPrefix, command }) => {
    const input = (text || '').trim()
    if (!input) {
        return m.reply(`🎬 *بحث الايديتات*\n\n${usedPrefix}${command} <الاسم>\nمثال: ${usedPrefix}${command} سوكونا\n\nأو مباشرة:\n${usedPrefix}${command} تيك سوكونا\n${usedPrefix}${command} يوتيوب سوكونا\n${usedPrefix}${command} فيس سوكونا\n${usedPrefix}${command} انستا سوكونا`)
    }

    // اختصار: المنصة كأول كلمة
    const [first, ...rest] = input.split(/\s+/)
    const direct = first && !/^\d+$/.test(first) ? pickPlatform(first) : null
    if (direct && rest.length) {
        PENDING.delete(keyOf(m))
        return runSearch(m, conn, direct, rest.join(' '))
    }

    PENDING.set(keyOf(m), { name: input, exp: Date.now() + MENU_TTL })
    const menu = Object.values(PLATFORMS).map(p => `*${p.n}* - ${p.label}`).join('\n')
    const bodyText = `🎬 *ايديت ${input}*\n\nتحب تجيب الايديت منين؟ اضغط زرار أو رد برقم:\n\n${menu}\n\n⏳ القائمة بتنتهي بعد دقيقتين`

    // 🔘 زراير اختيار المنصة (الضغط بيرجع الرقم 1-4 وبيلقطه handler.before)
    try {
        const msg = generateWAMessageFromContent(m.chat, {
            viewOnceMessage: {
                message: {
                    messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
                    interactiveMessage: proto.Message.InteractiveMessage.fromObject({
                        body: { text: bodyText },
                        footer: { text: '⛩️ SUKUNA BOT ⛩️' },
                        header: { hasMediaAttachment: false },
                        nativeFlowMessage: {
                            buttons: Object.values(PLATFORMS).map(p => ({
                                name: 'quick_reply',
                                buttonParamsJson: JSON.stringify({ display_text: p.label, id: String(p.n) })
                            }))
                        }
                    })
                }
            }
        }, { quoted: m })
        return await conn.relayMessage(m.chat, msg.message, { messageId: msg.key.id })
    } catch (e) {
        log('زراير القائمة فشلت:', e?.message)
        return conn.sendMessage(m.chat, { text: bodyText }, { quoted: m })
    }
}

// بيلقط رد المستخدم (زرار أو رقم 1-4 أو اسم المنصة) بعد القائمة
handler.before = async (m, { conn }) => {
    try {
        const p = PENDING.get(keyOf(m))
        if (!p) return false
        if (Date.now() > p.exp) { PENDING.delete(keyOf(m)); return false }
        const platform = pickPlatform(m.text)
        if (!platform) return false
        PENDING.delete(keyOf(m))
        await runSearch(m, conn, platform, p.name)
        return true
    } catch (e) {
        console.error('[ايديت:before]', e?.message)
        return false
    }
}

handler.help = ['ايديت <الاسم>']
handler.tags = ['downloader']
handler.command = /^(ايديت|edit)$/i

export default handler