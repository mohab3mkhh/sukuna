// plugins/mount-people.js

const OWNERS = ['201016855501', '201036547166']

// قاموس الأشخاص — الاسم في الأمر : رقمه
const TARGETS = {
  'دوما':    { jid: '201228356438@s.whatsapp.net',  img: 'https://i.ibb.co/dwPf4VBX/upload-1778018221395.jpg' },
  'داما':    { jid: '201007901673@s.whatsapp.net',  img: 'https://i.ibb.co/dwPf4VBX/upload-1778018221395.jpg' },
  'مارك':    { jid: '201277193891@s.whatsapp.net',  img: 'https://i.ibb.co/dwPf4VBX/upload-1778018221395.jpg' },
  'ياسين':   { jid: '201066036607@s.whatsapp.net',  img: 'https://i.ibb.co/dwPf4VBX/upload-1778018221395.jpg' },
  'توني':    { jid: '201212245715@s.whatsapp.net',  img: 'https://i.ibb.co/dwPf4VBX/upload-1778018221395.jpg' },
  'نجم':     { jid: '201031430824@s.whatsapp.net',  img: 'https://i.ibb.co/dwPf4VBX/upload-1778018221395.jpg' },
  'ادم':     { jid: '201150572826@s.whatsapp.net',  img: 'https://i.ibb.co/dwPf4VBX/upload-1778018221395.jpg' },
  'مهند':    { jid: '201096470209@s.whatsapp.net',  img: 'https://i.ibb.co/dwPf4VBX/upload-1778018221395.jpg' },
  'ساسكي':   { jid: '201037418972@s.whatsapp.net',  img: 'https://i.ibb.co/dwPf4VBX/upload-1778018221395.jpg' },
  'ميزو':    { jid: '2348096265019@s.whatsapp.net',  img: 'https://i.ibb.co/dwPf4VBX/upload-1778018221395.jpg' },

  // ✅ شركة وي (رقم دعم WE) — بيتخطى فحص العضوية دايمًا
  'شركة وي': { jid: '201555000111@s.whatsapp.net', img: 'https://i.ibb.co/dwPf4VBX/upload-1778018221395.jpg', {skipCheck: true },

const handler = async (m, { conn }) => {
  try {
    const senderNum = m.sender.replace(/@.+/, '').replace(/\D/g, '')
    const isOwner = OWNERS.some(o => senderNum.slice(-9) === o.slice(-9))

    // لو مش المطور
    if (!isOwner) {
      await conn.sendMessage(m.chat, {
        text: `
╔══✦ 🚫 ✦══╗
  *مش من حقك!*
╚══✦ 🚫 ✦══╝

😂 انت مبتعرفش لسه!
اطلب من *مهاب عمك* هو اللي يركب 🫵

❖──────────────────❖
        `.trim()
      }, { quoted: m })
      return
    }

    if (!m.isGroup) return m.reply('❌ هذا الأمر للجروبات فقط!')

    // استخراج اسم الشخص من الأمر
    const cmdText = m.text?.trim() || ''
    const match = cmdText.match(/^[.!#/\\]اركب[_ ]?(.+)$/i)
    const targetName = match?.[1]?.trim()

    if (!targetName || !TARGETS[targetName]) {
      const names = Object.keys(TARGETS).join(' | ')
      return conn.sendMessage(m.chat, { text:`❌ اسم غير معروف!\nالأسماء المتاحة: ${names}`)
    }

    const { jid: targetJid, img, skipCheck } = TARGETS[targetName]
    const hasJid = !!targetJid
    const targetNum = hasJid ? targetJid.split('@')[0] : null
    const mentions = hasJid ? [targetJid] : []
    // النص اللي هيتحط بدل الـ mention لو مفيش رقم
    const targetLabel = hasJid ? `@${targetNum}` : `*${targetName}*`

    let exists = true
    if (hasJid) {
      // التحقق من وجود الشخص في الجروب (بس لو عنده رقم فعلي)
      const metadata = await conn.groupMetadata(m.chat)
      const last9 = targetNum.slice(-9)
      const inGroup = metadata.participants.some(p => {
        const num = p.id.replace(/@.+/, '').replace(/\D/g, '')
        return num.slice(-9) === last9 || p.id === targetJid
      })

      exists = inGroup
      if (!exists) {
        try {
          const [res] = await conn.onWhatsApp(targetJid)
          exists = !!res?.exists
        } catch {}
      }
    }

    if (!exists) {
      const msgOpts = {
        text: `
╔══✦ 🚫 ✦══╗
  *${targetName} مش هنا!*
╚══✦ 🚫 ✦══╝

⚠️ *${targetLabel}* غير موجود في هذا الجروب!
لا يمكن تنفيذ أمر الركوب.

❖──────────────────❖
        `.trim(),
        mentions
      }
      if (img) {
        await conn.sendMessage(m.chat, { image: { url: img }, caption: msgOpts.text, mentions }, { quoted: m })
      } else {
        await conn.sendMessage(m.chat, msgOpts, { quoted: m })
      }
      return
    }

    // رسالة جاري الركوب
    const ridingMsg = `
╔══✦ ⚡️ ✦══╗
  *جاري الركوب...*
╚══✦ ⚡️ ✦══╝

🎯 *${targetLabel}* يتم ركوب ${targetName} الآن!
⏳ يرجى الانتظار...

❖──────────────────❖
    `.trim()

    if (img) {
      await conn.sendMessage(m.chat, { image: { url: img }, caption: ridingMsg, mentions }, { quoted: m })
    } else {
      await conn.sendMessage(m.chat, { text: ridingMsg, mentions }, { quoted: m })
    }

    await new Promise(r => setTimeout(r, 2000))

    // رسالة تم الركوب
    const doneMsg = `
╔══✦ ✅ ✦══╗
  *تم الركوب بنجاح!*
╚══✦ ✅ ✦══╝

🏆 *${targetLabel}* تم ركوب ${targetName} بنجاح! 🎉
⚡️ الركوب اكتمل بدون أي مشاكل!

❖──────────────────❖
    `.trim()

    if (img) {
      await conn.sendMessage(m.chat, { image: { url: img }, caption: doneMsg, mentions }, { quoted: m })
    } else {
      await conn.sendMessage(m.chat, { text: doneMsg, mentions }, { quoted: m })
    }

  } catch (err) {
    console.error('[ mount-people ] خطأ:', err?.message)
    await conn.sendMessage(m.chat, { text: '⚠️ حدث خطأ!' }, { quoted: m })
  }
}

handler.command = /^اركب[_ ]?.+$/i
handler.group = true

export default handler