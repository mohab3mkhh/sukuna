/**
 * plugins/testdl.js
 * أمر تحميل تجريبي لتعلم سحب رابط الفيديو من JSON وإرساله - للمطور فقط
 */

import axios from 'axios'
import fs from 'fs'
import path from 'path'
import os from 'os'

const DL_ENDPOINT = 'https://prexzyapis.com/nsfw/xnxx-dl'
const TMP = os.tmpdir()
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36'

async function fetchDownloadData(targetUrl) {
    const res = await axios.get(DL_ENDPOINT, {
        params: { url: targetUrl },
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
    const directUrl =
        data?.best?.url ||
        (Array.isArray(data?.qualities) && data.qualities[0]?.url) ||
        null

    if (!data?.status || !directUrl) {
        throw new Error('لم يتم العثور على رابط تحميل مباشر في الـ JSON')
    }

    return {
        title: data.title || 'فيديو',
        duration: data.duration || 'غير محدد',
        info: (data.info || '').replace(/\n+/g, ' | ').trim(),
        quality: data?.best?.quality || data?.qualities?.[0]?.quality || 'default',
        videoUrl: directUrl
    }
}

async function downloadToBuffer(videoUrl) {
    const res = await axios.get(videoUrl, {
        responseType: 'arraybuffer',
        timeout: 180000,
        maxRedirects: 5,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        headers: {
            'User-Agent': UA,
            'Referer': 'https://www.xnxx.com/'
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

    const targetUrl = (text || '').trim()
    if (!targetUrl) {
        return conn.reply(
            m.chat,
            `📥 ابعت الرابط بعد الأمر:\n*مثال:* ${usedPrefix + command} https://www.xnxx.com/video-1hyzy4ba/_`,
            m
        )
    }

    await m.react('⏳')
    const waitMsg = await m.reply('⏳ *جاري جلب بيانات التحميل...*')

    try {
        const meta = await fetchDownloadData(targetUrl)

        await conn.sendMessage(m.chat, {
            text: `⬇️ *جاري تحميل الفيديو...*\n📌 *العنوان:* ${meta.title}`,
            edit: waitMsg.key
        })

        const videoBuffer = await downloadToBuffer(meta.videoUrl)
        const tmpFile = path.join(TMP, `dl_${process.pid}_${Date.now()}.mp4`)

        fs.writeFileSync(tmpFile, videoBuffer)

        try {
            try { await conn.sendMessage(m.chat, { delete: waitMsg.key }) } catch {}

            const caption = [
                `🎬 *${meta.title}*`,
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
        console.error('[testdl error]:', err.message)
        try { await conn.sendMessage(m.chat, { delete: waitMsg.key }) } catch {}
        await m.react('❌').catch(() => {})
        return conn.reply(m.chat, `❌ حدث خطأ أثناء التحميل: ${err.message}`, m)
    }
}

handler.help = ['xnxxdl <رابط>']
handler.tags = ['owner']
handler.command = /^xnxxdl$/i
handler.owner = true

export default handler