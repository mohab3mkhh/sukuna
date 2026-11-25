// plugins/leagues.js
// ⛩️ SUKUNA BOT - الدوريات (لاليغا + الدوري الإنجليزي + دوري أبطال أوروبا) ⚽
// الماتشات الشغالة (الدقيقة + النتيجة + المسجلين) + ماتشات النهاردة + أقرب ماتش
// المصدر: ESPN public scoreboard API (من غير مفتاح)
// ملحوظة: الملف ده بيحل محل laliga.js — امسح laliga.js عشان الأمر ما يتكررش

const BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer'
const BASE_ALT = 'https://site.web.api.espn.com/apis/site/v2/sports/soccer'
const TZ = 'Africa/Cairo'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36'
const CACHE_MS = 30 * 1000     // ماتبعتش لـ ESPN أكتر من مرة كل 30 ثانية لكل دوري

const LEAGUES = {
    laliga: {
        slug: 'esp.1',
        title: '⚽ *الدوري الإسباني — لاليغا*',
        lookahead: 21,
        cmds: 'لاليغا|لا_ليغا|الليجا|الدوري_الاسباني|الدوري_الإسباني|laliga'
    },
    epl: {
        slug: 'eng.1',
        title: '🦁 *الدوري الإنجليزي الممتاز*',
        lookahead: 21,
        cmds: 'الدوري_الانجليزي|الدوري_الإنجليزي|الدوري_الانجليزى|بريميرليج|بريمير_ليج|epl|premierleague'
    },
    ucl: {
        slug: 'uefa.champions',
        title: '🏆 *دوري أبطال أوروبا*',
        lookahead: 45,         // الجولات بتبعد عن بعض أكتر
        cmds: 'دوري_ابطال|دوري_الابطال|دوري_ابطال_اوروبا|دوري_أبطال_أوروبا|ucl|championsleague'
    }
}

