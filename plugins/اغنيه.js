/**
 * plugins/غنيه.js — .غنيه <اسم/رابط>  → زرارين (صوت / فيديو) → تحميل
 *   .غنيه mp3 <اسم/رابط>        تحميل صوت مباشرة
 *   .غنيه mp4 <اسم/رابط>        قايمة الدقة ثم تحميل الفيديو
 *   .غنيه mp4 <رابط> 360        تحميل فيديو بدقة محددة
 *
 * ليه الأمر القديم ساكت:
 *  • الأزرار كانت بتتبعت relayMessage خام (viewOnce + interactive) وده بيتبلع/مش بيظهر،
 *    ودلوقتي بنبعتها من lib/buttons.js زي باقي الأوامر.
 *  • مصدر savetube لوحده بيقع كتير؛ دلوقتي yt-dlp الأول (نفس طريقة أمر شغل) وبعده savetube وytdl-core.
 *  • أي خطأ بقى بيظهر في الشات.
 */

import axios from 'axios'
import crypto from 'crypto'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'

let libButtons = null
try { libButtons = await import('../lib/buttons.js') } catch (e) { console.error('[غنيه] lib/buttons.js مش متحمّل:', e.message) }

const execFileP = promisify(execFile)
const log = (...a) => console.log('[غنيه]', ...a)
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
const FOOTER = '⛩️ SUKUNA BOT ⛩️'
const VIDEO_QUALITIES = ['144', '240', '360', '480', '720', '1080']
const LIMIT_AUDIO = 70 * 1024 * 1024
const LIMIT_VIDEO = 100 * 1024 * 1024
const delay = ms => new Promise(r => setTimeout(r, ms))

const ytId = url => {
    const m = String(url || '').match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|v\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/)
    return m ? m[1] : null
}
const isUrl = s => { try { new URL(s); return true } catch { return false } }
const sizeStr = n => { const u = ['B', 'KB', 'MB', 'GB']; let i = 0; while (n >= 1024 && i < 3) { n /= 1024; i++ } return `${n.toFixed(1)} ${u[i]}` }

