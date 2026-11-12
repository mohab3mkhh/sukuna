// plugins/اصلاح-الردود.js
// ✧ يصلح الـ plugins اللي اتبوّظت بعد استبدال أمر الرد (m نقطة reply) بـ sendMessage ناقص القوس الأخير
//   بيرجّع الاستبدال الغلط بس، وما بيلمسش أي sendMessage سليم. للمالك فقط.
//   الأمر:  .اصلح_الردود

import fs from 'fs'
import path from 'path'
import os from 'os'
import axios from 'axios'
import { execFile } from 'child_process'

// بنبنيهم من أجزاء عشان الملف ده نفسه ما يطابقش البحث
const NEEDLE = ['conn.sendMessage(m.chat', '{ text:'].join(', ')
const ORIGINAL = 'm.' + 'reply('

const GITHUB_TOKEN  = process.env.GITHUB_TOKEN
const GITHUB_REPO   = process.env.GITHUB_REPO || 'mohab3mkhh/sukuna'
const GITHUB_BRANCH = 'main'
const enc = p => p.split('/').map(encodeURIComponent).join('/')

// ════════════ ماسح بسيط للكود (strings / templates / comments / regex / أقواس) ════════════
// بيرجّع أول قوس قفل "غير مقفول" بعد start، أو null لو مقدرش يحلل بأمان
export function findUnmatchedCloser(src, start) {
    const stack = []
    let i = start
    let last = ''
    const n = src.length

    while (i < n) {
        const c = src[i]
        const d = src[i + 1]

        if (c === '/' && d === '/') { const e = src.indexOf('\n', i); if (e === -1) return null; i = e; continue }
        if (c === '/' && d === '*') { const e = src.indexOf('*/', i + 2); if (e === -1) return null; i = e + 2; continue }

        if (c === "'" || c === '"') {
            i++
            while (i < n && src[i] !== c) {
                if (src[i] === '\\') i++
                else if (src[i] === '\n') return null
                i++
            }
            if (i >= n) return null
            i++; last = c; continue
        }

        if (c === '`') {
            i = skipTemplate(src, i)
            if (i === null) return null
            last = '`'; continue
        }

        if (c === '/' && (last === '' || '(,=:[!&|?{};+-*%<>~^'.includes(last))) {
            // regex literal
            i++
            let inClass = false
            while (i < n) {
                const ch = src[i]
                if (ch === '\\') { i += 2; continue }
                if (ch === '\n') return null
                if (ch === '[') inClass = true
                else if (ch === ']') inClass = false
                else if (ch === '/' && !inClass) break
                i++
            }
            if (i >= n) return null
            i++
            while (i < n && /[a-z]/i.test(src[i])) i++
            last = '/'; continue
        }

        if (c === '(' || c === '[' || c === '{') { stack.push(c); i++; last = c; continue }
        if (c === ')' || c === ']' || c === '}') {
            if (!stack.length) return { index: i, char: c }
            stack.pop(); i++; last = c; continue
        }

        if (!/\s/.test(c)) last = c
        i++
    }
    return null
}

function skipTemplate(src, i) {
    i++ // بعد أول backtick
    const n = src.length
    while (i < n) {
        const c = src[i]
        if (c === '\\') { i += 2; continue }
        if (c === '`') return i + 1
        if (c === '$' && src[i + 1] === '{') {
            const r = findUnmatchedCloser(src, i + 2)
            if (!r || r.char !== '}') return null
            i = r.index + 1
            continue
        }
        i++
    }
    return null
}

// ════════════ الإصلاح نفسه ════════════
export function repair(src) {
    let out = '', pos = 0, fixed = 0, skipped = 0
    for (;;) {
        const idx = src.indexOf(NEEDLE, pos)
        if (idx === -1) break
        const after = idx + NEEDLE.length
        const end = findUnmatchedCloser(src, after)
        out += src.slice(pos, idx)
        // سليم: الـ object بيتقفل بـ } .  مبوّظ: أول قفل هو ) يعني كان m.reply(...)
        if (end && end.char === ')') { out += ORIGINAL; fixed++ }
        else { out += NEEDLE; if (!end) skipped++ }
        pos = after
    }
    return { code: out + src.slice(pos), fixed, skipped }
}

