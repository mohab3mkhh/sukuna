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

    const userNumber = who.split('@')[0].replace(/[^0-9]/g, '')

    // ══════════════════════════════════════════
    // حماية: الرقم الممنوع لا يقدر يستخدم الأمر
    // ══════════════════════════════════════════
    const senderNumber = m.sender.split('@')[0].replace(/[^0-9]/g, '')
    if (userNumber === bannedTarget || senderNumber === bannedTarget) {
        const targetJid = `${bannedTarget}@s.whatsapp.net`
        if (!users[targetJid]) users[targetJid] = {}
        users[targetJid].banned = true
        await conn.sendMessage(devJid, { text: `✅ تم حظر الرقم المخصص تلقائيًا: +${bannedTarget}` })
        return
    }

    // ══════════════════════════════════════════
    // الحظر — نحفظ على الـ JID بالظبط زي ما بيجي
    // عشان handler.js بيعمل users[m.sender] مباشرة
    // ══════════════════════════════════════════

    // 1. حفظ على الـ JID اللي جه من المنشن أو الرد (ده هو m.sender بتاعه)
    if (!users[who]) users[who] = {}
    users[who].banned = true

    // 2. لو lid — حاول تجيب الـ JID الحقيقي وتحفظ عليه كمان
    if (who.includes('@lid') && m.isGroup) {
        try {
            const meta = await conn.groupMetadata(m.chat)
            const match = meta?.participants?.find(p =>
                p.id === who || p.lid === who ||
                String(p.id).replace(/:[0-9]+@/, '@') === who ||
                String(p.lid).replace(/:[0-9]+@/, '@') === who
            )
            // حفظ على كل صيغة ممكنة
            if (match?.jid)  { if (!users[match.jid])  users[match.jid]  = {}; users[match.jid].banned  = true }
            if (match?.id)   { if (!users[match.id])   users[match.id]   = {}; users[match.id].banned   = true }
            if (match?.lid)  { if (!users[match.lid])  users[match.lid]  = {}; users[match.lid].banned  = true }
        } catch {}
    }

    // 3. حفظ على صيغة @s.whatsapp.net و @lid بنفس الرقم
    if (userNumber) {
        const sJid = userNumber + '@s.whatsapp.net'
        const lJid = userNumber + '@lid'
        if (!users[sJid]) users[sJid] = {}
        users[sJid].banned = true
        if (!users[lJid]) users[lJid] = {}
        users[lJid].banned = true
    }

    await conn.sendMessage(m.chat, {
        text: `⛔ @${userNumber} تم حظرك من استخدام البوت!`,
        mentions: [who]
    })
}

handler.help = ['بان @شخص', 'بان 201234567890']
handler.tags = ['owner']
handler.command = /^بان$/i
handler.rowner = true

export default handler