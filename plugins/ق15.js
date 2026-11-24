import fs from 'fs';

let handler = async (m, { conn }) => {
  let taguser = '@' + m.sender.split("@")[0];

  // قراءة روابط الصور من ملف
  const linksFile = './media-links.txt';
  if (!fs.existsSync(linksFile)) return await m.reply('⚠️ ملف روابط الصور غير موجود.');

  const links = fs.readFileSync(linksFile, 'utf-8').split('\n').filter(Boolean);
  if (!links.length) return await m.reply('⚠️ ملف روابط الصور فارغ.');

  // اختيار صورة عشوائية
  const randomImageUrl = links[Math.floor(Math.random() * links.length)];

  let message = `
╮••─๋︩︪──๋︩︪─═⊐‹﷽›⊏═─๋︩︪──๋︩︪─┈☇
╿↵ مرحــبـا ⌊${taguser}⌉
── • ◈ • ──
*⌝⛩️┊الحماية والمضادات┊⛩️⌞* 
╮─ׅ─๋︩︪─┈─๋︩︪─═⊐‹⛩️›⊏═┈ ─๋︩︪─ ∙ ∙ ⊰ـ
┤─ׅ─ׅ┈ ─๋︩︪──ׅ─ׅ┈ ─๋︩︪─☇ـ
┤┌ ─๋︩︪─✦الحماية☇─˚᳝᳝𖥻
│┊ ۬.͜ـ🔗˖ ⟨antilink☇
│┊ ۬.͜ـ🤖˖ ⟨مضاد_البوتات☇
│┊ ۬.͜ـ🚫˖ ⟨مضاد_تبنيد☇
│┊ ۬.͜ـ🛡️˖ ⟨مضاد_شتايم☇
│┊ ۬.͜ـ💥˖ ⟨مضاد_رياكت☇
┤└─ׅ─ׅ┈ ─๋︩︪──ׅ─ׅ┈ ─๋︩︪☇ـ
╯─ׅ─๋︩︪─═⊐‹⛩️›⊏═┈ ─๋︩︪─⊰ـ  `;

  const emojiReaction = '🛡️';

  try {
    await conn.sendMessage(m.chat, { react: { text: emojiReaction, key: m.key } });

    await conn.sendMessage(m.chat, { 
      image: { url: randomImageUrl },
      caption: message,
      mentions: [m.sender]
    });
  } catch (error) {
    console.error("Error sending message:", error);
    await conn.sendMessage(m.chat, { text: 'حدث خطأ أثناء إرسال الصورة.' });
  }
};

handler.command = /^(ق15)$/i;
handler.exp = 50;
handler.fail = null;

export default handler;