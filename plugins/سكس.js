/**
 * plugins/سكس.js
 * أمر تجريبي .هاها - يعرض قائمة مزخرفة للمطور فقط
 */

const ITEMS = [
    'Black',
    'Bottomless',
    'Boobs',
    'Anal',
    'Ass',
    'sixtynine',
    'Bdsm',
    'Collared',
    'Cum',
    'Cumsluts',
    'Dom',
    'Dp',
    'Fuck',
    'Easter',
    'Finger',
    'Feet',
    'Futa',
    'Gay',
    'Group18',
    'Hentai',
    'Hentaisfm',
    'Kiss',
    'Lick',
    'Pegged',
    'Phgif',
    'Puffies',
    'Pussy',
    'Suck',
    'Tattoo',
    'Xnxx',
    'Xnxxdl'
]

function buildMenu(senderJid) {
    const tagNum = senderJid ? senderJid.split('@')[0] : 'owner'
    const lines = ITEMS.map(item => `│ ◈ ⦓ *${item}* ⦔`).join('\n')

    return [
        `╔══❖•ೋ° °ೋ•❖══╗`,
        `   ⚡ *أهلاً بك يا @${tagNum}* ⚡`,
        `╚══❖•ೋ° °ೋ•❖══╝`,
        ``,
        `╭─── • ◈ • ───╮`,
        `   🧩 *قـائـمـة الـعـنـاصـر*`,
        `╰─── • ◈ • ───╯`,
        `┌──────────────`,
        lines,
        `└──────────────`,
        ``,
        `✦ *ملاحظة:* قائمة خاصة بالمطور فقط 🔥`
    ].join('\n')
}

let handler = async (m, { conn, isROwner, isOwner }) => {
    if (!isROwner && !isOwner) {
        return conn.reply(m.chat, 'عيب يحبيبي دة للمطور بس', m)
    }

    const menuText = buildMenu(m.sender)

    await conn.sendMessage(
        m.chat,
        {
            text: menuText,
            mentions: [m.sender]
        },
        { quoted: m }
    )
}

handler.help = ['سكس']
handler.tags = ['owner']
handler.command = /^سكس$/i
handler.owner = true

export default handler