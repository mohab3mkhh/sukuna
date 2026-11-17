// plugins/بتاعي.js
// ✧ لما رقم واحد بس (201036547166) يكتب "بتاعي" البوت يرد عليه بصورة عشوائية + رد عشوائي (في الكابشن)

import { randomInt } from 'crypto'

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

// كل صورة ليها نفس الفرصة بالظبط (من غير تكرار في القايمة)
const IMAGES = [
    'https://i.ibb.co/BVjhGRD5/adam-1794932868668.jpg',
    'https://i.ibb.co/xqnTFB4P/adam-1794932266261.jpg',
    'https://i.ibb.co/S4JCQXJR/adam-1794932291994.jpg',
    'https://i.ibb.co/BKF3gVzd/adam-1794932836576.jpg',
    'https://i.ibb.co/G4n3zBkF/adam-1794932841126.jpg',
    'https://i.ibb.co/fddyMLWj/adam-1794932846692.jpg',
    'https://i.ibb.co/7tPG8Bxh/adam-1794932851408.jpg',
    'https://i.ibb.co/kbvWcWW/adam-1794932857287.jpg',
    'https://i.ibb.co/4nzcxp77/adam-1794932879577.jpg',
    'https://i.ibb.co/zHV0f2D2/adam-1794933157974.jpg',
    'https://i.ibb.co/Q3XB5pH0/adam-1794933327377.jpg',
    'https://i.ibb.co/LDpC8tk5/adam-1794934180561.jpg',
    'https://i.ibb.co/r2GDNf7Y/adam-1794934236584.jpg',
    'https://i.ibb.co/kgvK1T92/adam-1794934284339.jpg',
    'https://i.ibb.co/23xjJyNN/adam-1794934331915.jpg',
    'https://i.ibb.co/x8DN1wB7/adam-1794934459059.jpg',
    'https://i.ibb.co/yc9Db609/adam-1794934581202.jpg',
    'https://i.ibb.co/kVh0049D/adam-1794934644363.jpg',
    'https://i.ibb.co/DN1T4VS/adam-1794934702132.jpg',
    'https://i.ibb.co/27DXJ9z3/adam-1794934854795.jpg',
    'https://i.ibb.co/WvP17PLc/adam-1794934911856.jpg',
    'https://i.ibb.co/YzbfYcd/adam-1794934959163.jpg',
    'https://i.ibb.co/cKXqpJtY/adam-1794934987207.jpg',
]

// اختيار عشوائي حقيقي (crypto) — الصورة والرد مستقلين عن بعض
const rand = arr => arr[randomInt(arr.length)]

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