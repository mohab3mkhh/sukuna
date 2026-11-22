// plugins/edit-search.js
// ⛩️ SUKUNA BOT - بحث إيديتات تيك توك (كاروسيل) 🎬
// v2: بحث أدق — ترجمة الأسماء العربي→إنجليزي، أكتر من صيغة بحث، فلترة بالصلة، وترتيب بالتفاعل

import * as _baileys from '@whiskeysockets/baileys'

const B = _baileys.generateWAMessageFromContent ? _baileys : (_baileys.default || _baileys)
const { proto, generateWAMessageFromContent, generateWAMessageContent } = B

const CARD_COUNT = 6      // عدد الكروت في الكاروسيل
const SEARCH_COUNT = 20   // عدد النتايج الأحسن اللي بنجهّز منها (احتياطي لو بعضها فشل)
const CONCURRENCY = 3
const CACHE_TTL = 30 * 60 * 1000
const CACHE = new Map()
const TR_CACHE = new Map()

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

// كلمات بتدل على "نوع المحتوى" مش على الشخصية — منستخدمهاش في تحديد الصلة
const STOP = new Set(['edit', 'edits', 'amv', 'video', 'videos', 'tiktok', 'ايديت', 'اديت', 'ايديتات', 'اديتات', 'فيديو', 'فيديوهات', 'تيك', 'توك', 'تيكتوك'])
const EDIT_WORDS = ['edit', 'amv', 'ايديت', 'اديت']

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

// ━━━ طلب واحد من revid ━━━
const mapVideo = v => ({
    id: v.id,
    desc: v.desc || 'TikTok Video',
    url: v.url,
    videoUrl: v.urlUploaded,
    duration: v.durationInSeconds || 0,
    author: v.userNickname || 'Unknown',
    likes: v.diggCount || 0,
    comments: v.commentCount || 0,
    plays: v.playCount || 0
})

async function revidSearch(keywords, filters) {
    const res = await fetch('https://www.revid.ai/api/tiktok-search', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'User-Agent': UA,
            'Referer': 'https://www.revid.ai/tiktok-video-finder',
            'Accept': 'application/json'
        },
        body: JSON.stringify({ keywords, filtersFast: filters, extraParams: { sort: '' } }),
        signal: AbortSignal.timeout(30000)
    })
    if (!res.ok) throw new Error('HTTP ' + res.status)
    const data = await res.json()
    return (data.videos || []).filter(Boolean).map(mapVideo)
}

// بيجرّب فلاتر من الأوسع للأضيق. الفلتر القديم (lang = 'en') كان بيشيل أي فيديو وصفه عربي!
async function revidSearchSmart(keywords) {
    const now = Math.floor(Date.now() / 1000)
    const twoYearsAgo = now - 2 * 365 * 24 * 60 * 60
    const oneYearAgo = now - 365 * 24 * 60 * 60
    const levels = [
        ['nbChar > 5', `createTime >= ${twoYearsAgo} AND createTime <= ${now}`],
        [],
        ['nbChar > 10', "lang = 'en'", `createTime >= ${oneYearAgo} AND createTime <= ${now}`]
    ]
    let lastErr = null
    for (const f of levels) {
        try {
            const r = await revidSearch(keywords, f)
            if (r.length) return r
        } catch (e) { lastErr = e }
    }
    if (lastErr) throw lastErr
    return []
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
        const isEdit = EDIT_WORDS.some(w => hay.includes(w)) ? 1 : 0
        const eng = Math.log10(v.plays + 1) * 20 + Math.log10(v.likes + 1) * 30
        const durPenalty = v.duration && (v.duration < 5 || v.duration > 180) ? -150 : 0
        return { v, ratio, score: ratio * 1000 + isEdit * 120 + eng + durPenalty }
    }).sort((a, b) => b.score - a.score)

    // لو فيه كفاية نتايج مطابقة فعلاً، نستبعد غير المطابقة
    const good = scored.filter(s => s.ratio >= 0.5)
    const matched = scored.filter(s => s.ratio > 0)
    const pool = good.length >= 3 ? good : matched.length >= 3 ? matched : scored
    return pool.map(s => s.v)
}

