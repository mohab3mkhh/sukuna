// plugins/انطق.js
// 🔊 تحويل النص لصوت بأصوات مختلفة
// الاستخدام: .انطق مرحبا كيف حالك

import axios from 'axios'

const FOOTER = '⛩️ SUKUNA BOT ⛩️'

// ━━━━━━━━ قائمة الأصوات + endpoints ━━━━━━━━
const VOICES = [
    { id: 1,  name: '👩 Female #1 (أمريكي)',     endpoint: 'tts-adult-female--1-american-english-truvoice' },
    { id: 2,  name: '👩 Female #2 (أمريكي)',     endpoint: 'tts-adult-female--2-american-english-truvoice' },
    { id: 3,  name: '👨 Male #1 (أمريكي)',       endpoint: 'tts-adult-male--1-american-english-truvoice' },
    { id: 4,  name: '👨 Male #2 (أمريكي)',       endpoint: 'tts-adult-male--2-american-english-truvoice' },
    { id: 5,  name: '👨 Male #3 (أمريكي)',       endpoint: 'tts-adult-male--3-american-english-truvoice' },
    { id: 6,  name: '👨 Male #4 (أمريكي)',       endpoint: 'tts-adult-male--4-american-english-truvoice' },
    { id: 7,  name: '👨 Male #5 (أمريكي)',       endpoint: 'tts-adult-male--5-american-english-truvoice' },
    { id: 8,  name: '👨 Male #6 (أمريكي)',       endpoint: 'tts-adult-male--6-american-english-truvoice' },
    { id: 9,  name: '👨 Male #7 (أمريكي)',       endpoint: 'tts-adult-male--7-american-english-truvoice' },
    { id: 10, name: '👨 Male #8 (أمريكي)',       endpoint: 'tts-adult-male--8-american-english-truvoice' },
    { id: 11, name: '🤫 Female Whisper',          endpoint: 'tts-female-whisper' },
    { id: 12, name: '🤫 Male Whisper',            endpoint: 'tts-male-whisper' },
    { id: 13, name: '👩 Mary',                   endpoint: 'tts-mary' },
    { id: 14, name: '📞 Mary (تليفون)',           endpoint: 'tts-mary-for-telephone' },
    { id: 15, name: '🏛️ Mary in Hall',            endpoint: 'tts-mary-in-hall' },
    { id: 16, name: '🌌 Mary in Space',           endpoint: 'tts-mary-in-space' },
    { id: 17, name: '🏟️ Mary in Stadium',         endpoint: 'tts-mary-in-stadium' },
    { id: 18, name: '👨 Mike',                   endpoint: 'tts-mike' },
    { id: 19, name: '📞 Mike (تليفون)',           endpoint: 'tts-mike-for-telephone' },
    { id: 20, name: '🏛️ Mike in Hall',            endpoint: 'tts-mike-in-hall' },
    { id: 21, name: '🌌 Mike in Space',           endpoint: 'tts-mike-in-space' },
    { id: 22, name: '🏟️ Mike in Stadium',         endpoint: 'tts-mike-in-stadium' },
    { id: 23, name: '🤖 RoboSoft One',            endpoint: 'tts-robosoft-one' },
    { id: 24, name: '🤖 RoboSoft Two',            endpoint: 'tts-robosoft-two' },
    { id: 25, name: '🤖 RoboSoft Three',          endpoint: 'tts-robosoft-three' },
    { id: 26, name: '🤖 RoboSoft Four',           endpoint: 'tts-robosoft-four' },
    { id: 27, name: '🤖 RoboSoft Five',           endpoint: 'tts-robosoft-five' },
    { id: 28, name: '🤖 RoboSoft Six',            endpoint: 'tts-robosoft-six' },
    { id: 29, name: '👦 Sam',                    endpoint: 'tts-sam' },
]

const BASE_URL = 'https://prexzyapis.com/tts'

// حالة الانتظار لكل مستخدم { text, expires }
if (!global._ttsState) global._ttsState = {}

