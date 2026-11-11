// plugins/menu.js
import { sendButtons } from '../lib/buttons.js'

function clockString(ms) {
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  return [h, m, s].map(v => v.toString().padStart(2, '0')).join(':')
}

const VIDEO_URL = 'https://files.catbox.moe/2bi3iw.mp4'
const CHANNEL_URL = 'https://whatsapp.com/channel/0029VbBilcVAO7RNV5OlOI0j'

const rows = [
  { header: '🎮 الألعاب',          title: '「 مَيْدَانُ الصِّرَاع 」',       id: '.ق1' },
  { header: '⚙️ المشرفين',         title: '「 أَدَوَاتُ الحُكَّام 」',       id: '.ق2' },
  { header: '🧰 الأدوات',          title: '「 تَرْسَانَةُ القُوَّة 」',       id: '.ق3' },
  { header: '⬇️ التحميل',          title: '「 نَهْبُ الملفات 」',            id: '.ق4' },
  { header: '💰 الاقتصاد',         title: '「 خَزِينَةُ اللَّعَنَات 」',      id: '.ق5' },
  { header: '🤖 الذكاء الاصطناعي', title: '「 عَقْلُ الشَّيطَان 」',         id: '.ق6' },
  { header: '😈 التسلية',          title: '「 مَلاهِي الجَحِيم 」',          id: '.ق7' },
  { header: '🕌 الدين',            title: '「 النُّور وَسْط الظَّلام 」',     id: '.ق8' },
  { header: '🖼️ الصور',            title: '「 عَيْنُ المَلِك 」',             id: '.ق11' },
  { header: '👿 المطور',           title: '「 صَانِعُ اللَّعْنَة 」',         id: '.ق12' },
  { header: '🤲 الادعية',          title: 'ادعي الي ربك',                   id: '.ق20' },
  { header: '⚽ الكورة',           title: '「 آلَکْوٌرةّ مًعٌ سِوٌکْوٌنِآ 」',    id: '.ق21' },
  { header: '📋 كل الأوامر',       title: '「 سِجِلُّ القُوَّة كَامِلاً 」',  id: '.كل_الاوامر' },
]

const handler = async (m, { conn }) => {
  try {
    const rtotalreg = Object.keys(global.db.data.users || {}).length
    const now = new Date()
    const week = now.toLocaleDateString('ar-TN', { weekday: 'long' })
    const time = now.toLocaleDateString('ar-TN', { year: 'numeric', month: 'long', day: 'numeric' })
    const uptime = clockString(process.uptime() * 1000)

    const user = global.db.data.users[m.sender] || {}
    const level = user.level || user.exp || user.xp || 0
    const role = user.role || user.rank || 'بَشَرٌ تَافِه'
    const mentionId = m.sender

    await conn.sendMessage(m.chat, { react: { text: '🩸', key: m.key } })

    const menuText = `
┏━━━━━━━━━━━━━━━━━━━━━━┓
   🔱 *S U K U N A  B O T* 🔱
    𝒌𝒊𝒏𝒈 𝒐𝒇 𝒄𝒖𝒓𝒔𝒆𝒔 ⚡️
┗━━━━━━━━━━━━━━━━━━━━━━┛

🩸 *هَهْ…* جِئْتَ تَسْتَدْعِينِي يَا *@${mentionId.split('@')[0]}*؟
  *أَنْتَ تَعْرِفُ ثَمَنَ هَذَا…*

━━━━━━━━━━━━━━━━━━━━━━━

📅 *اليوم* ⟶ ${week}
📆 *التاريخ* ⟶ ${time}
⏱️ *وقت تشغيلي* ⟶ \`${uptime}\`

━━━━━━━━━━━━━━━━━━━━━━━

🎖️ *مستواك* ⟶ ${level}
👑 *رتبتك* ⟶ ${role}
👥 *العبيد المسجّلون* ⟶ ${rtotalreg}

━━━━━━━━━━━━━━━━━━━━━━━
*❝ لا يُوجَدُ عَدُوٌّ لَا أَسْتَطِيعُ سَحْقَهُ…*
*   وَلا طَلَبٌ لا يَأْتِي بِثَمَن ❞*
━━━━━━━━━━━━━━━━━━━━━━━
`.trim()

    const payload = {
      text: menuText,
      footer: '⛩️ SUKUNA BOT ⛩️',
      title: '🩸 SUKUNA BOT',
      mentions: [mentionId],
      quoted: m,
      buttons: [
        {
          list: {
            title: '🩸 اخْتَرْ قِسْمَكَ أَيُّهَا الضَّعِيف',
            sections: [{ title: '👿 مَمَالِكُ سُوكُونَا', rows }],
          },
        },
        { url: CHANNEL_URL, text: '🩸 مَمْلَكَةُ المُطَوِّر' },
        { id: '.تواصل', text: '☠️ تَحَدَّثْ إِلَى الصَّانِع' },
      ],
    }

    try {
      try {
        // مع الفيديو
        await sendButtons(conn, m.chat, { ...payload, video: { url: VIDEO_URL }, gifPlayback: true })
      } catch (e) {
        console.log('[menu] with video failed:', e.message)
        // من غير فيديو
        await sendButtons(conn, m.chat, payload)
      }
    } catch (e) {
      // بديل نصي لو الأزرار فشلت خالص
      console.log('[menu] interactive failed, text fallback:', e.message)
      const list = rows.map(r => `${r.header} ⟶ ${r.id}`).join('\n')
      await conn.sendMessage(
        m.chat,
        { text: `${menuText}\n\n${list}\n\n> ⛩️ SUKUNA BOT ⛩️`, mentions: [mentionId] },
        { quoted: m }
      )
    }
  } catch (err) {
    console.error('[ SUKUNA BOT ] خطأ في القائمة:', err)
    await conn.sendMessage(m.chat, {
      text: '🩸 *حَتَّى مَلِكُ اللَّعَنَات يَوَاجِهُ عَقَبَات…*\n⚠️ حدث خطأ أثناء تحميل القائمة!'
    }, { quoted: m })
  }
}

handler.help = ['menu', 'اوامر']
handler.tags = ['main']
handler.command = ['menu', 'اوامر', 'القائمة']

export default handler