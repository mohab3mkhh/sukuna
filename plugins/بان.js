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
    // جمع كل صيغ الـ JID الممكنة
    // ══════════════════════════════════════════
    const allIds = new Set()
    allIds.add(who)

    // decoded
    if (typeof conn.decodeJid === 'function') {
        const decoded = conn.decodeJid(who)
        if (decoded) allIds.add(decoded)
    }

    // لو lid — جيب الـ jid الحقيقي من الجروب
    if (who.includes('@lid') && m.isGroup) {
        try {
            const meta = await conn.groupMetadata(m.chat)
            const match = meta?.participants?.find(p =>
                p.id === who || p.lid === who ||
                String(p.id).replace(/:[0-9]+@/, '@') === who ||
                String(p.lid).replace(/:[0-9]+@/, '@') === who
            )
            if (match?.jid) allIds.add(match.jid)
            if (match?.id)  allIds.add(match.id)
            if (match?.lid) allIds.add(match.lid)
        } catch {}
    }

    // أضف الصيغتين: @s.whatsapp.net و @lid بنفس الرقم
    const rawNum = who.split('@')[0].replace(/[^0-9]/g, '')
    if (rawNum) {
        allIds.add(rawNum + '@s.whatsapp.net')
        allIds.add(rawNum + '@lid')
    }

    // أضف النسخة بدون device suffix مثل :7@
    for (const id of [...allIds]) {
        const clean = String(id).replace(/:[0-9]+@/, '@')
        if (clean !== id) allIds.add(clean)
    }

    const displayWho = who
    const userNumber = rawNum || who.split('@')[0]

    // ══════════════════════════════════════════
    // حماية: الرقم الممنوع لا يقدر يستخدم الأمر
    // ══════════════════════════════════════════
    const senderNumber = m.sender.split('@')[0].replace(/[^0-9]/g, '')
    if ([...allIds].some(id => id.split('@')[0].replace(/[^0-9]/g, '') === bannedTarget) || senderNumber === bannedTarget) {
        const targetJid = `${bannedTarget}@s.whatsapp.net`
        if (!users[targetJid]) users[targetJid] = {}
        users[targetJid].banned = true
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
        text: `⛔ @${userNumber} تم حظرك من استخدام البوت!`,
        mentions: [displayWho]
    })
}

handler.help = ['بان @شخص', 'بان 201234567890']
handler.tags = ['owner']
handler.command = /^بان$/i
handler.rowner = true

export default handler