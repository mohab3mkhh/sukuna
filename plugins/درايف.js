// plugins/درايف.js — تحميل ملفات Google Drive
// الاستخدام: .درايف <رابط جوجل درايف>
// الترتيب: prexzyapis ← تحميل مباشر من جوجل (احتياطي)

import axios from 'axios'

const API_URL   = 'https://prexzyapis.com/download/gdrive'
const API_PARAM = 'url'                                   // اسم باراميتر الرابط (لو الموقع بيستخدم اسم تاني غيّره هنا)
const API_KEY   = (process.env.PREXZY_API_KEY || '').trim() // اختياري
const MAX_MB    = Number(process.env.GDRIVE_MAX_MB) || 100  // أكبر حجم يتبعت جوه الواتساب
const MAX_BYTES = MAX_MB * 1024 * 1024
const UA = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36'

const MIME_BY_EXT = {
    mp4: 'video/mp4', mkv: 'video/x-matroska', webm: 'video/webm', mov: 'video/quicktime',
    mp3: 'audio/mpeg', m4a: 'audio/mp4', ogg: 'audio/ogg', wav: 'audio/wav', opus: 'audio/ogg',
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
    pdf: 'application/pdf', zip: 'application/zip', rar: 'application/vnd.rar', '7z': 'application/x-7z-compressed',
    apk: 'application/vnd.android.package-archive', txt: 'text/plain',
    doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
}

// ───────────── أدوات ─────────────
export function extractDriveId(input) {
    const s = String(input || '')
    return (
        s.match(/\/(?:file|document|spreadsheets|presentation)\/d\/([\w-]{10,})/)?.[1] ||
        s.match(/[?&]id=([\w-]{10,})/)?.[1] ||
        s.match(/\/d\/([\w-]{10,})/)?.[1] ||
        null
    )
}

const isFolder = (s) => /drive\.google\.com\/drive\/(?:u\/\d+\/)?folders\//i.test(s)

const fmtSize = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(2)} MB` : `${(b / 1024).toFixed(1)} KB`)

function fileNameFromHeaders(headers = {}) {
    const cd = String(headers['content-disposition'] || '')
    const star = cd.match(/filename\*=(?:UTF-8'')?([^;]+)/i)?.[1]
    if (star) { try { return decodeURIComponent(star.trim().replace(/^"|"$/g, '')) } catch {} }
    const plain = cd.match(/filename="?([^";]+)"?/i)?.[1]
    return plain ? plain.trim() : null
}

// يلقّط روابط التحميل واسم الملف من أي شكل JSON بيرجّعه الـ API
function parseApi(data, inputUrl) {
    if (data?.status === false || data?.success === false || data?.error) {
        throw new Error(String(data?.message || data?.error || 'الـ API رجّع خطأ').slice(0, 120))
    }
    const SKIP = /thumb|preview|icon|avatar|cover|poster|logo/i
    const found = []
    let name = null

    const walk = (node, key = '') => {
        if (node == null) return
        if (typeof node === 'string') {
            if (/^https?:\/\//i.test(node)) {
                if (!SKIP.test(key) && node !== inputUrl && !/\/(?:file\/d\/[^/]+\/)?(?:view|edit)(?:\?|$)/.test(node)) {
                    const score = (/download|dl|direct/i.test(key) ? 3 : 0) + (/link|url/i.test(key) ? 1 : 0)
                    found.push({ url: node.replace(/&amp;/g, '&'), score })
                }
            } else if (!name && /^(file_?name|name|title)$/i.test(key) && node.length < 200) {
                name = node
            }
            return
        }
        if (Array.isArray(node)) return node.forEach(x => walk(x, key))
        if (typeof node === 'object') for (const [k, v] of Object.entries(node)) walk(v, k)
    }
    walk(data)

    found.sort((a, b) => b.score - a.score)
    return { links: [...new Set(found.map(f => f.url))], name }
}

async function viaApi(url) {
    const params = { [API_PARAM]: url }
    if (API_KEY) params.apikey = API_KEY
    const r = await axios.get(API_URL, { params, timeout: 30000, headers: { 'User-Agent': UA, Accept: 'application/json' } })
    const { links, name } = parseApi(r.data, url)
    if (!links.length) throw new Error('الـ API ما رجّعش رابط تحميل: ' + JSON.stringify(r.data).slice(0, 100))
    return { links, name }
}

// تحميل مباشر من جوجل (للملفات العامة)
function directLinks(id) {
    return [
        `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`,
        `https://drive.google.com/uc?export=download&id=${id}&confirm=t`
    ]
}

