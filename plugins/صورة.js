// plugins/صورة.js — بحث صور من 4 منصات
// .صورة كريستيانو  ← قائمة المنصات ← تختار ← كاروسيل صور من المنصة دي
// المنصات: Pinterest ✅ مستقرة | TikTok ✅ | Instagram ⚠️ محتاجة IG_COOKIES | Facebook ⚠️ تجريبية

import axios from 'axios'
import https from 'https'
import zlib from 'zlib'
import fs from 'fs'
import path from 'path'
import * as _baileys from '@whiskeysockets/baileys'
import { sendButtons, btn } from '../lib/buttons.js'

const B = _baileys.generateWAMessageFromContent ? _baileys : (_baileys.default || _baileys)
const { proto, generateWAMessageFromContent, generateWAMessageContent } = B

const PREFIX      = 'imgs:'
const PER_BATCH   = 6          // عدد الصور في كل دفعة (كاروسيل)
const POOL_SIZE   = 40         // عدد الروابط اللي بنجمعها من المنصة
const CONCURRENCY = 3
const TTL         = 30 * 60 * 1000
const FOOTER      = '⛩️ SUKUNA BOT ⛩️'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const IG_UA = 'Instagram 275.0.0.27.98 Android (33/13; 420dpi; 1080x2400; samsung; SM-G991B; o1s; exynos2100; en_US; 458229237)'
const IG_APP_ID = '936619743392459'
const TIK_KEY = (process.env.TIKWMAPI_KEY || '34ce144ad4984df4fbbc79480a131395').trim()

// ───────────── أدوات ─────────────
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

const shuffle = (arr) => {
    const a = [...arr]
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]]
    }
    return a
}

const uniq = (arr) => [...new Set(arr.filter(Boolean))]

const cleanUrl = (u) => (typeof u === 'string' && /^https?:\/\//i.test(u.trim()) ? u.trim() : '')

// يشغّل المصادر مع بعض بمهلة لكل مصدر، ويجمع نتايجها
async function collect(sources, ms, tag, errs) {
    const settled = await Promise.all(sources.map(([name, fn]) =>
        Promise.race([
            Promise.resolve().then(fn),
            new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))
        ]).catch(e => {
            const msg = `${name}: ${String(e?.message || e).slice(0, 80)}`
            console.error(`[صورة:${tag}] ❌ ${msg}`)
            errs.push(msg)
            return []
        })
    ))
    return settled.flat()
}

const TR_CACHE = new Map()
async function translateToEn(text) {
    if (!/[\u0600-\u06FF]/.test(text)) return null
    if (TR_CACHE.has(text)) return TR_CACHE.get(text)
    let out = null
    try {
        const mod = await import('@vitalets/google-translate-api')
        const tr = mod.translate || mod.default
        const r = await Promise.race([tr(text, { to: 'en' }), sleep(8000).then(() => { throw new Error('timeout') })])
        out = String(r?.text || '').trim() || null
    } catch (e) {
        console.error('[صورة:ترجمة]', e?.message || e)
    }
    TR_CACHE.set(text, out)
    return out
}

// ───────────── Pinterest ─────────────
async function pinterestDirect(query) {
    const data = { options: { query, scope: 'pins', page_size: 50, no_fetch_context_on_resource: false }, context: {} }
    const res = await axios.get('https://www.pinterest.com/resource/BaseSearchResource/get/', {
        params: { source_url: `/search/pins/?q=${encodeURIComponent(query)}`, data: JSON.stringify(data), _: Date.now() },
        headers: {
            'User-Agent': UA,
            Accept: 'application/json, text/javascript, */*, q=0.01',
            'Accept-Language': 'en-US,en;q=0.9',
            'X-Requested-With': 'XMLHttpRequest',
            'X-Pinterest-AppState': 'active',
            'X-Pinterest-PWS-Handler': 'www/search/[scope].js'
        },
        timeout: 20000
    })
    const results = res?.data?.resource_response?.data?.results || []
    return results.map(p => cleanUrl(p?.images?.orig?.url || p?.images?.['736x']?.url)).filter(Boolean)
}

