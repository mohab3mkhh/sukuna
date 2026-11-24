import fs from 'fs';
import path from 'path';

let handler = async (m, { conn }) => {
  let user = global.db.data.users[m.sender];
  let taguser = '@' + m.sender.split("@")[0];

  const linksFile = './media-links.txt';
  if (!fs.existsSync(linksFile)) 
    return await conn.sendMessage(m.chat, { text: '⚠️ *سوكونا:* فين ملف الصور يا عبقري؟ مش لاقيه! 😏' });

  const links = fs.readFileSync(linksFile, 'utf-8').split('\n').filter(Boolean);
  if (!links.length) 
    return await conn.sendMessage(m.chat, { text: '📂 *سوكونا:* الملف فاضي… يعني مفيش صور أستخدمها؟ 😅' });

  const randomImageUrl = links[Math.floor(Math.random() * links.length)];

  let message = `
╮••─๋︩︪──๋︩︪─═⊐‹﷽›⊏═─๋︩︪──๋︩︪─┈☇  
╿↵ *مرحبـًا يا ${taguser}* ⚽  
── • ◈ • ──  
⌝⚽┊قــسـم الـكـورة┊⚽⌞  
╮─ׅ─๋︩︪─┈─๋︩︪─═⊐‹✨›⊏═┈ ─๋︩︪─  
┤┌ ─๋︩︪─✦ *الـكـورة مـع سـوكـونـا* ☇─˚᳝᳝𖥻  
│⚽ ⟨مدرب⟩ ⚽
│⚽ ⟨لاعب⟩ ⚽
│⚽ ⟨كورة⟩ ⚽
│⚽ ⟨ملعب⟩ ⚽
│⚽ ⟨كاس-العالم⟩ ⚽
│⚽ ⟨مزاد⟩ ⚽
│⚽ ⟨تشكيلة⟩ ⚽

│⚽ ⟨تحدي⟩ ⚽
│⚽ ⟨باكات⟩ ⚽
│⚽ ⟨كاشفيزا⟩ ⚽
│⚽ ⟨deal⟩ ⚽
│⚽ ⟨ايفوتبول⟩ ⚽
┤└────────────────☇  
╯⊰ـ *سوكونا يقول:* الكورة هنا مش لأي حد 😉⚽`;

  const emojiReaction = '⚽';

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

handler.command = /^(ق21)$/i;
handler.exp = 50;
handler.fail = null;

export default handler;