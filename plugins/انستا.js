// plugins/انستا.js
// ✧ Instagram Downloader 🎬

import axios from 'axios'
import fs from 'fs'
import path from 'path'
import os from 'os'

const TMP = os.tmpdir()
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36'

const send = (conn, chat, text, quoted) =>
    conn.sendMessage(chat, { text }, { quoted })

// ════════════════════════════════════════════
// APIs
// ════════════════════════════════════════════

async function trySnapInsta(url) {
    const r = await axios.post('https://snapinsta.app/api/ajaxSearch',
        new URLSearchParams({ q: url, t: 'media', lang: 'ar' }).toString(),
        {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': UA,
                'Origin': 'https://snapinsta.app',
                'Referer': 'https://snapinsta.app/'
            },
            timeout: 20000
        }
    )

    const html = r.data?.data || ''
    if (!html) throw new Error('no data')

    const results = []

    // استخراج الفيديوهات
    const videoMatches = [...html.matchAll(/href="(https:\/\/[^"]+\.mp4[^"]*)"/g)]
    for (const m of videoMatches) {
        results.push({ type: 'video', url: m[1].replace(/&amp;/g, '&') })
    }

    // استخراج الصور
    const imgMatches = [...html.matchAll(/src="(https:\/\/[^"]+\.(jpg|jpeg|png|webp)[^"]*)"/g)]
    for (const m of imgMatches) {
        const u = m[1].replace(/&amp;/g, '&')
        if (!u.includes('logo') && !u.includes('icon')) {
            results.push({ type: 'image', url: u })
        }
    }

    if (!results.length) throw new Error('no results')
    return results
}

async function tryInstaDownloader(url) {
    const r = await axios.get(
        `https://api.instadownloader.cc/api?url=${encodeURIComponent(url)}`,
        { headers: { 'User-Agent': UA }, timeout: 20000 }
    )

    const data = r.data
    if (!data?.media?.length) throw new Error('no data')

    return data.media.map(item => ({
        type: item.type?.includes('video') ? 'video' : 'image',
        url: item.url
    }))
}

async function trySSIG(url) {
    const r = await axios.post(
        'https://ssig.pro/api/convert',
        { url },
        {
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': UA,
                'Origin': 'https://ssig.pro',
                'Referer': 'https://ssig.pro/'
            },
            timeout: 20000
        }
    )

    const data = r.data
    if (!data?.url && !data?.medias?.length) throw new Error('no data')

    if (data.medias?.length) {
        return data.medias.map(item => ({
            type: item.type?.includes('video') ? 'video' : 'image',
            url: item.url
        }))
    }

    return [{ type: data.type?.includes('video') ? 'video' : 'image', url: data.url }]
}

async function tryInflact(url) {
    const r = await axios.post(
        'https://inflact.com/downloader/instagram/post/',
        new URLSearchParams({ url }).toString(),
        {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': UA,
                'Origin': 'https://inflact.com',
                'Referer': 'https://inflact.com/downloader/instagram/post/'
            },
            timeout: 20000
        }
    )

    const data = r.data
    if (!data?.items?.length) throw new Error('no data')

    return data.items.map(item => ({
        type: item.type === 'video' ? 'video' : 'image',
        url: item.url || item.video_url || item.image_url
    }))
}

async function downloadBuffer(url) {
    const r = await axios.get(url, {
        headers: { 'User-Agent': UA, 'Accept': '*/*' },
        timeout: 90000,
        responseType: 'arraybuffer',
        maxRedirects: 10
    })
    return Buffer.from(r.data)
}

// ════════════════════════════════════════════
// Main Handler
// ════════════════════════════════════════════

async function handleDownload(m, conn, url) {
    const react = async (emoji) => {
        try { await conn.sendMessage(m.chat, { react: { text: emoji, key: m.key } }) } catch {}
    }

    await react('⏳')
    await send(conn, m.chat, '⏳ *جاري التحميل...*', m)

    let results = []
    const apis = [
        { name: 'SnapInsta', fn: () => trySnapInsta(url) },
        { name: 'InstaDownloader', fn: () => tryInstaDownloader(url) },
        { name: 'SSIG', fn: () => trySSIG(url) },
        { name: 'Inflact', fn: () => tryInflact(url) },
    ]

    for (const api of apis) {
        try {
            results = await api.fn()
            if (results.length) {
                console.log(`[Instagram] ✅ ${api.name}`)
                break
            }
        } catch (e) {
            console.error(`[Instagram] ❌ ${api.name}: ${e.message}`)
        }
    }

    if (!results.length) {
        await react('❌')
        return send(conn, m.chat, '❌ فشل تحميل الرابط\nتأكد إن المنشور مش private', m)
    }

    let sent = 0

    for (let i = 0; i < results.length; i++) {
        const item = results[i]
        if (!item.url) continue

        try {
            if (item.type === 'video') {
                const buffer = await downloadBuffer(item.url)
                if (buffer.length < 10000) continue
                const outFile = path.join(TMP, `ig_v_${Date.now()}_${i}.mp4`)
                fs.writeFileSync(outFile, buffer)
                await conn.sendMessage(m.chat, {
                    video: { url: outFile },
                    mimetype: 'video/mp4',
                    caption: `🎬 Instagram Video\n📦 ${(buffer.length / 1048576).toFixed(2)} MB`
                }, { quoted: m })
                setTimeout(() => { try { fs.unlinkSync(outFile) } catch {} }, 60000)
                sent++
            } else {
                const buffer = await downloadBuffer(item.url)
                if (buffer.length < 500) continue
                const caption = results.length > 1 ? `📷 Instagram (${i + 1}/${results.length})` : '📷 Instagram'
                await conn.sendMessage(m.chat, { image: buffer, caption }, { quoted: m })
                sent++
            }
        } catch (e) {
            console.error(`[Instagram] send error:`, e.message)
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