async function pinterestImages(entry, errs) {
    const sources = []
    for (const q of entry.queries) {
        sources.push(
            [`direct(${q.slice(0, 10)})`, () => pinterestDirect(q)],
            [`siputzx(${q.slice(0, 10)})`, async () => {
                const r = await axios.get(`https://api.siputzx.my.id/api/s/pinterest?query=${encodeURIComponent(q)}`, { timeout: 15000 })
                return (Array.isArray(r?.data?.data) ? r.data.data : []).map(x => cleanUrl(x?.images_url))
            }],
            [`dorratz(${q.slice(0, 10)})`, async () => {
                const r = await axios.get(`https://api.dorratz.com/v2/pinterest?q=${encodeURIComponent(q)}`, { timeout: 15000 })
                return (Array.isArray(r?.data) ? r.data : []).map(x => cleanUrl(x?.image))
            }]
        )
    }
    return shuffle(uniq(await collect(sources, 15000, 'pin', errs))).slice(0, POOL_SIZE)
}

// ───────────── TikTok ─────────────
async function tikSearch(keywords) {
    const params = new URLSearchParams({ keywords, count: 30, cursor: 0 })
    const errs = []

    if (TIK_KEY) {
        try {
            const r = await fetch(`https://api.tikwmapi.com/feed/search?${params}`, {
                headers: { 'x-tikwmapi-key': TIK_KEY, 'User-Agent': UA },
                signal: AbortSignal.timeout(20000)
            })
            if (!r.ok) throw new Error('HTTP ' + r.status)
            const j = await r.json()
            if (j?.code !== undefined && j.code !== 0) throw new Error(j?.msg || 'code ' + j.code)
            return j?.data?.videos || []
        } catch (e) { errs.push(`tikwmapi ${e?.message || e}`) }
    } else {
        errs.push('TIKWMAPI_KEY مش موجود في متغيرات السيرفر')
    }

    try {
        const r = await fetch(`https://www.tikwm.com/api/feed/search?${params}`, {
            headers: { 'User-Agent': UA },
            signal: AbortSignal.timeout(25000)
        })
        if (!r.ok) throw new Error('HTTP ' + r.status)
        const j = await r.json()
        if (j?.code !== undefined && j.code !== 0) throw new Error(j?.msg || 'failed')
        return j?.data?.videos || []
    } catch (e) { errs.push(`tikwm.com ${e?.message || e}`) }

    throw new Error(errs.join(' | '))
}

async function tiktokImages(entry, errs) {
    const sources = entry.queries.map(q => [`tiktok(${q.slice(0, 10)})`, async () => {
        const videos = await tikSearch(q)
        const photos = []   // منشورات صور (سلايدشو)
        const covers = []   // أغلفة الفيديوهات
        for (const v of videos) {
            if (Array.isArray(v?.images)) photos.push(...v.images.map(cleanUrl))
            covers.push(cleanUrl(v?.origin_cover || v?.cover || v?.ai_dynamic_cover))
        }
        return [...photos, ...covers]
    }])
    const all = uniq(await collect(sources, 25000, 'tik', errs))
    return all.slice(0, POOL_SIZE)
}

