// plugins/جيتهاب.js
// 🐙 تحميل من جيتهاب:
//   .جيتهاب <رابط ريبو>          → الريبو كامل ZIP
//   .جيتهاب <رابط ملف (blob)>    → الملف ده بس
//   .جيتهاب <رابط ملف> zip       → الريبو كامل حتى لو الرابط لملف
// يقبل: github.com/owner/repo  |  /tree/branch  |  /blob/branch/path  |  raw.githubusercontent.com/...  |  owner/repo
// المصدر: Prexzy API (معلومات الريبو) ← ولو فشل بيحمّل من جيتهاب مباشرة

import axios from 'axios'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { Transform } from 'stream'
import { pipeline } from 'stream/promises'

const FOOTER = '⛩️ SUKUNA BOT ⛩️'
const PREXZY = 'https://prexzyapis.com/download/github'
const MAX_MB = 80   // الذاكرة محدودة؛ الملف بيتحمّل على الديسك مش في الرام
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36'

const isHttp = v => typeof v === 'string' && /^https?:\/\//i.test(v)
const fmtSize = b => !b ? '?' : b < 1048576 ? (b / 1024).toFixed(1) + ' KB' : (b / 1048576).toFixed(2) + ' MB'

// ━━━━━━━━ تحليل الرابط ━━━━━━━━
export function parseGithub(input) {
    const s = String(input || '').trim().replace(/[)\]\.,>،]+$/, '')

    let m = s.match(/raw\.githubusercontent\.com\/([^/\s]+)\/([^/\s]+)\/([^/\s]+)\/([^\s?#]+)/i)
    if (m) return { owner: m[1], repo: m[2], branch: m[3], file: m[4] }

    m = s.match(/github\.com\/([^/\s]+)\/([^/\s#?]+?)(?:\.git)?(?:\/(tree|blob|raw)\/([^/\s?#]+)(?:\/([^\s?#]+))?)?\/?(?:[?#]\S*)?$/i)
    if (m) {
        const kind = m[3]
        return { owner: m[1], repo: m[2], branch: m[4] || null, file: (kind === 'blob' || kind === 'raw') ? (m[5] || null) : null }
    }

    m = s.match(/^([\w.-]+)\/([\w.-]+)$/)   // owner/repo
    if (m) return { owner: m[1], repo: m[2], branch: null, file: null }
    return null
}

// ━━━━━━━━ معلومات الريبو من Prexzy ━━━━━━━━
async function viaPrexzy({ owner, repo, branch }) {
    const url = `https://github.com/${owner}/${repo}` + (branch ? `/tree/${branch}` : '')
    const r = await axios.get(PREXZY, { params: { url }, timeout: 20000, validateStatus: () => true })
    const d = r.data?.data
    if (d?.name === 'AxiosError' || d?.stack) throw new Error('Prexzy: ' + String(d.message || 'خطأ').slice(0, 100))
    if (!d || !isHttp(d.downloadUrl)) throw new Error('Prexzy: مفيش رابط تحميل')
    return {
        downloadUrl: d.downloadUrl,
        fileName: d.fileName || `${repo}-${d.branch || branch || 'main'}.zip`,
        branch: d.branch || branch,
        stars: d.stars,
        description: d.description,
        sizeBytes: d.repoSizeBytes || 0
    }
}

// ━━━━━━━━ تحميل على الديسك (من غير ما الملف يدخل الرام) ━━━━━━━━
async function downloadToFile(url, dest, maxBytes) {
    const r = await axios.get(url, {
        responseType: 'stream', timeout: 120000, maxRedirects: 8,
        headers: { 'User-Agent': UA }, validateStatus: () => true
    })
    if (r.status !== 200) { try { r.data.destroy() } catch {} ; throw new Error('HTTP ' + r.status + (r.status === 404 ? ' (الملف/الريبو مش موجود أو private)' : '')) }
    const len = Number(r.headers?.['content-length'] || 0)
    if (len > maxBytes) { try { r.data.destroy() } catch {} ; throw new Error(`الحجم ${fmtSize(len)} أكبر من الحد (${MAX_MB}MB)`) }

    let bytes = 0
    const counter = new Transform({
        transform(chunk, _enc, cb) {
            bytes += chunk.length
            if (bytes > maxBytes) return cb(new Error(`الحجم أكبر من الحد (${MAX_MB}MB)`))
            cb(null, chunk)
        }
    })
    await pipeline(r.data, counter, fs.createWriteStream(dest))
    return bytes
}

const MIMES = { zip: 'application/zip', json: 'application/json', pdf: 'application/pdf', txt: 'text/plain', md: 'text/plain', js: 'text/plain', py: 'text/plain', html: 'text/html' }
const mimeOf = name => MIMES[String(name).split('.').pop().toLowerCase()] || 'application/octet-stream'

const handler = async (m, { conn, text, usedPrefix, command }) => {
    const reply = t => conn.sendMessage(m.chat, { text: t }, { quoted: m })
    const react = async e => { try { await conn.sendMessage(m.chat, { react: { text: e, key: m.key } }) } catch {} }

    const given = String(text || '')
    const urlMatch = (`${given} ${m.quoted?.text || ''}`).match(/(?:https?:\/\/)?(?:raw\.githubusercontent\.com|github\.com)\/[^\s]+|(?<![\w/])[\w.-]+\/[\w.-]+(?![\w/.:])/i)
    const parsed = urlMatch ? parseGithub(urlMatch[0]) : null

    if (!parsed) {
        return reply(`🐙 *تحميل من جيتهاب*\n\n*${usedPrefix}${command} <رابط الريبو>* ← الريبو كامل ZIP\n*${usedPrefix}${command} <رابط ملف>* ← الملف ده بس\n*${usedPrefix}${command} <رابط ملف> zip* ← الريبو كامل\n\n💡 مثال:\n${usedPrefix}${command} https://github.com/mohab3mkhh/sukuna\n\n> ${FOOTER}`)
    }

    const wantRepo = /(^|\s)(zip|repo|كامل|الريبو)(\s|$)/i.test(given.replace(urlMatch[0], ' '))
    const maxBytes = MAX_MB * 1048576
    const tmp = path.join(os.tmpdir(), `gh_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`)

    await react('⏳')
    try {
        // ───── ملف واحد ─────
        if (parsed.file && !wantRepo) {
            const rawUrl = `https://raw.githubusercontent.com/${parsed.owner}/${parsed.repo}/${parsed.branch || 'HEAD'}/${parsed.file.split('/').map(encodeURIComponent).join('/')}`
            const bytes = await downloadToFile(rawUrl, tmp, maxBytes)
            const fileName = parsed.file.split('/').pop()
            await conn.sendMessage(m.chat, {
                document: { url: tmp }, mimetype: mimeOf(fileName), fileName,
                caption: `📄 *${fileName}*\n🐙 ${parsed.owner}/${parsed.repo}${parsed.branch ? ` (${parsed.branch})` : ''}\n💾 ${fmtSize(bytes)}\n\n> ${FOOTER}`
            }, { quoted: m })
            await react('✅')
            return
        }

        // ───── الريبو كامل ─────
        const errors = []
        let info = null
        try { info = await viaPrexzy(parsed) } catch (e) { errors.push(e.message) }

        if (info?.sizeBytes && info.sizeBytes > maxBytes * 1.5) {
            throw new Error(`الريبو حجمه ${fmtSize(info.sizeBytes)} وأكبر من الحد (${MAX_MB}MB)`)
        }

        const sources = []
        if (info) sources.push({ url: info.downloadUrl, name: 'prexzy' })
        sources.push({ url: `https://codeload.github.com/${parsed.owner}/${parsed.repo}/zip/${parsed.branch || 'HEAD'}`, name: 'github' })

        let bytes = 0
        let ok = false
        for (const s of sources) {
            try {
                bytes = await downloadToFile(s.url, tmp, maxBytes)
                const head = fs.readFileSync(tmp).subarray(0, 2).toString('latin1')
                if (head !== 'PK') throw new Error('الملف مش ZIP')
                ok = true
                break
            } catch (e) {
                errors.push(`${s.name}: ${e.message}`)
                try { fs.unlinkSync(tmp) } catch {}
                if (/أكبر من الحد/.test(e.message)) break
            }
        }
        if (!ok) throw new Error(errors.join(' | '))

        const branch = info?.branch || parsed.branch || 'main'
        const fileName = info?.fileName || `${parsed.repo}-${branch}.zip`
        const lines = [
            `📦 *${parsed.repo}*`,
            `👤 ${parsed.owner}`,
            `🌿 ${branch}${info?.stars != null ? `  |  ⭐ ${info.stars}` : ''}`,
            `💾 ${fmtSize(bytes)}`,
            info?.description ? `📝 ${String(info.description).slice(0, 150)}` : '',
            '',
            `> ${FOOTER}`
        ].filter((l, i, a) => l !== '' || a[i - 1] !== '')
        await conn.sendMessage(m.chat, {
            document: { url: tmp }, mimetype: 'application/zip', fileName, caption: lines.join('\n')
        }, { quoted: m })
        await react('✅')
    } catch (e) {
        await react('❌')
        reply(`❌ فشل التحميل\n\n${String(e.message).slice(0, 400)}\n\n> ${FOOTER}`)
    } finally {
        try { fs.unlinkSync(tmp) } catch {}
    }
}

handler.help = ['جيتهاب <رابط>']
handler.tags = ['downloader']
handler.command = /^(جيتهاب|github|gitclone|ريبو)$/i

export default handler