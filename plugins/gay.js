/**
 * plugins/gay.js
 * محتوى 18+ - للمطور فقط
 */

import axios from 'axios'
import { execFile } from 'child_process'
import { promisify } from 'util'
import fs from 'fs'
import os from 'os'
import path from 'path'

const execFileP = promisify(execFile)

async function ffmpegPath() {
    try { await execFileP('ffmpeg', ['-version'], { timeout: 8000 }); return 'ffmpeg' } catch {}
    try { const mod = await import('@ffmpeg-installer/ffmpeg'); const p = (mod.default || mod).path; if (p && fs.existsSync(p)) return p } catch {}
    try { const mod = await import('ffmpeg-static'); const p = mod.default || mod; if (p && fs.existsSync(p)) return p } catch {}
    return null
}

async function gifToMp4(gifBuffer) {
    const ff = await ffmpegPath()
    if (!ff) throw new Error('مفيش ffmpeg')
    const id  = `${process.pid}_${Date.now()}`
    const inp = path.join(os.tmpdir(), `gif_${id}.gif`)
    const out = path.join(os.tmpdir(), `gif_${id}.mp4`)
    try {
        fs.writeFileSync(inp, gifBuffer)
        await execFileP(ff, ['-y', '-i', inp, '-movflags', 'faststart', '-pix_fmt', 'yuv420p', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', out], { timeout: 60000 })
        const buf = fs.readFileSync(out)
        if (buf.length < 1000) throw new Error('ناتج التحويل فاضي')
        return buf
    } finally {
        try { fs.unlinkSync(inp) } catch {}
        try { fs.unlinkSync(out) } catch {}
    }
}

let handler = async (m, { conn, isROwner, isOwner }) => {
    if (!isROwner && !isOwner) {
        return conn.reply(m.chat, '❌ هذا الأمر للمطور فقط.', m)
    }

    const title    = "Gay"
    const emoji    = "🔞"
    const endpoint = "https://prexzyapis.com/nsfw/gay"
    const caption  = `${emoji} *${title}*\n\n> ⛩️ SUKUNA BOT • 18+`

    try {
        await m.react('⏳')

        const res = await axios.get(endpoint, {
            timeout: 20000,
            responseType: 'arraybuffer',
            headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': '*/*' },
            validateStatus: () => true
        })

        if (res.status >= 400) throw new Error(`HTTP ${res.status}`)

        const buffer = Buffer.from(res.data)
        if (buffer.length < 500) throw new Error('الملف فارغ')

        const magic  = buffer.slice(0, 4).toString('hex')
        const isGif  = magic.startsWith('47494638')
        const isMp4  = magic.startsWith('00000018') || magic.startsWith('00000020')
        const isPng  = magic.startsWith('89504e47')

        console.log('[gay] magic:', magic, '| size:', buffer.length)

        if (isGif) {
            try {
                const mp4 = await gifToMp4(buffer)
                await conn.sendMessage(m.chat, { video: mp4, mimetype: 'video/mp4', gifPlayback: true, caption }, { quoted: m })
            } catch (e) {
                console.error('[gay] gif→mp4 فشل:', e.message, '— هبعته صورة')
                await conn.sendMessage(m.chat, { image: buffer, mimetype: 'image/gif', caption }, { quoted: m })
            }
        } else if (isMp4) {
            await conn.sendMessage(m.chat, { video: buffer, mimetype: 'video/mp4', caption }, { quoted: m })
        } else {
            await conn.sendMessage(m.chat, { image: buffer, mimetype: isPng ? 'image/png' : 'image/jpeg', caption }, { quoted: m })
        }

        await m.react('✅')

    } catch (err) {
        console.error('[gay] error:', err.message)
        await m.react('❌').catch(() => {})
        return conn.reply(m.chat, `❌ حدث خطأ: ${err.message}`, m)
    }
}

handler.help    = ['gay']
handler.tags    = ['18plus']
handler.command = /^gay$/i
handler.owner   = true

export default handler