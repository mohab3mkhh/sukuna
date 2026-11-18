/**
 * plugins/tts.js - نص لصوت عن طريق @Amazing_VoiceBot
 *
 * إصلاح خلل الفويس:
 *  - كان بيبعت أي ملف كأنه "audio/ogg; codecs=opus" حتى لو مش كده (mp3/m4a) ← الصوت بيطلع مشوّه.
 *  - دلوقتي بيقرأ النوع الحقيقي للملف، ولو مش ogg/opus بيحوّله بـ ffmpeg (لو موجود)،
 *    ولو مفيش ffmpeg بيبعته كملف صوت عادي بنوعه الصحيح بدل فويس بايظ.
 *  - بيمسك الرد بالـ id (رسالة جديدة بعد رسالتك) من غير event handlers، ومش بيلقط رسايل قديمة.
 */

import { TelegramClient } from 'telegram'
import { StringSession } from 'telegram/sessions/index.js'
import { spawn, spawnSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'

const BOT = 'Amazing_VoiceBot'
const TIMEOUT = 60000
const sleep = ms => new Promise(r => setTimeout(r, ms))

/* ── كلاينت تليجرام (مشترك مع باقي الأوامر لو موجود) ── */
async function getClient() {
    const id = parseInt(process.env.TG_API_ID)
    const hash = process.env.TG_API_HASH
    if (!id || !hash || !process.env.TG_SESSION) throw new Error('متغيرات TG_API_ID / TG_API_HASH / TG_SESSION ناقصة')
    if (global._drawTgClient?.connected) return global._drawTgClient
    if (global._ttsTgClient?.connected) return global._ttsTgClient
    const c = new TelegramClient(new StringSession(process.env.TG_SESSION), id, hash, { connectionRetries: 5 })
    await c.connect()
    global._ttsTgClient = c
    return c
}

/* ── ffmpeg (اختياري) ── */
let _ff
async function findFfmpeg() {
    if (_ff !== undefined) return _ff
    try {
        const p = (await import('ffmpeg-static')).default
        if (p && fs.existsSync(p)) return (_ff = p)
    } catch {}
    try {
        if (spawnSync('ffmpeg', ['-version']).status === 0) return (_ff = 'ffmpeg')
    } catch {}
    return (_ff = null)
}

async function toOpus(buf, ff) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tts-'))
    const inp = path.join(dir, 'in'), out = path.join(dir, 'out.ogg')
    fs.writeFileSync(inp, buf)
    try {
        await new Promise((res, rej) => {
            const p = spawn(ff, ['-y', '-i', inp, '-vn', '-c:a', 'libopus', '-b:a', '48k', '-ar', '48000', '-ac', '1', '-f', 'ogg', out], { stdio: 'ignore' })
            p.on('error', rej)
            p.on('close', c => (c === 0 ? res() : rej(new Error('ffmpeg code ' + c))))
        })
        return fs.readFileSync(out)
    } finally {
        fs.rmSync(dir, { recursive: true, force: true })
    }
}

/* ── التعرف على نوع الملف من البايتات (أدق من اللي تليجرام بيقوله) ── */
function sniff(buf) {
    const h = buf.subarray(0, 12)
    const s = h.toString('latin1')
    if (s.startsWith('OggS')) {
        const isOpus = buf.subarray(0, 200).includes(Buffer.from('OpusHead'))
        return { kind: 'ogg', opus: isOpus, mime: isOpus ? 'audio/ogg; codecs=opus' : 'audio/ogg' }
    }
    if (s.startsWith('ID3') || (h[0] === 0xff && (h[1] & 0xe0) === 0xe0)) return { kind: 'mp3', mime: 'audio/mpeg' }
    if (s.slice(4, 8) === 'ftyp') return { kind: 'm4a', mime: 'audio/mp4' }
    if (s.startsWith('RIFF')) return { kind: 'wav', mime: 'audio/wav' }
    return { kind: 'unknown', mime: 'audio/mpeg' }
}

const isAudioMsg = m =>
    !!(m.voice || m.audio || String(m.document?.mimeType || '').startsWith('audio/') || m.document?.mimeType === 'application/ogg')

/* ── استنى رد البوت (رسالة جديدة بعد رسالتك) ── */
async function askBot(client, text) {
    const sent = await client.sendMessage(BOT, { message: text })
    const afterId = sent?.id ?? 0
    const isNew = m => !m.out && m.id > afterId

    const t0 = Date.now()
    let found = null
    while (Date.now() - t0 < TIMEOUT) {
        const msgs = await client.getMessages(BOT, { limit: 15 })
        const aud = msgs.filter(m => isNew(m) && isAudioMsg(m))
        if (aud.length) {
            // نستنى ثانيتين لو البوت لسه بيبعت أكتر من ملف، وبعدين نختار
            await sleep(2000)
            const again = (await client.getMessages(BOT, { limit: 15 })).filter(m => isNew(m) && isAudioMsg(m))
            found = again.length ? again : aud
            break
        }
        await sleep(1500)
    }
    if (!found) {
        const msgs = await client.getMessages(BOT, { limit: 15 })
        const txt = msgs.filter(m => isNew(m) && m.message).map(m => m.message).join(' | ')
        throw new Error(txt ? `البوت رد بنص: ${txt.slice(0, 200)}` : 'انتهى الوقت ومفيش صوت وصل')
    }
    // نفضّل الفويس، وبعدين أقدم ملف صوت (الأصلي)
    found.sort((a, b) => a.id - b.id)
    return found.find(m => m.voice) || found[0]
}

const handler = async (m, { conn, text }) => {
    const input = (text || '').trim()
    if (!input) return m.reply('ابعت النص\nمثال: `.tts مرحبا`')

    try {
        await m.react?.('⏳')
        const client = await getClient()
        const msg = await askBot(client, input)

        let buffer = await client.downloadMedia(msg)
        if (!buffer || !buffer.length) throw new Error('مقدرتش أحمّل الصوت')
        buffer = Buffer.from(buffer)

        const info = sniff(buffer)
        let payload

        if (info.kind === 'ogg' && info.opus) {
            // جاهز كفويس
            payload = { audio: buffer, mimetype: 'audio/ogg; codecs=opus', ptt: true }
        } else {
            const ff = await findFfmpeg()
            if (ff) {
                try {
                    payload = { audio: await toOpus(buffer, ff), mimetype: 'audio/ogg; codecs=opus', ptt: true }
                } catch (e) {
                    console.error('[TTS] ffmpeg فشل:', e.message)
                }
            }
            // مفيش تحويل: نبعته بنوعه الحقيقي كملف صوت (مش فويس) عشان ما يتشوّهش
            if (!payload) payload = { audio: buffer, mimetype: info.mime, ptt: false }
        }

        await conn.sendMessage(m.chat, payload, { quoted: m })
        await m.react?.('✅')
    } catch (e) {
        console.error('[TTS]', e?.message || e)
        await m.react?.('❌')
        await m.reply(`❌ فشل\n⚠️ ${e?.message || e}`)
    }
}

handler.help = ['tts']
handler.tags = ['tools']
handler.command = /^(tts|صوت|كلام)$/i
export default handler