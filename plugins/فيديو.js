// plugins/ytvideo.js
// ⛩️ تحميل فيديو يوتيوب (بالاسم أو الرابط)
// المصادر بالترتيب: cnv.cx → yt-dlp (بدل bk9.fun اللي وقع)

import axios from 'axios'
import { execFile } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
const MAX_MB = 60            // حد واتساب العملي للفيديو
const MAX_SECONDS = 20 * 60  // أطول فيديو مسموح

const YTDLP = fs.existsSync('/root/.nix-profile/bin/yt-dlp') ? '/root/.nix-profile/bin/yt-dlp' : 'yt-dlp'
const FFMPEG = fs.existsSync('/root/.nix-profile/bin/ffmpeg') ? '/root/.nix-profile/bin/ffmpeg' : 'ffmpeg'
const COOKIES = '/app/cookies.txt'

const CNV_HEADERS = {
    'User-Agent': UA,
    Origin: 'https://iframe.y2meta-uk.com',
    Referer: 'https://iframe.y2meta-uk.com/'
}

const sleep = ms => new Promise(r => setTimeout(r, ms))
const log = (...a) => console.log('[ytvideo]', ...a)
const errLog = (...a) => console.error('[ytvideo:ERR]', ...a.map(x => String(x?.message || x).slice(0, 240)))
const isMp4 = buf => buf && buf.length > 12 && buf.subarray(4, 8).toString('latin1') === 'ftyp'

const YT_ID_RE = /(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/|v\/))([\w-]{11})/i

/* ---------- بحث يوتيوب ---------- */
async function searchYouTube(query) {
    try {
        const mod = await import('yt-search')
        const yts = mod.default || mod
        const res = await yts(query)
        const vids = (res?.videos || []).filter(v => v.seconds > 0)
        const pick = vids.find(v => v.seconds <= MAX_SECONDS) || vids[0]
        if (pick?.videoId) return { id: pick.videoId, title: pick.title || query, seconds: pick.seconds || 0 }
    } catch (e) {
        errLog('yt-search:', e)
    }

    // احتياطي: قراءة صفحة نتائج يوتيوب مباشرة
    const r = await axios.get(
        `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
        { headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9', Cookie: 'SOCS=CAI' }, timeout: 15000 }
    )
    const match = String(r.data).match(/var ytInitialData = ({.+?});<\/script>/)
    if (!match) return null
    const data = JSON.parse(match[1])
    const sections = data.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || []
    for (const s of sections) {
        for (const item of s.itemSectionRenderer?.contents || []) {
            const v = item.videoRenderer
            if (v?.videoId) return { id: v.videoId, title: v.title?.runs?.[0]?.text || query, seconds: 0 }
        }
    }
    return null
}

// معلومات فيديو من الـ ID (لما المدخل رابط) — لو فشلت بنكمل بعنوان عام
async function videoInfo(id) {
    try {
        const mod = await import('yt-search')
        const yts = mod.default || mod
        const v = await yts({ videoId: id })
        if (v?.title) return { id, title: v.title, seconds: v.seconds || 0 }
    } catch (e) {
        errLog('videoInfo:', e)
    }
    return { id, title: 'فيديو يوتيوب', seconds: 0 }
}

/* ---------- المصدر 1: cnv.cx ---------- */
async function cnvVideo(videoId) {
    const k = await axios.get(`https://cnv.cx/v2/sanity/key?id=${videoId}`, { headers: CNV_HEADERS, timeout: 15000 })
    if (!k.data?.key) throw new Error('cnv: لا يوجد مفتاح')
    await sleep(1000)

    const params = new URLSearchParams({
        link: `https://youtu.be/${videoId}`,
        format: 'mp4',
        audioBitrate: '128',
        videoQuality: '720',
        filenameStyle: 'pretty',
        vCodec: 'h264'
    })

    const r = await axios.post('https://cnv.cx/v2/converter', params.toString(), {
        headers: {
            ...CNV_HEADERS,
            'Content-Type': 'application/x-www-form-urlencoded',
            accept: '*/*',
            key: k.data.key
        },
        timeout: 120000,
        validateStatus: () => true
    })
    if (!(r.status === 200 && r.data?.url)) throw new Error(r.data?.errorMsg || `cnv: ${r.status}`)

    let last
    for (let i = 0; i < 2; i++) {
        try {
            const d = await axios.get(r.data.url, {
                headers: { 'User-Agent': UA, Referer: 'https://cnv.cx/', Origin: 'https://cnv.cx' },
                responseType: 'arraybuffer',
                timeout: 180000,
                maxContentLength: MAX_MB * 1024 * 1024,
                maxBodyLength: MAX_MB * 1024 * 1024,
                validateStatus: () => true
            })
            const buf = d.status === 200 ? Buffer.from(d.data) : null
            if (buf && buf.length > 50 * 1024 && isMp4(buf)) return buf
            last = new Error(`cnv: ملف غير صالح (${d.status})`)
        } catch (e) {
            last = e
        }
        await sleep(1500)
    }
    throw last || new Error('cnv: فشل التحميل')
}

/* ---------- المصدر 2: yt-dlp ---------- */
function runYtDlp(args) {
    return new Promise((resolve, reject) => {
        execFile(YTDLP, args, { timeout: 180000, maxBuffer: 8 * 1024 * 1024 }, (err, _out, stderr) => {
            if (err) {
                const line = String(stderr || err.message || '').trim().split('\n').pop() || 'yt-dlp error'
                return reject(new Error(line.slice(0, 200)))
            }
            resolve()
        })
    })
}

async function ytdlpVideo(videoId) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ytv-'))
    const out = path.join(dir, `${videoId}.%(ext)s`)
    const args = [
        '-f', 'bv*[height<=720][vcodec^=avc1]+ba[ext=m4a]/b[height<=720][ext=mp4]/b[height<=720]/b',
        '--merge-output-format', 'mp4',
        '--no-playlist', '--no-warnings',
        '--max-filesize', `${MAX_MB}M`,
        '--ffmpeg-location', FFMPEG,
        '-o', out
    ]
    if (fs.existsSync(COOKIES)) args.push('--cookies', COOKIES)
    args.push(`https://www.youtube.com/watch?v=${videoId}`)

    try {
        await runYtDlp(args)
        const file = fs.readdirSync(dir).find(f => f.endsWith('.mp4'))
        if (!file) throw new Error('yt-dlp: لم ينتج ملف mp4')
        const buf = fs.readFileSync(path.join(dir, file))
        if (buf.length < 50 * 1024) throw new Error('yt-dlp: الملف صغير جداً')
        if (buf.length > MAX_MB * 1024 * 1024) throw new Error('الفيديو كبير جداً')
        return buf
    } finally {
        try { fs.rmSync(dir, { recursive: true, force: true }) } catch {}
    }
}