async function fetchFile(url, hintName) {
    let r
    try {
        r = await axios.get(url, {
            responseType: 'arraybuffer',
            timeout: 180000,
            maxRedirects: 10,
            maxContentLength: MAX_BYTES,
            maxBodyLength: MAX_BYTES,
            headers: { 'User-Agent': UA, Accept: '*/*' }
        })
    } catch (e) {
        if (/maxContentLength|exceeded/i.test(String(e?.message))) {
            const err = new Error(`الملف أكبر من ${MAX_MB} MB`)
            err.tooBig = true
            throw err
        }
        throw e
    }

    const ctype = String(r.headers['content-type'] || '').toLowerCase()
    if (ctype.includes('text/html')) throw new Error('رجّع صفحة ويب (الملف خاص أو وصل حد التحميل)')

    const buffer = Buffer.from(r.data)
    if (buffer.length < 1) throw new Error('الملف فاضي')

    const name = fileNameFromHeaders(r.headers) || hintName || 'file'
    const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : ''
    let mime = ctype.split(';')[0].trim()
    if (!mime || mime === 'application/octet-stream') mime = MIME_BY_EXT[ext] || 'application/octet-stream'

    return { buffer, name, mime }
}

async function sendFile(conn, m, { buffer, name, mime }) {
    const caption = `📥 *Google Drive*\n📄 ${name}\n📦 ${fmtSize(buffer.length)}`
    if (mime.startsWith('video/mp4') && buffer.length <= 60 * 1048576) {
        return conn.sendMessage(m.chat, { video: buffer, mimetype: 'video/mp4', fileName: name, caption }, { quoted: m })
    }
    if (mime.startsWith('image/') && mime !== 'image/gif') {
        return conn.sendMessage(m.chat, { image: buffer, caption }, { quoted: m })
    }
    if (mime.startsWith('audio/')) {
        return conn.sendMessage(m.chat, { audio: buffer, mimetype: mime, fileName: name }, { quoted: m })
    }
    return conn.sendMessage(m.chat, { document: buffer, mimetype: mime, fileName: name, caption }, { quoted: m })
}

// ───────────── الأمر ─────────────
const handler = async (m, { conn, text, usedPrefix, command, isROwner }) => {
    const input = String(text || '').trim().split(/\s+/)[0]

    if (!input) {
        return m.reply(`╭─「 📥 *Google Drive* 」\n│\n│  اكتب الأمر مع رابط الملف:\n│  ${usedPrefix}${command} https://drive.google.com/file/d/...\n│\n│  📌 الملف لازم يكون *عام* (أي شخص معاه الرابط)\n│  📦 الحد الأقصى: ${MAX_MB} MB\n╰──────────────`)
    }
    if (!/drive\.google\.com|docs\.google\.com/i.test(input)) return m.reply('❌ ابعت رابط Google Drive صحيح')
    if (isFolder(input)) return m.reply('❌ ده رابط *مجلد*، ابعت رابط ملف واحد')

    const id = extractDriveId(input)
    if (!id) return m.reply('❌ ما قدرتش أستخرج معرّف الملف من الرابط')

    await m.react('⏳')

    const errors = []
    let hintName = null
    const candidates = []   // روابط تحميل بالترتيب

    // 1) الـ API
    try {
        const { links, name } = await viaApi(input)
        hintName = name
        candidates.push(...links)
        console.log(`[Drive] ✅ API (${links.length} رابط)`)
    } catch (e) {
        const msg = `api: ${e?.response?.status ? 'HTTP ' + e.response.status : (e?.message || e)}`
        errors.push(msg)
        console.error(`[Drive] ❌ ${msg}`)
    }

    // 2) المباشر كاحتياطي
    candidates.push(...directLinks(id))

    let file = null
    let tooBig = false
    for (const link of candidates) {
        try {
            file = await fetchFile(link, hintName)
            break
        } catch (e) {
            if (e.tooBig) tooBig = true
            const msg = `${new URL(link).host}: ${e?.response?.status ? 'HTTP ' + e.response.status : (e?.message || e)}`
            errors.push(msg)
            console.error(`[Drive] ❌ ${msg}`)
            if (tooBig) break   // لو كبير مفيش فايدة نجرّب غيره
        }
    }

    if (!file) {
        await m.react('❌')
        if (tooBig) {
            return m.reply(`❌ الملف أكبر من ${MAX_MB} MB وماينفعش يتبعت هنا.\n🔗 حمّله من الرابط مباشرة:\nhttps://drive.google.com/uc?export=download&id=${id}`)
        }
        return m.reply(`❌ فشل التحميل\n• تأكد إن الملف *عام* (أي شخص معاه الرابط)\n• أو وصل حد التحميل اليومي${isROwner ? `\n\n🛠 *تفاصيل:*\n${errors.map(e => `• ${e}`).join('\n').slice(0, 600)}` : ''}`)
    }

    try {
        await sendFile(conn, m, file)
        await m.react('✅')
    } catch (e) {
        console.error('[Drive] send error:', e?.message || e)
        await m.react('❌')
        await m.reply('❌ اتحمّل الملف بس فشل إرساله، جرّب تاني')
    }
}

handler.help = ['درايف <رابط>']
handler.tags = ['downloader']
handler.command = /^(درايف|جدرايف|gdrive|drive)$/i

export default handler