/**
 * plugins/testfakeigpost.js
 * أمر تجريبي لإنشاء صورة بوست إنستجرام عبر /imagecreator/fakeigpost - للمطور فقط
 */

import axios from 'axios'

const ENDPOINT = 'https://prexzyapis.com/imagecreator/fakeigpost'
const DEFAULT_IMG = 'https://i.ibb.co/bjVGcHsx/adam-1795353406565.jpg'

function isValidHttpUrl(str) {
    try {
        const u = new URL(str)
        return u.protocol === 'http:' || u.protocol === 'https:'
    } catch {
        return false
    }
}

function parseInput(rawText) {
    const parts = String(rawText || '')
        .split('|')
        .map(s => s.trim())

    return {
        username: parts[0] || '',
        pp: parts[1] || '',
        media: parts[2] || ''
    }
}

let handler = async (m, { conn, text, usedPrefix, command, isROwner, isOwner }) => {
    if (!isROwner && !isOwner) {
        return conn.reply(m.chat, '❌ هذا الأمر للمطور فقط.', m)
    }

    const { username, pp: rawPp, media: rawMedia } = parseInput(text)

    if (!username) {
        return conn.reply(
            m.chat,
            [
                `📸 *طريقة الاستخدام:*`,
                `${usedPrefix + command} username | رابط_البروفايل | رابط_صورة_البوست`,
                ``,
                `💡 *مثال:*`,
                `${usedPrefix + command} Mohabhita | https://example.com/pp.jpg | https://example.com/post.jpg`
            ].join('\n'),
            m
        )
    }

    const pp = isValidHttpUrl(rawPp) ? rawPp : DEFAULT_IMG
    const media = isValidHttpUrl(rawMedia) ? rawMedia : DEFAULT_IMG

    await m.react('⏳')

    try {
        const res = await axios.get(ENDPOINT, {
            params: { username, pp, media },
            timeout: 25000,
            responseType: 'arraybuffer',
            headers: {
                'User-Agent': 'Mozilla/5.0',
                'Accept': 'image/*, application/json'
            },
            validateStatus: () => true
        })

        const buffer = Buffer.from(res.data || [])
        const contentType = String(res.headers['content-type'] || '')

        if (contentType.includes('application/json') || res.status >= 400) {
            let errMsg = `HTTP ${res.status}`
            try {
                const jsonErr = JSON.parse(buffer.toString('utf8'))
                errMsg = jsonErr?.error || jsonErr?.message || jsonErr?.note || errMsg
            } catch {}
            throw new Error(errMsg)
        }

        if (buffer.length < 500) {
            throw new Error('الصورة الناتجة فارغة أو غير صالحة')
        }

        await conn.sendMessage(
            m.chat,
            {
                image: buffer,
                mimetype: contentType.includes('png') ? 'image/png' : 'image/jpeg',
                caption: `📸 *Fake IG Post*\n👤 *Username:* ${username}`
            },
            { quoted: m }
        )

        await m.react('✅')
    } catch (err) {
        console.error('[testfakeigpost error]:', err.message)
        await m.react('❌').catch(() => {})
        return conn.reply(m.chat, `❌ فشل إنشاء البوست: ${err.message}`, m)
    }
}

handler.help = ['fakeigpost <username | pp_url | media_url>']
handler.tags = ['owner']
handler.command = /^(fakeigpost|بوست_فيك)$/i
handler.owner = true

export default handler