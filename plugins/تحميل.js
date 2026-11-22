// plugins/تحميل.js
// ⬇️ تحميل شامل: .تحميل <رابط>  → فيديو / صور / أغنية حسب الرابط
//   .تحميل <رابط> صوت      → الصوت بس
//   (أو رد على رسالة فيها رابط واكتب .تحميل)
//
// المصادر: Prexzy AIO (أول) ← يدعم كل المواقع
//          ثم btch-downloader / instagram-url-direct / yt-dlp كـ fallback

import axios from 'axios'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileP = promisify(execFile)

const FOOTER      = '⛩️ SUKUNA BOT ⛩️'
const MAX_MB      = 500
const AS_VIDEO_MB = 50
const MAX_IMAGES  = 10
const UA          = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36'

const PREXZY_AIO = 'https://prexzyapis.com/download/aio'

const URL_RE   = /https?:\/\/[^\s<>"']+/i
const AUDIO_RE = /(^|\s)(mp3|audio)(\s|$)|صوت|اغني|أغني|اغاني|أغاني|موسيق/i
const log      = (...a) => console.log('[تحميل]', ...a)
const snip     = d => { try { return (typeof d === 'string' ? d : JSON.stringify(d)).replace(/\s+/g, ' ').slice(0, 120) } catch { return '' } }
const shortErr = e => e?.response?.status ? `HTTP ${e.response.status}` : String(e?.code || e?.message || e || 'unknown').slice(0, 140)

// ━━━━━━━━ استخراج الروابط من أي JSON ━━━━━━━━
const SKIP_KEYS  = /thumb|preview|cover|avatar|profile|poster|icon|logo|author|user|config|headers|request|stack/i
const TITLE_KEYS = /^(title|desc|description|caption)$/i

function extractMedia(data) {
    const links = []
    const seen  = new Set()
    let title   = ''
    const walk  = (node, key = '', depth = 0) => {
        if (node == null || depth > 8) return
        if (typeof node === 'string') {
            if (/^https?:\/\//i.test(node)) {
                if (!SKIP_KEYS.test(key)) {
                    const url = node.replace(/&amp;/g, '&')
                    if (!seen.has(url)) { seen.add(url); links.push({ url, key }) }
                }
            } else if (!title && TITLE_KEYS.test(key) && node.trim()) title = node.trim()
            return
        }
        if (Array.isArray(node)) return node.forEach(x => walk(x, key, depth + 1))
        if (typeof node === 'object') for (const [k, v] of Object.entries(node)) walk(v, k, depth + 1)
    }
    walk(data)
    return { links, title }
}

// ━━━━━━━━ ترتيب الروابط حسب المطلوب ━━━━━━━━
function rankLinks(links, mode) {
    const score = ({ url, key }) => {
        const s = `${key} ${url}`.toLowerCase()
        let n = 0
        if (mode === 'audio') {
            if (/music|audio|mp3|sound|m4a/.test(s)) n += 50
            if (/video|play|nowm/.test(s)) n -= 10
        } else {
            if (/hd|nowm|no_watermark|nowatermark/.test(s)) n += 40
            if (/video|play|mp4|download/.test(s)) n += 20
            if (/image|photo|slide|img/.test(s)) n += 10
            if (/music|audio|mp3|sound/.test(s)) n -= 30
            if (/wmplay|watermark|_wm/.test(s)) n -= 20
        }
        if (/\.mp4(\?|$)/.test(s)) n += 15
        return n
    }
    return [...links].sort((a, b) => score(b) - score(a))
}

// ━━━━━━━━ معرفة نوع الملف من محتواه ━━━━━━━━
function sniff(b) {
    if (!b || b.length < 500) return null
    const head  = b.slice(0, 16)
    const brand = b.slice(4, 8).toString('latin1')
    if (brand === 'ftyp') {
        const sub = b.slice(8, 12).toString('latin1')
        return /^M4[AB]/.test(sub) ? { kind: 'audio', mime: 'audio/mp4', ext: 'm4a' } : { kind: 'video', mime: 'video/mp4', ext: 'mp4' }
    }
    if (head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) return { kind: 'video', mime: 'video/webm', ext: 'webm' }
    if (head[0] === 0xff && head[1] === 0xd8) return { kind: 'image', mime: 'image/jpeg', ext: 'jpg' }
    if (head[0] === 0x89 && head.slice(1, 4).toString('latin1') === 'PNG') return { kind: 'image', mime: 'image/png', ext: 'png' }
    if (head.slice(0, 4).toString('latin1') === 'RIFF' && b.slice(8, 12).toString('latin1') === 'WEBP') return { kind: 'image', mime: 'image/webp', ext: 'webp' }
    if (head.slice(0, 3).toString('latin1') === 'GIF') return { kind: 'image', mime: 'image/gif', ext: 'gif' }
    if (head.slice(0, 3).toString('latin1') === 'ID3' || (head[0] === 0xff && (head[1] & 0xe0) === 0xe0)) return { kind: 'audio', mime: 'audio/mpeg', ext: 'mp3' }
    if (head.slice(0, 4).toString('latin1') === 'OggS') return { kind: 'audio', mime: 'audio/ogg', ext: 'ogg' }
    if (head.slice(0, 4).toString('latin1') === 'RIFF' && b.slice(8, 12).toString('latin1') === 'WAVE') return { kind: 'audio', mime: 'audio/wav', ext: 'wav' }
    return null
}

async function downloadBuffer(url, extraHeaders = {}, retries = 1) {
    let lastErr = null
    for (let i = 0; i < retries; i++) {
        try {
            const r = await axios.get(url, {
                headers: { 'User-Agent': UA, Accept: '*/*', ...extraHeaders },
                responseType: 'arraybuffer', timeout: 600000, maxRedirects: 8,
                maxContentLength: MAX_MB * 1024 * 1024,
                validateStatus: () => true
            })
            if (r.status === 200 && r.data?.length) return Buffer.from(r.data)
            lastErr = new Error('HTTP ' + r.status)
        } catch (e) { lastErr = e }
        if (i < retries - 1) await new Promise(r => setTimeout(r, 2000))
    }
    throw lastErr || new Error('تحميل فاشل')
}

// ━━━━━━━━ Prexzy AIO — يدعم كل المواقع ━━━━━━━━
async function viaPrexzyAIO(url) {
    const r = await axios.get(PREXZY_AIO, {
        params: { url },
        timeout: 40000,
        validateStatus: () => true
    })
    const d = r.data
    log('[prexzy-aio] status:', r.status, '| sample:', snip(d))

    if (r.status >= 400) throw new Error(`Prexzy-AIO: HTTP ${r.status}`)
    if (d?.data?.name === 'AxiosError' || d?.data?.stack) throw new Error('Prexzy-AIO: ' + snip(d.data.message || 'خطأ داخلي'))
    if (d?.status === false) throw new Error('Prexzy-AIO: ' + snip(d.message || d))

    const ex = extractMedia(d?.data ?? d)
    if (!ex.links.length) throw new Error('Prexzy-AIO: مفيش روابط — ' + snip(d))
    return ex
}

// ━━━━━━━━ yt-dlp ━━━━━━━━
let ytdlpPath = null
async function canRun(bin) {
    try { await execFileP(bin, ['--version'], { timeout: 20000 }); return true } catch { return false }
}
async function ensureYtdlp() {
    if (ytdlpPath && fs.existsSync(ytdlpPath)) return ytdlpPath
    const dirs       = [...new Set(['/tmp', os.tmpdir(), process.cwd(), '/home'])]
    const candidates = dirs.map(d => path.join(d, 'yt-dlp-bin'))
    for (const bin of candidates) {
        if (fs.existsSync(bin)) {
            try { fs.chmodSync(bin, 0o755) } catch {}
            if (await canRun(bin)) return (ytdlpPath = bin)
        }
    }
    log('بنزّل yt-dlp...')
    const r    = await axios.get('https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux',
        { responseType: 'arraybuffer', timeout: 120000, maxRedirects: 5 })
    const data = Buffer.from(r.data)
    if (data.length < 1024 * 1024) throw new Error('yt-dlp: التحميل ناقص')
    for (const bin of candidates) {
        try {
            fs.writeFileSync(bin, data); fs.chmodSync(bin, 0o755)
            if (await canRun(bin)) return (ytdlpPath = bin)
        } catch {}
    }
    throw new Error('yt-dlp: مفيش مكان يسمح بالتنفيذ على السيرفر')
}

async function viaYtdlp(url, mode) {
    const bin    = await ensureYtdlp()
    const tmpDir = os.tmpdir()
    const stem   = `dl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    const args   = [
        '-f', mode === 'audio' ? 'ba[ext=m4a]/ba/b' : 'best[ext=mp4][height<=720]/best[ext=mp4]/best',
        '--no-playlist', '--no-warnings', '--max-filesize', `${MAX_MB}M`,
        '-o', path.join(tmpDir, `${stem}.%(ext)s`)
    ]
    let cookieFile = null
    const host = (() => { try { return new URL(url).hostname } catch { return '' } })()
    const igRaw = (process.env.IG_COOKIES || '').trim()
    if (/instagram\.com$/.test(host) && igRaw) {
        if (igRaw.includes('sessionid=') && !igRaw.includes('\t')) args.push('--add-header', `Cookie:${igRaw}`)
        else { cookieFile = path.join(tmpDir, `${stem}_c.txt`); fs.writeFileSync(cookieFile, igRaw); args.push('--cookies', cookieFile) }
    } else if (/youtube\.com$|youtu\.be$/.test(host) && process.env.YT_COOKIES) {
        cookieFile = path.join(tmpDir, `${stem}_c.txt`); fs.writeFileSync(cookieFile, process.env.YT_COOKIES); args.push('--cookies', cookieFile)
    }
    if (process.env.YT_PROXY) args.push('--proxy', process.env.YT_PROXY)
    args.push(url)

    let file = null
    try {
        try {
            await execFileP(bin, args, { timeout: 240000, maxBuffer: 1 << 24 })
        } catch (e) {
            const msg = String(e.stderr || e.message).trim().split('\n').filter(l => /ERROR/.test(l)).pop() || String(e.message)
            throw new Error('yt-dlp: ' + msg.slice(0, 140))
        }
        file = fs.readdirSync(tmpDir).find(f => f.startsWith(stem + '.') && !f.endsWith('_c.txt'))
        if (!file) throw new Error('yt-dlp: مفيش ملف')
        return { buffers: [fs.readFileSync(path.join(tmpDir, file))], title: '' }
    } finally {
        if (file) { try { fs.unlinkSync(path.join(tmpDir, file)) } catch {} }
        if (cookieFile) { try { fs.unlinkSync(cookieFile) } catch {} }
    }
}

// ━━━━━━━━ يوتيوب عن طريق cnv.cx (fallback) ━━━━━━━━
const CNV_HEADERS = {
    'User-Agent': UA,
    'Origin':  'https://iframe.y2meta-uk.com',
    'Referer': 'https://iframe.y2meta-uk.com/'
}

function ytId(url) {
    const m = String(url).match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/)
    return m ? m[1] : null
}

async function viaCnv(url, mode) {
    const id = ytId(url)
    if (!id) throw new Error('cnv: مش لاقي ID الفيديو في الرابط')
    const k = await axios.get(`https://cnv.cx/v2/sanity/key?id=${id}`, { headers: CNV_HEADERS, timeout: 20000 })
    if (!k.data?.key) throw new Error('cnv: فشل جلب المفتاح')
    await new Promise(r => setTimeout(r, 1500))

    const params = new URLSearchParams({
        link: `https://youtu.be/${id}`,
        format: mode === 'audio' ? 'mp3' : 'mp4',
        videoQuality: '720',
        filenameStyle: 'pretty',
        vCodec: 'h264'
    })
    if (mode === 'audio') params.set('audioBitrate', '256')

    const r = await axios.post('https://cnv.cx/v2/converter', params.toString(), {
        headers: { ...CNV_HEADERS, 'Content-Type': 'application/x-www-form-urlencoded', accept: '*/*', key: k.data.key },
        timeout: 120000, validateStatus: () => true
    })
    if (r.status === 200 && r.data?.url) {
        return {
            links: [{ url: r.data.url, key: 'download' }],
            title: String(r.data.filename || '').replace(/\.(mp4|mp3)$/i, ''),
            dlHeaders: { Referer: 'https://cnv.cx/', Origin: 'https://cnv.cx' },
            assume: mode === 'audio' ? 'audio' : 'video',
            retries: 3
        }
    }
    throw new Error('cnv: ' + (r.data?.errorMsg || `HTTP ${r.status}`))
}

// ━━━━━━━━ باقي المزوّدين كـ fallback ━━━━━━━━
const viaPackage = (pkg, fnName, extra) => async (url) => {
    let mod
    try { mod = await import(pkg) } catch { throw new Error(`${pkg} مش متثبتة`) }
    const fn = mod[fnName] || mod.default?.[fnName] || (extra && extra(mod))
    if (typeof fn !== 'function') throw new Error(`${pkg}: مفيش دالة ${fnName}`)
    const data = await fn(url)
    const ex   = extractMedia(data)
    if (!ex.links.length) throw new Error(`${pkg}: مفيش روابط ${snip(data)}`)
    return ex
}

const P = {
    aio:    { name: 'prexzy-aio', run: viaPrexzyAIO },
    btchTT: { name: 'btch-tt',    run: viaPackage('btch-downloader', 'ttdl') },
    btchIG: { name: 'btch-ig',    run: viaPackage('btch-downloader', 'igdl') },
    btchFB: { name: 'btch-fb',    run: viaPackage('btch-downloader', 'fbdown') },
    btchTW: { name: 'btch-tw',    run: viaPackage('btch-downloader', 'twitter') },
    igUrl:  { name: 'ig-url',     run: viaPackage('instagram-url-direct', 'instagramGetUrl', m => m.default) },
    tobyTT: { name: 'tiktok-dl',  run: viaPackage('@tobyg74/tiktok-api-dl', 'Downloader', m => m.default?.Downloader ? ((u) => m.default.Downloader(u, { version: 'v3' })) : null) },
    cnv:    { name: 'cnv',        run: viaCnv },
    ytdlp:  { name: 'yt-dlp',    run: viaYtdlp }
}

// ━━━━━━━━ السلاسل — Prexzy AIO أول دايماً ━━━━━━━━
function chainFor(host) {
    if (/tiktok\.com$/.test(host))              return [P.aio, P.tobyTT, P.btchTT, P.ytdlp]
    if (/youtube\.com$|youtu\.be$/.test(host))  return [P.aio, P.cnv, P.ytdlp]
    if (/instagram\.com$/.test(host))           return [P.aio, P.ytdlp, P.igUrl, P.btchIG]
    if (/facebook\.com$|fb\.watch$/.test(host)) return [P.aio, P.btchFB, P.ytdlp]
    if (/twitter\.com$|x\.com$/.test(host))     return [P.aio, P.btchTW, P.ytdlp]
    return [P.aio, P.ytdlp]
}

// ━━━━━━━━ تجميع الملفات من نتيجة مزوّد ━━━━━━━━
async function collect(res, mode) {
    const files = []
    for (const b of res.buffers || []) { const t = sniff(b); if (t) files.push({ buf: b, ...t }) }

    const wantDone = () => files.some(f => f.kind === (mode === 'audio' ? 'audio' : 'video'))
    for (const l of rankLinks(res.links || [], mode)) {
        if (wantDone()) break
        if (files.filter(f => f.kind === 'image').length >= MAX_IMAGES) break
        try {
            const b = await downloadBuffer(l.url, res.dlHeaders, res.retries || 1)
            let t   = sniff(b)
            if (!t && res.assume && b.length > 10000) {
                const head = b.slice(0, 1).toString('latin1')
                if (head !== '<' && head !== '{') {
                    t = res.assume === 'audio'
                        ? { kind: 'audio', mime: 'audio/mpeg', ext: 'mp3' }
                        : { kind: 'video', mime: 'video/mp4',  ext: 'mp4' }
                }
            }
            if (t) files.push({ buf: b, ...t })
            else log(`نوع ملف مش معروف (${b.length} بايت):`, snip(b.slice(0, 80).toString('latin1')))
        } catch (e) { log('رابط فشل:', shortErr(e)) }
    }

    const first = k => files.find(f => f.kind === k)
    if (mode === 'audio') return first('audio') ? { kind: 'audio', files: [first('audio')] } : null
    if (first('video')) return { kind: 'video', files: [first('video')] }
    const imgs = files.filter(f => f.kind === 'image')
    if (imgs.length) return { kind: 'images', files: imgs.slice(0, MAX_IMAGES) }
    if (first('audio')) return { kind: 'audio', files: [first('audio')] }
    return null
}

const cleanName = t => (String(t || 'file').replace(/[\\/:*?"<>|\n\r]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60)) || 'file'

async function sendOut(conn, m, out, title) {
    const caption = `${title ? `*${title.slice(0, 120)}*\n\n` : ''}> ${FOOTER}`
    const opts    = { quoted: m }
    if (out.kind === 'video') {
        const f      = out.files[0]
        const sizeMB = f.buf.length / 1048576
        if (sizeMB > MAX_MB) throw new Error(`الحجم ${sizeMB.toFixed(1)}MB أكبر من الحد (${MAX_MB}MB)`)
        const fileName = `${cleanName(title || 'video')}.${f.ext}`
        if (sizeMB > AS_VIDEO_MB) await conn.sendMessage(m.chat, { document: f.buf, mimetype: f.mime, fileName, caption }, opts)
        else await conn.sendMessage(m.chat, { video: f.buf, mimetype: f.mime, caption }, opts)
    } else if (out.kind === 'images') {
        for (let i = 0; i < out.files.length; i++) {
            await conn.sendMessage(m.chat, { image: out.files[i].buf, caption: i === 0 ? caption : '' }, opts)
        }
    } else {
        const f = out.files[0]
        await conn.sendMessage(m.chat, { audio: f.buf, mimetype: f.mime, fileName: `${cleanName(title || 'audio')}.${f.ext}`, ptt: false }, opts)
    }
}

// ━━━━━━━━ الأمر ━━━━━━━━
let handler = async (m, { conn, text, usedPrefix, command }) => {
    const reply = t => conn.sendMessage(m.chat, { text: t }, { quoted: m })
    const react = async e => { try { await conn.sendMessage(m.chat, { react: { text: e, key: m.key } }) } catch {} }

    const given = String(text || '')
    const url   = (`${given} ${m.quoted?.text || ''}`.match(URL_RE) || [])[0]
    if (!url) {
        return reply(
            `⬇️ *تحميل شامل*\n\n` +
            `ابعت رابط (تيك توك / إنستجرام / فيسبوك / تويتر / يوتيوب...)\n\n` +
            `*${usedPrefix}${command} <الرابط>*  ← فيديو أو صور\n` +
            `*${usedPrefix}${command} <الرابط> صوت*  ← الصوت بس\n\n` +
            `> ${FOOTER}`
        )
    }

    let host = ''
    try { host = new URL(url).hostname.replace(/^www\./, '').replace(/^(m|vm|vt|mobile)\./, '') } catch { return reply('❌ الرابط غير صالح') }

    const mode = AUDIO_RE.test(given.replace(url, ' ')) ? 'audio' : 'video'
    await react('⏳')

    const errors = []
    for (const p of chainFor(host)) {
        try {
            const res = await p.run(url, mode)
            const out = await collect(res, mode)
            if (!out) { errors.push(`${p.name}: ملقيتش ميديا صالحة`); continue }
            await sendOut(conn, m, out, res.title || '')
            log(`✅ ${p.name} (${out.kind})`)
            await react('✅')
            return
        } catch (e) {
            const msg = `${p.name}: ${shortErr(e)}`
            errors.push(msg)
            log('❌', msg)
        }
    }

    await react('❌')
    return reply(
        `❌ فشل التحميل\nتأكد إن الرابط عام (مش private)\n\n` +
        `🔧 *تفاصيل:*\n${errors.map(e => `• ${e}`).join('\n').slice(0, 900)}\n\n> ${FOOTER}`
    )
}

handler.help    = ['تحميل <رابط>']
handler.tags    = ['downloader']
handler.command = /^(تحميل|dl)$/i

export default handler