// ━━━ البحث ━━━
async function findVideo(query) {
    const id = isUrl(query) ? ytId(query) : null
    try {
        const mod = await import('yt-search')
        const yts = mod.default || mod
        if (id) {
            const v = await yts({ videoId: id })
            if (v) return { id, url: `https://www.youtube.com/watch?v=${id}`, title: v.title, thumb: v.thumbnail || v.image }
        } else {
            const r = await yts(query)
            const v = r?.videos?.[0]
            if (v) return { id: v.videoId, url: v.url, title: v.title, thumb: v.thumbnail }
        }
    } catch (e) { log('yt-search:', e.message) }
    if (id) return { id, url: `https://www.youtube.com/watch?v=${id}`, title: 'YouTube', thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` }
    try {
        const r = await axios.get(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&hl=en`, { headers: { 'User-Agent': UA }, timeout: 15000 })
        const html = String(r.data)
        const mm = html.match(/"videoRenderer":\{"videoId":"([\w-]{11})"/)
        if (mm) {
            const vid = mm[1]
            const tm = html.slice(html.indexOf(vid)).match(/"title":\{"runs":\[\{"text":"(.*?)"\}/)
            return { id: vid, url: `https://www.youtube.com/watch?v=${vid}`, title: tm ? tm[1] : query, thumb: `https://i.ytimg.com/vi/${vid}/hqdefault.jpg` }
        }
    } catch (e) { log('scrape:', e.message) }
    return null
}

// ━━━ yt-dlp ━━━
let ytdlpPath = null
async function canRun(bin) { try { await execFileP(bin, ['--version'], { timeout: 20000 }); return true } catch { return false } }
async function ensureYtdlp() {
    if (ytdlpPath && fs.existsSync(ytdlpPath)) return ytdlpPath
    const dirs = [...new Set(['/tmp', os.tmpdir(), process.cwd(), '/home'])]
    const candidates = dirs.map(d => path.join(d, 'yt-dlp-bin'))
    for (const bin of candidates) {
        if (fs.existsSync(bin)) { try { fs.chmodSync(bin, 0o755) } catch {} if (await canRun(bin)) return (ytdlpPath = bin) }
    }
    log('بنزّل yt-dlp...')
    const r = await axios.get('https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux', { responseType: 'arraybuffer', timeout: 120000, maxRedirects: 5 })
    const data = Buffer.from(r.data)
    if (data.length < 1024 * 1024) throw new Error('yt-dlp: التحميل ناقص')
    for (const bin of candidates) {
        try { fs.writeFileSync(bin, data); fs.chmodSync(bin, 0o755); if (await canRun(bin)) return (ytdlpPath = bin) } catch {}
    }
    throw new Error('yt-dlp: مفيش مكان يسمح بالتنفيذ')
}
function prepareCookies() {
    const tmp = path.join(os.tmpdir(), `cookies_${process.pid}_${Date.now()}.txt`)
    if (process.env.YT_COOKIES) { fs.writeFileSync(tmp, process.env.YT_COOKIES); return tmp }
    const local = path.join(process.cwd(), 'cookies.txt')
    if (fs.existsSync(local)) { fs.copyFileSync(local, tmp); return tmp }
    return null
}

async function viaYtdlp(video, kind, quality) {
    const bin = await ensureYtdlp()
    const base = path.join(os.tmpdir(), `gh_${video.id}_${Date.now()}`)
    const cookies = prepareCookies()
    const args = kind === 'audio'
        ? ['-f', 'bestaudio[ext=m4a]/bestaudio', '--max-filesize', '70M']
        : ['-f', `best[height<=${quality}][ext=mp4]/best[height<=${quality}]/best[ext=mp4]/best`, '--max-filesize', '100M']
    args.push('--no-playlist', '--no-warnings', '-o', `${base}.%(ext)s`)
    if (cookies) args.push('--cookies', cookies)
    if (process.env.YT_PROXY) args.push('--proxy', process.env.YT_PROXY)
    args.push(video.url)
    let file
    try {
        try { await execFileP(bin, args, { timeout: 170000, maxBuffer: 1 << 24 }) }
        catch (e) { throw new Error('yt-dlp: ' + String(e.stderr || e.message).trim().split('\n').slice(-2).join(' | ')) }
        const prefix = path.basename(base)
        const name = fs.readdirSync(os.tmpdir()).find(f => f.startsWith(prefix))
        if (!name) throw new Error('yt-dlp: الملف مش موجود')
        file = path.join(os.tmpdir(), name)
        const ext = path.extname(file).slice(1).toLowerCase()
        const buffer = fs.readFileSync(file)
        const mime = kind === 'audio' ? (ext === 'mp3' ? 'audio/mpeg' : 'audio/mp4') : 'video/mp4'
        return { name: 'yt-dlp', buffer, mimetype: mime, ext }
    } finally {
        if (file) try { fs.unlinkSync(file) } catch {}
        if (cookies) try { fs.unlinkSync(cookies) } catch {}
    }
}

// ━━━ savetube (احتياطي) ━━━
const ST = { base: 'https://media.savetube.me/api', key: 'C5D58EF67A7584E4A29F6C35BBC4EB12',
    headers: { accept: '*/*', 'content-type': 'application/json', origin: 'https://yt.savetube.me', referer: 'https://yt.savetube.me/', 'user-agent': UA } }
const stDecrypt = enc => {
    const data = Buffer.from(enc, 'base64')
    const d = crypto.createDecipheriv('aes-128-cbc', Buffer.from(ST.key, 'hex'), data.subarray(0, 16))
    return JSON.parse(Buffer.concat([d.update(data.subarray(16)), d.final()]).toString())
}
async function viaSavetube(video, kind, quality) {
    const cdn = (await axios.get(`${ST.base}/random-cdn`, { headers: ST.headers, timeout: 20000 })).data?.cdn
    if (!cdn) throw new Error('savetube: مفيش CDN')
    const info = await axios.post(`https://${cdn}/v2/info`, { url: video.url }, { headers: ST.headers, timeout: 30000 })
    const dec = stDecrypt(info.data.data)
    const dl = await axios.post(`https://${cdn}/download`, { id: video.id, downloadType: kind, quality: kind === 'audio' ? '128' : quality, key: dec.key }, { headers: ST.headers, timeout: 60000 })
    const url = dl.data?.data?.downloadUrl
    if (!url) throw new Error('savetube: مفيش رابط')
    return { name: 'savetube', url, mimetype: kind === 'audio' ? 'audio/mpeg' : 'video/mp4', ext: kind === 'audio' ? 'mp3' : 'mp4' }
}

// ━━━ ytdl-core (احتياطي) ━━━
async function viaYtdlCore(video, kind) {
    const mod = await import('@distube/ytdl-core')
    const ytdl = mod.default || mod
    const stream = ytdl(video.url, kind === 'audio' ? { filter: 'audioonly', quality: 'highestaudio', highWaterMark: 1 << 25 } : { quality: 'highest', filter: f => f.hasVideo && f.hasAudio, highWaterMark: 1 << 25 })
    const chunks = []; let size = 0
    for await (const c of stream) { size += c.length; if (size > LIMIT_VIDEO) throw new Error('الملف كبير'); chunks.push(c) }
    return { name: 'ytdl-core', buffer: Buffer.concat(chunks), mimetype: kind === 'audio' ? 'audio/mp4' : 'video/mp4', ext: kind === 'audio' ? 'm4a' : 'mp4' }
}

async function download(video, kind, quality) {
    const errors = []
    const chain = [['yt-dlp', () => viaYtdlp(video, kind, quality)], ['savetube', () => viaSavetube(video, kind, quality)], ['ytdl-core', () => viaYtdlCore(video, kind)]]
    for (const [name, fn] of chain) {
        try {
            const res = await fn()
            let buffer = res.buffer
            if (!buffer) {
                const r = await axios.get(res.url, { responseType: 'arraybuffer', timeout: 120000, maxContentLength: LIMIT_VIDEO, headers: { 'User-Agent': UA } })
                buffer = Buffer.from(r.data)
            }
            if (buffer.length < 20 * 1024) throw new Error('الملف صغير/غير صالح')
            const limit = kind === 'audio' ? LIMIT_AUDIO : LIMIT_VIDEO
            if (buffer.length > limit) throw new Error(`الملف كبير (${sizeStr(buffer.length)}) — جرّب دقة أقل`)
            log(`✅ ${res.name} (${sizeStr(buffer.length)})`)
            return { buffer, mimetype: res.mimetype, ext: res.ext }
        } catch (e) { errors.push(`${name}: ${String(e.message).slice(0, 120)}`); log(`❌ ${name}: ${e.message}`) }
    }
    throw new Error(errors.join('\n'))
}

const handler = async (m, { conn, args, usedPrefix = '.', command }) => {
    const say = t => conn.sendMessage(m.chat, { text: t }, { quoted: m })
    const react = async e => { try { await conn.sendMessage(m.chat, { react: { text: e, key: m.key } }) } catch {} }

    // لو حد كتب mp3/صوت قبل الاسم نتجاهلها
    let list = [...args]
    if (['mp3', 'mp4', 'صوت', 'فيديو'].includes((list[0] || '').toLowerCase())) list.shift()
    const query = list.join(' ').trim()

    if (!query) return say(`🎵 *الاستخدام:*\n*${usedPrefix + command} <اسم الأغنية أو رابط يوتيوب>*\n\nمثال: ${usedPrefix + command} mockingbird`)

    try {
        await react('🕒')
        const video = await findVideo(query)
        if (!video) { await react('✖️'); return say('❌ لم يتم العثور على نتائج.') }

        await say(`⏳ جاري تحميل الأغنية...\n🎵 ${video.title}`)
        const file = await download(video, 'audio')
        const safe = String(video.title).replace(/[\\/:*?"<>|]/g, '').slice(0, 100) || 'song'

        await conn.sendMessage(m.chat, { audio: file.buffer, mimetype: file.mimetype, fileName: `${safe}.${file.ext}` }, { quoted: m })
        await react('✅')
    } catch (e) {
        console.error('[غنيه]', e)
        await react('✖️')
        await say(`❌ فشل التنزيل:\n${String(e.message).slice(0, 600)}`)
    }
}

handler.help = ['غنيه <اسم الأغنية>']
handler.tags = ['downloader']
handler.command = /^(غنيه|اغنيه|اغنية)$/i

export default handler