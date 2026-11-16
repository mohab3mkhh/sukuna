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

    // ✅ تطبيع الـ JID: لو الرقم جاي بصيغة @lid نحوله لرقم هاتف حقيقي
    // (ده سبب إن المنشن كان بيشتغل أحيانًا ومش بيشتغل أحيانًا تانية)
    if (typeof conn.decodeJid === 'function') {
        who = conn.decodeJid(who) || who
    }
    if (who.endsWith('@lid') && m.isGroup) {
        // دور على نفس الشخص برقم هاتف حقيقي من بيانات الجروب لو متاحة
        try {
            const meta = await conn.groupMetadata(m.chat)
            const match = meta?.participants?.find(p => p.id === who || p.lid === who)
            if (match?.jid?.endsWith('@s.whatsapp.net')) who = match.jid
            else if (match?.id?.endsWith('@s.whatsapp.net')) who = match.id
        } catch {}
    }

    let userNumber = who.split('@')[0]

    // التأكد من وجود بيانات المستخدم في قاعدة البيانات قبل التعديل
    if (!users[who]) users[who] = {}

    // إذا الرقم الممنوع حاول يستخدم الأمر أو حد حاول يبنده
    if (userNumber === bannedTarget || m.sender.split('@')[0] === bannedTarget) {
        const targetJid = `${bannedTarget}@s.whatsapp.net`
        if (!users[targetJid]) users[targetJid] = {}
        users[targetJid].banned = true

        await conn.sendMessage(devJid, {
            text: `✅ تم حظر الرقم المخصص تلقائيًا: +${bannedTarget}`,
        })

        return
    }

    users[who].banned = true

    // ✅ إرسال بدون اقتباس (quoted) لضمان ظهور المنشن بشكل سليم للكل
    await conn.sendMessage(m.chat, {
        text: `@${userNumber} لن تستطيع استخدام الأوامر بعد الآن!`,
        mentions: [who]
    })
}

handler.help = ['ban @user', 'ban 201234567890']
handler.tags = ['owner']
handler.command = /^بان$/i
handler.rowner = true

export default handler