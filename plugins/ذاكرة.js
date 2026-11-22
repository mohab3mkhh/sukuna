// plugins/memory-guard.js
// 🧠 مراقب الذاكرة + أمر .ذاكرة (للمالك)
//   .ذاكرة          ← يعرض استهلاك الذاكرة وأكبر الكاشات
//   .ذاكرة تنظيف    ← يمسح الكاشات يدوياً
// بيكتب سطر [MEM] في لوج Railway كل دقيقة، وبينضّف الكاشات لو الذاكرة قربت تخلص،
// وبيعمل Restart نظيف قبل ما Node يقع بخطأ "heap out of memory".
// لإيقاف الـ Restart التلقائي: متغير MEM_AUTORESTART=0

import v8 from 'v8'

const MB = n => Math.round(n / 1048576)
const CACHE_NAMES = ['ytCache', 'ytSearchCache', 'ttCache', '_groupMetaCache']

function stats() {
    const m = process.memoryUsage()
    const limit = v8.getHeapStatistics().heap_size_limit
    return { rss: m.rss, heapUsed: m.heapUsed, external: m.external, arrayBuffers: m.arrayBuffers, limit, ratio: m.heapUsed / limit }
}

function clearCaches() {
    let cleared = 0
    for (const k of CACHE_NAMES) {
        const c = global[k]
        if (c && typeof c.clear === 'function') { cleared += c.size || 0; c.clear() }
    }
    try { global.gc?.() } catch {}
    return cleared
}

if (!global.__memGuard) {
    let warned = false
    global.__memGuard = setInterval(async () => {
        const s = stats()
        console.log(`[MEM] heap ${MB(s.heapUsed)}/${MB(s.limit)}MB (${Math.round(s.ratio * 100)}%) | rss ${MB(s.rss)}MB | external ${MB(s.external)}MB | بوتات فرعية ${global.conns?.length ?? 0}`)

        if (s.ratio > 0.8) {
            const n = clearCaches()
            console.log(`[MEM] ⚠️ الذاكرة عالية — مسحت ${n} عنصر من الكاشات`)
            warned = true
        }
        if (s.ratio > 0.92 && process.env.MEM_AUTORESTART !== '0') {
            console.log('[MEM] 🔴 الذاكرة هتخلص — Restart نظيف قبل الانهيار')
            try { await global.db?.write?.() } catch {}
            setTimeout(() => process.exit(1), 1500)
        } else if (s.ratio < 0.6) warned = false
    }, 60_000)
    global.__memGuard.unref?.()
}

const handler = async (m, { conn, args }) => {
    if (/^(تنظيف|clear)$/i.test(args?.[0] || '')) {
        const n = clearCaches()
        return conn.sendMessage(m.chat, { text: `🧹 تم مسح ${n} عنصر من الكاشات` }, { quoted: m })
    }

    const s = stats()
    const size = k => global[k]?.size ?? 0
    const lines = [
        '🧠 *حالة الذاكرة*',
        '',
        `📦 Heap: ${MB(s.heapUsed)} / ${MB(s.limit)} MB (${Math.round(s.ratio * 100)}%)`,
        `💾 RSS: ${MB(s.rss)} MB`,
        `📎 Buffers/External: ${MB(s.external)} MB`,
        `⏱ مدة التشغيل: ${Math.floor(process.uptime() / 60)} دقيقة`,
        '',
        `🤖 بوتات فرعية: ${global.conns?.length ?? 0}`,
        `🔌 Plugins: ${Object.keys(global.plugins || {}).length}`,
        `👥 مستخدمين في الداتا: ${Object.keys(global.db?.data?.users || {}).length}`,
        `💬 شاتات في الداتا: ${Object.keys(global.db?.data?.chats || {}).length}`,
        `🗂 شاتات في الذاكرة: ${Object.keys(conn.chats || {}).length}`,
        '',
        `🧺 الكاشات: يوتيوب ${size('ytCache')} | بحث ${size('ytSearchCache')} | تيك ${size('ttCache')} | جروبات ${size('_groupMetaCache')}`,
        '',
        '> ⛩️ SUKUNA BOT ⛩️'
    ]
    return conn.sendMessage(m.chat, { text: lines.join('\n') }, { quoted: m })
}

handler.help = ['ذاكرة']
handler.tags = ['owner']
handler.command = /^(ذاكرة|الذاكرة|mem)$/i
handler.owner = true

export default handler