// ━━━ البحث ━━━
async function searchTikTok(name) {
    const key = norm(name)
    const cached = CACHE.get(key)
    if (cached && Date.now() - cached.time < CACHE_TTL) return cached.results

    const en = await translateToEn(name)
    const variants = [...new Set([`${name} edit`, en && `${en} edit`, en, name].filter(Boolean))].slice(0, 4)

    const settled = await Promise.allSettled(variants.map(revidSearchSmart))
    const all = settled.flatMap(s => (s.status === 'fulfilled' ? s.value : []))
    if (!all.length) {
        const failed = settled.find(s => s.status === 'rejected')
        if (failed) throw failed.reason
        return []
    }

    // إزالة التكرار
    const seen = new Set()
    const unique = all.filter(v => {
        const k = v.id || v.url
        if (!k || seen.has(k)) return false
        seen.add(k)
        return true
    })

    const groups = [tokens(name), en ? tokens(en) : []]
    const results = rank(unique, groups).slice(0, SEARCH_COUNT)
    console.log(`[edit-search] "${name}"${en ? ` (${en})` : ''}: ${all.length} نتيجة → ${unique.length} فريدة → ${results.length} بعد الترتيب`)

    CACHE.set(key, { results, time: Date.now() })
    return results
}

// ━━━ tikwm (بدون علامة مائية) — لو بيرجّع 403 بنوقفه 10 دقايق بدل ما نضيّع وقت ━━━
let lastTikwm = 0
let tikwmDisabledUntil = 0
async function tikwmGate() {
    const slot = Math.max(Date.now(), lastTikwm + 1100)
    lastTikwm = slot
    const wait = slot - Date.now()
    if (wait > 0) await sleep(wait)
}

async function getVideoNoWatermark(tiktokUrl) {
    if (Date.now() < tikwmDisabledUntil) throw new Error('tikwm موقوف مؤقتاً')
    await tikwmGate()
    const r = await fetch('https://www.tikwm.com/api/?url=' + encodeURIComponent(tiktokUrl), {
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(30000)
    })
    if (r.status === 403 || r.status === 429) {
        tikwmDisabledUntil = Date.now() + 10 * 60 * 1000
        throw new Error('HTTP ' + r.status)
    }
    if (!r.ok) throw new Error('HTTP ' + r.status)
    const j = await r.json()
    if (j.code !== 0) throw new Error(j.msg || 'Failed')
    const url = j.data.hdplay || j.data.play
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

// الأفضل: بدون علامة مائية (tikwm)، وإلا الرابط المباشر
async function getVideoBuffer(video) {
    if (Date.now() >= tikwmDisabledUntil) {
        try {
            return await downloadVideo(await getVideoNoWatermark(video.url))
        } catch (e) {
            console.log('[edit-search] tikwm فشل:', e.message)
        }
    }
    if (video.videoUrl) return await downloadVideo(video.videoUrl)
    throw new Error('مفيش مصدر')
}

// ━━━ كارت واحد ━━━
async function processItem(video, conn) {
    const buffer = await getVideoBuffer(video)
    const mediaMsg = await generateWAMessageContent(
        { video: buffer, mimetype: 'video/mp4' },
        { upload: conn.waUploadToServer }
    )
    const title = (video.desc || 'TikTok Edit').replace(/\s+/g, ' ').trim()
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
        return send(`🔍 *بحث اديتات تيك توك*\n\n${usedPrefix}${command} <اسم الشخصية>\n\n💡 مثال:\n${usedPrefix}${command} زورو\n${usedPrefix}${command} gojo\n\n⛩️ SUKUNA BOT ⛩️`)
    }

    const characterName = args.join(' ')
    await react('🔍')
    await send(`🔍 *جاري البحث عن اديتات:* ${characterName}`)

    try {
        const videos = await searchTikTok(characterName)
        if (!videos.length) throw new Error(`ما لقيت اديتات لـ ${characterName}`)

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
                            body: proto.Message.InteractiveMessage.Body.create({ text: `🎬 *اديتات: ${characterName}*\n${cards.length} فيديو` }),
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

handler.help = ['بحثتيك <اسم>']
handler.tags = ['downloader']
// ملحوظة: "ايديت" مش هنا عشان ما يتعارضش مع أمر ايديت التاني
handler.command = /^(بحثتيك|بحثتيكك|بحث_تيك|تيك|تيكتوك)$/i

export default handler