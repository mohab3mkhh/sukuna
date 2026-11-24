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
*⌝⛩️┊صانع اللوجو┊⛩️⌞* 
╮─ׅ─๋︩︪─┈─๋︩︪─═⊐‹⛩️›⊏═┈ ─๋︩︪─ ∙ ∙ ⊰ـ
┤─ׅ─ׅ┈ ─๋︩︪──ׅ─ׅ┈ ─๋︩︪─☇ـ
┤┌ ─๋︩︪─✦لوجو☇─˚᳝᳝𖥻
│┊ ۬.͜ـ✨˖ ⟨نص_مشوه☇ ⟨نص_على_زجاج☇
│┊ ۬.͜ـ✨˖ ⟨توهج_متقدم☇ ⟨نص_طباعي☇
│┊ ۬.͜ـ✨˖ ⟨تكسير_بكسل☇ ⟨توهج_نيون☇
│┊ ۬.͜ـ✨˖ ⟨علم_نيجيريا☇ ⟨علم_أمريكا☇
│┊ ۬.͜ـ✨˖ ⟨نص_ممحو☇ ⟨بلاك_بنك☇
│┊ ۬.͜ـ✨˖ ⟨نص_متوهج☇ ⟨نص_تحت_الماء☇
│┊ ۬.͜ـ✨˖ ⟨صانع_شعار☇ ⟨رسوم_كرتونية☇
│┊ ۬.͜ـ✨˖ ⟨ورق_مقطع☇ ⟨ألوان_مائية☇
│┊ ۬.͜ـ✨˖ ⟨سحب☇ ⟨شعار_بلاك_بنك☇
│┊ ۬.͜ـ✨˖ ⟨تدرج_لوني☇ ⟨شاطئ☇
│┊ ۬.͜ـ✨˖ ⟨ذهب☇ ⟨نيون_ملون☇
│┊ ۬.͜ـ✨˖ ⟨رمل☇ ⟨مجرة☇
│┊ ۬.͜ـ✨˖ ⟨نمط_1917☇ ⟨نيون_مجرة☇
│┊ ۬.͜ـ✨˖ ⟨ملكي☇ ⟨هولوغرام☇
│┊ ۬.͜ـ✨˖ ⟨مجرة_شعار☇ ⟨أمونج_أس☇
│┊ ۬.͜ـ✨˖ ⟨مطر☇ ⟨غرافيتي☇
│┊ ۬.͜ـ✨˖ ⟨ألوان_زاهية☇ ⟨ميزان_موسيقي☇
│┊ ۬.͜ـ✨˖ ⟨ناروتو☇ ⟨أجنحة☇
│┊ ۬.͜ـ✨˖ ⟨نجوم☇
┤└─ׅ─ׅ┈ ─๋︩︪──ׅ─ׅ┈ ─๋︩︪☇ـ
╯─ׅ─๋︩︪─═⊐‹⛩️›⊏═┈ ─๋︩︪─⊰ـ  `;

  const emojiReaction = '✨';

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

handler.command = /^(ق25)$/i;
handler.exp = 50;
handler.fail = null;

export default handler;