const sleep = ms => new Promise(r => setTimeout(r, ms))
const pad = n => String(n).padStart(2, '0')
const ymd = d => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`

// ━━━ أسماء الفرق بالعربي (لو الاسم مش موجود بيطلع بالإنجليزي) ━━━
const AR = [
    // إسبانيا
    ['real madrid', 'ريال مدريد'], ['barcelona', 'برشلونة'], ['atletico', 'أتلتيكو مدريد'],
    ['athletic', 'أتلتيك بيلباو'], ['real sociedad', 'ريال سوسيداد'], ['villarreal', 'فياريال'],
    ['betis', 'ريال بيتيس'], ['sevilla', 'إشبيلية'], ['valencia', 'فالنسيا'],
    ['celta', 'سيلتا فيغو'], ['girona', 'جيرونا'], ['osasuna', 'أوساسونا'],
    ['getafe', 'خيتافي'], ['rayo', 'رايو فاليكانو'], ['mallorca', 'ريال مايوركا'],
    ['alaves', 'ألافيس'], ['espanyol', 'إسبانيول'], ['las palmas', 'لاس بالماس'],
    ['leganes', 'ليغانيس'], ['valladolid', 'بلد الوليد'], ['elche', 'إلتشي'],
    ['levante', 'ليفانتي'], ['oviedo', 'ريال أوفييدو'], ['almeria', 'ألميريا'],
    ['cadiz', 'قادش'], ['granada', 'غرناطة'], ['sporting gij', 'سبورتينغ خيخون'],
    ['racing', 'راسينغ سانتاندير'], ['la coruna', 'ديبورتيفو لاكورونيا'], ['zaragoza', 'ريال سرقسطة'],
    ['malaga', 'ملقا'], ['eibar', 'إيبار'], ['huesca', 'هويسكا'],
    // إنجلترا
    ['manchester city', 'مانشستر سيتي'], ['man city', 'مانشستر سيتي'],
    ['manchester united', 'مانشستر يونايتد'], ['man united', 'مانشستر يونايتد'],
    ['liverpool', 'ليفربول'], ['arsenal', 'أرسنال'], ['chelsea', 'تشيلسي'],
    ['tottenham', 'توتنهام'], ['newcastle', 'نيوكاسل'], ['aston villa', 'أستون فيلا'],
    ['west ham', 'وست هام'], ['brighton', 'برايتون'], ['crystal palace', 'كريستال بالاس'],
    ['everton', 'إيفرتون'], ['fulham', 'فولهام'], ['brentford', 'برينتفورد'],
    ['bournemouth', 'بورنموث'], ['nottingham', 'نوتينغهام فورست'], ['wolverhampton', 'وولفرهامبتون'],
    ['wolves', 'وولفرهامبتون'], ['leeds', 'ليدز يونايتد'], ['burnley', 'بيرنلي'],
    ['sunderland', 'سندرلاند'], ['leicester', 'ليستر سيتي'], ['southampton', 'ساوثهامبتون'],
    ['ipswich', 'إيبسويتش'], ['sheffield', 'شيفيلد يونايتد'], ['luton', 'لوتون'],
    // ألمانيا
    ['bayern', 'بايرن ميونخ'], ['dortmund', 'بوروسيا دورتموند'], ['leverkusen', 'باير ليفركوزن'],
    ['leipzig', 'لايبزيغ'], ['frankfurt', 'آينتراخت فرانكفورت'], ['stuttgart', 'شتوتغارت'],
    ['wolfsburg', 'فولفسبورغ'], ['gladbach', 'بوروسيا مونشنغلادباخ'], ['freiburg', 'فرايبورغ'],
    ['union berlin', 'يونيون برلين'], ['hoffenheim', 'هوفنهايم'], ['werder', 'فيردر بريمن'],
    // إيطاليا
    ['inter milan', 'إنتر ميلان'], ['ac milan', 'ميلان'], ['milan', 'ميلان'], ['juventus', 'يوفنتوس'],
    ['napoli', 'نابولي'], ['atalanta', 'أتالانتا'], ['roma', 'روما'], ['lazio', 'لاتسيو'],
    ['fiorentina', 'فيورنتينا'], ['bologna', 'بولونيا'], ['torino', 'تورينو'], ['genoa', 'جنوى'],
    // فرنسا
    ['paris saint', 'باريس سان جيرمان'], ['psg', 'باريس سان جيرمان'], ['marseille', 'مارسيليا'],
    ['monaco', 'موناكو'], ['lille', 'ليل'], ['lyon', 'ليون'], ['brest', 'بريست'],
    ['nice', 'نيس'], ['rennes', 'رين'], ['lens', 'لانس'],
    // باقي أوروبا
    ['benfica', 'بنفيكا'], ['porto', 'بورتو'], ['sporting cp', 'سبورتينغ لشبونة'], ['braga', 'براغا'],
    ['ajax', 'أياكس'], ['psv', 'آيندهوفن'], ['feyenoord', 'فينورد'],
    ['celtic', 'سيلتيك'], ['rangers', 'رينجرز'],
    ['galatasaray', 'غلطة سراي'], ['fenerbahce', 'فنربخشة'], ['besiktas', 'بشكتاش'],
    ['club brugge', 'كلوب بروج'], ['union saint', 'يونيون سان جيلواز'], ['anderlecht', 'أندرلخت'],
    ['salzburg', 'سالزبورغ'], ['sturm', 'شتورم غراتس'], ['young boys', 'يانغ بويز'],
    ['shakhtar', 'شاختار دونيتسك'], ['dynamo kyiv', 'دينامو كييف'], ['copenhagen', 'كوبنهاغن'],
    ['bodo', 'بودو غليمت'], ['qarabag', 'قره باغ'], ['slavia', 'سلافيا براغ'], ['sparta', 'سبارتا براغ'],
    ['red star', 'النجم الأحمر'], ['dinamo zagreb', 'دينامو زغرب'], ['olympiacos', 'أولمبياكوس'],
    ['paok', 'باوك'], ['pafos', 'بافوس'], ['kairat', 'كايرات'], ['maccabi', 'مكابي تل أبيب'],
    ['sparta rotterdam', 'سبارتا روتردام']
].sort((a, b) => b[0].length - a[0].length) // الأطول الأول عشان "inter milan" تسبق "milan"

const plain = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
function ar(name) {
    const n = plain(name)
    const hit = AR.find(([k]) => n.includes(k))
    return hit ? hit[1] : name
}

// ━━━ تحويل ماتش ESPN لشكل بسيط ━━━
function parseEvent(ev) {
    const comp = ev?.competitions?.[0]
    if (!comp) return null
    const home = comp.competitors?.find(c => c.homeAway === 'home')
    const away = comp.competitors?.find(c => c.homeAway === 'away')
    if (!home || !away) return null

    const st = comp.status || ev.status || {}
    const type = st.type || {}
    const side = c => ({
        id: String(c.team?.id ?? c.id ?? ''),
        name: c.team?.displayName || c.team?.shortDisplayName || c.team?.name || '?',
        score: Number(c.score ?? 0) || 0,
        pens: c.shootoutScore != null ? Number(c.shootoutScore) : null
    })
    const goals = (comp.details || [])
        .filter(d => d.scoringPlay)
        .map(d => ({
            name: d.athletesInvolved?.[0]?.displayName || d.athletesInvolved?.[0]?.shortName || '',
            minute: d.clock?.displayValue || '',
            teamId: String(d.team?.id ?? ''),
            pen: !!d.penaltyKick,
            og: !!d.ownGoal
        }))

    const date = new Date(ev.date || comp.date)
    if (isNaN(date)) return null
    return {
        id: ev.id,
        date,
        state: type.state || 'pre',          // pre | in | post
        statusName: String(type.name || ''), // STATUS_HALFTIME ...
        detail: type.shortDetail || type.detail || '',
        clock: st.displayClock || '',
        off: /POSTPONED|CANCELED|CANCELLED|SUSPENDED|ABANDONED/i.test(String(type.name || '')),
        home: side(home),
        away: side(away),
        goals
    }
}

// ━━━ جلب الماتشات (من أمس لحد X يوم) ━━━
const caches = {}
async function fetchEvents(league) {
    const c = caches[league.slug]
    if (c?.events.length && Date.now() - c.time < CACHE_MS) return c.events

    const now = Date.now()
    const from = ymd(new Date(now - 24 * 3600 * 1000))
    const to = ymd(new Date(now + league.lookahead * 24 * 3600 * 1000))
    const main = `${BASE}/${league.slug}/scoreboard`

    // لو صيغة فشلت (حظر/400/مضيف تاني) بنكمل على اللي بعدها
    const urls = [
        `${main}?dates=${from}-${to}&limit=200`,
        `${main}?dates=${from}-${to}`,
        `${BASE_ALT}/${league.slug}/scoreboard?dates=${from}-${to}`,
        main // أضعف حل: ماتشات النهاردة بس
    ]

    let lastErr
    for (const url of urls) {
        try {
            const r = await fetch(url, {
                headers: { 'User-Agent': UA, Accept: 'application/json' },
                signal: AbortSignal.timeout(15000)
            })
            if (!r.ok) throw new Error('HTTP ' + r.status)
            const j = await r.json()
            const events = (j.events || []).map(parseEvent).filter(Boolean).sort((a, b) => a.date - b.date)
            if (!events.length && url !== main) throw new Error('رد فاضي')
            caches[league.slug] = { time: Date.now(), events }
            return events
        } catch (e) {
            lastErr = e
            console.error('[leagues] فشل', url, '→', e?.cause?.code || e?.message || e)
            await sleep(500)
        }
    }
    if (c?.events.length) return c.events // آخر نسخة محفوظة أحسن من لا شيء
    throw lastErr
}

// ━━━ تنسيق ━━━
const fmtTime = d => d.toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: TZ })
const fmtDay = d => d.toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ })
const dayKey = d => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d) // YYYY-MM-DD

function untilText(ms) {
    const m = Math.max(0, Math.floor(ms / 60000))
    const d = Math.floor(m / 1440)
    const h = Math.floor((m % 1440) / 60)
    const mi = m % 60
    const parts = []
    if (d) parts.push(`${d} يوم`)
    if (h) parts.push(`${h} ساعة`)
    if (!d && mi) parts.push(`${mi} دقيقة`)
    return parts.join(' و') || 'دلوقتي'
}

function scoreLine(e) {
    let line = `*${ar(e.home.name)}* ${e.home.score} - ${e.away.score} *${ar(e.away.name)}*`
    if (e.home.pens != null && e.away.pens != null && (e.home.pens || e.away.pens)) {
        line += ` (ركلات الترجيح ${e.home.pens}-${e.away.pens})`
    }
    return line
}
const fixtureLine = e => `*${ar(e.home.name)}* × *${ar(e.away.name)}*`

function goalLines(e) {
    return e.goals.map(g => {
        const team = g.teamId === e.home.id ? e.home : g.teamId === e.away.id ? e.away : null
        const tag = g.og ? ' (عكسي)' : g.pen ? ' (جزاء)' : ''
        return `   ⚽ ${g.name || 'هدف'} ${g.minute}${tag}${team ? ` — ${ar(team.name)}` : ''}`.trimEnd()
    })
}

function liveMinute(e) {
    if (/HALFTIME/i.test(e.statusName)) return 'استراحة بين الشوطين'
    const c = e.clock || e.detail
    return c ? `الدقيقة ${c}` : 'شغال دلوقتي'
}

function buildMessage(league, events) {
    const now = new Date()
    const today = dayKey(now)
    const out = [league.title, '']

    // 🔴 الشغالة دلوقتي
    const live = events.filter(e => e.state === 'in')
    out.push('🔴 *مباشر دلوقتي*')
    if (live.length) {
        for (const e of live) {
            out.push(scoreLine(e), `⏱️ ${liveMinute(e)}`, ...goalLines(e), '')
        }
    } else {
        out.push('مفيش ماتشات شغالة دلوقتي', '')
    }

    // 📅 ماتشات النهاردة (غير الشغالة)
    const todayOthers = events.filter(e => e.state !== 'in' && dayKey(e.date) === today)
    out.push(`📅 *ماتشات النهاردة* (${fmtDay(now)})`)
    if (todayOthers.length) {
        for (const e of todayOthers) {
            if (e.off) out.push(`⚠️ ${fixtureLine(e)} — ${e.detail || 'مؤجلة'}`)
            else if (e.state === 'post') out.push(`✅ ${scoreLine(e)}`, ...goalLines(e))
            else out.push(`🕗 ${fixtureLine(e)} — ${fmtTime(e.date)}`)
        }
    } else if (!live.some(e => dayKey(e.date) === today)) {
        out.push('مفيش ماتشات النهاردة')
    } else {
        out.push('الماتشات الشغالة فوق 👆')
    }
    out.push('')

    // ⏭️ أقرب ماتش
    const next = events.find(e => e.state === 'pre' && !e.off && e.date > now)
    out.push('⏭️ *أقرب ماتش*')
    if (next) {
        out.push(
            fixtureLine(next),
            `📆 ${fmtDay(next.date)} — 🕗 ${fmtTime(next.date)}`,
            `⏳ بعد ${untilText(next.date - now)}`
        )
    } else {
        out.push(`مفيش ماتشات متحددة في الـ ${league.lookahead} يوم الجايين`)
    }

    out.push('', '⛩️ SUKUNA BOT ⛩️')
    return out.join('\n')
}

const handler = async (m, { conn, command }) => {
    const cmd = String(command || '').toLowerCase()
    const league = Object.values(LEAGUES).find(l => new RegExp(`^(${l.cmds})$`, 'i').test(cmd)) || LEAGUES.laliga
    try {
        try { await conn.sendMessage(m.chat, { react: { text: '⚽', key: m.key } }) } catch {}
        const events = await fetchEvents(league)
        await m.reply(buildMessage(league, events))
    } catch (err) {
        console.error('[leagues]', league.slug, err?.message || err)
        await m.reply(`❌ تعذر جلب الماتشات دلوقتي، جرّب بعد شوية.\n_(${String(err?.cause?.code || err?.message || err).slice(0, 80)})_\n\n⛩️ SUKUNA BOT ⛩️`)
    }
}

handler.help = ['لاليغا', 'الدوري_الانجليزي', 'دوري_ابطال']
handler.tags = ['sports']
handler.command = new RegExp(`^(${Object.values(LEAGUES).map(l => l.cmds).join('|')})$`, 'i')

export default handler