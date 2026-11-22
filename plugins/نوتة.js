/**
 * plugins/testfakenote.js
 * أمر تجريبي لإنشاء صورة نوتة إنستجرام عبر /imagecreator/fakeignote - للمطور فقط
 */

import axios from 'axios'

const ENDPOINT = 'https://prexzyapis.com/imagecreator/fakeignote'
const DEFAULT_AVATAR = 'https://i.ibb.co/4pDNDk1/avatar-default.png'

function parseNoteInput(rawText) {
    const parts = String(rawText || '')
        .split('|')
        .map(s => s.trim())

    const name = parts[0] || ''
    const message = parts[1] || ''
    const avatar = parts[2] || ''

    return { name, message, avatar }
}

function isValidHttpUrl(str) {
    try {
        const u = new URL(str)
        return u.protocol === 'http:' || u.protocol === 'https:'
    } catch {
        return false
    }
}

let handler = async (m, { conn, text, usedPrefix, command, isROwner, isOwner }) => {
    if (!isROwner && !isOwner) {
        return conn.reply(m.chat, '❌ هذا الأمر للمطور فقط.', m)
    }

    const { name, message, avatar: rawAvatar } = parseNoteInput(text)

    if (!name || !message) {
        return conn.reply(
            m.chat,
            [
                `📝 *طريقة الاستخدام:*`,
                `${usedPrefix + command} الاسم | الرسالة | رابط_الصورة`,
                ``,
                `💡 *مثال:*`,
                `${usedPrefix + command} Mohab | Doma | https://example.com/avatar.jpg`,
                ``,
                `ℹ️ لو نسيت رابط الصورة، هيستخدم صورة افتراضية للتجربة.`
            ].join('\n'),
            m
        )
    }

    const avatarUrl = isValidHttpUrl(rawAvatar) ? rawAvatar : DEFAULT_AVATAR

    await m.react('⏳')

    try {
        const res = await axios.get(ENDPOINT, {
            params: {
                name,
                message,
                avatar: avatarUrl
            },
            timeout: 25000,
            responseType: 'arraybuffer',
            headers: {
                'User-Agent': 'Mozilla/5.0',
                'Accept': 'image/*, application/json'
            },
            validateStatus: () => true
        })

        const buffer = Buffer.from(res.data || [])

        // لو الـ API رجّع JSON بدل صورة (مثلاً في حالة خطأ)
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
                caption: `📝 *نوتة:* ${name}\n💬 *الرسالة:* ${message}`
            },
            { quoted: m }
        )

        await m.react('✅')
    } catch (err) {
        console.error('[testfakenote error]:', err.message)
        await m.react('❌').catch(() => {})
        return conn.reply(m.chat, `❌ فشل إنشاء النوتة: ${err.message}`, m)
    }
}

handler.help = ['fakenote <الاسم | الرسالة | رابط الصورة>']
handler.tags = ['owner']
handler.command = /^(fakenote|نوتة)$/i
handler.owner = true

export default handler