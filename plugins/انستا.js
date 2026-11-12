// plugins/انستا.js
// ✧ Instagram Downloader 🎬 (v5)
// الترتيب: API بالكوكيز ← yt-dlp ← instagram-url-direct ← saveig ← btch

import axios from 'axios'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFile } from 'child_process'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36'
const IG_APP_UA = 'Instagram 275.0.0.27.98 Android (33/13; 420dpi; 1080x2400; samsung; SM-G991B; o1s; exynos2100; en_US; 458229237)'
const IG_APP_ID = '936619743392459'

const send = (conn, chat, text, quoted) => conn.sendMessage(chat, { text }, { quoted })

const SKIP_KEYS = /thumb|preview|cover|avatar|profile|poster|icon|logo/i

export function extractMedia(data) {
    const found = new Set()
    const walk = (node, key = '') => {
        if (node == null) return
        if (typeof node === 'string') {
            if (/^https?:\/\//i.test(node) && !SKIP_KEYS.test(key)) found.add(node.replace(/&amp;/g, '&'))
            return
        }
        if (Array.isArray(node)) return node.forEach(x => walk(x, key))
        if (typeof node === 'object') for (const [k, v] of Object.entries(node)) walk(v, k)
    }
    walk(data)
    return [...found]
}

export function extractFromHtml(html) {
    const out = new Set()
    for (const m of String(html).matchAll(/download-items__btn[^>]*>\s*<a[^>]*href="([^"]+)"/g)) out.add(m[1].replace(/&amp;/g, '&'))
    if (!out.size) {
        for (const m of String(html).matchAll(/<a[^>]+href="(https?:\/\/[^"]+)"/g)) {
            const u = m[1].replace(/&amp;/g, '&')
            if (/\.(mp4|jpg|jpeg|png|webp)(\?|$)|dl\.|download|cdn/i.test(u)) out.add(u)
        }
    }
    return [...out]
}

const snippet = d => {
    try { return (typeof d === 'string' ? d : JSON.stringify(d)).replace(/\s+/g, ' ').slice(0, 110) } catch { return '' }
}

