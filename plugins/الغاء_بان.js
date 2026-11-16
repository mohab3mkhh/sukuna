let handler = async (m, { conn, text, usedPrefix, command, args }) => {
    let users = global.db.data.users

    // ══════════════════════════════════════════
    // تحديد الشخص
    // ══════════════════════════════════════════
    let who
    if (m.mentionedJid?.[0]) {
        who = m.mentionedJid[0]
    } else if (m.quoted?.sender) {
        who = m.quoted.sender
    } else if (args[0]) {
        let number = args[0].replace(/[^0-9]/g, '')
        if (!number) throw '❒ أدخل رقمًا صالحًا أو منشن'
        who = number + '@s.whatsapp.net'
    } else if (!m.isGroup) {
        who = m.chat
    } else {
        throw '❒ منشن الشخص أو رد على رسالته'
    }

    if (!who) throw '❒ منشن الشخص لفك البان'

    // ══════════════════════════════════════════
    // جمع كل صيغ الـ JID
    // ══════════════════════════════════════════
    const allIds = new Set([who])

    if (typeof conn.decodeJid === 'function') {
        const d = conn.decodeJid(who)
        if (d) allIds.add(d)
    }

    // لو lid — حوّله لرقم حقيقي
    if (String(who).includes('@lid')) {
        try {
            const pn = await conn.signalRepository?.lidMapping?.getPNForLID?.(who)
            if (pn) allIds.add(pn)
        } catch {}

        if (m.isGroup) {
            try {
                const meta = await conn.groupMetadata(m.chat)
                const p = meta?.participants?.find(x =>
                    x.id === who || x.lid === who ||
                    String(x.id).replace(/:[0-9]+@/, '@') === who ||
                    String(x.lid).replace(/:[0-9]+@/, '@') === who
                )
                if (p?.jid) allIds.add(p.jid)
                if (p?.id)  allIds.add(p.id)
                if (p?.lid) allIds.add(p.lid)
            } catch {}
        }
    }

    // أضف صيغتي @s.whatsapp.net و @lid
    for (const id of [...allIds]) {
        const num = String(id).split('@')[0].replace(/[^0-9]/g, '')
        if (num) {
            allIds.add(num + '@s.whatsapp.net')
            allIds.add(num + '@lid')
        }
        const clean = String(id).replace(/:[0-9]+@/, '@')
        if (clean !== id) allIds.add(clean)
    }

    const rawNum = String(who).split('@')[0].replace(/[^0-9]/g, '')

    // ══════════════════════════════════════════
    // فك البان على كل الصيغ
    // ══════════════════════════════════════════
    for (const id of allIds) {
        if (users[id]) users[id].banned = false
    }

    await conn.sendMessage(m.chat, {
        text: `✅ @${rawNum} تم رفع الحظر عنك!`,
        mentions: [who]
    }, { quoted: m })
}

handler.help = ['رفع-البان @شخص']
handler.tags = ['owner']
handler.command = /^(الغاء_البان|بانفك|رفع-البان|رفع_البان)$/i
handler.rowner = true

export default handler