async function downloadVideo(videoId) {
    try {
        return await cnvVideo(videoId)
    } catch (e1) {
        errLog('cnv:', e1)
        try {
            return await ytdlpVideo(videoId)
        } catch (e2) {
            errLog('yt-dlp:', e2)
            throw new Error(`${e1?.message || 'cnv فشل'} | ${e2?.message || 'yt-dlp فشل'}`)
        }
    }
}

/* ---------- handler ---------- */
const handler = async (m, { conn, text, usedPrefix, command }) => {
    const input = (text || '').trim()
    if (!input) {
        return m.reply(`🎬 *تحميل فيديو يوتيوب*\n\nاكتب اسم الفيديو أو رابطه:\n*مثال:* ${usedPrefix + command} funk da montanha`)
    }

    const react = async emoji => {
        try { await conn.sendMessage(m.chat, { react: { text: emoji, key: m.key } }) } catch {}
    }

    try {
        await react('⏳')
        await m.reply('⏳ جارٍ البحث عن الفيديو وتحميله، انتظر لحظة...')

        const idMatch = input.match(YT_ID_RE)
        const video = idMatch ? await videoInfo(idMatch[1]) : await searchYouTube(input)
        if (!video) {
            await react('❌')
            return m.reply('❌ لم يتم العثور على أي فيديو بهذا العنوان.')
        }
        if (video.seconds && video.seconds > MAX_SECONDS) {
            await react('❌')
            return m.reply(`❌ الفيديو طويل (${Math.round(video.seconds / 60)} دقيقة)، الحد الأقصى ${MAX_SECONDS / 60} دقيقة.`)
        }

        log('تحميل:', video.id, video.title)
        const buf = await downloadVideo(video.id)

        await conn.sendMessage(
            m.chat,
            {
                video: buf,
                mimetype: 'video/mp4',
                fileName: `${video.title}.mp4`.replace(/[\\/:*?"<>|]/g, ''),
                caption: `🎬 *${video.title}*\n📥 تم تحميل الفيديو بنجاح.\n\n⛩️ SUKUNA BOT ⛩️`
            },
            { quoted: m }
        )
        await react('✅')
    } catch (err) {
        errLog(err)
        await react('❌')
        await m.reply(`❌ حدث خطأ أثناء التحميل: ${String(err?.message || err).slice(0, 200)}`)
    }
}

handler.help = ['فيديو <اسم أو رابط>']
handler.tags = ['downloader']
handler.command = ['فيديو', 'فيديو-شغل', 'تت', 'تتت']

export default handler