// ───────────── Instagram (بالكوكيز) ─────────────
function igCookie() {
    const raw = (process.env.IG_COOKIES || '').trim()
    if (raw.includes('sessionid=')) return raw
    const local = path.join(process.cwd(), 'ig_cookies.txt')
    const src = raw && raw.includes('\t') ? raw : (fs.existsSync(local) ? fs.readFileSync(local, 'utf8') : '')
    if (!src) return ''
    const pairs = []
    for (const line of src.split('\n')) {
        const l = line.replace(/^#HttpOnly_/, '').trim()
        if (!l || l.startsWith('#')) continue
        const p = l.split('\t')
        if (p.length >= 7 && /instagram\.com$/i.test(p[0].replace(/^\./, ''))) pairs.push(`${p[5]}=${p[6]}`)
    }
    return pairs.join('; ')
}

async function igGet(url, cookie, label) {
    try {
        return await axios.get(url, {
            headers: {
                'User-Agent': IG_UA,
                'X-IG-App-ID': IG_APP_ID,
                'X-CSRFToken': /csrftoken=([^;]+)/.exec(cookie)?.[1] || '',
                'X-Requested-With': 'XMLHttpRequest',
                Cookie: cookie,
                Accept: '*/*'
            },
            timeout: 20000
        })
    } catch (e) {
        const s = e.response?.status
        if (s === 400 || s === 401 || s === 403) throw new Error(`${label}: HTTP ${s} (الكوكيز منتهية أو الحساب متقيّد)`)
        throw new Error(`${label}: ${s ? 'HTTP ' + s : (e.code || e.message)}`)
    }
}

const igProfile = async (username, cookie) => {
    const p = await igGet(`https://i.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`, cookie, `profile(${username})`)
    const user = p.data?.data?.user
    if (!user) throw new Error(`profile(${username}): رد فاضي`)
    return user
}

function igUrlsFromProfile(user) {
    const urls = [cleanUrl(user.profile_pic_url_hd)]
    for (const edge of user.edge_owner_to_timeline_media?.edges || []) {
        const n = edge?.node
        if (!n) continue
        const children = n.edge_sidecar_to_children?.edges
        if (children?.length) children.forEach(c => urls.push(cleanUrl(c?.node?.display_url)))
        else urls.push(cleanUrl(n.display_url))
    }
    return urls
}

async function instagramImages(entry) {
    const cookie = igCookie()
    if (!cookie) throw new Error('محتاج IG_COOKIES في إعدادات السيرفر')

    const latin = entry.queries.find(q => /^[\x00-\x7F]+$/.test(q)) || entry.queries[0]
    let username = entry.igHandle || null     // .صورة @username ← حساب محدد
    let user = null
    const errs = []

    // 1) البحث عن الحساب (endpoints الموبايل — بتاعة الويب القديمة رجّعت 404)
    if (!username) {
        const q = encodeURIComponent(latin)
        const attempts = [
            ['fbsearch', `https://i.instagram.com/api/v1/fbsearch/topsearch_flat/?context=blended&query=${q}&search_surface=top_search_page&timezone_offset=7200&count=30`],
            ['users-search', `https://i.instagram.com/api/v1/users/search/?q=${q}&count=10&timezone_offset=7200`]
        ]
        for (const [label, url] of attempts) {
            try {
                const r = await igGet(url, cookie, label)
                const list = (r.data?.users || r.data?.list || []).map(x => x?.user || x).filter(u => u?.username)
                if (list.length) {
                    username = (list.find(u => u.is_verified) || list[0]).username
                    break
                }
                errs.push(`${label}: مفيش نتايج`)
            } catch (e) { errs.push(e.message) }
        }
    }

    // 2) لو البحث فشل: نخمّن اسم الحساب من الاسم (ونقبل الحسابات الموثّقة بس)
    if (!username) {
        const words = latin.toLowerCase().replace(/[^a-z0-9\s._]/g, ' ').trim().split(/\s+/).filter(Boolean)
        const cands = uniq([words.join(''), words.join('_'), words.join('.'), words[0], words[words.length - 1]]).filter(c => c && c.length >= 3).slice(0, 4)
        for (const c of cands) {
            try {
                const u = await igProfile(c, cookie)
                if (u.is_verified) { username = c; user = u; break }
            } catch (e) { errs.push(e.message) }
        }
    }
    if (!username) throw new Error('ما لقيتش حساب. جرّب: .صورة @اسم_الحساب\n' + errs.join(' | '))

    // 3) صور الحساب: web_profile_info ثم feed كاحتياطي
    const urls = []
    try {
        user = user || await igProfile(username, cookie)
        if (user.is_private && !user.followed_by_viewer) throw new Error(`حساب ${username} خاص`)
        urls.push(...igUrlsFromProfile(user))
    } catch (e) { errs.push(e.message) }

    if (uniq(urls).length < 2) {
        try {
            const f = await igGet(`https://i.instagram.com/api/v1/feed/user/${encodeURIComponent(username)}/username/?count=12`, cookie, 'feed')
            for (const it of f.data?.items || []) {
                const nodes = it.carousel_media?.length ? it.carousel_media : [it]
                for (const n of nodes) urls.push(cleanUrl(n?.image_versions2?.candidates?.[0]?.url))
            }
        } catch (e) { errs.push(e.message) }
    }

    const out = uniq(urls)
    if (!out.length) throw new Error(`حساب ${username}: ما جبتش صور — ${errs.join(' | ')}`)
    entry.igUser = username
    return out.slice(0, POOL_SIZE)
}

// ───────────── Facebook (تجريبي) ─────────────
const CHROME_CIPHERS = [
    'TLS_AES_128_GCM_SHA256', 'TLS_AES_256_GCM_SHA384', 'TLS_CHACHA20_POLY1305_SHA256',
    'ECDHE-ECDSA-AES128-GCM-SHA256', 'ECDHE-RSA-AES128-GCM-SHA256', 'ECDHE-ECDSA-AES256-GCM-SHA384',
    'ECDHE-RSA-AES256-GCM-SHA384', 'ECDHE-ECDSA-CHACHA20-POLY1305', 'ECDHE-RSA-CHACHA20-POLY1305',
    'ECDHE-RSA-AES128-SHA', 'ECDHE-RSA-AES256-SHA', 'AES128-GCM-SHA256', 'AES256-GCM-SHA384', 'AES128-SHA', 'AES256-SHA'
].join(':')

function fbRequest(url, maxRedirects = 5) {
    return new Promise((resolve, reject) => {
        const u = new URL(url)
        const req = https.request({
            hostname: u.hostname,
            path: u.pathname + u.search,
            method: 'GET',
            headers: {
                'User-Agent': UA,
                Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Upgrade-Insecure-Requests': '1'
            },
            timeout: 30000,
            ciphers: CHROME_CIPHERS,
            minVersion: 'TLSv1.2',
            maxVersion: 'TLSv1.3'
        }, async res => {
            if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && maxRedirects > 0) {
                res.resume()
                const next = res.headers.location.startsWith('http') ? res.headers.location : new URL(res.headers.location, url).href
                try { return resolve(await fbRequest(next, maxRedirects - 1)) } catch (e) { return reject(e) }
            }
            const chunks = []
            res.on('data', c => chunks.push(c))
            res.on('end', () => {
                let buf = Buffer.concat(chunks)
                try {
                    const enc = res.headers['content-encoding'] || ''
                    if (enc.includes('gzip')) buf = zlib.gunzipSync(buf)
                    else if (enc.includes('deflate')) buf = zlib.inflateSync(buf)
                    else if (enc.includes('br')) buf = zlib.brotliDecompressSync(buf)
                } catch {}
                resolve({ status: res.statusCode, text: buf.toString('utf-8') })
            })
        })
        req.on('error', reject)
        req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')) })
        req.end()
    })
}

