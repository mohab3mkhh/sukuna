let handler = async (m, { conn, text, usedPrefix, command, args }) => {
    let users = global.db.data.users

    const bannedTarget = '212624732487'
    const devJid = '201036547166@s.whatsapp.net'

    // ══════════════════════════════════════════
    // تحديد الشخص المراد حظره
    // ══════════════════════════════════════════
    let who
    if (m.mentionedJid && m.mentionedJid[0]) {
        who = m.mentionedJid[0]
    } else if (m.quoted?.sender) {
        who = m.quoted.sender
    } else if (args[0]) {
        let number = args[0].replace(/[^0-9]/g, '')
        if (!number) throw '□ أدخل رقمًا صالحًا أو منشن'
        who = number + '@s.whatsapp.net'
    } else if (m.isGroup) {
        throw '□ منشن الشخص أو رد على رسالته'
    } else {
        who = m.chat
    }

    if (!who) throw '□ منشن الشخص أو أدخل رقمه'

    // ══════════════════════════════════════════
    // جمع كل الصيغ الممكنة للـ JID
    // ══════════════════════════════════════════
    const allIds = new Set([who])

    // decode
    if (typeof conn.decodeJid === 'function') {
        const d = conn.decodeJid(who)
        if (d) allIds.add(d)
    }

    // لو lid — حوّله لرقم حقيقي
    if (String(who).includes('@lid')) {
        // طريقة 1: lidMapping
        try {
            const pn = await conn.signalRepository?.lidMapping?.getPNForLID?.(who)
            if (pn) allIds.add(pn)
        } catch {}

        // طريقة 2: participants في الجروب
        if (m.isGroup) {
            try {
                const meta = await conn.groupMetadata(m.chat)
                const p = meta?.participants?.find(x =>
                    x.id === who || x.lid === who ||
                    String(x.id).replace(/:[0-9]+@/, '@') === who ||
                    String(x.lid).replace(/:[0-9]+@/, '@') === who
                )
                if (p?.phoneNumber) allIds.add(p.phoneNumber)
                if (p?.jid) allIds.add(p.jid)
                if (p?.id)  allIds.add(p.id)
                if (p?.lid) allIds.add(p.lid)
            } catch {}
        }
    }

    // أضف صيغتي @s.whatsapp.net و @lid لكل رقم موجود
    for (const id of [...allIds]) {
        const num = String(id).split('@')[0].replace(/[^0-9]/g, '')
        if (num) {
            allIds.add(num + '@s.whatsapp.net')
            allIds.add(num + '@lid')
        }
        // بدون device suffix
        const clean = String(id).replace(/:[0-9]+@/, '@')
        if (clean !== id) allIds.add(clean)
    }

    const rawNum = String(who).split('@')[0].replace(/[^0-9]/g, '')

    // ══════════════════════════════════════════
    // حماية: الرقم الممنوع لا يقدر يستخدم الأمر
    // ══════════════════════════════════════════
    const senderNum = m.sender.split('@')[0].replace(/[^0-9]/g, '')
    if ([...allIds].some(id => id.split('@')[0].replace(/[^0-9]/g, '') === bannedTarget) || senderNum === bannedTarget) {
        const t = `${bannedTarget}@s.whatsapp.net`
        if (!users[t]) users[t] = {}
        users[t].banned = true
        await conn.sendMessage(devJid, { text: `✅ تم حظر الرقم المخصص تلقائيًا: +${bannedTarget}` })
        return
    }

    // ══════════════════════════════════════════
    // الحظر على كل الصيغ
    // ══════════════════════════════════════════
    for (const id of allIds) {
        if (!users[id]) users[id] = {}
        users[id].banned = true
    }

    await conn.sendMessage(m.chat, {
        text: `⛔ @${rawNum} تم حظرك من استخدام البوت!`,
        mentions: [who]
    })
}

handler.help = ['بان @شخص', 'بان 201234567890']
handler.tags = ['owner']
handler.command = /^بان$/i
handler.rowner = true

export default handler