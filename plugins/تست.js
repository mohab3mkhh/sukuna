// plugins/تست.js
// سبب الخلل: الـ voice note (ptt) لازم يكون ogg/opus، وإنت كنت باعت mp3 بـ ptt:true فبيظهر "الصوت مش شغال".
// الحل: نحوّل الـ mp3 لـ opus بـ ffmpeg (system أو @ffmpeg-installer)، ولو التحويل مش متاح نبعته كملف صوت عادي يشتغل.

import { execFile } from 'child_process'
import { promisify } from 'util'
import fs from 'fs'
import os from 'os'
import path from 'path'

const execFileP = promisify(execFile)

const videoUrl = 'https://files.catbox.moe/mqlh1o.mp4'
const audioUrl = 'https://files.catbox.moe/lrc08x.mp3'

const replyText = `
⛩️══════════════⛩️
🩸 *𝑹 𝒀 𝑶 𝑴 𝑬 𝑵  𝑺 𝑼 𝑲 𝑼 𝑵 𝑨* 🩸
⛩️══════════════⛩️

❖ *ﭐلِاسَمُ*  ⟶  رِيـومَـن سُوكـونَـا
❖ *ﭐللَّقَـبُ* ⟶  مَـلِكُ اللَّعَنَـاتِ 😈
❖ *ﭐلرُّتبَـةُ* ⟶  ﭐلشَّيطَـانُ ﭐلمَحظُـور ☠️
❖ *ﭐلقُـوَّةُ* ⟶  لَا حُـدُودَ لَهَـا 🔱

⛩️══════════════⛩️

❝ اِركَعْ أَمَامِي وَأَثْبِتْ أَنَّكَ ❞
❝ تَسْتَحِقُّ المَوْتَ عَلَى يَدَيَّ ❞

⛩️══════════════⛩️

👑 *زَوْجُ العَدِيدِ مِنَ النِّسَاء*
⚡ *وَيُمكِنُ أَنتِ تَكُونِي مِنهُم*

⛩️══════════════⛩️
🩸 *👹 𝑾𝑬𝑳𝑪𝑶𝑴𝑬 𝑻𝑶 𝑴𝒀 𝑫𝑶𝑴𝑨𝑰𝑵 👹* 🩸
⛩️══════════════⛩️`.trim()

async function getBuffer(url) {
    const r = await fetch(url)
    if (!r.ok) throw new Error(`فشل تحميل الملف (HTTP ${r.status})`)
    return Buffer.from(await r.arrayBuffer())
}

async function ffmpegPath() {
    try { await execFileP('ffmpeg', ['-version'], { timeout: 8000 }); return 'ffmpeg' } catch {}
    try { const mod = await import('@ffmpeg-installer/ffmpeg'); const p = (mod.default || mod).path; if (p && fs.existsSync(p)) return p } catch {}
    try { const mod = await import('ffmpeg-static'); const p = mod.default || mod; if (p && fs.existsSync(p)) return p } catch {}
    return null
}

// mp3 → ogg/opus (الصيغة الوحيدة اللي واتساب بيشغّلها كـ voice note)
let cachedVoice = null
async function toVoiceNote(mp3) {
    if (cachedVoice) return cachedVoice
    const ff = await ffmpegPath()
    if (!ff) throw new Error('مفيش ffmpeg')
    const id = `${process.pid}_${Date.now()}`
    const inp = path.join(os.tmpdir(), `vn_${id}.mp3`)
    const out = path.join(os.tmpdir(), `vn_${id}.ogg`)
    try {
        fs.writeFileSync(inp, mp3)
        await execFileP(ff, ['-y', '-i', inp, '-vn', '-c:a', 'libopus', '-b:a', '48k', '-ar', '48000', '-ac', '1', '-application', 'voip', out], { timeout: 60000 })
        const buf = fs.readFileSync(out)
        if (buf.length < 1000) throw new Error('ناتج التحويل فاضي')
        return (cachedVoice = buf)
    } finally {
        try { fs.unlinkSync(inp) } catch {}
        try { fs.unlinkSync(out) } catch {}
    }
}

let handler = async (m, { conn }) => {
    try {
        const videoBuffer = await getBuffer(videoUrl)
        await conn.sendMessage(m.chat, { video: videoBuffer, caption: replyText, gifPlayback: true }, { quoted: m })

        const mp3 = await getBuffer(audioUrl)
        try {
            const ogg = await toVoiceNote(mp3)
            await conn.sendMessage(m.chat, { audio: ogg, mimetype: 'audio/ogg; codecs=opus', ptt: true }, { quoted: m })
        } catch (e) {
            console.error('[تست] التحويل فشل، هبعت الصوت عادي:', e.message)
            await conn.sendMessage(m.chat, { audio: mp3, mimetype: 'audio/mpeg', ptt: false }, { quoted: m })
        }
    } catch (err) {
        await conn.sendMessage(m.chat, { text: `⚠️ حدث خطأ: ${err.message}` }, { quoted: m })
    }
}

handler.customPrefix = /^(تست|\.تست)$/i
handler.command = new RegExp()

export default handler