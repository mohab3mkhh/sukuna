/**
 * plugins/testdl_multi.js
 * أوامر تحميل تجريبية: .xnxxdl و .xvideosdl (للمطور فقط)
 */

import axios from 'axios'
import fs from 'fs'
import path from 'path'
import os from 'os'

const DL_SOURCES = {
    xnxxdl: {
        label: 'XNXX',
        url: 'https://prexzyapis.com/nsfw/xnxx-dl',
        paramKey: 'url',
        referer: 'https://www.xnxx.com/'
    },
    xvideosdl: {
        label: 'XVideos',
        url: 'https://prexzyapis.com/nsfw/xvideos-dl',
        paramKey: 'url',
        referer: 'https://www.xvideos.com/'
    }
}

const TMP = os.tmpdir()
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36'

// اختيار أعلى جودة متاحة من الـ JSON بأمان
function pickBestVideoUrl(data) {
    const list = Array.isArray(data?.qualities) ? data.qualities : []
    const priority = ['1080', '720', 'hd', '480', 'sd', '360']

    for (const q of priority) {
        const found = list.find(item =>
            String(item?.quality || '').toLowerCase().includes(q) && item?.url
        )
        if (found) return { quality: found.quality || q, url: found.url }
    }

    if (data?.best?.url) {
        return { quality: data.best.quality || 'best', url: data.best.url }
    }

    const firstQual = list.find(item => item?.url)
    if (firstQual) {
        return { quality: firstQual.quality || 'default', url: firstQual.url }
    }

    // احتمالات إضافية لو الـ JSON رجّع اسم حقل مختلف للرابط المباشر
    const fallbackUrl =
        data?.url ||
        data?.video ||
        data?.videoUrl ||
        data?.download ||
        data?.result?.url ||
        data?.data?.url ||
        null

    if (fallbackUrl) {
        return { quality: 'default', url: fallbackUrl }
    }

    return null
}

async function fetchDownloadMeta(sourceKey, targetUrl) {
    const src = DL_SOURCES[sourceKey]

    const res = await axios.get(src.url, {
        params: { [src.paramKey]: targetUrl },
        timeout: 25000,
        headers: {
            'User-Agent': UA,
            'Accept': 'application/json'
        },
        validateStatus: () => true
    })

    if (res.status >= 400) {
        throw new Error(`HTTP ${res.status}`)
    }

    const data = res.data
    const chosen = pickBestVideoUrl(data)

    if (!chosen?.url) {
        if (data && typeof data === 'object') {
            console.log(`[${sourceKey}] unexpected JSON keys:`, Object.keys(data))
        }
        throw new Error('لم يتم العثور على رابط تحميل مباشر في الـ JSON')
    }

    const rawInfo = data?.info || data?.uploader || data?.author || ''
    const cleanInfo = Array.isArray(rawInfo)
        ? rawInfo.join(' | ')
        : String(rawInfo).replace(/\n+/g, ' | ').trim()

    return {
        sourceLabel: src.label,
        referer: src.referer,
        title: data?.title || data?.name || `فيديو ${src.label}`,
        duration: data?.duration || 'غير محدد',
        info: cleanInfo,
        quality: chosen.quality,
        videoUrl: chosen.url
    }
}

async function downloadToBuffer(videoUrl, referer) {
    const res = await axios.get(videoUrl, {
        responseType: 'arraybuffer',
        timeout: 180000,
        maxRedirects: 5,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        headers: {
            'User-Agent': UA,
            'Referer': referer
        },
        validateStatus: () => true
    })

    if (res.status >= 400 || !res.data) {
        throw new Error(`فشل تحميل ملف الفيديو (HTTP ${res.status})`)
    }

    const buf = Buffer.from(res.data)
    if (buf.length < 5000) {
        throw new Error('ملف الفيديو صغير جداً أو غير صالح')
    }

    return buf
}

let handler = async (m, { conn, text, usedPrefix, command, isROwner, isOwner }) => {
    if (!isROwner && !isOwner) {
        return conn.reply(m.chat, '❌ هذا الأمر للمطور فقط.', m)
    }

    const cmdKey = (command || '').toLowerCase()
    const src = DL_SOURCES[cmdKey]
    if (!src) return

    const targetUrl = (text || '').trim()
    if (!targetUrl) {
        return conn.reply(
            m.chat,
            `📥 ابعت رابط ${src.label} بعد الأمر:\n*مثال:* ${usedPrefix + cmdKey} https://example.com/video`,
            m
        )
    }

    await m.react('⏳')
    const waitMsg = await m.reply(`⏳ *جاري جلب بيانات التحميل (${src.label})...*`)

    try {
        const meta = await fetchDownloadMeta(cmdKey, targetUrl)

        await conn.sendMessage(m.chat, {
            text: `⬇️ *جاري تحميل الفيديو (${meta.sourceLabel})...*\n📌 *العنوان:* ${meta.title}`,
            edit: waitMsg.key
        })

        const videoBuffer = await downloadToBuffer(meta.videoUrl, meta.referer)
        const tmpFile = path.join(TMP, `dl_${cmdKey}_${process.pid}_${Date.now()}.mp4`)

        fs.writeFileSync(tmpFile, videoBuffer)

        try {
            try { await conn.sendMessage(m.chat, { delete: waitMsg.key }) } catch {}

            const caption = [
                `🎬 *${meta.title}*`,
                `🌐 *المصدر:* ${meta.sourceLabel}`,
                `🎞️ *الجودة:* ${meta.quality}`,
                `⏱️ *المدة:* ${meta.duration}`,
                meta.info ? `ℹ️ *معلومات:* ${meta.info}` : ''
            ]
                .filter(Boolean)
                .join('\n')

            await conn.sendMessage(
                m.chat,
                {
                    video: { url: tmpFile },
                    mimetype: 'video/mp4',
                    caption
                },
                { quoted: m }
            )

            await m.react('✅')
        } finally {
            setTimeout(() => {
                try { fs.unlinkSync(tmpFile) } catch {}
            }, 120000)
        }
    } catch (err) {
        console.error(`[${cmdKey} error]:`, err.message)
        try { await conn.sendMessage(m.chat, { delete: waitMsg.key }) } catch {}
        await m.react('❌').catch(() => {})
        return conn.reply(m.chat, `❌ حدث خطأ أثناء التحميل: ${err.message}`, m)
    }
}

handler.help = ['xnxxdl <رابط>', 'xvideosdl <رابط>']
handler.tags = ['owner']
handler.command = /^(xnxxdl|xvideosdl)$/i
handler.owner = true

export default handler