const fbDecode = (s) => s.replace(/\\\//g, '/').replace(/\\u0025/g, '%').replace(/\\u0026/g, '&').replace(/&amp;/g, '&')

// المصغّرات الصغيرة (أقل من 480px) نتجاهلها
function fbSmall(u) {
    try {
        const m = decodeURIComponent(u).match(/stp=[^&]*?(\d{2,4})x(\d{2,4})/)
        return !!m && Math.max(Number(m[1]), Number(m[2])) < 480
    } catch { return false }
}

// صورة الغلاف بجودة عالية من صفحة الفيديو نفسها
async function fbPoster(id) {
    const r = await fbRequest(`https://www.facebook.com/watch/?v=${id}`)
    if (r.status !== 200) return null
    const og = r.text.match(/<meta property="og:image" content="([^"]+)"/)?.[1]
    const pt = r.text.match(/"preferred_thumbnail":\{"image":\{"uri":"([^"]+)"/)?.[1]
    const raw = og ? og.replace(/&amp;/g, '&') : (pt ? fbDecode(pt) : null)
    return cleanUrl(raw)
}

async function facebookImages(entry) {
    const q = entry.queries[0]
    const r = await fbRequest(`https://www.facebook.com/watch/search/?q=${encodeURIComponent(q)}`)
    if (r.status !== 200 || r.text.length < 1000) throw new Error('فيسبوك رفض البحث')

    // 1) أغلفة الفيديوهات بجودة عالية (على دفعات 5 مع بعض)
    const ids = uniq([...r.text.matchAll(/"video_id":"(\d+)"/g)].map(m => m[1])).slice(0, 20)
    const out = []
    for (let i = 0; i < ids.length && out.length < POOL_SIZE; i += 5) {
        const batch = await Promise.all(ids.slice(i, i + 5).map(id => fbPoster(id).catch(() => null)))
        out.push(...batch.filter(Boolean))
    }

    // 2) احتياطي: مصغّرات صفحة البحث (الكبيرة بس)
    if (!out.length) {
        for (const m of r.text.matchAll(/"(?:uri|src|thumbnail_uri)":"(https:\\\/\\\/[^"]+)"/g)) {
            const u = fbDecode(m[1])
            if (/(scontent|fbcdn)/.test(u) && /\.(jpe?g|png|webp)/i.test(u) && !/emoji|rsrc|static/i.test(u) && !fbSmall(u)) out.push(u)
        }
    }

    const seen = new Set()
    const result = out.filter(u => {
        const k = u.split('?')[0]
        if (seen.has(k)) return false
        seen.add(k)
        return true
    })
    if (!result.length) throw new Error('فيسبوك مش بيدّي صور بحث للزوار من غير تسجيل دخول')
    return result.slice(0, POOL_SIZE)
}

