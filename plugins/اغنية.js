/**
 * plugins/soundcloud.js
 * أمر أغنية: بحث في SoundCloud (/search/soundcloud) + تنزيل وإرسال الصوت (/download/soundcloud) - متاح للجميع
 */

import axios from 'axios'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { sendButtons, btn, getButtonId } from '../lib/buttons.js'

const SEARCH_ENDPOINT = 'https://prexzyapis.com/search/soundcloud'
const DL_ENDPOINT = 'https://prexzyapis.com/download/soundcloud'
const MAX_ITEMS = 10
const TTL_MS = 30 * 60 * 1000
const MAX_AUDIO_MB = 150
const MAX_AUDIO_BYTES = MAX_AUDIO_MB * 1024 * 1024
const TMP = os.tmpdir()
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

if (!global.scSearchCache) global.scSearchCache = new Map()

function genId() {
    return Math.random().toString(36).slice(2, 10)
}

function sanitizeFileName(name) {
    return String(name || 'track')
        .replace(/[\\/:*?"<>|]+/g, '_')
        .replace(/\s+/g, '_')
        .slice(0, 60)
}

function formatDuration(val) {
    if (!val && val !== 0) return ''
    if (typeof val === 'number') {
        const totalSec = val > 10000 ? Math.floor(val / 1000) : Math.floor(val)
        const mins = Math.floor(totalSec / 60)
        const secs = totalSec % 60
        return `${mins}:${String(secs).padStart(2, '0')}`
    }
    return String(val).trim()
}

function extractStringField(val) {
    if (!val) return ''
    if (typeof val === 'string' || typeof val === 'number') return String(val).trim()
    if (typeof val === 'object') {
        return String(
            val.username ||
            val.name ||
            val.title ||
            val.full_name ||
            val.display_name ||
            ''
        ).trim()
    }
    return ''
}

function normalizeTrack(raw, index) {
    const title = String(
        extractStringField(raw?.title) ||
        extractStringField(raw?.name) ||
        extractStringField(raw?.trackName) ||
        extractStringField(raw?.song) ||
        `مقطع ${index + 1}`
    ).trim()

    const artist = String(
        extractStringField(raw?.author) ||
        extractStringField(raw?.artist) ||
        extractStringField(raw?.user) ||
        extractStringField(raw?.uploader) ||
        'غير معروف'
    ).trim()

    const duration = formatDuration(
        raw?.duration ||
        raw?.full_duration ||
        raw?.length ||
        raw?.time ||
        ''
    )

    const url = String(
        raw?.url ||
        raw?.permalink_url ||
        raw?.link ||
        raw?.trackUrl ||
        ''
    ).trim()

    const id = raw?.id ? String(raw.id).trim() : ''
    const artwork = String(raw?.artwork || raw?.thumbnail || raw?.artwork_url || raw?.image || '').trim()

    return {
        index: index + 1,
        id,
        title,
        artist,
        duration,
        url,
        artwork
    }
}

async function searchSoundCloud(query) {
    const res = await axios.get(SEARCH_ENDPOINT, {
        params: { q: query },
        timeout: 20000,
        headers: {
            'User-Agent': UA,
            'Accept': 'application/json'
        },
        validateStatus: () => true
    })

    if (res.status >= 400) {
        throw new Error(`HTTP ${res.status}`)
    }

    const d = res.data
    const list =
        (Array.isArray(d?.result) && d.result) ||
        (Array.isArray(d?.results) && d.results) ||
        (Array.isArray(d?.data) && d.data) ||
        (Array.isArray(d?.tracks) && d.tracks) ||
        (Array.isArray(d?.data?.result) && d.data.result) ||
        []

    if (!list.length) return []
    return list.slice(0, MAX_ITEMS).map((item, i) => normalizeTrack(item, i))
}

async function downloadStreamToFile(audioUrl, referer, outFilePath) {
    const res = await axios.get(audioUrl, {
        responseType: 'stream',
        timeout: 180000,
        maxRedirects: 5,
        maxContentLength: MAX_AUDIO_BYTES,
        maxBodyLength: MAX_AUDIO_BYTES,
        headers: {
            'User-Agent': UA,
            'Referer': referer || 'https://soundcloud.com/'
        },
        validateStatus: () => true
    })

    if (res.status >= 400 || !res.data) {
        throw new Error(`HTTP ${res.status}`)
    }

    const contentType = String(res.headers['content-type'] || '').toLowerCase()
    if (contentType.includes('text/html') || contentType.includes('application/json')) {
        throw new Error('الرابط لا يرجع ملفاً صوتياً مباشراً')
    }

    let bytes = 0
    await new Promise((resolve, reject) => {
        const writer = fs.createWriteStream(outFilePath)
        res.data.on('data', (chunk) => {
            bytes += chunk.length
            if (bytes > MAX_AUDIO_BYTES) {
                writer.destroy()
                res.data.destroy()
                reject(new Error(`حجم الملف تجاوز ${MAX_AUDIO_MB} MB`))
            }
        })
        res.data.on('error', (err) => {
            writer.destroy()
            reject(err)
        })
        writer.on('error', reject)
        writer.on('finish', resolve)
        res.data.pipe(writer)
    })

    if (bytes < 10000) {
        try { fs.unlinkSync(outFilePath) } catch {}
        throw new Error('الملف الصوتي صغير جداً أو غير صالح')
    }

    const mime = contentType.includes('audio/')
        ? contentType.split(';')[0]
        : 'audio/mpeg'

    return { bytes, mimetype: mime }
}

async function downloadSoundCloudTrack(track, outFilePath) {
    const paramAttempts = [
        ...(track.url ? [{ url: track.url }] : []),
        ...(track.id ? [{ id: track.id, mode: 'audio', quality: 'hq' }] : [])
    ]

    let lastApiError = ''

    for (const params of paramAttempts) {
        try {
            const res = await axios.get(DL_ENDPOINT, {
                params,
                timeout: 30000,
                responseType: 'arraybuffer',
                headers: {
                    'User-Agent': UA,
                    'Accept': 'audio/*, application/json, */*'
                },
                validateStatus: () => true
            })

            if (res.status >= 400 || !res.data) {
                lastApiError = `HTTP ${res.status}`
                continue
            }

            const buf = Buffer.from(res.data)
            const contentType = String(res.headers['content-type'] || '').toLowerCase()

            if (contentType.includes('audio/') || (buf.length > 50000 && !contentType.includes('application/json') && buf[0] !== 0x7b)) {
                if (buf.length > MAX_AUDIO_BYTES) {
                    throw new Error(`حجم الملف تجاوز ${MAX_AUDIO_MB} MB`)
                }
                fs.writeFileSync(outFilePath, buf)
                return {
                    bytes: buf.length,
                    mimetype: contentType.includes('audio/') ? contentType.split(';')[0] : 'audio/mpeg'
                }
            }

            if (contentType.includes('application/json') || buf[0] === 0x7b) {
                let json = null
                try {
                    json = JSON.parse(buf.toString('utf8'))
                } catch {
                    continue
                }

                if (json && json.status === false) {
                    lastApiError = json.error || json.message || `statusCode ${json.statusCode || 400}`
                    continue
                }

                const d = json?.data || json?.result || json
                const audioUrl =
                    d?.downloadUrl ||
                    d?.download ||
                    d?.audio ||
                    d?.audioUrl ||
                    d?.stream ||
                    d?.streams?.hq ||
                    d?.streams?.lq ||
                    ''

                if (typeof audioUrl === 'string' && /^https?:\/\//i.test(audioUrl.trim())) {
                    return await downloadStreamToFile(audioUrl.trim(), track.url || 'https://soundcloud.com/', outFilePath)
                }
            }
        } catch (err) {
            if (err.message.includes('تجاوز')) throw err
            lastApiError = err.message
        }
    }

    throw new Error(lastApiError || 'تعذر جلب ملف الصوت من /download/soundcloud')
}

async function sendTracksMenu(conn, m, query, tracks) {
    const rows = tracks.map((track) => {
        const key = genId()
        global.scSearchCache.set(key, {
            track,
            query,
            createdAt: Date.now()
        })

        const desc = [
            `🎤 ${track.artist}`,
            track.duration ? `⏱️ ${track.duration}` : ''
        ].filter(Boolean).join(' | ')

        return {
            title: `${track.index}. ${track.title.slice(0, 50)}`,
            description: desc.slice(0, 70),
            id: `sc_${key}`
        }
    })

    await sendButtons(conn, m.chat, {
        title: '🎧 SoundCloud Search',
        subtitle: query,
        text: `🔍 *بحث عن:* ${query}\n🎶 *النتائج:* ${tracks.length}\n\n👇 اختر أغنية لتنزيلها:`,
        footer: '🎧 SoundCloud',
        buttons: [
            btn.list('🎵 اختر أغنية', [
                {
                    title: 'نتائج البحث',
                    rows
                }
            ])
        ]
    }, m)
}

let before = async (m, { conn }) => {
    try {
        const buttonId = getButtonId(m)
        if (!buttonId || !buttonId.startsWith('sc_')) return false

        const key = buttonId.replace('sc_', '')
        const cached = global.scSearchCache.get(key)
        if (!cached) return false

        global.scSearchCache.delete(key)

        const { track } = cached
        await m.react('⏳').catch(() => {})
        const waitMsg = await m.reply(`⬇️ *جاري تنزيل:* ${track.title}...`)
        const tmpFile = path.join(TMP, `sc_${process.pid}_${Date.now()}.mp3`)

        try {
            const { bytes, mimetype } = await downloadSoundCloudTrack(track, tmpFile)
            const sizeMb = (bytes / (1024 * 1024)).toFixed(2)
            const fileName = `${sanitizeFileName(track.title)}.mp3`

            try { await conn.sendMessage(m.chat, { delete: waitMsg.key }) } catch {}

            await conn.sendMessage(
                m.chat,
                {
                    audio: { url: tmpFile },
                    mimetype,
                    ptt: false,
                    fileName
                },
                { quoted: m }
            )

            await conn.sendMessage(
                m.chat,
                {
                    text: [
                        `🎵 *العنوان:* ${track.title}`,
                        `🎤 *الفنان:* ${track.artist}`,
                        track.duration ? `⏱️ *المدة:* ${track.duration}` : '',
                        `💾 *الحجم:* ${sizeMb} MB`,
                        track.url ? `🔗 *الرابط:* ${track.url}` : ''
                    ].filter(Boolean).join('\n')
                },
                { quoted: m }
            )

            await m.react('✅').catch(() => {})
            return true
        } catch (dlErr) {
            try { fs.unlinkSync(tmpFile) } catch {}
            try { await conn.sendMessage(m.chat, { delete: waitMsg.key }) } catch {}

            const fallbackMsg = [
                `🎵 *العنوان:* ${track.title}`,
                `🎤 *الفنان:* ${track.artist}`,
                track.duration ? `⏱️ *المدة:* ${track.duration}` : '',
                track.url ? `🔗 *الرابط:* ${track.url}` : '',
                ``,
                `⚠️ *تعذر تنزيل الصوت:* ${dlErr.message}`
            ].filter(Boolean).join('\n')

            await conn.sendMessage(m.chat, { text: fallbackMsg }, { quoted: m })
            await m.react('⚠️').catch(() => {})
            return true
        } finally {
            setTimeout(() => {
                try { fs.unlinkSync(tmpFile) } catch {}
            }, 180000)
        }
    } catch (e) {
        console.error('[soundcloud before]', e.message)
        return false
    }
}

let handler = async (m, { conn, text, usedPrefix, command }) => {
    const query = (text || '').trim()
    if (!query) {
        return conn.reply(
            m.chat,
            `🎧 اكتب اسم أغنية للبحث في SoundCloud:\n*مثال:* ${usedPrefix + command} انا مين`,
            m
        )
    }

    await m.react('🔍')
    const wait = await m.reply(`🔍 *جاري البحث في SoundCloud عن:* ${query}`)

    try {
        const tracks = await searchSoundCloud(query)
        if (!tracks.length) {
            await m.react('❌')
            return conn.sendMessage(m.chat, { text: '❌ مفيش نتائج.', edit: wait.key })
        }

        try { await conn.sendMessage(m.chat, { delete: wait.key }) } catch {}
        await sendTracksMenu(conn, m, query, tracks)
        await m.react('✅')
    } catch (e) {
        console.error('[soundcloud handler]', e.message)
        await m.react('❌')
        await conn.sendMessage(m.chat, { text: `❌ ${e.message}`, edit: wait.key })
    }
}

setInterval(() => {
    const now = Date.now()
    for (const [k, v] of global.scSearchCache.entries()) {
        if (now - v.createdAt > TTL_MS) {
            global.scSearchCache.delete(k)
        }
    }
}, 5 * 60 * 1000)

handler.before = before
handler.help = ['اغنية <اسم الأغنية>']
handler.tags = ['downloader']
handler.command = /^(اغنية|أغنية|sc|soundcloud)$/i

export default handler