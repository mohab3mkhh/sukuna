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
*⌝⛄┊قــســم الصور┊🧸⌞* 
╮─๋︩︪─┈─๋︩︪─═⊐‹✨›⊏═┈ ─๋︩︪─ ∙ ∙ ⊰ـ
┤─ׅ─ׅ┈ ─๋︩︪──ׅ─ׅ┈ ─๋︩︪─☇ـ
┤┌ ─๋︩︪─✦الاوامر☇─˚᳝᳝𖥻
│┊ ۬.͜ـ⛩️˖ ⟨كورومي☇ 
│┊ ۬.͜ـ⛩️˖ ⟨كيوت☇
│┊ ۬.͜ـ🌀˖ ⟨ميكاسا☇
│┊ ۬.͜ـ🌀˖ ⟨كابلز☇
│┊ ۬.͜ـ⚡️˖ ⟨هيناتا☇
│┊ ۬.͜ـ⚡️˖ ⟨بين☇
│┊ ۬.͜ـ👾˖ ⟨صوره☇
│┊ ۬.͜ـ👾˖ ⟨خلفيات☇
│┊ ۬.͜ـ⚜️˖ ⟨كانيكي☇
│┊ ۬.͜ـ⚜️˖ ⟨تصفح☇
│┊ ۬.͜ـ☠️˖ ⟨بينتر☇
│┊ ۬.͜ـ✨˖ ⟨صورة☇
│┊ ۬.͜ـ🍌˖ ⟨نانو☇
│┊ ۬.͜ـ🎨˖ ⟨فوتوشوب☇
│┊ ۬.͜ـ👁️˖ ⟨رؤية☇
│┊ ۬.͜ـ🖌️˖ ⟨عدل☇
│┊ ۬.͜ـ🎎˖ ⟨لانمي☇
│┊ ۬.͜ـ💭˖ ⟨حلمي☇
│┊ ۬.͜ـ🔎˖ ⟨بحث_بصري☇
│┊ ۬.͜ـ🔍˖ ⟨unblur☇
│┊ ۬.͜ـ🎬˖ ⟨veo3☇
│┊ ۬.͜ـ👗˖ ⟨كوسبلاي☇
│┊ ۬.͜ـ🔥˖ ⟨لوجو☇
┤└─ׅ─ׅ┈ ─๋︩︪──ׅ─ׅ┈ ─๋︩︪☇ـ
╯─ׅ─๋︩︪─═⊐‹♻️›⊏═┈ ─๋︩︪─⊰ـ  `;

  const emojiReaction = '📷';


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

handler.command = /^(ق11)$/i;
handler.exp = 50;
handler.fail = null;

export default handler;