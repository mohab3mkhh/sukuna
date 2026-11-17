// plugins/باتش.js — عرض كود أي plugin (شكل الكود الملوّن الجديد + الملف مرفق)
//   .باتش            → قائمة كل البلاجنز (مرقمة)
//   .باتش تست        → كود plugins/تست.js بالشكل الجديد + الملف
//   .باتش 12         → نفس الشيء بالرقم من القائمة
//   (امتداد .js و plugins/ اختياريين، ولو كتبت جزء من الاسم وفيه نتيجة واحدة بيفتحها)

import fs from 'fs'
import path from 'path'
import * as _baileys from '@whiskeysockets/baileys'

const B = _baileys.generateWAMessageFromContent ? _baileys : (_baileys.default || _baileys)
const { generateWAMessageFromContent, generateMessageIDV2, proto } = B

const PLUGINS_DIR = path.join(process.cwd(), 'plugins')
const ALLOWED = [
    '201016855501@s.whatsapp.net',
    '201036547166@s.whatsapp.net',
    '201150572826@s.whatsapp.net',
    '201515023210@s.whatsapp.net',
    '201066036607@s.whatsapp.net',
]
const MAX_RICH = 100000          // أكبر كود يتعرض بالشكل الملوّن
const MAX_FILE = 10 * 1024 * 1024
const MAX_TEXT = 3000            // أكبر كود يتعرض كنص عادي (لو الشكل الملوّن مش متاح)
const CHUNK = 3500               // حجم الرسالة الواحدة في القائمة

const listPlugins = () => fs.readdirSync(PLUGINS_DIR).filter(f => f.endsWith('.js')).map(f => f.slice(0, -3)).sort((a, b) => a.localeCompare(b))

// ━━━ الشكل الملوّن (نفس طريقة أمر ملف) ━━━
async function sendRichCode(conn, chat, relativePath, code) {
    if (!proto || typeof proto.AIRichResponseMessage === 'undefined') throw new Error('المكتبة مفيهاش richResponseMessage')
    const bytes = Buffer.byteLength(code, 'utf8')
    const header =
        `\n⛩️ ⌈ *Name* ⌋ ⇢ ${relativePath}\n` +
        `🩸 ⌈ *Size* ⌋ ⇢ ${bytes} bytes\n` +
        `⛩️ ⌈ *Lang* ⌋ ⇢ JS\n`
    const richMessage = {
        richResponseMessage: {
            messageType: 1,
            submessages: [
                { messageType: 2, messageText: header },
                { messageType: 5, codeMetadata: { codeLanguage: 'javascript', codeBlocks: [{ highlightType: 1, codeContent: code }] } },
            ],
            contextInfo: { isForwarded: true, forwardingScore: 1, forwardOrigin: 4 },
        },
    }
    const opts = { userJid: conn.user.id }
    if (typeof generateMessageIDV2 === 'function') opts.messageId = generateMessageIDV2(conn.user.id)
    const sent = await generateWAMessageFromContent(chat, { botForwardedMessage: { message: richMessage } }, opts)
    await conn.relayMessage(chat, sent.message, { messageId: sent.key.id })
}

// ━━━ تحديد البلجن من اسم أو رقم أو جزء من الاسم ━━━
function resolve(input, files) {
    const q = input.trim().replace(/^['"]|['"]$/g, '').replace(/^\.?\/?plugins\//i, '').replace(/\.js$/i, '')
    if (files.includes(q)) return { name: q }
    if (/^\d+$/.test(q)) {
        const f = files[Number(q) - 1]
        return f ? { name: f } : { error: `❌ مفيش رقم ${q}. عدد البلجنز ${files.length}.` }
    }
    const low = q.toLowerCase()
    const same = files.filter(f => f.toLowerCase() === low)
    if (same.length === 1) return { name: same[0] }
    const part = files.filter(f => f.toLowerCase().includes(low))
    if (part.length === 1) return { name: part[0] }
    if (part.length > 1) return { matches: part }
    return { error: `❌ البلجن "${q}" غير موجود.\nاكتب .باتش لعرض كل البلاجنز.` }
}

let handler = async (m, { conn, text, isROwner }) => {
    const say = t => conn.sendMessage(m.chat, { text: t }, { quoted: m })
    if (!isROwner && !ALLOWED.includes(m.sender)) return say('❌ هذا الأمر خاص بـ *مهاب* فقط.')

    let files
    try { files = listPlugins() } catch (e) { return say(`❌ مقدرتش أقرا مجلد plugins: ${e.message}`) }

    // ━━━ القائمة ━━━
    if (!text?.trim()) {
        const lines = files.map((f, i) => `│ [${i + 1}] ${f}`)
        const head = `╭─「 قائمة البلاجنز 」─╮\n│ العدد: ${files.length}\n╰──────────────╯`
        const chunks = []
        let cur = head
        for (const l of lines) {
            if (cur.length + l.length + 1 > CHUNK) { chunks.push(cur); cur = '' }
            cur += (cur ? '\n' : '') + l
        }
        if (cur) chunks.push(cur)
        for (let i = 0; i < chunks.length; i++) {
            await say(chunks[i] + (i === chunks.length - 1 ? '\n\n✍️ اكتب: .باتش <الاسم أو الرقم>' : ''))
        }
        return
    }

    const r = resolve(text, files)
    if (r.error) return say(r.error)
    if (r.matches) {
        return say(`🔎 لقيت ${r.matches.length} بلجن مشابه، اختار واحد:\n\n${r.matches.slice(0, 40).map(f => `• ${f}  (${files.indexOf(f) + 1})`).join('\n')}${r.matches.length > 40 ? '\n…' : ''}`)
    }

    // ━━━ عرض الكود + الملف ━━━
    const file = `${r.name}.js`
    const full = path.join(PLUGINS_DIR, file)
    try {
        const st = fs.statSync(full)
        if (!st.isFile()) return say('❌ ده مش ملف.')
        if (st.size > MAX_FILE) return say('❌ الملف أكبر من 10 ميجابايت.')
        const buf = fs.readFileSync(full)
        const code = buf.toString('utf8')
        const rel = `plugins/${file}`

        let shown = false
        if (code.length <= MAX_RICH) {
            try { await sendRichCode(conn, m.chat, rel, code); shown = true }
            catch (e) { console.log('[باتش] الشكل الملوّن مش متاح:', e?.message) }
        }
        if (!shown && code.length <= MAX_TEXT) {
            await say(`📄 *${rel}*\n📦 ${(buf.length / 1024).toFixed(2)} KB | 📝 ${code.split('\n').length} سطر\n\n\`\`\`\n${code}\n\`\`\``)
        }

        await conn.sendMessage(m.chat, { document: buf, mimetype: 'application/javascript', fileName: file }, { quoted: m })
    } catch (e) {
        return say(`❌ حدث خطأ أثناء فتح الملف: ${e.message}`)
    }
}

handler.help = ['باتش <اسم البلجن>']
handler.tags = ['owner']
handler.command = /^(باتش|gp)$/i
handler.owner = true

export default handler