// ───────────── المنصات ─────────────
const PLATFORMS = {
    pin: { name: 'Pinterest', emoji: '📌', desc: 'صور عالية الجودة (الأفضل)', referer: 'https://www.pinterest.com/', run: pinterestImages },
    tik: { name: 'TikTok', emoji: '🎵', desc: 'صور وأغلفة فيديوهات تيك توك', referer: 'https://www.tiktok.com/', run: tiktokImages },
    ig:  { name: 'Instagram', emoji: '📸', desc: 'صور من حساب الشخصية (محتاج كوكيز)', referer: 'https://www.instagram.com/', run: instagramImages },
    fb:  { name: 'Facebook', emoji: '📘', desc: 'تجريبي، ممكن مايرجعش نتايج', referer: 'https://www.facebook.com/', run: facebookImages }
}

// ───────────── تحميل الصور وبناء الكاروسيل ─────────────
function sniffImage(buf) {
    if (buf[0] === 0xFF && buf[1] === 0xD8) return true
    if (buf[0] === 0x89 && buf.subarray(1, 4).toString() === 'PNG') return true
    if (buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') return true
    if (buf.subarray(0, 4).toString() === 'GIF8') return true
    return false
}

async function downloadImage(url, referer) {
    const res = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 30000,
        maxContentLength: 15 * 1024 * 1024,
        headers: { 'User-Agent': UA, Referer: referer, Accept: 'image/*,*/*' }
    })
    const buf = Buffer.from(res.data)
    if (buf.length < 3000) throw new Error('صورة صغيرة جدًا')
    if (!sniffImage(buf)) throw new Error('مش صورة سليمة')
    return buf
}

