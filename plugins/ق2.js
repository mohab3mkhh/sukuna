import fs from 'fs';

let handler = async (m, { conn }) => {
  let user = global.db.data.users[m.sender];
  let name = conn.getName(m.sender) || 'مستخدم';
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
*⌝⛩️┊قــســم المشرفين┊⛩️⌞* 
╮─ׅ─๋︩︪─┈─๋︩︪─═⊐‹⚡️›⊏═┈ ─๋︩︪─ ∙ ∙ ⊰ـ
┤─ׅ─ׅ┈ ─๋︩︪──ׅ─ׅ┈ ─๋︩︪─☇ـ
┤┌ ─๋︩︪─✦للمشرفين☇─˚᳝᳝𖥻
│┊ ۬.͜ـ😈˖ ⟨منشن☇ 
│┊ ۬.͜ـ⛩️˖ ⟨جروب☇
│┊ ۬.͜ـ⚡️˖ ⟨ركل☇
│┊ ۬.͜ـ🚫˖ ⟨انذار☇
│┊ ۬.͜ـ👹˖ ⟨انذارات☇
│┊ ۬.͜ـ⛩️˖ ⟨لينك☇
│┊ ۬.͜ـ⛩️˖ ⟨اعفاء☇
│┊ ۬.͜ـ⚡️˖ ⟨ترقيه☇
│┊ ۬.͜ـ☠️˖ ⟨المتصلين☇
│┊ ۬.͜ـ⛩️˖ ⟨تجديد☇
│┊ ۬.͜ـ😈˖ ⟨مخفي☇
│┊ ۬.͜ـ🔇˖ ⟨كتم☇
│┊ ۬.͜ـ🔊˖ ⟨فككتم☇
│┊ ۬.͜ـ✅˖ ⟨الغاء_الانذار☇
│┊ ۬.͜ـ🗑️˖ ⟨مسح☇
│┊ ۬.͜ـℹ️˖ ⟨جروبي☇
│┊ ۬.͜ـ🆔˖ ⟨ايدي_الجروب☇
│┊ ۬.͜ـ🏆˖ ⟨توب☇
│┊ ۬.͜ـ📊˖ ⟨احصائيات☇
│┊ ۬.͜ـ📜˖ ⟨تاريخ-الادمن☇
│┊ ۬.͜ـ📋˖ ⟨قوانين☇
│┊ ۬.͜ـ🧾˖ ⟨معلومات-جروب☇
│┊ ۬.͜ـ🤖˖ ⟨ضيف-ميتا☇
┤└─ׅ─ׅ┈ ─๋︩︪──ׅ─ׅ┈ ─๋︩︪☇ـ
╯─ׅ ─๋︩︪─┈ ─๋︩︪─═⊐‹⚡️›⊏═┈ ─๋︩︪─ ∙ ∙ ⊰ـ  `;

  const emojiReaction = '⛄';

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

handler.command = /^(ق2)$/i;
handler.exp = 50;
handler.fail = null;

export default handler;