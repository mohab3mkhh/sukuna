// plugins/انستا.js
// ✧ Instagram Downloader 🎬 (v4)

import axios from 'axios'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFile } from 'child_process'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36'

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

// ━━━ المزوّدين ━━━
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

const viaPackage = (pkg, call) => async (url) => {
    let mod
    try { mod = await import(pkg) } catch { throw new Error(`${pkg} مش متثبتة`) }
    const data = await call(mod, url)
    const links = extractMedia(data)
    if (!links.length) throw new Error('مفيش روابط: ' + snippet(data))
    return links
}

// كوكيز إنستجرام: IG_COOKIES بصيغة سطر واحد  sessionid=...; csrftoken=...; ds_user_id=...
// (أو ملف ig_cookies.txt بصيغة Netscape في جذر المشروع)
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

const PROVIDERS = [
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