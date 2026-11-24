// plugins/تواصل.js
// ⛩️ تحدث إلى الصانع — بيبعت الرقم كنص فقط (من غير جهات اتصال)

const DEV_NUMBER = '201036547166'          // غيّر الرقم من هنا لو عايز
const DEV_PRETTY = '+20 103 654 7166'

let handler = async (m, { conn }) => {
  await conn.sendMessage(m.chat, {
    text: `╭─「 ⛩️ *تواصل مع المطور* 」
│
│  🧠 *عمو مهاب* — صانع البوت
│
│  📲 *الرقم:* ${DEV_PRETTY}
│  🔗 wa.me/${DEV_NUMBER}
│
│  ✨ *خد وكلم فحلك!*
│  🔧 هيحل أي مشكلة في ثواني
│
╰──────────────`
  }, { quoted: m })
}

handler.help = ['تواصل']
handler.tags = ['main']
handler.command = ['تواصل']

export default handler