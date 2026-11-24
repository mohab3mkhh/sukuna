// plugins/devContact.js
// زر "🚀 تواصل مع المطور" — بيبعت الرقم كنص فقط (من غير جهات اتصال)

const DEV_NUMBER = '201036547166'
const DEV_PRETTY = '+20 103 654 7166'

const handler = async (m, { conn }) => {
  try {
    if (/^🚀 تواصل مع المطور$/i.test(m.text)) {
      await conn.sendMessage(m.chat, {
        text: `╭─「 ⛩️ *تواصل مع المطور* 」
│
│  📲 *الرقم:* ${DEV_PRETTY}
│  🔗 wa.me/${DEV_NUMBER}
│
╰──────────────`
      }, { quoted: m })
    }
  } catch (err) {
    console.error('[ SUKUNA BOT ] خطأ في التواصل مع المطور:', err)
    await conn.sendMessage(m.chat, { text: '⚠️ حدث خطأ أثناء إرسال رقم المطور!' }, { quoted: m })
  }
}

handler.help = ['🚀 تواصل مع المطور']
handler.tags = ['main']
handler.command = ['🚀 تواصل مع المطور'] // لازم نضيفها للـ esm
handler.rowner = false
handler.limit = false
export default handler