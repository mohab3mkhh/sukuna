// plugins/بتاعي.js
// ✧ لما رقم واحد بس (201036547166) يكتب "بتاعي" البوت يرد عليه بصورة عشوائية + رد عشوائي (في الكابشن)

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
    'يا دادي ريّح نفسك شوية😭🍼',
    'لا لا لا يدادي هدّي اللعب🙂😳',
    'بس يدادي هتفضحنا قدام الناس🙈💗',
    'ايدك يدادي بعيد عن الموضوع دا🥺🎀',
    'يا بخت اللي هتاخدك يدادي😍🌚',
    'استحمل يدادي لسه بدري🫣💓',
    'ايه الكبر دا يدادي👀🔥',
    'يدادي انت اتجننت؟😂🌚',
    'هجبلك تلج يدادي🧊😭',
    'دادي شكله محتاج دش بارد🚿😌',
    'قول ماشاء الله يدادي🧿😏',
    'يا ويلي منك يدادي🥴💞',
]

// الصور المكررة مقصودة (بتزوّد احتمال ظهورها)
const IMAGES = [
    'https://i.ibb.co/CKWP3gcz/adam-1794672787197.jpg',
    'https://i.ibb.co/KcmCxmVT/adam-1794672961574.jpg',
    'https://i.ibb.co/KcmCxmVT/adam-1794672961574.jpg',
    'https://i.ibb.co/3mHgL5jT/adam-1794673028475.jpg',
    'https://i.ibb.co/3mHgL5jT/adam-1794673028475.jpg',
    'https://i.ibb.co/y71p3GY/adam-1794673056517.jpg',
    'https://i.ibb.co/fYKSXv7Y/adam-1794673076475.jpg',
    'https://i.ibb.co/pBVtzt0g/adam-1794673096153.jpg',
    'https://i.ibb.co/twrnRwT0/adam-1794673132211.jpg',
]

const rand = arr => arr[Math.floor(Math.random() * arr.length)]

let handler = m => m

handler.before = async function (m) {
    try {
        if (m.key?.fromMe || !m.text) return false
        if (String(m.sender || '').split('@')[0] !== ONLY_NUMBER) return false
        if (m.text.trim() !== 'بتاعي') return false

        const caption = rand(REPLIES)
        try {
            await this.sendMessage(m.chat, { image: { url: rand(IMAGES) }, caption }, { quoted: m })
        } catch (e) {
            // لو الصورة فشلت يبعت الرد نص بس
            console.error('[بتاعي] الصورة فشلت:', e.message)
            await this.sendMessage(m.chat, { text: caption }, { quoted: m })
        }
    } catch (e) {
        console.error('[بتاعي]', e.message)
    }
    return false
}

export default handler