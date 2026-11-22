/**
 * plugins/testtextimg.js
 * أمر تجريبي لتحويل نص لصورة عبر /imagecreator/image - للمطور فقط
 */

import axios from 'axios'

const ENDPOINT = 'https://prexzyapis.com/imagecreator/image'

// صيغة الإدخال: النص | الخلفية (اختياري) | اللون (اختياري) | الإيموجي (اختياري)
function parseImageInput(rawText) {
    const parts = String(rawText || '')
        .split('|')
        .map(s => s.trim())

    const text = parts[0] || ''
    const background = parts[1] || ''
    const color = parts[2] || ''
    const emojiStyle = parts[3] || ''

    const params = { text }
    if (background) params.background = background
    if (color) params.color = color
    if (emojiStyle) params.emojiStyle = emojiStyle

    return { text, background, color, emojiStyle, params }
}

let handler = async (m, { conn, text, usedPrefix, command, isROwner, isOwner }) => {
    if (!isROwner && !isOwner) {
        return conn.reply(m.chat, '❌ هذا الأمر للمطور فقط.', m)
    }

    const parsed = parseImageInput(text)
    if (!parsed.text) {
        return conn.reply(
            m.chat,
            [
                `🖼️ *طريقة الاستخدام:*`,
                `${usedPrefix + command} النص | الخلفية | اللون | الإيموجي`,
                ``,
                `💡 *أمثلة:*`,
                `• ${usedPrefix + command} Hello World`,
                `• ${usedPrefix + command} Hello World | Grass | Green | 🌿`
            ].join('\n'),
            m
        )
    }

    await m.react('⏳')

    try {
        const res = await axios.get(ENDPOINT, {
            params: parsed.params,
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

        const captionParts = [
            `🖼️ *النص:* ${parsed.text}`,
            parsed.background ? `🌄 *الخلفية:* ${parsed.background}` : '',
            parsed.color ? `🎨 *اللون:* ${parsed.color}` : '',
            parsed.emojiStyle ? `✨ *الإيموجي:* ${parsed.emojiStyle}` : ''
        ].filter(Boolean)

        await conn.sendMessage(
            m.chat,
            {
                image: buffer,
                mimetype: contentType.includes('png') ? 'image/png' : 'image/jpeg',
                caption: captionParts.join('\n')
            },
            { quoted: m }
        )

        await m.react('✅')
    } catch (err) {
        console.error('[testtextimg error]:', err.message)
        await m.react('❌').catch(() => {})
        return conn.reply(m.chat, `❌ فشل إنشاء الصورة: ${err.message}`, m)
    }
}

handler.help = ['textimg <النص | الخلفية | اللون | الإيموجي>']
handler.tags = ['owner']
handler.command = /^(textimg|نص_صورة)$/i
handler.owner = true

export default handler