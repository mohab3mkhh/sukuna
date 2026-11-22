const MAX_APK_BYTES = 150 * 1024 * 1024 // حد أقصى 150MB لتجنب ضغط الـ RAM وفشل إرسال واتساب

function isStoreOrJunkUrl(url) {
    return /store|an1[-_]?store|market|play\.google|intent:|javascript:|#$/i.test(url)
}

async function findDirectApkUrl(pageUrl) {
    if (!pageUrl || !/^https?:\/\//i.test(pageUrl)) return null

    const pageRes = await axios.get(pageUrl, {
        timeout: 20000,
        maxRedirects: 5,
        headers: {
            'User-Agent': UA,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Referer': 'https://an1.com/'
        },
        validateStatus: () => true
    })

    if (pageRes.status >= 400 || !pageRes.data) return null

    const html = typeof pageRes.data === 'string' ? pageRes.data : String(pageRes.data)

    // لو الصفحة الحالية هي صفحة التحميل /file_... نبحث فيها عن رابط .apk الحقيقي
    // ولو هي صفحة اللعبة الأساسية، نجيب رابط /file_... الأول
    const isFilePage = /\/file_\d+/i.test(pageUrl)

    let targetPages = []
    if (isFilePage) {
        targetPages.push(pageUrl)
    } else {
        const fileLinks = [...html.matchAll(/href\s*=\s*["']([^"']*\/file_\d+[^"']*)["']/gi)]
            .map(m => resolveUrl(pageUrl, m[1].replace(/&amp;/g, '&')))
            .filter(Boolean)
        targetPages.push(...fileLinks.slice(0, 2), pageUrl)
    }

    for (const target of targetPages) {
        try {
            const res = target === pageUrl
                ? pageRes
                : await axios.get(target, {
                    timeout: 20000,
                    maxRedirects: 5,
                    headers: {
                        'User-Agent': UA,
                        'Referer': pageUrl
                    },
                    validateStatus: () => true
                })

            if (res.status >= 400 || !res.data) continue
            const content = typeof res.data === 'string' ? res.data : String(res.data)

            const apkMatches = (content.match(/https?:\/\/[^\s"'<>\\]+\.apk(?:\?[^\s"'<>\\]*)?/gi) || [])
                .map(u => u.replace(/\\+/g, '').replace(/&amp;/g, '&'))
                .filter(u => !isStoreOrJunkUrl(u))

            if (apkMatches.length) {
                return apkMatches[0]
            }
        } catch {}
    }

    return null
}

async function downloadApkBuffer(apkUrl, referer) {
    // فحص مبدئي للحجم عبر HEAD قبل تحميل الملف بالكامل في الذاكرة
    try {
        const head = await axios.head(apkUrl, {
            timeout: 15000,
            maxRedirects: 5,
            headers: {
                'User-Agent': UA,
                'Referer': referer || 'https://an1.com/'
            },
            validateStatus: () => true
        })

        const len = Number(head.headers['content-length'] || 0)
        if (len > MAX_APK_BYTES) {
            const mb = (len / (1024 * 1024)).toFixed(1)
            throw new Error(`حجم الملف كبير جداً (${mb} MB) — الحد المسموح للبوت 150 MB`)
        }
    } catch (e) {
        if (e.message.includes('حجم الملف كبير جداً')) throw e
    }

    const res = await axios.get(apkUrl, {
        responseType: 'arraybuffer',
        timeout: 180000,
        maxRedirects: 5,
        maxContentLength: MAX_APK_BYTES,
        maxBodyLength: MAX_APK_BYTES,
        headers: {
            'User-Agent': UA,
            'Referer': referer || 'https://an1.com/'
        },
        validateStatus: () => true
    })

    if (res.status >= 400 || !res.data) {
        throw new Error(`فشل تنزيل ملف APK (HTTP ${res.status})`)
    }

    const buf = Buffer.from(res.data)
    if (buf.length > MAX_APK_BYTES) {
        throw new Error('حجم الملف تجاوز الحد المسموح (150 MB)')
    }

    // التحقق إن الملف يبدأ بتوقيع ZIP/APK الحقيقي (PK) وليس صفحة HTML أو ملف متجر خطأ
    if (buf.length < 50000 || buf[0] !== 0x50 || buf[1] !== 0x4b) {
        throw new Error('الملف المستلم ليس حزمة APK صالحة أو محمي بصفحة تحميل')
    }

    return buf
}