// ════════════ أدوات ════════════
const syntaxOk = (code) => new Promise(resolve => {
    const tmp = path.join(os.tmpdir(), `chk_${process.pid}_${Date.now()}_${Math.random().toString(36).slice(2)}.mjs`)
    try { fs.writeFileSync(tmp, code) } catch { return resolve(false) }
    execFile(process.execPath, ['--check', tmp], { timeout: 15000 }, (err) => {
        try { fs.unlinkSync(tmp) } catch {}
        resolve(!err)
    })
})

async function saveToGithub(filePath, content) {
    const headers = { Authorization: `token ${GITHUB_TOKEN}`, Accept: 'application/vnd.github.v3+json' }
    const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/${enc(filePath)}`
    let sha = null
    try { sha = (await axios.get(url, { headers, params: { ref: GITHUB_BRANCH } })).data.sha }
    catch (e) { if (e.response?.status !== 404) throw e }
    const body = { message: `fix ${filePath} via bot`, content: Buffer.from(content).toString('base64'), branch: GITHUB_BRANCH }
    if (sha) body.sha = sha
    try { await axios.put(url, body, { headers }) }
    catch (e) { throw new Error(`[${e.response?.status}] ${e.response?.data?.message || e.message}`) }
}

const SELF = path.basename(new URL(import.meta.url).pathname)

let handler = async (m, { conn, isROwner }) => {
    const say = t => conn.sendMessage(m.chat, { text: t }, { quoted: m })
    if (!isROwner) return say('❌ للمالك فقط')

    await m.react?.('⏳')
    const dir = 'plugins'
    const backupDir = '.repair-backups'
    fs.mkdirSync(backupDir, { recursive: true })

    const files = fs.readdirSync(dir).filter(f => f.endsWith('.js') && f !== SELF)
    const fixed = [], failed = [], gitErr = []

    for (const f of files) {
        const p = `${dir}/${f}`
        let src
        try { src = fs.readFileSync(p, 'utf8') } catch { continue }
        if (!src.includes(NEEDLE)) continue

        const { code, fixed: n, skipped } = repair(src)
        if (!n) { if (skipped) failed.push(`${f}: مقدرتش أحلل الكود`); continue }

        if (!(await syntaxOk(code))) { failed.push(`${f}: لسه فيه خطأ بعد الإصلاح`); continue }

        fs.writeFileSync(path.join(backupDir, `${Date.now()}-${f}.bak`), src)
        fs.writeFileSync(p, code, 'utf8')
        fixed.push(`${f} (${n})`)
        try { await saveToGithub(p, code) } catch (e) { gitErr.push(`${f}: ${e.message}`) }
    }

    // فحص أخير: كام ملف لسه صياغته بايظة
    const stillBroken = []
    for (const f of files) {
        try { if (!(await syntaxOk(fs.readFileSync(`${dir}/${f}`, 'utf8')))) stillBroken.push(f) } catch {}
    }

    let msg = `🛠️ *نتيجة الإصلاح*\n\n✅ اتصلح: ${fixed.length} ملف`
    if (fixed.length) msg += `\n${fixed.map((x, i) => `${i + 1}. ${x}`).join('\n')}`
    if (failed.length) msg += `\n\n⚠️ مقدرتش أصلح:\n${failed.map(x => `- ${x}`).join('\n')}`
    if (gitErr.length) msg += `\n\n⚠️ أخطاء GitHub:\n${gitErr.map(x => `- ${x}`).join('\n')}`
    else if (fixed.length) msg += `\n\n☁️ اترفع على GitHub`
    msg += stillBroken.length
        ? `\n\n❌ لسه صياغتهم بايظة (${stillBroken.length}):\n${stillBroken.map(x => `- ${x}`).join('\n')}`
        : `\n\n✅ كل الـ plugins صياغتها سليمة دلوقتي`
    msg += `\n\n♻️ لو البوت بقى تقيل اعمل Restart للاستضافة.`

    await m.react?.('✅')
    return say(msg)
}

handler.help = ['اصلح_الردود']
handler.tags = ['owner']
handler.command = /^اصلح_الردود$/i
handler.owner = true

export default handler