// lib/videofix.js
// 🎞️ إصلاح الفيديو قبل الإرسال لواتساب (بدون إعادة ترميز — سريع وبنفس الجودة)
// بيحل: مدة الفيديو 0:00 / مفيش تقديم وتأخير (seek) / مينفعش يتحفظ
// السبب: ملفات MP4 من بعض المصادر بتكون "مقطّعة" (fragmented) أو الـ moov في آخر الملف.
// الحل: remux بـ ffmpeg (-c copy -movflags +faststart) فيتكتب header صحيح فيه المدة.
//
// الاستخدام:
//   import { fixVideo } from '../lib/videofix.js'
//   const fx = await fixVideo('/tmp/x.mp4')   // → { path, fixed }
//   // ابعت fx.path، وبعدها امسح الملفين (الأصلي والمصلّح لو fixed)

import { execFile } from 'child_process'
import { promisify } from 'util'
import fs from 'fs'

const execFileP = promisify(execFile)
let ffmpegBin   // undefined = لسه ما اتجرّبش | null = مش موجود

async function getFfmpeg() {
    if (ffmpegBin !== undefined) return ffmpegBin
    const candidates = []
    try {
        const mod = await import('@ffmpeg-installer/ffmpeg')
        candidates.push(mod.path || mod.default?.path)
    } catch {}
    candidates.push('ffmpeg')
    for (const c of candidates.filter(Boolean)) {
        try {
            await execFileP(c, ['-version'], { timeout: 15000 })
            return (ffmpegBin = c)
        } catch {}
    }
    console.log('[videofix] ffmpeg مش موجود — الفيديو هيتبعت زي ما هو')
    return (ffmpegBin = null)
}

export async function fixVideo(inPath) {
    const bin = await getFfmpeg()
    if (!bin) return { path: inPath, fixed: false, reason: 'no ffmpeg' }

    const out = inPath.replace(/\.mp4$/i, '') + '_fx.mp4'
    try {
        await execFileP(bin, [
            '-y', '-v', 'error',
            '-i', inPath,
            '-map', '0:v:0', '-map', '0:a:0?',
            '-c', 'copy',
            '-movflags', '+faststart',
            '-f', 'mp4',
            out
        ], { timeout: 120000 })
        if (fs.statSync(out).size < 1000) throw new Error('الناتج فاضي')
        return { path: out, fixed: true }
    } catch (e) {
        try { fs.unlinkSync(out) } catch {}
        console.log('[videofix] فشل الإصلاح:', String(e.message).slice(0, 150))
        return { path: inPath, fixed: false, reason: e.message }
    }
}

export default { fixVideo }