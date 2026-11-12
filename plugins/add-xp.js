// plugins/add-xp.js
// أمر إضافة XP لشخص معين (للمالك فقط)

const OWNERS = [
  '201016855501@s.whatsapp.net', // رقمك أنت
  '201036547166@s.whatsapp.net', // الرقم الجديد
]

let handler = async (m, { conn, text, usedPrefix, command }) => {
  // ✅ التأكد إن الأمر من أحد المالكين فقط
  if (!OWNERS.includes(m.sender)) {
    return m.reply('❌ *للأسف، هذا الأمر للمالك فقط.*')
  }

  // ✅ التأكد من وجود رقم
  if (!text) {
    return m.reply(
      `📌 *طريقة الاستخدام:*\n\n` +
      `${usedPrefix}${command} <الكمية> <@منشن>\n\n` +
      `📌 *مثال:*\n` +
      `${usedPrefix}${command} 5000 @مهاب`
    )
  }

  // ✅ استخراج الكمية والمنشن
  let parts = text.trim().split(/\s+/)
  let amount = parseInt(parts[0])
  
  if (isNaN(amount) || amount <= 0) {
    return m.reply('❌ *ادخل كمية صحيحة (رقم أكبر من 0)*')
  }

  // ✅ تحديد الشخص المستهدف
  let who = null
  
  // الحالة 1: منشن
  if (m.mentionedJid && m.mentionedJid.length > 0) {
    who = m.mentionedJid[0]
  }
  // الحالة 2: رد على رسالة شخص
  else if (m.quoted) {
    who = m.quoted.sender
  }
  // الحالة 3: لو مفيش منشن ولا رد، يضيف لنفسه
  else {
    who = m.sender
  }

  // ✅ التأكد من وجود المستخدم في قاعدة البيانات
  if (!global.db.data.users[who]) {
    global.db.data.users[who] = { exp: 0, lastrob: 0 }
  }

  // ✅ إضافة الـ XP
  global.db.data.users[who].exp = (global.db.data.users[who].exp || 0) + amount

  // ✅ جلب اسم الشخص
  let name = await conn.getName(who) || who.split('@')[0]

  await m.react('✅')
  await m.reply(
    `✅ *تمت الإضافة بنجاح!*\n\n` +
    `👤 *المستخدم:* ${name}\n` +
    `➕ *تم إضافة:* ${amount} XP\n` +
    `📊 *إجمالي XP:* ${global.db.data.users[who].exp.toLocaleString()}`
  )
}

handler.help = ['اضف <الكمية> <@منشن>']
handler.tags = ['owner']
handler.command = /^(اضف|addxp|xp\+)$/i

export default handler