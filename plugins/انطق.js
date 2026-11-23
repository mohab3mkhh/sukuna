// ID: SUKUNA-TTS — أمر .انطق (قايمة شخصيات + تحويل نص لصوت) — ESM
import { generateWAMessageFromContent, proto } from '@whiskeysockets/baileys'

// ───────────── إعدادات ─────────────
const API_BASE   = 'https://prexzyapis.com/tts'
const TEXT_PARAM = 'text'          // لو الـ API بيستقبل النص باسم تاني (q مثلاً) غيّره هنا
const MAX_CHARS  = 300
const PICK_TTL   = 10 * 60_000     // القايمة صالحة 10 دقايق
const SEND_PTT   = true            // true = يتبعت كرسالة صوتية (فويس) / false = ملف صوت عادي

// name = الاسم بالظبط زي ما في الـ API (منه بيتعمل رابط الـ endpoint)
// label = الاسم اللي بيظهر في القايمة
const VOICES = [
  { name: 'Adult Female #1, American English (TruVoice)', label: '👩 Adult Female 1' },
  { name: 'Adult Female #2, American English (TruVoice)', label: '👩 Adult Female 2' },
  { name: 'Adult Male #1, American English (TruVoice)',   label: '👨 Adult Male 1' },
  { name: 'Adult Male #2, American English (TruVoice)',   label: '👨 Adult Male 2' },
  { name: 'Adult Male #3, American English (TruVoice)',   label: '👨 Adult Male 3' },
  { name: 'Adult Male #4, American English (TruVoice)',   label: '👨 Adult Male 4' },
  { name: 'Adult Male #5, American English (TruVoice)',   label: '👨 Adult Male 5' },
  { name: 'Adult Male #6, American English (TruVoice)',   label: '👨 Adult Male 6' },
  { name: 'Adult Male #7, American English (TruVoice)',   label: '👨 Adult Male 7' },
  { name: 'Adult Male #8, American English (TruVoice)',   label: '👨 Adult Male 8' },
  { name: 'Female Whisper',        label: '🤫 Female Whisper' },
  { name: 'Male Whisper',          label: '🤫 Male Whisper' },
  { name: 'Mary',                  label: '👩 Mary' },
  { name: 'Mary (for Telephone)',  label: '📞 Mary Telephone' },
  { name: 'Mary in Hall',          label: '🏛️ Mary in Hall' },
  { name: 'Mary in Space',         label: '🚀 Mary in Space' },
  { name: 'Mary in Stadium',       label: '🏟️ Mary in Stadium' },
  { name: 'Mike',                  label: '👨 Mike' },
  { name: 'Mike (for Telephone)',  label: '📞 Mike Telephone' },
  { name: 'Mike in Hall',          label: '🏛️ Mike in Hall' },
  { name: 'Mike in Space',         label: '🚀 Mike in Space' },
  { name: 'Mike in Stadium',       label: '🏟️ Mike in Stadium' },
  { name: 'RoboSoft One',          label: '🤖 RoboSoft One' },
  { name: 'RoboSoft Two',          label: '🤖 RoboSoft Two' },
  { name: 'RoboSoft Three',        label: '🤖 RoboSoft Three' },
  { name: 'RoboSoft Four',         label: '🤖 RoboSoft Four' },
  { name: 'RoboSoft Five',         label: '🤖 RoboSoft Five' },
  { name: 'RoboSoft Six',          label: '🤖 RoboSoft Six' },
  { name: 'Sam',                   label: '👨 Sam' }
]