// ━━━ الكوكيز ━━━
// IG_COOKIES = "sessionid=...; csrftoken=...; ds_user_id=..."  أو ملف ig_cookies.txt (Netscape)
function getCookieString() {
    const raw = (process.env.IG_COOKIES || '').trim()
    if (raw.includes('sessionid=')) return raw

    const local = path.join(process.cwd(), 'ig_cookies.txt')
    const src = raw && raw.includes('\t') ? raw : (fs.existsSync(local) ? fs.readFileSync(local, 'utf8') : '')
    if (!src) return ''

    const pairs = []
    for (const line of src.split('\n')) {
        const l = line.replace(/^#HttpOnly_/, '').trim()
        if (!l || l.startsWith('#')) continue
        const p = l.split('\t')
        if (p.length >= 7 && /instagram\.com$/i.test(p[0].replace(/^\./, ''))) pairs.push(`${p[5]}=${p[6]}`)
    }
    return pairs.join('; ')
}

// ━━━ shortcode → media id ━━━
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
const shortcodeToId = (sc) => {
    let id = 0n
    for (const c of sc) id = id * 64n + BigInt(B64.indexOf(c))
    return id.toString()
}
const parseIgUrl = (url) => String(url).match(/instagram\.com\/(?:[^/?#]+\/)?(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i)

// ━━━ المزوّدين ━━━

// 1) API إنستجرام الرسمي بالكوكيز (الأثبت)
const viaApi = async (url) => {
    const cookie = getCookieString()
    if (!cookie) throw new Error('مفيش كوكيز (حط IG_COOKIES)')
    const mm = parseIgUrl(url)
    if (!mm) throw new Error('الرابط مش منشور/ريل (ستوري غير مدعوم هنا)')

    const csrf = /csrftoken=([^;]+)/.exec(cookie)?.[1] || ''
    let r
    try {
        r = await axios.get(`https://i.instagram.com/api/v1/media/${shortcodeToId(mm[1])}/info/`, {
            headers: {
                'User-Agent': IG_APP_UA,
                'X-IG-App-ID': IG_APP_ID,
                'X-CSRFToken': csrf,
                Cookie: cookie,
                Accept: '*/*'
            },
            timeout: 25000
        })
    } catch (e) {
        const s = e.response?.status
        if (s === 400 || s === 401 || s === 403) throw new Error(`HTTP ${s} — الكوكيز منتهية أو الحساب متقيّد`)
        if (s === 404) throw new Error('المنشور مش موجود أو private')
        throw e
    }

    const item = r.data?.items?.[0]
    if (!item) throw new Error('رد فاضي: ' + snippet(r.data))

    const pick = (it) => it.video_versions?.[0]?.url || it.image_versions2?.candidates?.[0]?.url
    const nodes = item.carousel_media?.length ? item.carousel_media : [item]
    const links = nodes.map(pick).filter(Boolean)
    if (!links.length) throw new Error('مفيش روابط في الرد')
    return links
}

// 2) yt-dlp
const ytdlp = (url) => new Promise((resolve, reject) => {
    const raw = (process.env.IG_COOKIES || '').trim()
    const headerMode = raw.includes('sessionid=') && !raw.includes('\t')
    let tmp = null
    const cookieArgs = []

    if (headerMode) {
        cookieArgs.push('--add-header', `Cookie:${raw}`)
    } else {
        tmp = path.join(os.tmpdir(), `igcookies_${process.pid}_${Date.now()}.txt`)
        const local = path.join(process.cwd(), 'ig_cookies.txt')
        if (raw) fs.writeFileSync(tmp, raw)
        else if (fs.existsSync(local)) fs.copyFileSync(local, tmp)
        else tmp = null
        if (tmp) cookieArgs.push('--cookies', tmp)
    }

    execFile('yt-dlp', ['-g', '-f', 'b/best', '--no-warnings', ...cookieArgs, url], { timeout: 45000, maxBuffer: 1 << 20 }, (err, stdout, stderr) => {
        if (tmp) { try { fs.unlinkSync(tmp) } catch {} }
        if (err) return reject(new Error(err.code === 'ENOENT' ? 'yt-dlp مش موجود في PATH' : (String(stderr || err.message).split('\n').find(l => /ERROR/.test(l)) || err.message).slice(0, 140)))
        const links = String(stdout).split('\n').map(s => s.trim()).filter(s => /^https?:\/\//.test(s))
        links.length ? resolve(links) : reject(new Error('yt-dlp: مفيش روابط'))
    })
})

const viaPackage = (pkg, call) => async (url) => {
    let mod
    try { mod = await import(pkg) } catch (e) {
        throw new Error(e?.code === 'ERR_MODULE_NOT_FOUND' ? `${pkg} مش متثبتة (npm i ${pkg})` : `${pkg}: ${String(e?.message).slice(0, 100)}`)
    }
    const data = await call(mod, url)
    const links = extractMedia(data)
    if (!links.length) throw new Error('مفيش روابط: ' + snippet(data))
    return links
}

const ajaxSearch = (host) => async (url) => {
    const r = await axios.post(`https://${host}/api/ajaxSearch`,
        new URLSearchParams({ q: url, t: 'media', lang: 'en' }).toString(),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA, Origin: `https://${host}`, Referer: `https://${host}/` }, timeout: 25000 })
    const html = r.data?.data
    if (typeof html !== 'string' || !html) throw new Error('رد فاضي: ' + snippet(r.data))
    if (html.startsWith('eval(')) throw new Error('الموقع بقى يرجّع كود مشفّر (محتاج فك)')
    const links = extractFromHtml(html)
    if (!links.length) throw new Error('مفيش روابط في الـ HTML: ' + snippet(html))
    return links
}

const PROVIDERS = [
    { name: 'ig-api', run: viaApi },
    { name: 'yt-dlp', run: ytdlp },
    { name: 'instagram-url-direct', run: viaPackage('instagram-url-direct', (m, u) => (m.instagramGetUrl || m.default?.instagramGetUrl || m.default || m)(u)) },
    { name: 'saveig', run: ajaxSearch('v3.saveig.app') },
    { name: 'btch', run: viaPackage('btch-downloader', (m, u) => (m.igdl || m.default?.igdl)(u)) },
]

const shortErr = e => e.response?.status ? `HTTP ${e.response.status}` : (e.code || e.message || 'unknown').toString().slice(0, 140)

// ━━━ تحميل ━━━
export function sniff(buf, mime = '') {
    if (mime.startsWith('video/')) return 'video'
    if (mime.startsWith('image/')) return 'image'
    if (buf.length > 12 && buf.slice(4, 8).toString() === 'ftyp') return 'video'
    if (buf[0] === 0xFF && buf[1] === 0xD8) return 'image'
    if (buf[0] === 0x89 && buf.slice(1, 4).toString() === 'PNG') return 'image'
    if (buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return 'image'
    return null
}

async function download(url) {
    const r = await axios.get(url, { headers: { 'User-Agent': UA, Accept: '*/*' }, timeout: 90000, responseType: 'arraybuffer', maxRedirects: 10 })
    const buffer = Buffer.from(r.data)
    return { buffer, kind: sniff(buffer, String(r.headers['content-type'] || '')) }
}

async function handleDownload(m, conn, url) {
    const react = async (emoji) => { try { await conn.sendMessage(m.chat, { react: { text: emoji, key: m.key } }) } catch {} }
    await react('⏳')

    let links = []
    const errors = []
    for (const p of PROVIDERS) {
        try {
            links = await p.run(url)
            console.log(`[Instagram] ✅ ${p.name} (${links.length})`)
            break
        } catch (e) {
            const msg = `${p.name}: ${shortErr(e)}`
            errors.push(msg)
            console.error(`[Instagram] ❌ ${msg}`)
        }
    }

    if (!links.length) {
        await react('❌')
        return send(conn, m.chat,
            `❌ فشل تحميل الرابط\nتأكد إن المنشور مش private\n\n🔧 *تفاصيل (للمطور):*\n${errors.map(e => `• ${e}`).join('\n')}`, m)
    }

    let sent = 0
    for (let i = 0; i < links.length; i++) {
        try {
            const { buffer, kind } = await download(links[i])
            if (buffer.length < 500 || !kind) continue
            if (kind === 'video') {
                await conn.sendMessage(m.chat, { video: buffer, mimetype: 'video/mp4', caption: `🎬 Instagram Video\n📦 ${(buffer.length / 1048576).toFixed(2)} MB` }, { quoted: m })
            } else {
                await conn.sendMessage(m.chat, { image: buffer, caption: links.length > 1 ? `📷 Instagram (${i + 1}/${links.length})` : '📷 Instagram' }, { quoted: m })
            }
            sent++
        } catch (e) {
            console.error(`[Instagram] send error: ${shortErr(e)}`)
        }
    }

    if (!sent) {
        await react('❌')
        return send(conn, m.chat, '❌ لقيت الروابط بس تعذّر تحميل الملفات، حاول مرة أخرى', m)
    }
    await react('✅')
}

let handler = async (m, { conn, text, usedPrefix, command }) => {
    const input = (text || '').trim()
    if (!input) return send(conn, m.chat, `📷 *Instagram Downloader*\n\nمثال:\n${usedPrefix}${command} https://www.instagram.com/p/...`, m)
    if (input.includes('instagram.com')) return handleDownload(m, conn, input)
    return send(conn, m.chat, '❌ ابعت رابط Instagram صحيح', m)
}

handler.help = ['انستا <رابط>']
handler.tags = ['downloader']
handler.command = /^(انستا|انستجرام|instagram|ig)$/i

export default handler