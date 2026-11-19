/**
 * plugins/المطورين.js
 * معلومات المطورين
 * الصوت: الملف aac والـ voice note لازم يكون ogg/opus، فبنحوّله بـ ffmpeg قبل الإرسال.
 */

import { execFile } from 'child_process'
import { promisify } from 'util'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { sendButtons, btn } from '../lib/buttons.js'

const execFileP = promisify(execFile)

const VIDEO_URL = 'https://files.catbox.moe/97or2g.mp4'
const AUDIO_URL = 'https://files.catbox.moe/9n2llm.aac'
const CONTACT_NUMBERS = [
  { name: 'الفحل مهاب', number: '201036547166' }
]
const FANCY_NAME = '◜⏤͟͟͞͞ 𝙎𝙐𝙆𝙐𝙉𝘼 ✦ 𝙆𝙄𝙉𝙂 ✦ 𝙊𝙁 𝘾𝙐𝙍𝙎𝙀𝙎 ˖࣪⃟🔥 ◞'

async function ffmpegPath() {
  try { await execFileP('ffmpeg', ['-version'], { timeout: 8000 }); return 'ffmpeg' } catch {}
  try { const mod = await import('@ffmpeg-installer/ffmpeg'); const p = (mod.default || mod).path; if (p && fs.existsSync(p)) return p } catch {}
  try { const mod = await import('ffmpeg-static'); const p = mod.default || mod; if (p && fs.existsSync(p)) return p } catch {}
  return null
}

// أي صيغة صوت → ogg/opus (الوحيدة اللي واتساب بيشغّلها كـ voice note)
let cachedVoice = null
async function toVoiceNote(buf) {
  if (cachedVoice) return cachedVoice
  const ff = await ffmpegPath()
  if (!ff) throw new Error('مفيش ffmpeg')
  const id = `${process.pid}_${Date.now()}`
  const inp = path.join(os.tmpdir(), `dv_${id}.in`)
  const out = path.join(os.tmpdir(), `dv_${id}.ogg`)
  try {
    fs.writeFileSync(inp, buf)
    await execFileP(ff, ['-y', '-i', inp, '-vn', '-c:a', 'libopus', '-b:a', '48k', '-ar', '48000', '-ac', '1', '-application', 'voip', out], { timeout: 60000 })
    const res = fs.readFileSync(out)
    if (res.length < 1000) throw new Error('ناتج التحويل فاضي')
    return (cachedVoice = res)
  } finally {
    try { fs.unlinkSync(inp) } catch {}
    try { fs.unlinkSync(out) } catch {}
  }
}

let handler = async (m, { conn }) => {
  try {
    try { await conn.sendMessage(m.chat, { react: { text: '🔥', key: m.key } }) } catch {}

    const bodyText = `╔═══━━━══━━━❪👑❫━━━══━━━═══╗
║  ❪🔥❫ *ＫＩＮＧ ＯＦ ＣＵＲＳＥＳ*  ║
║  ❪⚔️❫ *مَلِكُ اللَّعَنَات*      ║
║  ──━━━══━━━──                  ║
║  ❪👥❫ *مُطَوِّرِي سُوكُونَا*    ║
║  ──━━━══━━━──                  ║
║  ❝ *لَا يُوجَدُ عَدُوٌّ*         ║
║  *لَا أَسْتَطِيعُ سَحْقَهُ…* ❞  ║
╚═══━━━══━━━❪👑❫━━━══━━━═══╝`

    const buttons = CONTACT_NUMBERS.map(({ name, number }) =>
      btn.url(`📞 ${name}`, `https://wa.me/${number}`)
    )

    await sendButtons(conn, m.chat, {
      title: '👑 KING OF CURSES',
      subtitle: 'مطوري سوكونا',
      text: bodyText,
      footer: FANCY_NAME,
      video: VIDEO_URL,
      gif: true,
      buttons
    }, m)

    // الريكورد
    try {
      const r = await fetch(AUDIO_URL)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const raw = Buffer.from(await r.arrayBuffer())
      try {
        const ogg = await toVoiceNote(raw)
        await conn.sendMessage(m.chat, { audio: ogg, mimetype: 'audio/ogg; codecs=opus', ptt: true }, { quoted: m })
      } catch (e) {
        console.error('[المطورين] التحويل فشل، هبعت الصوت عادي:', e.message)
        await conn.sendMessage(m.chat, { audio: raw, mimetype: 'audio/mp4', ptt: false }, { quoted: m })
      }
    } catch (e) {
      console.error('[المطورين] فشل إرسال الصوت:', e.message)
    }

  } catch (err) {
    console.error('[المطورين Error]', err)
    await conn.sendMessage(m.chat, {
      text: `🔥 *${FANCY_NAME}*\n\n⚡ Sukuna Bot`
    }, { quoted: m })
  }
}

handler.help = ['المطورين']
handler.tags = ['main']
handler.command = /^(المطورين|مطور|مطورين|devs)$/i

export default handler