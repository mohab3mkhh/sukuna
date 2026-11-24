// plugins/edit-search.js
// ⛩️ SUKUNA BOT - بحث فيديوهات تيك توك (كاروسيل) 🎬
// v5: بحث عام عن فيديوهات (مش ايديتات بس): كلمات/اسم فيديو، @حساب، أو لينك تيك توك
//     البحث والتحميل من tikwmapi (بالمفتاح) وبديل tikwm.com

import * as _baileys from '@whiskeysockets/baileys'

const B = _baileys.generateWAMessageFromContent ? _baileys : (_baileys.default || _baileys)
const { proto, generateWAMessageFromContent, generateWAMessageContent } = B

const CARD_COUNT = 6      // عدد الكروت في الكاروسيل
const SEARCH_COUNT = 20   // عدد النتايج الأحسن اللي بنجهّز منها (احتياطي لو بعضها فشل)
const CONCURRENCY = 3
const CACHE_TTL = 30 * 60 * 1000
const CACHE = new Map()
const TR_CACHE = new Map()

const TIK_KEY = process.env.TIKWMAPI_KEY || '34ce144ad4984df4fbbc79480a131395'
const TIK_API = 'https://api.tikwmapi.com'
const TIK_GAP_MS = 300    // فاصل بسيط بين طلبات الـ API

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36'

const sleep = ms => new Promise(r => setTimeout(r, ms))
const isMp4 = buf => buf && buf.length > 12 && buf.subarray(4, 8).toString('latin1') === 'ftyp'

function formatNum(n) {
    if (!n) return '0'
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
    if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
    return n.toString()
}

