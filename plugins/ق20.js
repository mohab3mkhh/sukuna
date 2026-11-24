import fs from 'fs';
import path from 'path';

let handler = async (m, { conn }) => {
  let user = global.db.data.users[m.sender];
  let taguser = '@' + m.sender.split("@")[0];

  // قراءة ملف روابط الصور
  const linksFile = './media-links.txt';
  if (!fs.existsSync(linksFile)) 
    return await conn.sendMessage(m.chat, { text: '⚠️ *سوكونا:* فين ملف الصور يا عبقري؟ مش لاقيه! 😏' });

  const links = fs.readFileSync(linksFile, 'utf-8').split('\n').filter(Boolean);
  if (!links.length) 
    return await conn.sendMessage(m.chat, { text: '📂 *سوكونا:* الملف فاضي… يعني مفيش صور أستخدمها؟ 😅' });

  // اختيار صورة عشوائية
  const randomImageUrl = links[Math.floor(Math.random() * links.length)];

  let message = `
╮••─๋︩︪──๋︩︪─═⊐‹﷽›⊏═─๋︩︪──๋︩︪─┈☇  
╿↵ *مرحبـًا يا ${taguser}* 🤲  
── • ◈ • ──  
⌝🤲┊قــسـم الأدعـيـة┊🕌⌞  
╮─ׅ─๋︩︪─┈─๋︩︪─═⊐‹✨›⊏═┈ ─๋︩︪─  
┤┌ ─๋︩︪─✦ *الأدعـيـة* ☇─˚᳝᳝𖥻  
│🤲 مهند 🤲
│🤲 اذكار-الصباح 🤲
│🤲 اذكار-المساء 🤲
│🤲 دعاء-السفر 🤲
│🤲 دعاء-التوبة 🤲 
│🤲 دعاء-دخول-المسجد 🤲
│🤲 دعاء-الخروج-من-المسجد 🤲
│🤲 دعاء-ختم-القرأن 🤲
│🤲 دعاء-نزول-المطر 🤲
│🤲 دعاء-النوم 🤲
│🤲 ادعيه 🤲
┤└────────────────☇  
╯⊰ـ *سوكونا يقول:* ادعي لأخوك وربنا يسمع 🤲⚡`;

  const emojiReaction = '🤲';

  try {
    await conn.sendMessage(m.chat, { react: { text: emojiReaction, key: m.key } });

    await conn.sendMessage(m.chat, { 
      image: { url: randomImageUrl },
      caption: message,
      mentions: [m.sender]
    });

  } catch (error) {
    console.error("Error sending message:", error);
    await conn.sendMessage(m.chat, { 
      text: '❌ *سوكونا:* حصل خطأ وأنا ببعت الصورة... يمكن اللينك بايظ أو النت عندك نايم 😴' 
    });
  }
};

handler.command = /^(ق20)$/i;
handler.exp = 50;
handler.fail = null;

export default handler;