// ━━━━━━━━ جيب الصوت من API ━━━━━━━━
async function fetchVoice(endpoint, text) {
    const url = `${BASE_URL}/${endpoint}`
    const r   = await axios.get(url, {
        params: { text },
        responseType: 'arraybuffer',
        timeout: 30000,
        validateStatus: () => true,
        headers: { 'User-Agent': 'Mozilla/5.0' }
    })

    if (r.status >= 400) throw new Error(`HTTP ${r.status}`)

    const buf = Buffer.from(r.data)
    if (buf.length < 100) throw new Error('الملف فارغ')

    // لو JSON فيه رابط
    const ct = (r.headers['content-type'] || '').toLowerCase()
    if (ct.includes('application/json') || ct.includes('text/')) {
        try {
            const json = JSON.parse(buf.toString())
            const link = json?.url || json?.audio || json?.link || json?.data?.url
            if (link) {
                const r2 = await axios.get(link, { responseType: 'arraybuffer', timeout: 30000 })
                return Buffer.from(r2.data)
            }
        } catch {}
        throw new Error('رد غير متوقع من API')
    }

    return buf
}

// ━━━━━━━━ قائمة الأصوات كنص ━━━━━━━━
function voicesList() {
    const lines = VOICES.map(v => `*${v.id}.* ${v.name}`).join('\n')
    return (
        `╭━━━〔 🔊 *اختار الصوت* 〕━━━⬣\n` +
        `┃\n` +
        `${lines.split('\n').map(l => `┃ ${l}`).join('\n')}\n` +
        `┃\n` +
        `╰━━━━━━━━━━━━━━⬣\n\n` +
        `ابعت *رقم* الصوت اللي عايزه\n\n> ${FOOTER}`
    )
}

// ━━━━━━━━ Handler ━━━━━━━━
let handler = async (m, { conn, text, usedPrefix, command }) => {
    const sender  = m.sender
    const jid     = m.chat
    const input   = (text || '').trim()
    const reply   = t => conn.sendMessage(jid, { text: t }, { quoted: m })
    const react   = async e => { try { await conn.sendMessage(jid, { react: { text: e, key: m.key } }) } catch {} }

    // ══ مرحلة 2: المستخدم بعت رقم الصوت ══
    const state = global._ttsState[sender]
    if (state && Date.now() < state.expires) {
        const num = parseInt(input)
        if (!isNaN(num) && num >= 1 && num <= VOICES.length) {
            const voice = VOICES[num - 1]
            delete global._ttsState[sender]

            await react('⏳')
            try {
                const audioBuf = await fetchVoice(voice.endpoint, state.text)

                await conn.sendMessage(jid, {
                    audio:    audioBuf,
                    mimetype: 'audio/mpeg',
                    ptt:      false,
                    fileName: 'voice.mp3'
                }, { quoted: m })

                await conn.sendMessage(jid, {
                    text: `╭━━━〔 ✅ *تـم* 〕━━━⬣\n┃ 🔊 *الصوت:* ${voice.name}\n┃ 📝 *النص:* ${state.text.slice(0, 80)}\n╰━━━━━━━━━━━━━━⬣\n\n> ${FOOTER}`
                }, { quoted: m })

                await react('✅')
            } catch (e) {
                await react('❌')
                console.error('[انطق]', e.message)
                await reply(`❌ فشل جلب الصوت: ${e.message}`)
            }
            return
        }

        // رقم غلط
        return reply(`❌ اختار رقم من 1 لـ ${VOICES.length}`)
    }

    // ══ مرحلة 1: المستخدم بعت النص ══
    if (!input) {
        return reply(
            `╭━━━〔 🔊 *انطق* 〕━━━⬣\n` +
            `┃ ✦ حول أي نص لصوت\n` +
            `┃\n` +
            `┃ 📌 *الاستخدام:*\n` +
            `┃ ${usedPrefix}${command} مرحبا كيف حالك\n` +
            `╰━━━━━━━━━━━━━━⬣\n\n> ${FOOTER}`
        )
    }

    // احفظ النص واعرض القائمة
    global._ttsState[sender] = {
        text:    input,
        expires: Date.now() + 2 * 60 * 1000  // دقيقتين مهلة
    }

    await reply(
        `╭━━━〔 🔊 *انطق* 〕━━━⬣\n` +
        `┃ 📝 *النص:* ${input.slice(0, 80)}${input.length > 80 ? '...' : ''}\n` +
        `╰━━━━━━━━━━━━━━⬣\n\n` +
        voicesList()
    )
}

handler.help    = ['انطق <نص>']
handler.tags    = ['tools']
handler.command = /^(انطق|tts|نطق)$/i

export default handler