// pool.pos مشترك بين العمّال عشان كل صورة تتاخد مرة واحدة
async function buildCards(pool, platform, conn) {
    const items = []
    const workers = Array.from({ length: CONCURRENCY }, async () => {
        while (items.length < PER_BATCH) {
            const i = pool.pos++
            if (i >= pool.urls.length) break
            try {
                const buffer = await downloadImage(pool.urls[i], platform.referer)
                const media = await generateWAMessageContent({ image: buffer }, { upload: conn.waUploadToServer })
                if (items.length < PER_BATCH) items.push({ buffer, url: pool.urls[i], imageMessage: media.imageMessage })
            } catch (e) {
                console.error(`[صورة:${platform.name}] صورة فشلت: ${String(e?.message || e).slice(0, 80)}`)
            }
        }
    })
    await Promise.all(workers)
    return items
}

// ───────────── كاش ─────────────
const CACHE = new Map()

function putCache(query, queries, igHandle = null) {
    const now = Date.now()
    for (const [k, v] of CACHE) if (now - v.at > TTL) CACHE.delete(k)
    if (CACHE.size >= 100) CACHE.delete(CACHE.keys().next().value)
    const token = Math.random().toString(36).slice(2, 7)
    CACHE.set(token, { query, queries, igHandle, pools: {}, busy: new Set(), at: now })
    return token
}

// ───────────── القائمة ─────────────
async function sendMenu(conn, m, entry, token) {
    const rows = Object.entries(PLATFORMS).map(([key, p]) => ({
        title: `${p.emoji} ${p.name}`,
        description: p.desc,
        id: `${PREFIX}${token}:${key}`
    }))

    await sendButtons(conn, m.chat, {
        title: '🖼️ بحث الصور',
        text: `🔍 *البحث عن:* ${entry.query}\n\nاختر المنصة اللي عايز الصور منها 👇`,
        footer: FOOTER,
        buttons: [btn.list('📲 اختر المنصة', [{ title: 'المنصات', rows }])]
    }, m)
}

// ───────────── جلب وإرسال دفعة ─────────────
async function sendBatch(conn, m, entry, token, key) {
    const platform = PLATFORMS[key]
    const lockKey = key
    if (entry.busy.has(lockKey)) {
        await conn.sendMessage(m.chat, { react: { text: '⏳', key: m.key } }).catch(() => {})
        return
    }
    entry.busy.add(lockKey)

    try {
        await m.react('⏳')

        // أول مرة: نجمع الروابط من المنصة
        if (!entry.pools[key]) {
            const errs = []
            const urls = await platform.run(entry, errs)
            if (!urls?.length) {
                const detail = errs.length ? `\n\n🔧 ${errs.slice(0, 4).join('\n🔧 ')}` : ''
                throw new Error(`ما لقيتش صور على ${platform.name}${detail}`)
            }
            entry.pools[key] = { urls, pos: 0 }
        }

        const pool = entry.pools[key]
        if (pool.pos >= pool.urls.length) {
            await m.react('❌')
            await sendButtons(conn, m.chat, {
                text: `✅ خلصت كل نتايج *${platform.name}* لـ ${entry.query}`,
                footer: FOOTER,
                buttons: [btn.reply('🔀 منصة تانية', `${PREFIX}${token}:menu`)]
            }, m)
            return
        }

        const items = await buildCards(pool, platform, conn)
        if (!items.length) throw new Error('كل الصور فشل تحميلها، جرّب منصة تانية')

        const label = key === 'ig' && entry.igUser ? `@${entry.igUser}` : entry.query
        const cards = items.map((it, i) => ({
            body: proto.Message.InteractiveMessage.Body.fromObject({ text: `${platform.emoji} ${platform.name} | ${i + 1}/${items.length}` }),
            footer: proto.Message.InteractiveMessage.Footer.fromObject({ text: FOOTER }),
            header: proto.Message.InteractiveMessage.Header.fromObject({
                title: String(label).slice(0, 40),
                hasMediaAttachment: true,
                imageMessage: it.imageMessage
            }),
            nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({ buttons: [] })
        }))

        try {
            const msg = generateWAMessageFromContent(m.chat, {
                viewOnceMessage: {
                    message: {
                        messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
                        interactiveMessage: proto.Message.InteractiveMessage.fromObject({
                            body: proto.Message.InteractiveMessage.Body.create({ text: `🖼️ *${platform.name}: ${label}*\n${cards.length} صورة` }),
                            footer: proto.Message.InteractiveMessage.Footer.create({ text: FOOTER }),
                            header: proto.Message.InteractiveMessage.Header.create({ hasMediaAttachment: false }),
                            carouselMessage: proto.Message.InteractiveMessage.CarouselMessage.fromObject({ cards })
                        })
                    }
                }
            }, { quoted: m })
            await conn.relayMessage(m.chat, msg.message, { messageId: msg.key.id })
        } catch (e) {
            console.error('[صورة] الكاروسيل فشل:', e?.message || e)
            for (const it of items.slice(0, 4)) {
                await conn.sendMessage(m.chat, { image: it.buffer, caption: `${platform.emoji} ${platform.name}` }, { quoted: m })
            }
        }

        // أزرار المتابعة
        const more = pool.pos < pool.urls.length
        await sendButtons(conn, m.chat, {
            text: more ? 'عايز تكمل؟' : `✅ دي كانت آخر نتايج *${platform.name}*`,
            footer: FOOTER,
            buttons: [
                ...(more ? [btn.reply('🎲 صور تانية', `${PREFIX}${token}:${key}`)] : []),
                btn.reply('🔀 منصة تانية', `${PREFIX}${token}:menu`)
            ]
        }, m)

        await m.react('✅')
    } catch (e) {
        console.error(`[صورة:${platform.name}]`, e?.message || e)
        await m.react('❌')
        await m.reply(`❌ ${String(e?.message || e).slice(0, 500)}`)
    } finally {
        entry.busy.delete(lockKey)
    }
}