// ━━━ تنظيف النص للمقارنة (عربي + إنجليزي) ━━━
const norm = s => String(s ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')       // تشكيل + تطويل
    .replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()

// كلمات عامة مش بتحدد المطلوب — منستخدمهاش في تحديد الصلة
const STOP = new Set(['video', 'videos', 'tiktok', 'فيديو', 'فيديوهات', 'تيك', 'توك', 'تيكتوك'])

function tokens(s) {
    const all = norm(s).split(' ').filter(Boolean)
    const kept = all.filter(t => !STOP.has(t))
    return kept.length ? kept : all
}

// الكلمة القصيرة (≤3 حروف لاتيني) لازم تتطابق ككلمة كاملة، عشان "ace" ماتطابقش "palace"
function has(hay, t) {
    return t.length <= 3 && /^[a-z0-9]+$/.test(t) ? (` ${hay} `).includes(` ${t} `) : hay.includes(t)
}

// ━━━ ترجمة الاسم للإنجليزي (best-effort — لو فشلت بنكمل بالاسم الأصلي) ━━━
async function translateToEn(text) {
    if (!/[\u0600-\u06FF]/.test(text)) return null
    if (TR_CACHE.has(text)) return TR_CACHE.get(text)
    let out = null
    try {
        const mod = await import('@vitalets/google-translate-api')
        const tr = mod.translate || mod.default
        const r = await Promise.race([
            tr(text, { to: 'en' }),
            sleep(8000).then(() => { throw new Error('timeout') })
        ])
        out = String(r?.text || '').trim() || null
        if (out && norm(out) === norm(text)) out = null
    } catch (e) {
        console.log('[edit-search] الترجمة فشلت:', e.message)
    }
    TR_CACHE.set(text, out)
    return out
}

// ━━━ تحويل نتيجة tikwmapi لشكل موحد ━━━
const mapVideo = (v, fallbackUser = '') => {
    const user = v.author?.unique_id || fallbackUser
    const id = v.video_id || v.id
    return {
        id,
        desc: v.title || v.desc || 'TikTok Video',
        url: user && id ? `https://www.tiktok.com/@${user}/video/${id}` : (v.share_url || v.url || ''),
        videoUrl: v.hdplay || v.play || null,   // رابط مباشر بدون علامة مائية (لو الـ API رجّعه)
        duration: v.duration || 0,
        author: v.author?.nickname || user || 'Unknown',
        likes: v.digg_count || 0,
        comments: v.comment_count || 0,
        plays: v.play_count || 0
    }
}

const usable = v => v.url || v.videoUrl

// بديل لو tikwmapi وقع (نفس الشكل، بس محدود بطلب كل ~ثانية)
let lastPublicCall = 0
async function tikwmPublic(pathname, params) {
    const slot = Math.max(Date.now(), lastPublicCall + 1200)
    lastPublicCall = slot
    const wait = slot - Date.now()
    if (wait > 0) await sleep(wait)
    const r = await fetch(`https://www.tikwm.com/api${pathname}?${new URLSearchParams(params)}`, {
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(30000)
    })
    if (!r.ok) throw new Error('tikwm.com: HTTP ' + r.status)
    const j = await r.json()
    if (j?.code !== undefined && j.code !== 0) throw new Error(j?.msg || 'tikwm.com: Failed')
    return j
}

async function apiWithFallback(pathname, params) {
    try {
        return await tikApiGet(pathname, params)
    } catch (e) {
        console.log(`[edit-search] tikwmapi ${pathname} فشل، بجرب tikwm.com:`, e.message)
        return await tikwmPublic(pathname, params)
    }
}

// بحث بالكلمات (اسم فيديو أو جزء منه)
async function searchVariant(keywords) {
    const j = await apiWithFallback('/feed/search', { keywords, count: 20, cursor: 0 })
    return (j?.data?.videos || []).filter(Boolean).map(v => mapVideo(v)).filter(usable)
}

// فيديوهات حساب معين
async function fetchUserPosts(user) {
    const j = await apiWithFallback('/user/posts', { unique_id: user, count: 30, cursor: 0 })
    return (j?.data?.videos || []).filter(Boolean).map(v => mapVideo(v, user)).filter(usable)
}

// فيديو واحد من لينك
async function fetchSingle(link) {
    const j = await apiWithFallback('/', { url: link })
    const d = j?.data
    if (!d) return []
    const v = mapVideo(d)
    if (!v.url) v.url = link
    return [v].filter(usable)
}

// ━━━ الترتيب بالصلة + التفاعل ━━━
function rank(videos, groups) {
    const scored = videos.map(v => {
        const hay = norm(`${v.desc} ${v.author}`)
        let ratio = 0
        for (const g of groups) {
            if (!g.length) continue
            ratio = Math.max(ratio, g.filter(t => has(hay, t)).length / g.length)
        }
        const eng = Math.log10(v.plays + 1) * 20 + Math.log10(v.likes + 1) * 30
        const durPenalty = 0
        return { v, ratio, score: ratio * 1000 + eng + durPenalty }
    }).sort((a, b) => b.score - a.score)

    // لو فيه كفاية نتايج مطابقة فعلاً، نستبعد غير المطابقة
    const good = scored.filter(s => s.ratio >= 0.5)
    const matched = scored.filter(s => s.ratio > 0)
    const pool = good.length >= 3 ? good : matched.length >= 3 ? matched : scored
    return pool.map(s => s.v)
}

// ━━━ البحث ━━━
// لينك فيديو → الفيديو ده | لينك/@حساب → فيديوهات الحساب | غير كده → بحث بالكلمات
function parseInput(input) {
    const link = input.match(/https?:\/\/\S*tiktok\.com\S*/i)?.[0]
    if (link) {
        const prof = link.match(/tiktok\.com\/@([\w.]+)\/?(?:\?\S*)?$/i)
        return prof ? { type: 'user', user: prof[1] } : { type: 'link', link }
    }
    const at = input.match(/^@([\w.]+)$/)
    if (at) return { type: 'user', user: at[1] }
    return { type: 'keywords' }
}

async function searchTikTok(input) {
    const key = input.trim().toLowerCase()
    const cached = CACHE.get(key)
    if (cached && Date.now() - cached.time < CACHE_TTL) return cached.results

    const parsed = parseInput(input)
    let results = []

    if (parsed.type === 'link') {
        results = await fetchSingle(parsed.link)
    } else if (parsed.type === 'user') {
        results = (await fetchUserPosts(parsed.user)).slice(0, SEARCH_COUNT)
    } else {
        const en = await translateToEn(input)
        const variants = [...new Set([input, en].filter(Boolean))]

        const settled = await Promise.allSettled(variants.map(searchVariant))
        const all = settled.flatMap(s => (s.status === 'fulfilled' ? s.value : []))

        if (all.length) {
            const seen = new Set()
            const unique = all.filter(v => {
                const k = v.id || v.url
                if (!k || seen.has(k)) return false
                seen.add(k)
                return true
            })
            const groups = [tokens(input), en ? tokens(en) : []]
            results = rank(unique, groups).slice(0, SEARCH_COUNT)
            console.log(`[edit-search] "${input}"${en ? ` (${en})` : ''}: ${all.length} نتيجة → ${unique.length} فريدة → ${results.length} بعد الترتيب`)
        } else {
            const failed = settled.find(s => s.status === 'rejected')
            // مفيش نتايج بالكلمات والاسم شكله يوزر (كلمة واحدة) → جرب كحساب
            if (/^[\w.]{2,24}$/.test(input)) {
                results = (await fetchUserPosts(input).catch(() => [])).slice(0, SEARCH_COUNT)
            }
            if (!results.length && failed) throw failed.reason
        }
    }

    if (results.length) CACHE.set(key, { results, time: Date.now() })
    return results
}

// ━━━ tikwmapi (بالمفتاح) ━━━
// لو المفتاح مرفوض (401/403) بنوقفه 10 دقايق، ولو 429 بنوقفه دقيقة
let lastTikCall = 0
let tikDisabledUntil = 0
async function tikGate() {
    const slot = Math.max(Date.now(), lastTikCall + TIK_GAP_MS)
    lastTikCall = slot
    const wait = slot - Date.now()
    if (wait > 0) await sleep(wait)
}

async function tikApiGet(pathname, params) {
    if (Date.now() < tikDisabledUntil) throw new Error('tikwmapi موقوف مؤقتاً')
    let lastErr
    for (let attempt = 0; attempt < 2; attempt++) {
        await tikGate()
        try {
            const r = await fetch(`${TIK_API}${pathname}?${new URLSearchParams(params)}`, {
                headers: { 'x-tikwmapi-key': TIK_KEY, 'User-Agent': UA },
                signal: AbortSignal.timeout(30000)
            })
            if (r.status === 401 || r.status === 403) {
                tikDisabledUntil = Date.now() + 10 * 60 * 1000
                const e = new Error('tikwmapi: HTTP ' + r.status + ' (تأكد من المفتاح)')
                e.fatal = true
                throw e
            }
            if (r.status === 429) {
                tikDisabledUntil = Date.now() + 60 * 1000
                const e = new Error('tikwmapi: HTTP 429')
                e.fatal = true
                throw e
            }
            if (r.status >= 500) {
                const body = (await r.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 150)
                lastErr = new Error(`tikwmapi: HTTP ${r.status} ${body}`.trim())
                await sleep(1200)
                continue
            }
            if (!r.ok) throw Object.assign(new Error('tikwmapi: HTTP ' + r.status), { fatal: true })
            const j = await r.json()
            if (j?.code !== undefined && j.code !== 0) throw Object.assign(new Error(j?.msg || 'tikwmapi: Failed'), { fatal: true })
            return j
        } catch (e) {
            if (e.fatal) throw e
            lastErr = e
            await sleep(1200)
        }
    }
    throw lastErr
}

async function getVideoNoWatermark(tiktokUrl) {
    const j = await tikApiGet('/', { url: tiktokUrl })
    const url = j?.data?.hdplay || j?.data?.play
    if (!url) throw new Error('No video URL')
    return url
}

async function downloadVideo(url) {
    const r = await fetch(url, {
        headers: { 'User-Agent': UA, 'Referer': 'https://www.tiktok.com/' },
        signal: AbortSignal.timeout(90000)
    })
    if (!r.ok) throw new Error('HTTP ' + r.status)
    const buf = Buffer.from(await r.arrayBuffer())
    if (buf.length < 10000) throw new Error('فيديو صغير جدًا')
    if (!isMp4(buf)) throw new Error('فيديو غير سليم')
    return buf
}

// الأول الرابط المباشر اللي رجع مع نتيجة البحث، ولو فشل نطلب رابط جديد من tikwmapi
async function getVideoBuffer(video) {
    if (video.videoUrl) {
        try {
            return await downloadVideo(video.videoUrl)
        } catch (e) {
            console.log('[edit-search] الرابط المباشر فشل:', e.message)
        }
    }
    if (video.url) return await downloadVideo(await getVideoNoWatermark(video.url))
    throw new Error('مفيش مصدر')
}

// ━━━ كارت واحد ━━━
async function processItem(video, conn) {
    const buffer = await getVideoBuffer(video)
    const mediaMsg = await generateWAMessageContent(
        { video: buffer, mimetype: 'video/mp4' },
        { upload: conn.waUploadToServer }
    )
    const title = (video.desc || 'TikTok Video').replace(/\s+/g, ' ').trim()
    return {
        buffer,
        info: video,
        card: {
            body: proto.Message.InteractiveMessage.Body.fromObject({
                text: `❤️ ${formatNum(video.likes)} | 💬 ${formatNum(video.comments)} | 👁️ ${formatNum(video.plays)}\n👤 ${video.author} | ⏱️ ${video.duration}s`
            }),
            footer: proto.Message.InteractiveMessage.Footer.fromObject({ text: '⛩️ SUKUNA BOT ⛩️' }),
            header: proto.Message.InteractiveMessage.Header.fromObject({
                title: title.slice(0, 40),
                hasMediaAttachment: true,
                videoMessage: mediaMsg.videoMessage
            }),
            nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({ buttons: [] })
        }
    }
}

// بيجهز كروت كفاية (CARD_COUNT) من قايمة النتايج، 3 مع بعض
async function buildCards(videos, conn) {
    const results = []
    let idx = 0
    const workers = Array.from({ length: CONCURRENCY }, async () => {
        while (results.length < CARD_COUNT) {
            const i = idx++
            if (i >= videos.length) break
            try {
                const item = await processItem(videos[i], conn)
                if (results.length < CARD_COUNT) results.push(item)
            } catch (e) {
                console.log(`[edit-search] كارت ${i} فشل:`, e.message)
            }
        }
    })
    await Promise.all(workers)
    return results
}

let handler = async (m, { conn, args, usedPrefix, command }) => {
    const chat = m.chat
    const send = t => conn.sendMessage(chat, { text: t })
    const react = async emoji => {
        try { await conn.sendMessage(chat, { react: { text: emoji, key: m.key } }) } catch {}
    }

    if (!args[0]) {
        await react('❌')
        return send(`🔍 *بحث فيديوهات تيك توك*\n\n${usedPrefix}${command} <اسم الفيديو أو جزء منه>\n${usedPrefix}${command} @اسم_الحساب\n${usedPrefix}${command} <لينك تيك توك>\n\n💡 مثال:\n${usedPrefix}${command} funk da montanha\n${usedPrefix}${command} @charlidamelio\n\n⛩️ SUKUNA BOT ⛩️`)
    }

    const query = args.join(' ')
    await react('🔍')
    await send(`🔍 *جاري البحث عن:* ${query}`)

    try {
        const videos = await searchTikTok(query)
        if (!videos.length) throw new Error(`ما لقيت نتائج لـ ${query}`)

        await send(`⬇️ *لقيت ${videos.length} نتيجة مناسبة، جاري تجهيز ${Math.min(CARD_COUNT, videos.length)} فيديو...*`)

        const items = await buildCards(videos, conn)
        if (!items.length) throw new Error('فشل تحميل الفيديوهات')
        const cards = items.map(i => i.card)

        try {
            const msg = generateWAMessageFromContent(chat, {
                viewOnceMessage: {
                    message: {
                        messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
                        interactiveMessage: proto.Message.InteractiveMessage.fromObject({
                            body: proto.Message.InteractiveMessage.Body.create({ text: `🎬 *نتائج: ${query}*\n${cards.length} فيديو` }),
                            footer: proto.Message.InteractiveMessage.Footer.create({ text: 'SukunaBot' }),
                            header: proto.Message.InteractiveMessage.Header.create({ hasMediaAttachment: false }),
                            carouselMessage: proto.Message.InteractiveMessage.CarouselMessage.fromObject({ cards })
                        })
                    }
                }
            }, { quoted: m })

            await conn.relayMessage(chat, msg.message, { messageId: msg.key.id })
        } catch (err) {
            // لو الكاروسيل فشل: نبعت أول 3 فيديوهات عادي
            console.error('[edit-search] الكاروسيل فشل:', err?.message)
            for (const it of items.slice(0, 3)) {
                await conn.sendMessage(chat, {
                    video: it.buffer,
                    mimetype: 'video/mp4',
                    caption: `🎬 *${it.info.desc.slice(0, 80)}*\n👤 ${it.info.author}\n\n⛩️ SUKUNA BOT ⛩️`
                })
            }
        }

        await react('✅')
    } catch (err) {
        console.error('[edit-search]', err.message)
        await react('❌')
        await send('❌ ' + err.message)
    }
}

handler.help = ['بحثتيك <اسم فيديو | @حساب | لينك>']
handler.tags = ['downloader']
handler.command = /^(بحثتيك|بحثتيكك|بحث_تيك|تيك|تيكتوك)$/i

export default handler