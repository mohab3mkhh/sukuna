// plugins/بتاعي.js
// ✧ لما رقم واحد بس (201036547166) يكتب "بتاعي" البوت يرد عليه برد عشوائي

const ONLY_NUMBER = '201036547166'

const REPLIES = [
    'مالو يدادي😭🌚',
    'اجي ادلكهولك👽💗',
    'بتكسف يدادي🎀💓',
    'مين دي اللي وقفتلك بتاعك يدادي😡🥺',
    'ثواني هندهلك كاروس او اجيلك انا؟🥺🥹',
    'طوله 30 سنتي🙂‍↕️😌',
    'ارحم نفسك يدادي🍭',
    'دادييي😡',
]

let handler = m => m

handler.before = async function (m) {
    try {
        if (m.key?.fromMe || !m.text) return false
        if (String(m.sender || '').split('@')[0] !== ONLY_NUMBER) return false
        if (m.text.trim() !== 'بتاعي') return false

        const reply = REPLIES[Math.floor(Math.random() * REPLIES.length)]
        await this.sendMessage(m.chat, { text: reply }, { quoted: m })
    } catch (e) {
        console.error('[بتاعي]', e.message)
    }
    return false
}

export default handler