// "Adult Female #1, American English (TruVoice)" → tts-adult-female--1-american-english-truvoice
const toSlug = n => 'tts-' + n.toLowerCase()
  .replace(/#/g, '-')
  .replace(/[(),]/g, '')
  .trim()
  .replace(/\s+/g, '-')

// ───────────── طلبات الانتظار (واحد لكل شخص) ─────────────
const PENDING = new Map()   // sender → { text, ts }

function getPending(sender) {
  const p = PENDING.get(sender)
  if (!p) return null
  if (Date.now() - p.ts > PICK_TTL) { PENDING.delete(sender); return null }
  return p
}

// ───────────── استدعاء الـ API ─────────────
function findUrl(obj, depth = 0) {
  if (!obj || depth > 4) return null
  if (typeof obj === 'string') return /^https?:\/\//i.test(obj) ? obj : null
  if (typeof obj !== 'object') return null
  for (const k of ['url', 'audio', 'audio_url', 'audioUrl', 'result', 'download', 'link', 'data']) {
    const u = findUrl(obj[k], depth + 1)
    if (u) return u
  }
  for (const v of Object.values(obj)) {
    const u = findUrl(v, depth + 1)
    if (u) return u
  }
  return null
}

async function getVoiceAudio(voice, text) {
  const url = `${API_BASE}/${toSlug(voice.name)}?${TEXT_PARAM}=${encodeURIComponent(text)}`
  const res = await fetch(url, { signal: AbortSignal.timeout(45_000) })
  if (!res.ok) throw new Error(`API ${res.status}`)

  const ct = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()

  // الـ API رجّع الصوت نفسه مباشرة
  if (ct.startsWith('audio/') || ct === 'application/octet-stream') {
    return { buffer: Buffer.from(await res.arrayBuffer()), mime: ct.startsWith('audio/') ? ct : 'audio/mpeg' }
  }

  // الـ API رجّع JSON فيه لينك الصوت
  const json = await res.json().catch(() => null)
  const link = findUrl(json)
  if (!link) throw new Error(json?.message || json?.error || 'الـ API ماردش بصوت')

  const a = await fetch(link, { signal: AbortSignal.timeout(45_000) })
  if (!a.ok) throw new Error(`audio ${a.status}`)
  const act = (a.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
  return { buffer: Buffer.from(await a.arrayBuffer()), mime: act.startsWith('audio/') ? act : 'audio/mpeg' }
}

// ───────────── إرسال القايمة ─────────────
async function sendVoiceList(conn, m, text, prefix) {
  const preview = text.length > 80 ? text.slice(0, 80) + '…' : text
  const body =
`╔═══━━━─── • ───━━━═══╗
   『 𝙎 𝙐 𝙆 𝙐 𝙉 𝘼 』
╚═══━━━─── • ───━━━═══╝
🎙️ *تحويل النص لصوت*
⟡ النص: ${preview}
⟡ اختر الشخصية من القايمة 👇`

  try {
    const msg = generateWAMessageFromContent(m.chat, {
      viewOnceMessage: {
        message: {
          messageContextInfo: { deviceListMetadataVersion: 2, deviceListMetadata: {} },
          interactiveMessage: proto.Message.InteractiveMessage.create({
            body:   proto.Message.InteractiveMessage.Body.create({ text: body }),
            footer: proto.Message.InteractiveMessage.Footer.create({ text: '꧁༒【⛩️𝗦𝗨𝗞𝗨𝗡𝗔⚡𝗕𝗢𝗧⛩️】༒꧂' }),
            header: proto.Message.InteractiveMessage.Header.create({ title: '', subtitle: '', hasMediaAttachment: false }),
            nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
              buttons: [{
                name: 'single_select',
                buttonParamsJson: JSON.stringify({
                  title: '🎙️ اختر الشخصية',
                  sections: [{
                    title: 'الأصوات المتاحة',
                    rows: VOICES.map((v, i) => ({
                      header: '',
                      title: v.label,
                      description: v.name,
                      id: `${prefix}اختر_صوت ${i + 1}`
                    }))
                  }]
                })
              }]
            })
          })
        }
      }
    }, { quoted: m })
    await conn.relayMessage(m.chat, msg.message, { messageId: msg.key.id })
  } catch (e) {
    console.log('[TTS] list failed, fallback:', e.message)
    const list = VOICES.map((v, i) => `*${i + 1}* ◂ ${v.label}`).join('\n')
    await conn.reply(m.chat, `${body}\n\n${list}\n\n✍️ اكتب: ${prefix}اختر_صوت <الرقم>`, m)
  }
}

// ───────────── الأمر ─────────────
const handler = async (m, { conn, args, text, usedPrefix, command }) => {
  const prefix = typeof usedPrefix === 'string' && usedPrefix ? usedPrefix : '.'

  // 2) اختيار الشخصية (من القايمة أو بكتابة الرقم)
  if (/^اختر_صوت$/i.test(command)) {
    const idx = parseInt(args[0], 10)
    const voice = VOICES[idx - 1]
    if (!voice) return conn.reply(m.chat, `⟡ رقم الشخصية غلط (1 - ${VOICES.length})`, m)

    const pending = getPending(m.sender)
    if (!pending) return conn.reply(m.chat, `⟡ مفيش نص مستني. اكتب: ${prefix}انطق <الكلام>`, m)

    await conn.sendMessage(m.chat, { react: { text: '⏳', key: m.key } }).catch(() => {})
    try {
      const { buffer, mime } = await getVoiceAudio(voice, pending.text)
      if (!buffer?.length) throw new Error('صوت فاضي')
      await conn.sendMessage(m.chat, { audio: buffer, mimetype: mime, ptt: SEND_PTT }, { quoted: m })
      await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } }).catch(() => {})
    } catch (e) {
      console.error('[TTS] error:', e.message)
      await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } }).catch(() => {})
      await conn.reply(m.chat, `⟡ فشل التحويل بصوت *${voice.label}*\n(${e.message})\nجرّب شخصية تانية.`, m)
    }
    return
  }

  // 1) .انطق <الكلام>
  const input = (text || args.join(' ') || m.quoted?.text || m.quoted?.caption || '').trim()
  if (!input) return conn.reply(m.chat, `⟡ اكتب الكلام بعد الأمر\nمثال: ${prefix}انطق مرحبا كيف حالك`, m)
  if (input.length > MAX_CHARS) return conn.reply(m.chat, `⟡ الكلام طويل (الحد الأقصى ${MAX_CHARS} حرف)`, m)

  PENDING.set(m.sender, { text: input, ts: Date.now() })
  await sendVoiceList(conn, m, input, prefix)
}

handler.command = /^(انطق|اختر_صوت)$/i
export default handler