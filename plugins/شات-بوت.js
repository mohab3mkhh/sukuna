// plugins/ردود-تلقائية.js
// ✧ ردود تلقائية على كلمات معينة (بوت / تست / هلا ...)
//
// سبب العطل القديم: الملف كان بيعمل  import pkg from '@whiskeysockets/baileys'
// وفي النسخة 7 الـ default هو دالة makeWASocket مش الـ exports، فـ generateWAMessageFromContent
// كانت undefined والخطأ بيتبلع في صمت (البوت يسكت). الملف ده مش محتاج الاستيراد ده خالص.
// وكمان شلنا externalAdReply لأنه بيخفي الرسالة على واتساب العادي.

let libButtons = null
try { libButtons = await import('../lib/buttons.js') } catch (e) { console.error('[ردود] lib/buttons.js مش متحمّل:', e.message) }

export const REPLIES = [
    [/^احا$/i, '*خدها و شلحها😆*'],
    [/^فورينا$/i, '*نـعـم انـا هـنـا*'],
    [/^الحمدلله$/i, '*ادام الله حمدك*'],
    [/^(عبيط|يا عبيط|اهبل|غبي)$/i, '*انت يبيبي 🥲❤️*'],
    [/^بوت$/i, '*ارغي عايز ايه*'],
    [/^يب$/i, '*متسترجل يــاض🐦❤*'],
    [/^الاستور$/i, '*مطوري و حبيبي😊*'],
    [/^(بوت خرا|بوت زفت|خرا عليك)$/i, '*بص يسطا لم نفسك بدل ما افــشــخـك😒🗿*'],
    [/^(منور|منوره)$/i, '*بنوري انا 🫠💔*'],
    [/^(بنورك|دا نورك|نورك الاصل|نور نورك)$/i, '*يعم بنوري انا 🫠🐦*'],
    [/^(امزح|بهزر)$/i, '*دمك تقيل متهزرش تاني😒*'],
    [/^في ايه$/i, '*انا معرفش حاجه🙂*'],
    [/^تست$/i, '*موجود عايز فــيـن🗿*'],
    [/^(بتعمل ايه دلوقتي|بتعمل اي)$/i, '*انت مالك😒*'],
    [/^انا جيت$/i, '*امشي تاني*'],
    [/^(حرامي|سارق)$/i, '*تتهم بريء بالسرقة ... فبسكوتك اقتل جهلك*'],
    [/^(ملل|مللل|ملللل|زهق)$/i, '*لانك موجود🗿*'],
    [/^🤖$/i, 'انت بوت عشان ترسل الايموجي ده 🐦'],
    [/^🐦‍⬛$/i, '🐦'],
    [/^ايه$/i, '*خــدتـك عـلـيــه🌝🤣*'],
    [/^نعم$/i, '*حد ناداك 🌚🐦*'],
    [/^(كيفك|شخبارك|علوك|عامل ايه|اخبارك|اي الدنيا)$/i, '*⛄وانــت مـالًــك؟*'],
    [/^🐤$/i, '🐦'],
    [/^(تصبح علي خير|تصبحوا علي خير)$/i, 'وانت من اهل الخير حبيبي✨💜'],
    [/^(ببحبك بوت|حبك|بوت بحبك)$/i, '🙄'],
    [/^🙂$/i, 'بص بعيد🙂'],
    [/^باي$/i, '*مـع الـسـلامـه🐥*'],
    [/^هلا$/i, '*اهـلا كـيـفـك🧸*'],
]

async function sendReply(conn, m, text) {
    // الأول: نفس الشكل القديم (الرد + زرارين) عن طريق lib/buttons.js اللي بيظهر للاتنين
    try {
        if (libButtons?.sendButtons && libButtons?.btn?.reply) {
            await libButtons.sendButtons(conn, m.chat, {
                text,
                footer: '⛩️ SUKUNA BOT ⛩️',
                buttons: [
                    libButtons.btn.reply('⌈🚀╎المطور╎🚀⌋', '.المطور'),
                    libButtons.btn.reply('⌈🧩╎الاوامر╎🧩⌋', '.الاوامر')
                ]
            }, m)
            return
        }
    } catch (e) {
        console.error('[ردود] الأزرار فشلت، هبعت نص عادي:', e.message)
    }
    // احتياطي: نص عادي يظهر على أي واتساب
    await conn.sendMessage(m.chat, { text, contextInfo: global.adReply?.contextInfo }, { quoted: m })
}

let handler = m => m

handler.all = async function (m) {
    try {
        if (m.key?.fromMe) return
        const chat = global.db?.data?.chats?.[m.chat]
        if (!chat || chat.isBanned) return

        const t = (m.text || '').trim()
        if (!t) return true

        for (const [re, reply] of REPLIES) {
            if (re.test(t)) {
                await sendReply(this, m, reply)
                break
            }
        }
    } catch (e) {
        console.error('[ردود] خطأ:', e.message)
    }
    return true
}

export default handler