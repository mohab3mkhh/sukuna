let handler = async (m, { conn, text, usedPrefix, command, args }) => {
    let who
    let users = global.db.data.users

    // تعريف الرقم الممنوع والمطور
    const bannedTarget = '212624732487'
    const devJid = '201036547166@s.whatsapp.net' // ✅ رقمك انت المطور

    // إذا تم تحديد رقم يدويًا أو منشن أو اقتباس
    if (args[0]) {
        let number = args[0].replace(/[^0-9]/g, '') // تنظيف الرقم
        if (!number) throw '□ أدخل رقمًا صالحًا أو منشن'
        who = number + '@s.whatsapp.net'
    } else if (m.isGroup) {
        who = m.mentionedJid[0] ? m.mentionedJid[0] : m.quoted ? m.quoted.sender : null
    } else {
        who = m.chat
    }

    if (!who) throw `□ منشن الشخص أو أدخل رقمه`

    // ✅ نجمع كل الصيغ الممكنة لنفس الشخص (الأصلية + المطبّعة)
    // عشان الحظر يتمسك مهما كانت الصيغة اللي بيتفحص بيها في باقي البوت
    const allIds = new Set([who])

    let displayWho = who // للمنشن في الرسالة، نفضّل رقم هاتف حقيقي لو لقيناه

    if (typeof conn.decodeJid === 'function') {
        const decoded = conn.decodeJid(who)
        if (decoded) { allIds.add(decoded); displayWho = decoded }
    }

    if (who.endsWith('@lid') && m.isGroup) {
        try {
            const meta = await conn.groupMetadata(m.chat)
            const match = meta?.participants?.find(p => p.id === who || p.lid === who)
            if (match?.jid) { allIds.add(match.jid); displayWho = match.jid }
            if (match?.id) allIds.add(match.id)
        } catch {}
    }

    let userNumber = displayWho.split('@')[0]

    // إذا الرقم الممنوع حاول يستخدم الأمر أو حد حاول يبنده
    const senderNumber = m.sender.split('@')[0]
    if ([...allIds].some(id => id.split('@')[0] === bannedTarget) || senderNumber === bannedTarget) {
        const targetJid = `${bannedTarget}@s.whatsapp.net`
        if (!users[targetJid]) users[targetJid] = {}
        users[targetJid].banned = true

        await conn.sendMessage(devJid, {
            text: `✅ تم حظر الرقم المخصص تلقائيًا: +${bannedTarget}`,
        })

        return
    }

    // ✅ نحظر على كل الصيغ مع بعض
    for (const id of allIds) {
        if (!users[id]) users[id] = {}
        users[id].banned = true
    }

    await conn.sendMessage(m.chat, {
        text: `@${userNumber} لن تستطيع استخدام الأوامر بعد الآن!`,
        mentions: [displayWho]
    })
}

handler.help = ['ban @user', 'ban 201234567890']
handler.tags = ['owner']
handler.command = /^بان$/i
handler.rowner = true

export default handler