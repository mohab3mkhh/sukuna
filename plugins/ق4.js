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
╮•─๋︩︪──๋︩︪─═⊐‹﷽›⊏═─๋︩︪──๋︩︪─┈☇
╿↵ مرحــبـا ⌊${taguser}⌉
── • ◈ • ──
*⌝⛩️┊👹قــســم التحميل  الملعون😈┊⛩️⌞* 
╮─ׅ─๋︩︪─┈─๋︩︪─═⊐‹✨›⊏═┈ ─๋︩︪─ ∙ ∙ ⊰ـ
┤┌ ─๋︩︪─✦التحميلات─˚᳝᳝𖥻
│┊ ۬.͜ـ😈˖ ⟨جيتهاب☇ 
│┊ ۬.͜ـ💠˖ ⟨ميجا☇
│┊ ۬.͜ـ🔽˖ ⟨ميديا_فاير☇
│┊ ۬.͜ـ⛩️˖ ⟨تويتر☇
│┊ ۬.͜ـ⛩️˖ ⟨تيك☇
│┊ ۬.͜ـ⚜️˖ ⟨فيديو☇
│┊ ۬.͜ـ⛩️˖ ⟨ريكورد☇
│┊ ۬.͜ـ😈˖ ⟨تحمل(اغنيه)☇
│┊ ۬.͜ـ⚜️˖ ⟨يوتيوب☇
│┊ ۬.͜ـ⛩️˖ ⟨انستا☇
│┊ ۬.͜ـ🚀˖ ⟨تيكتوك☇
│┊ ۬.͜ـ❓️˖ ⟨فيس☇
| |🎶ساوند🎶 تحميل اغنيه من ساوند كلاود
|⛩️ ايديت  ⛩️ جلب ايديتات
| |🫟ريلزات🫟 تحميل من انستجرام
| |🎶تيكتوك🎶تحميل اقوي من تيكتوك
| | ⚡️سبوتي⚡️تحميل من سبوتيفاي
| | ⛩️SUKUNA⚡️BOT⛩️
│┊ ۬.͜ـ🎵˖ ⟨اغنية☇
│┊ ۬.͜ـ▶️˖ ⟨شغل☇
│┊ ۬.͜ـ🍎˖ ⟨ابل☇
│┊ ۬.͜ـ☁️˖ ⟨درايف☇
│┊ ۬.͜ـ📱˖ ⟨apk☇
│┊ ۬.͜ـ🖼️˖ ⟨خلفيات☇
│┊ ۬.͜ـ📸˖ ⟨تيك_صوره☇
│┊ ۬.͜ـ📘˖ ⟨فيس_فيديو☇
│┊ ۬.͜ـ📘˖ ⟨facebook☇
│┊ ۬.͜ـ🎬˖ ⟨زونا☇
│┊ ۬.͜ـ🎞️˖ ⟨افلام☇
┤└─ׅ─ׅ┈ ─๋︩︪──ׅ─ׅ┈ ─๋︩︪☇ـ
╯─ׅ ─๋︩︪─┈─๋︩︪─═⊐‹♻️›⊏═┈ ─๋︩︪─ ∙ ∙ ⊰ـ  `;

  const emojiReaction = '🛠️';

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

handler.command = /^(ق4)$/i;
handler.exp = 50;
handler.fail = null;

export default handler;