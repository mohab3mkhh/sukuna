// plugins/انستا.js
// ✧ Instagram Downloader 🎬 (v2 — يعرض سبب الفشل الحقيقي)

import axios from 'axios'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36'

const send = (conn, chat, text, quoted) =>
    conn.sendMessage(chat, { text }, { quoted })

// ════════════════════════════════════════════
// APIs — كل واحد بيرجع JSON، والمستخرج بيدور على الروابط لوحده
// لو API مات، ضيف غيره هنا بس (سطر واحد)
// ════════════════════════════════════════════
const APIS = [
    { name: 'Siputzx', url: u => `https://api.siputzx.my.id/api/d/igdl?url=${encodeURIComponent(u)}` },
    { name: 'Vreden',  url: u => `https://api.vreden.my.id/api/igdownload?url=${encodeURIComponent(u)}` },
    { name: 'Ryzen',   url: u => `https://api.ryzendesu.vip/api/downloader/igdl?url=${encodeURIComponent(u)}` },
    { name: 'Agatz',   url: u => `https://api.agatz.xyz/api/instagram?url=${encodeURIComponent(u)}` },
]

const SKIP_KEYS = /thumb|preview|cover|avatar|profile|poster|icon|logo/i

// يدور في أي JSON على روابط الميديا (بيتجاهل الصور المصغرة)
export function extractMedia(data) {
    const found = new Map()
    const walk = (node, key = '') => {
        if (node == null) return
        if (typeof node === 'string') {
            if (/^https?:\/\//i.test(node) && !SKIP_KEYS.test(key)) {
                const clean = node.replace(/&amp;/g, '&')
                if (!found.has(clean)) found.set(clean, true)
            }
            return
        }
        if (Array.isArray(node)) return node.forEach(x => walk(x, key))
        if (typeof node === 'object') {
            for (const [k, v] of Object.entries(node)) walk(v, k)
        }
    }
    walk(data)
    return [...found.keys()]
}

async function callApi(api, url) {
    const r = await axios.get(api.url(url), {
        headers: { 'User-Agent': UA, 'Accept': 'application/json' },
        timeout: 25000
    })
    const links = extractMedia(r.data)
    if (!links.length) throw new Error('الرد مفيهوش روابط ميديا')
    return links
}

async function download(url) {
    const r = await axios.get(url, {
        headers: { 'User-Agent': UA, 'Accept': '*/*' },
        timeout: 90000,
        responseType: 'arraybuffer',
        maxRedirects: 10
    })
    return { buffer: Buffer.from(r.data), mime: String(r.headers['content-type'] || '') }
}

const shortErr = e => e.response?.status
    ? `HTTP ${e.response.status}`
    : (e.code || e.message || 'unknown').toString().slice(0, 60)

// ════════════════════════════════════════════
// Main
// ════════════════════════════════════════════
async function handleDownload(m, conn, url) {
    const react = async (emoji) => {
        try { await conn.sendMessage(m.chat, { react: { text: emoji, key: m.key } }) } catch {}
    }

    await react('⏳')

    let links = []
    const errors = []

    for (const api of APIS) {
        try {
            links = await callApi(api, url)
            console.log(`[Instagram] ✅ ${api.name} (${links.length} links)`)
            break
        } catch (e) {
            const msg = `${api.name}: ${shortErr(e)}`
            errors.push(msg)
            console.error(`[Instagram] ❌ ${msg}`)
        }
    }

    if (!links.length) {
        await react('❌')
        return send(conn, m.chat,
            `❌ فشل تحميل الرابط\n` +
            `تأكد إن المنشور مش private\n\n` +
            `🔧 *تفاصيل (للمطور):*\n${errors.map(e => `• ${e}`).join('\n')}`, m)
    }

    let sent = 0
    for (let i = 0; i < links.length; i++) {
        try {
            const { buffer, mime } = await download(links[i])
            if (buffer.length < 500) continue
            const size = (buffer.length / 1048576).toFixed(2)

            if (mime.startsWith('video/') || /\.mp4(\?|$)/i.test(links[i])) {
                await conn.sendMessage(m.chat, {
                    video: buffer,
                    mimetype: 'video/mp4',
                    caption: `🎬 Instagram Video\n📦 ${size} MB`
                }, { quoted: m })
                sent++
            } else if (mime.startsWith('image/')) {
                const caption = links.length > 1 ? `📷 Instagram (${i + 1}/${links.length})` : '📷 Instagram'
                await conn.sendMessage(m.chat, { image: buffer, caption }, { quoted: m })
                sent++
            }
        } catch (e) {
            console.error(`[Instagram] send error: ${shortErr(e)}`)
        }
    }

    if (sent === 0) {
        await react('❌')
        return send(conn, m.chat, '❌ تعذّر إرسال الملفات، حاول مرة أخرى', m)
    }
    await react('✅')
}

let handler = async (m, { conn, text, usedPrefix, command }) => {
    const input = (text || '').trim()

    if (!input) {
        return send(conn, m.chat, `📷 *Instagram Downloader*\n\nمثال:\n${usedPrefix}${command} https://www.instagram.com/p/...`, m)
    }
    if (input.includes('instagram.com')) {
        return handleDownload(m, conn, input)
    }
    return send(conn, m.chat, '❌ ابعت رابط Instagram صحيح', m)
}

handler.help = ['انستا <رابط>']
handler.tags = ['downloader']
handler.command = /^(انستا|انستجرام|instagram|ig)$/i

export default handler