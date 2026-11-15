// plugins/getpp.js
// يشتغل مع: منشن / رد على رسالة / رقم / ولو مفيش حاجة يجيب صورتك انت

const numOf = (jid) => String(jid || '').split('@')[0].split(':')[0]

// يحوّل الرقم المكتوب لصيغة دولية (يدعم 01xxxxxxxxx المصري)
function normalizeNumber(text) {
    let n = String(text || '').replace(/\D/g, '')
    if (/^01\d{9}$/.test(n)) n = '20' + n.slice(1)
    else if (/^00\d+$/.test(n)) n = n.slice(2)
    return n.length >= 8 ? n : ''
}

// كل الصيغ الممكنة للشخص (جروبات Baileys 7 ساعات تبعت LID بدل الرقم)
async function candidatesFor(conn, m, jid) {
    const list = [jid]
    try {
        if (jid.endsWith('@lid')) {
            const map = conn.signalRepository?.lidMapping
            const pn = await map?.getPNForLID?.(jid)
            if (pn) list.push(pn)

            if (m.isGroup) {
                const meta = await conn.groupMetadata(m.chat)
                const p = meta?.participants?.find(x => x.id === jid || x.lid === jid)
                const pn2 = p?.phoneNumber || p?.jid
                if (pn2) list.push(pn2)
            }
        }
    } catch {}
    return [...new Set(list.filter(Boolean))]
}

async function getPicture(conn, jids) {
    for (const j of jids) {
        for (const type of ['image', 'preview']) {
            try {
                const url = await conn.profilePictureUrl(j, type)
                if (url) return url
            } catch {}
        }
    }
    return null
}

const handler = async (m, { conn, text, usedPrefix, command }) => {
    const decode = (j) => (conn.decodeJid ? conn.decodeJid(j) : j)
    let who = null
    let viaNumber = false

    // 1) منشن
    const mentioned = m.mentionedJid?.[0] || m.msg?.contextInfo?.mentionedJid?.[0]
    if (mentioned) who = decode(mentioned)

    // 2) رد على رسالة
    if (!who && m.quoted) {
        const q = m.quoted
        who = decode(q.sender || q.participant || q.key?.participant || q.key?.remoteJid)
    }

    // 3) رقم مكتوب
    if (!who && text) {
        const n = normalizeNumber(text)
        if (n) { who = n + '@s.whatsapp.net'; viaNumber = true }
    }

    // 4) مفيش حاجة: صورتك انت
    if (!who) who = decode(m.sender)

    if (!who) {
        return m.reply(`❌ رُد على شخص أو منشنه أو اكتب رقمه\nمثال: ${usedPrefix}${command} 201xxxxxxxxx`)
    }

    // التأكد إن الرقم على واتساب (للأرقام المكتوبة بس، المنشن والرد أكيد موجودين)
    if (viaNumber) {
        try {
            const res = await conn.onWhatsApp(who)
            const found = Array.isArray(res) ? res[0] : null
            if (!found?.exists) return m.reply('❌ الرقم ده مش على واتساب!')
            who = found.jid || who
        } catch {}
    }

    const jids = await candidatesFor(conn, m, who)
    const url = await getPicture(conn, jids)
    const tag = `@${numOf(who)}`

    if (!url) {
        return conn.sendMessage(m.chat, {
            text: `⚠️ *${tag}* مش عنده صورة بروفايل أو مخفياها`,
            mentions: [who]
        }, { quoted: m })
    }

    await conn.sendMessage(m.chat, {
        image: { url },
        caption: `📸 صورة بروفايل *${tag}*`,
        mentions: [who]
    }, { quoted: m })
}

handler.help = ['بروفايل']
handler.tags = ['tools']
handler.command = /^(بروفايل|pp|صورة)$/i

export default handler