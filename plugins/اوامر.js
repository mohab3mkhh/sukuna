// plugins/menu.js

function clockString(ms) {
  let h = Math.floor(ms / 3600000);
  let m = Math.floor((ms % 3600000) / 60000);
  let s = Math.floor((ms % 60000) / 1000);
  return [h, m, s].map(v => v.toString().padStart(2, '0')).join(':');
}

import { sendButtons, btn } from '../lib/buttons.js';

const handler = async (m, { conn }) => {
  try {
    let rtotalreg = Object.keys(global.db.data.users || {}).length;
    let now = new Date();
    let week = now.toLocaleDateString('ar-TN', { weekday: 'long' });
    let time = now.toLocaleDateString('ar-TN', { year: 'numeric', month: 'long', day: 'numeric' });
    let uptime = clockString(process.uptime() * 1000);

    let user = global.db.data.users[m.sender] || {};
    let level = user.level || user.exp || user.xp || 0;
    let role  = user.role  || user.rank        || "بَشَرٌ تَافِه";
    let mentionId = m.sender;

    await conn.sendMessage(m.chat, { react: { text: '🩸', key: m.key } });

    const gojoText = `
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
`.trim();

    const sections = [
      {
        title: '👿 مَمَالِكُ سُوكُونَا',
        rows: [
          { header: '🎮 الألعاب',          title: '「 مَيْدَانُ الصِّرَاع 」',         id: '.ق1'  },
          { header: '⚙️ المشرفين',         title: '「 أَدَوَاتُ الحُكَّام 」',        id: '.ق2'  },
          { header: '🧰 الأدوات',          title: '「 تَرْسَانَةُ القُوَّة 」',       id: '.ق3'  },
          { header: '⬇️ التحميل',          title: '「 نَهْبُ الملفات 」',             id: '.ق4'  },
          { header: '💰 الاقتصاد',         title: '「 خَزِينَةُ اللَّعَنَات 」',      id: '.ق5'  },
          { header: '🤖 الذكاء الاصطناعي', title: '「 عَقْلُ الشَّيطَان 」',         id: '.ق6'  },
          { header: '😈 التسلية',          title: '「 مَلاهِي الجَحِيم 」',           id: '.ق7'  },
          { header: '🕌 الدين',            title: '「 النُّور وَسْط الظَّلام 」',     id: '.ق8'  },
          { header: '🖼️ الصور',           title: '「 عَيْنُ المَلِك 」',             id: '.ق11' },
          { header: '👿 المطور',          title: '「 صَانِعُ اللَّعْنَة 」',         id: '.ق12' },
          { header: '🤲 الادعية',         title: 'ادعي الي ربك',                    id: '.ق20' },
          { header: '⚽ الكورة',          title: '「 آلَکْوٌرةّ مًعٌ سِوٌکْوٌنِآ 」',   id: '.ق21' },
          { header: '📋 كل الأوامر',      title: '「 سِجِلُّ القُوَّة كَامِلاً 」',   id: '.كل_الاوامر' }
        ]
      }
    ];

    await sendButtons(conn, m.chat, {
      text: gojoText,
      video: { url: 'https://files.catbox.moe/2bi3iw.mp4' },
      gif: true,
      mentions: [mentionId],
      buttons: [
        btn.list('🩸 اخْتَرْ قِسْمَكَ أَيُّهَا الضَّعِيف', sections),
        btn.url('🩸 مَمْلَكَةُ المُطَوِّر', 'https://whatsapp.com/channel/0029VbBilcVAO7RNV5OlOI0j'),
        btn.reply('☠️ تَحَدَّثْ إِلَى الصَّانِع', '.تواصل')
      ]
    }, m);

  } catch (err) {
    console.error('[ SUKUNA BOT ] خطأ في القائمة:', err);
    await conn.sendMessage(m.chat, {
      text: '🩸 *حَتَّى مَلِكُ اللَّعَنَات يَوَاجِهُ عَقَبَات…*\n⚠️ حدث خطأ أثناء تحميل القائمة!'
    }, { quoted: m });
  }
};

handler.help = ['menu', 'اوامر'];
handler.tags  = ['main'];
handler.command = ['menu', 'اوامر', 'القائمة'];

export default handler;