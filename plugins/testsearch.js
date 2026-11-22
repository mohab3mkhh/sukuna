/**
 * plugins/testsearch.js
 * أمر سيرش تجريبي لتعلم قراءة JSON من GET endpoint - للمطور فقط
 */

import axios from 'axios'

let handler = async (m, { conn, text, usedPrefix, command, isROwner, isOwner }) => {
    if (!isROwner && !isOwner) {
        return conn.reply(m.chat, '❌ هذا الأمر للمطور فقط.', m)
    }

    const query = (text || '').trim()
    if (!query) {
        return conn.reply(
            m.chat,
            `🔍 اكتب كلمة للبحث:\n*مثال:* ${usedPrefix + command} nature`,
            m
        )
    }

    const endpoint = 'https://prexzyapis.com/nsfw/xnxx-search'

    try {
        await m.react('⏳')

        const res = await axios.get(endpoint, {
            params: { query },
            timeout: 20000,
            headers: {
                'User-Agent': 'Mozilla/5.0',
                'Accept': 'application/json'
            },
            validateStatus: () => true
        })

        if (res.status >= 400) {
            throw new Error(`HTTP ${res.status}`)
        }

        const data = res.data
        const videos = Array.isArray(data?.videos) ? data.videos : []

        console.log('[testsearch] status:', data?.status, '| totalVideos:', data?.totalVideos, '| returned:', videos.length)

        if (!data?.status || !videos.length) {
            return conn.reply(m.chat, `⚠️ لم يتم العثور على نتائج لـ *${query}*.`, m)
        }

        // نأخذ أول 5 عناصر كـ مثال تعليمي
        const topList = videos.slice(0, 5).map((item, i) => {
            const title    = item.title || 'بدون عنوان'
            const uploader = item.uploader || 'غير معروف'
            const views    = item.views || 'غير محدد'
            const duration = item.duration || 'غير محدد'
            const link     = item.link || ''

            return [
                `*${i + 1}. ${title}*`,
                `👤 الناشر: ${uploader} | ⏱️ المدة: ${duration} | 👁️ المشاهدات: ${views}`,
                link ? `🔗 ${link}` : ''
            ]
                .filter(Boolean)
                .join('\n')
        })

        const replyText = [
            `🔎 *نتائج البحث عن:* ${data.query || query}`,
            `📊 *الإجمالي المتاح:* ${data.totalVideos ?? videos.length}`,
            '',
            topList.join('\n\n━━━━━━━━━━━━━━\n\n')
        ].join('\n')

        await conn.sendMessage(m.chat, { text: replyText }, { quoted: m })
        await m.react('✅')
    } catch (err) {
        console.error('[testsearch error]:', err.message)
        await m.react('❌').catch(() => {})
        return conn.reply(m.chat, `❌ حدث خطأ: ${err.message}`, m)
    }
}

handler.help = ['testsearch <كلمة>']
handler.tags = ['owner']
handler.command = /^testsearch$/i
handler.owner = true

export default handler