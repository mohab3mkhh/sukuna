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
*⌝♾️┊قــســم الادوات┊👾⌞* 
╮─ׅ─๋︩︪─┈─๋︩︪─═⊐‹⛩️›⊏═┈ ─๋︩︪─ ∙ ∙ ⊰ـ
┤─ׅ─ׅ┈ ─๋︩︪──ׅ─ׅ┈ ─๋︩︪─☇ـ
┤┌ ─๋︩︪─✦الادوات─˚᳝᳝𖥻
│┊ ۬.͜ـ⛩️˖ ⟨لرابط☇ 
│┊ ۬.͜ـ⚡️˖ ⟨لصوت☇
│┊ ۬.͜ـ▶️˖ ⟨لفيديو☇
│┊ ۬.͜ـ💠˖ ⟨لصوره☇
│┊ ۬.͜ـ⚜️˖ ⟨ستيك☇
│┊ ۬.͜ـ⛩️˖ ⟨تحسين☇
│┊ ۬.͜ـ👾˖ ⟨تعديل☇
│┊ ۬.͜ـ🚀˖ ⟨كود☇
│┊ ۬.͜ـ👤˖ ⟨حقوق☇
│┊ ۬.͜ـ🌀˖ ⟨اختصار☇
│┊ ۬.͜ـ♾️˖ ⟨ترجم☇
│┊ ۬.͜ـ💖˖ ⟨رسم☇
│┊ ۬.͜ـ⏸️˖ ⟨كلمات_فيديو☇
│┊ ۬.͜ـ🔹️˖ ⟨لكرتون☇
│┊ ۬.͜ـ👾˖ ⟨حلل☇
│┊ ۬.͜ـ⛩️˖ ⟨صورته☇
│┊ ۬.͜ـ🗣️˖ ⟨انطق☇
│┊ ۬.͜ـ📝˖ ⟨نص☇
│┊ ۬.͜ـ🔳˖ ⟨qr☇
│┊ ۬.͜ـ📸˖ ⟨سكرين☇
│┊ ۬.͜ـ⏰˖ ⟨تذكير☇
│┊ ۬.͜ـ🕰️˖ ⟨توقيت☇
│┊ ۬.͜ـ🌦️˖ ⟨مدينه☇
│┊ ۬.͜ـ📊˖ ⟨تصويت☇
┤└─ׅ─ׅ┈ ─๋︩︪──ׅ─ׅ┈ ─๋︩︪☇ـ
╯─ׅ ─๋︩︪─┈─๋︩︪─═⊐‹⛩️›⊏═┈ ─๋︩︪─ ∙ ∙ ⊰ـ  `;

  const emojiReaction = '⛩️';

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

handler.command = /^(ق3)$/i;
handler.exp = 50;
handler.fail = null;

export default handler;