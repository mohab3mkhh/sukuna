// plugins/twitter.js
// ⛩️ تحميل فيديوهات/صور تويتر (X)
// المصادر بالترتيب: fxtwitter → vxtwitter → api-dylux (اختياري، لو متسطّب)

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36'
const MAX_MB = 64

// twitter.com / x.com / mobile.twitter.com / fxtwitter.com ... كلهم بنفس الشكل
const TW_RE = /(?:^|[/.])(?:twitter|x|fxtwitter|vxtwitter|fixupx)\.com\/(?:#!\/)?(\w+)\/status(?:es)?\/(\d+)/i

async function getJson(url) {
    const r = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: 'application/json' },
        signal: AbortSignal.timeout(20000)
    })
    if (!r.ok) throw new Error('HTTP ' + r.status)
    return r.json()
}

// ━━━ المصادر ━━━
async function viaFx(user, id) {
    const j = await getJson(`https://api.fxtwitter.com/${user}/status/${id}`)
    const t = j?.tweet
    if (!t) throw new Error('fxtwitter: التغريدة مش موجودة')
    return {
        text: t.text || '',
        author: t.author?.name || user,
        videos: (t.media?.videos || []).map(v => v?.url).filter(Boolean),
        photos: (t.media?.photos || []).map(p => p?.url).filter(Boolean)
    }
}

async function viaVx(user, id) {
    const j = await getJson(`https://api.vxtwitter.com/${user}/status/${id}`)
    const ext = j?.media_extended || []
    return {
        text: j?.text || '',
        author: j?.user_name || user,
        videos: ext.filter(x => x.type === 'video' || x.type === 'gif').map(x => x.url).filter(Boolean),
        photos: ext.filter(x => x.type === 'image').map(x => x.url).filter(Boolean)
    }
}

async function viaDylux(link) {
    const mod = await import('api-dylux') // لو الحزمة مش موجودة بيفشل هنا بس، مش الأمر كله
    const fg = mod.default || mod
    const r = await fg.twitter(link)
    const url = r?.HD || r?.SD
    return { text: r?.desc || '', author: '', videos: url ? [url] : [], photos: [] }
}

async function fetchTweet(link, user, id) {
    const providers = [
        ['fxtwitter', () => viaFx(user, id)],
        ['vxtwitter', () => viaVx(user, id)],
        ['api-dylux', () => viaDylux(link)]
    ]
    const errors = []
    for (const [name, fn] of providers) {
        try {
            const r = await fn()
            if (r.videos.length || r.photos.length) return r
            errors.push(`${name}: مفيش ميديا`)
        } catch (e) {
            errors.push(`${name}: ${e?.message || e}`)
            console.error(`[twitter] ${name} فشل:`, e?.message || e)
        }
    }
    throw new Error(errors.join(' | '))
}

async function downloadBuffer(url) {
    const r = await fetch(url, {
        headers: { 'User-Agent': UA, Referer: 'https://twitter.com/' },
        signal: AbortSignal.timeout(120000)
    })
    if (!r.ok) throw new Error('HTTP ' + r.status)
    const len = Number(r.headers.get('content-length') || 0)
    if (len && len > MAX_MB * 1024 * 1024) throw new Error('الفيديو كبير جداً')
    const buf = Buffer.from(await r.arrayBuffer())
    if (buf.length < 1000) throw new Error('ملف فارغ')
    if (buf.length > MAX_MB * 1024 * 1024) throw new Error('الفيديو كبير جداً')
    return buf
}

const handler = async (m, { conn, args, usedPrefix, command }) => {
    const input = (args.join(' ') || '').trim()
    const match = input.match(TW_RE)

    if (!input) {
        return m.reply(`📌 المثال:\n*${usedPrefix + command}* https://twitter.com/fernandavasro/status/1569741835555291139`)
    }
    if (!match) {
        return m.reply('🧚🏼‍♂️ تأكد من أن الرابط من تويتر (رابط تغريدة فيها فيديو أو صورة)')
    }

    const [, user, id] = match
    const link = `https://twitter.com/${user}/status/${id}`
    const react = async emoji => {
        try { await conn.sendMessage(m.chat, { react: { text: emoji, key: m.key } }) } catch {}
    }

    try {
        await react('⏳')
        const t = await fetchTweet(link, user, id)

        const desc = (t.text || '').replace(/\s+/g, ' ').trim().slice(0, 500)
        const caption =
            `┌─⊷ *『 تويتر 』*\n` +
            (t.author ? `▢ الحساب: ${t.author}\n` : '') +
            `▢ الوصف: ${desc || '—'}\n` +
            `└───────────`

        if (t.videos.length) {
            const buf = await downloadBuffer(t.videos[0])
            await conn.sendMessage(
                m.chat,
                { video: buf, mimetype: 'video/mp4', fileName: 'twitter.mp4', caption },
                { quoted: m }
            )
        } else {
            for (const [i, url] of t.photos.slice(0, 4).entries()) {
                await conn.sendMessage(
                    m.chat,
                    { image: { url }, caption: i === 0 ? caption : '' },
                    { quoted: m }
                )
            }
        }
        await react('✅')
    } catch (e) {
        console.error('[twitter]', e?.message || e)
        await react('❌')
        await m.reply(`🧚🏼‍♂️ تعذر التحميل، تأكد إن الرابط لتغريدة فيها فيديو أو صورة وإنها مش خاصة.\n_(${String(e?.message || e).slice(0, 120)})_`)
    }
}

handler.help = ['twitter'].map(v => v + ' <url>')
handler.tags = ['downloader']
handler.command = /^(twitter|tw|تويتر)$/i
handler.diamond = true

export default handler