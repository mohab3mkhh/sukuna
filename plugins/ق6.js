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
*⌝⛩️┊قــســم الـAI┊⛩️⌞* 
╮─ׅ─๋︩︪─┈─๋︩︪─═⊐‹⛩️›⊏═┈ ─๋︩︪─ ∙ ∙ ⊰ـ
┤─ׅ─ׅ┈ ─๋︩︪──ׅ─ׅ┈ ─๋︩︪─☇ـ
┤┌─๋︩︪──ׅ─ׅ┈ ─๋︩︪─›
│┊ ۬.͜ـ💠˖ ⟨كيلوا☇ 
│┊ ۬.͜ـ👤˖ ⟨ليفاي☇
│┊ ۬.͜ـ👾˖ ⟨الستور☇
│┊ ۬.͜ـ⛩️˖ ⟨ميكو☇
│┊ ۬.͜ـ☠️˖ ⟨سمسم☇
│┊ ۬.͜ـ🔹️˖ ⟨ليفاي☇
│┊ ۬.͜ـ⛩️˖ ⟨فكك☇
│┊ ۬.͜ـ⚜️˖ ⟨دليل☇
│┊ ۬.͜ـ👾˖ ⟨مبرمج☇
│┊ ۬.͜ـ🚀˖ ⟨ايلون☇
│┊ ۬.͜ـ⚕️˖ ⟨زورو☇
│┊ ۬.͜ـ💠˖ ⟨لوفي☇
│┊ ۬.͜ـ❓️˖ ⟨ايرين☇
│┊ ۬.͜ـ❤️˖ ⟨جبتي☇
│┊ ۬.͜ـ💖˖ ⟨مريم☇
| |⛩️ سكونا⛩️
| |♾️سوكونا♾️
| |🥊ايتادوري🥊
| |☠️يوتا☠️
| |💖نوبارا💖
| |😈كافكا😈
| |⚡️ايزن⚡️
| |👑غوكو👑
│┊ ۬.͜ـ💎˖ ⟨جيميني☇
│┊ ۬.͜ـ🐋˖ ⟨ديب2☇
│┊ ۬.͜ـ🤖˖ ⟨ai☇
│┊ ۬.͜ـ💬˖ ⟨شات☇
│┊ ۬.͜ـ🎙️˖ ⟨فويس☇
│┊ ۬.͜ـ☁️˖ ⟨كلاودي☇
│┊ ۬.͜ـ🦙˖ ⟨ليما☇
┤└─ׅ─ׅ┈ ─๋︩︪──ׅ─ׅ┈ ─๋︩︪☇ـ
╯─ׅ ─๋︩︪─┈ ─๋︩︪─═⊐‹⛩️›⊏═┈ ─๋︩︪─ ∙ ∙ ⊰ـ `;

  const emojiReaction = '🤖';

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

handler.command = /^(ق6)$/i;
handler.exp = 50;
handler.fail = null;

export default handler;