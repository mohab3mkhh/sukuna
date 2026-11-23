import axios from 'axios'
import FormData from 'form-data'

const send = (conn, chat, text) => conn.sendMessage(chat, { text })

// ═══ رفع الصورة على Catbox عشان ناخد رابط عام نبعته للـ API ═══
async function uploadToCatbox(buffer) {
    const form = new FormData()
    form.append('reqtype', 'fileupload')
    form.append('fileToUpload', buffer, { filename: 'image.jpg' })

    const res = await axios.post('https://catbox.moe/user/api.php', form, {
        headers: form.getHeaders(),
        timeout: 30000,
    })

    const url = String(res.data || '').trim()
    if (!url.startsWith('http')) throw new Error('فشل رفع الصورة على Catbox')
    return url
}

// ═══ استخراج رابط الصورة الناتجة من رد الـ API مهما كان شكله ═══
function extractImageUrl(data) {
    if (typeof data === 'string' && data.startsWith('http')) return data
    if (!data || typeof data !== 'object') return null
    return (
        data.result?.url || data.result?.image || data.result ||
        data.data?.url || data.data?.image ||
        data.url || data.image || data.image_url || data.output ||
        null
    )
}

let handler = async (m, { conn, text }) => {
    const q = m.quoted || m
    const mime = (q.msg?.mimetype || q.mimetype || '').toLowerCase()
    const isImage = /image\/(jpeg|png|webp)/.test(mime)

    if (!isImage) {
        return send(conn, m.chat,
            `❌ رد على صورة واكتب بعد الأمر الوصف اللي عايز تعدله.\nمثال:\n.عدل اجعل الخلفية بحر`
        )
    }

    if (!text) {
        return send(conn, m.chat, '❌ اكتب وصف التعديل بعد الأمر.\nمثال:\n.عدل اجعل الخلفية بحر')
    }

    await conn.sendMessage(m.chat, { react: { text: '⏳', key: m.key } }).catch(() => {})

    try {
        const buffer = await q.download()
        const imgUrl = await uploadToCatbox(buffer)

        const apiUrl = `https://prexzyapis.com/ai/imageedit?img=${encodeURIComponent(imgUrl)}&text=${encodeURIComponent(text)}`
        const res = await axios.get(apiUrl, { timeout: 60000 })

        const resultUrl = extractImageUrl(res.data)
        if (!resultUrl) {
            console.error('[عدل] رد غير متوقع من الـ API:', JSON.stringify(res.data).slice(0, 500))
            await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } }).catch(() => {})
            return send(conn, m.chat, '❌ لم يرجع الـ API صورة صالحة. حاول تاني بوصف مختلف.')
        }

        const imgRes = await axios.get(resultUrl, { responseType: 'arraybuffer', timeout: 30000 })

        await conn.sendMessage(m.chat, {
            image: Buffer.from(imgRes.data),
            caption: `✅ تم التعديل: ${text}`,
        })
        await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } }).catch(() => {})

    } catch (e) {
        console.error('[عدل] خطأ:', e.message)
        await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } }).catch(() => {})
        await send(conn, m.chat, `❌ حصل خطأ أثناء تعديل الصورة: ${e.message}`)
    }
}

handler.help = ['عدل <وصف> (رد على صورة)']
handler.tags = ['ai']
handler.command = /^عدل$/i

export default handler