// ───────────── الأمر ─────────────
const handler = async (m, { conn, text, usedPrefix, command }) => {
    const query = String(text || '').trim()
    if (!query) {
        return m.reply(`🖼️ *بحث الصور*\n\nاكتب اسم الشخص أو الموضوع:\n• ${usedPrefix}${command} كريستيانو\n• ${usedPrefix}${command} cristiano ronaldo\n\nبعدها هتختار المنصة من القائمة.`)
    }
    if (query.length > 80) return m.reply('❌ الاسم طويل، اختصره')

    // .صورة @username ← حساب إنستجرام محدد (والمنصات التانية بتدوّر بالاسم من غير @)
    const handle = query.match(/^@([\w.]{2,30})$/)?.[1] || null
    const base = handle || query
    const en = await translateToEn(base)
    const queries = uniq([base, en])
    const token = putCache(query, queries, handle)

    try {
        await sendMenu(conn, m, CACHE.get(token), token)
    } catch (e) {
        console.error('[صورة] menu failed:', e?.message || e)
        const list = Object.values(PLATFORMS).map(p => `${p.emoji} ${p.name}`).join('\n')
        await m.reply(`❌ ما قدرتش أعرض القائمة.\n${list}`)
    }
}

// ───────────── اختيار المنصة / الأزرار ─────────────
handler.before = async function (m, { conn } = {}) {
    conn = conn || this
    if (!m || typeof m.text !== 'string' || !m.chat || m.fromMe) return false

    const t = m.text.trim()
    if (!t.startsWith(PREFIX)) return false

    const [, token, action] = t.split(':')
    const entry = CACHE.get(token)
    if (!entry || Date.now() - entry.at > TTL) {
        await conn.sendMessage(m.chat, { text: '⌛ انتهت صلاحية البحث، اكتب .صورة واسم الشخص من جديد' }, { quoted: m })
        return true
    }

    if (action === 'menu') {
        await sendMenu(conn, m, entry, token)
        return true
    }

    if (PLATFORMS[action]) {
        await sendBatch(conn, m, entry, token, action)
        return true
    }
    return true
}

handler.help = ['صورة <اسم>']
handler.tags = ['tools']
handler.command = /^(صورة|img)$/i

export default handler