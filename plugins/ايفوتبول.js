/**
 * plugins/ايفوتبول.js
 * لعبة خمن مهارة اللاعب من الصورة - كل شخص له لعبة مستقلة
 */

import * as pkg from '@whiskeysockets/baileys';
const { generateWAMessageFromContent, prepareWAMessageMedia } = pkg;

// ✅ قائمة المهارات مع صور اللاعبين (تم التحديث)
const SKILLS = [
  { name: '𝑨𝑪𝑪𝑬𝑳𝑹𝑨𝑻𝑰𝑶𝑵 𝑩𝑼𝑹𝑺𝑻', img: 'https://files.catbox.moe/n6wvjf.png', player: 'لاعب 1' },
  { name: '𝑩𝑳𝑰𝑻𝒁 𝑪𝑼𝑹𝑳𝑬𝑹', img: 'https://files.catbox.moe/cvex35.png', player: 'لاعب 2' },
  { name: '𝑳𝑶𝑾 𝑺𝑪𝑹𝑬𝑨𝑴𝑬𝑹', img: 'https://files.catbox.moe/4vkjqo.png', player: 'لاعب 3' },
  { name: '𝑴𝑨𝑮𝑵𝑬𝑻𝑰𝑪 𝑭𝑬𝑬𝑻', img: 'https://files.catbox.moe/o1500o.png', player: 'لاعب 4' },
  { name: '𝑭𝑶𝑹𝑻𝑹𝑬𝑺𝑺', img: 'https://files.catbox.moe/fmu67b.png', player: 'لاعب 5' },
  { name: '𝑬𝑫𝑮𝑬𝑫 𝑪𝑹𝑶𝑺𝑺𝑰𝑵𝑮', img: 'https://files.catbox.moe/cr3xlb.png', player: 'لاعب 6' },
  { name: '𝑷𝑯𝑬𝑵𝑶𝑴𝑬𝑵𝑶𝑵𝑨𝑳 𝑭𝑰𝑵𝑰𝑺𝑯𝑰𝑵𝑮', img: 'https://files.catbox.moe/vxhysn.png', player: 'لاعب 7' },
  { name: '𝑨𝑬𝑹𝑰𝑨𝑳 𝑭𝑶𝑹𝑻', img: 'https://files.catbox.moe/6mxgb4.png', player: 'لاعب 8' },
  { name: '𝑨𝑪𝑪𝑬𝑳𝑹𝑨𝑻𝑰𝑶𝑵 𝑩𝑼𝑹𝑺𝑻', img: 'https://files.catbox.moe/o7wbpi.png', player: 'لاعب 9' },
  { name: '𝑩𝑳𝑰𝑻𝒁 𝑪𝑼𝑹𝑳𝑬𝑹', img: 'https://files.catbox.moe/k3sqza.png', player: 'لاعب 10' },
  { name: '𝑴𝑶𝑴𝑬𝑵𝑻𝑼𝑴 𝑫𝑹𝑰𝑩𝑩𝑳𝑰𝑵𝑮', img: 'https://files.catbox.moe/al0wwe.png', player: 'لاعب 11' },
  { name: '𝑳𝑶𝑾 𝑺𝑪𝑹𝑬𝑨𝑴𝑬𝑹', img: 'https://files.catbox.moe/b698gu.png', player: 'لاعب 12' },
  { name: '𝑳𝑶𝑵𝑮 𝑹𝑬𝑨𝑪𝑯 𝑻𝑨𝑪𝑲𝑳𝑬', img: 'https://files.catbox.moe/tqw4m7.png', player: 'لاعب 13' },
  { name: '𝑨𝑻𝑻𝑨𝑪𝑲𝑰𝑵𝑮 𝑺𝑼𝑹𝑮𝑬', img: 'https://files.catbox.moe/sgsjau.png', player: 'لاعب 14' },
  { name: '𝑽𝑰𝑺𝑰𝑶𝑵𝑨𝑹𝒀 𝑷𝑨𝑺𝑺', img: 'https://files.catbox.moe/nr6aqu.png', player: 'لاعب 15' },
  { name: '𝑴𝑶𝑴𝑬𝑵𝑻𝑼𝑴 𝑫𝑹𝑰𝑩𝑩𝑳𝑰𝑵𝑮', img: 'https://files.catbox.moe/m0kkvj.png', player: 'لاعب 16' },
  { name: '𝑩𝑼𝑳𝑳𝑬𝑻 𝑯𝑬𝑨𝑫𝑬𝑹', img: 'https://files.catbox.moe/xa52sq.png', player: 'لاعب 17' },
  { name: '𝑾𝑰𝑳𝑳𝑷𝑶𝑾𝑬𝑹', img: 'https://files.catbox.moe/mw7mh3.png', player: 'لاعب 18' },
  { name: '𝑩𝑳𝑰𝑻𝒁 𝑪𝑼𝑹𝑳𝑬𝑹', img: 'https://files.catbox.moe/v4vhg2.png', player: 'لاعب 19' },
  { name: '𝑩𝑳𝑰𝑻𝒁 𝑪𝑼𝑹𝑳𝑬𝑹', img: 'https://files.catbox.moe/k8g54y.png', player: 'لاعب 20' },
  { name: '𝑳𝑶𝑾 𝑺𝑪𝑹𝑬𝑨𝑴𝑬𝑹', img: 'https://files.catbox.moe/kt5cbp.png', player: 'لاعب 21' },
  { name: '𝑾𝑰𝑳𝑳𝑷𝑶𝑾𝑬𝑹', img: 'https://files.catbox.moe/vf1j8p.png', player: 'لاعب 22' },
  { name: '𝑷𝑯𝑬𝑵𝑶𝑴𝑬𝑵𝑨𝑳 𝑭𝑰𝑵𝑰𝑺𝑯𝑰𝑵𝑮', img: 'https://files.catbox.moe/v9exlk.png', player: 'لاعب 23' },
  // ✅ إضافات جديدة
  { name: '𝑬𝑫𝑮𝑬𝑫 𝑪𝑹𝑶𝑺𝑺𝑰𝑵𝑮', img: 'https://files.catbox.moe/fklktn.png', player: 'لاعب 24' },
  { name: '𝑨𝑻𝑻𝑨𝑪𝑲𝑰𝑵𝑮 𝑺𝑼𝑹𝑮𝑬', img: 'https://files.catbox.moe/cd2ecg.png', player: 'لاعب 25' },
  { name: '𝑬𝑫𝑮𝑬𝑫 𝑪𝑹𝑶𝑺𝑺𝑰𝑵𝑮', img: 'https://files.catbox.moe/k16z0v.png', player: 'لاعب 26' },
  { name: '𝑳𝑶𝑵𝑮 𝑹𝑬𝑨𝑪𝑯 𝑻𝑨𝑪𝑲𝑳𝑬', img: 'https://files.catbox.moe/t9bn8w.png', player: 'لاعب 27' },
  { name: '𝑳𝑶𝑵𝑮 𝑹𝑬𝑨𝑪𝑯 𝑻𝑨𝑪𝑲𝑳𝑬', img: 'https://files.catbox.moe/06kf6j.png', player: 'لاعب 28' }
];

function shuffle(arr) {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function getChoices(correct, all) {
  const others = all.filter(s => s.name !== correct.name);
  const wrong = shuffle(others).slice(0, 3);
  const choices = [correct, ...wrong.slice(0, 3)];
  return shuffle(choices);
}

// ✅ تخزين الألعاب النشطة لكل مستخدم
if (!global._skillGames) global._skillGames = {};

const handler = async (m, { conn }) => {
  const chatId = m.chat;
  const userId = m.sender;
  const gameKey = `${chatId}_${userId}`;

  if (global._skillGames[gameKey]) {
    return m.reply('❗ عندك سؤال شغال دلوقتي! جاوب عليه قبل ما تبدأ سؤال جديد.');
  }

  const correct = SKILLS[Math.floor(Math.random() * SKILLS.length)];
  const choices = getChoices(correct, SKILLS);

  try {
    const imgRes = await fetch(correct.img, {
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8'
      }
    });
    
    if (!imgRes.ok) throw new Error(`HTTP ${imgRes.status}`);
    const imgBuffer = Buffer.from(await imgRes.arrayBuffer());

    const imageMessage = await prepareWAMessageMedia(
      { image: imgBuffer },
      { upload: conn.waUploadToServer }
    );

    const buttons = choices.map((s, i) => ({
      name: 'quick_reply',
      buttonParamsJson: JSON.stringify({
        display_text: `${['1️⃣','2️⃣','3️⃣','4️⃣'][i]} ${s.name}`,
        id: `مهارة_اجابة_${s.name}`
      })
    }));

    const msg = generateWAMessageFromContent(chatId, {
      viewOnceMessage: {
        message: {
          interactiveMessage: {
            header: { hasMediaAttachment: true, ...imageMessage },
            body: { text: `⚡ *@${userId.split('@')[0]} خمن مهارة اللاعب!*\n\n🕒 عندك 60 ثانية\n💰 الجائزة: 5000 XP\n📌 اختار المهارة الصحيحة للاعب في الصورة` },
            footer: { text: '⚽ خمن مهارة اللاعب' },
            nativeFlowMessage: { buttons }
          }
        }
      }
    }, { userJid: conn.user.id });

    await conn.relayMessage(chatId, msg.message, { messageId: msg.key.id });

    global._skillGames[gameKey] = {
      answer: correct.name,
      choices: choices.map(c => c.name),
      starter: userId,
      messageId: msg.key.id,
      chatId: chatId,
      player: correct.player,
      timeout: setTimeout(() => {
        if (global._skillGames[gameKey]) {
          conn.sendMessage(chatId, {
            text: `⏰ *انتهى وقت @${userId.split('@')[0]}!*\n\n✅ *المهارة الصحيحة:* ${correct.name}\n👤 *اللاعب:* ${correct.player}\n\n🎯 استخدم .ايفوتبول للعب مرة أخرى`,
            mentions: [userId]
          });
          delete global._skillGames[gameKey];
        }
      }, 60000)
    };
    
  } catch (error) {
    console.error('[خطأ في التحميل]', error.message);
    await m.reply(`❌ فشل تحميل الصورة. حاول مرة أخرى.`);
  }
};

handler.before = async function (m) {
  const chatId = m.chat;
  const userId = m.sender;
  
  let activeGameKey = null;
  let activeGame = null;
  
  for (const key in global._skillGames) {
    const game = global._skillGames[key];
    if (game.starter === userId && game.chatId === chatId) {
      activeGameKey = key;
      activeGame = game;
      break;
    }
  }
  
  if (!activeGame) return false;
  
  const isReplyingToGame = m.quoted && m.quoted.key && m.quoted.key.id === activeGame.messageId;
  const isButtonPress = m.text && m.text.includes('مهارة_اجابة_');
  const isNumberReply = isReplyingToGame && /^[1-4]$/.test(m.text?.trim());
  
  if (!isButtonPress && !isNumberReply) return false;
  
  let userAnswer = null;
  
  if (isButtonPress) {
    userAnswer = m.text.replace('مهارة_اجابة_', '').toLowerCase().trim();
  } else if (isNumberReply) {
    const choiceNum = parseInt(m.text.trim());
    if (activeGame.choices && activeGame.choices[choiceNum - 1]) {
      userAnswer = activeGame.choices[choiceNum - 1].toLowerCase();
    }
  }
  
  if (!userAnswer) return false;
  
  const isCorrect = userAnswer === activeGame.answer.toLowerCase();
  
  if (!isCorrect) {
    await this.sendMessage(chatId, {
      text: `❌ *إجابة غلط يا @${userId.split('@')[0]}!*\n\n✅ المهارة الصحيحة: *${activeGame.answer}*\n👤 اللاعب: ${activeGame.player}\n\n💡 حاول تاني المرة الجاية`,
      mentions: [userId]
    });
    clearTimeout(activeGame.timeout);
    delete global._skillGames[activeGameKey];
    return false;
  }

  clearTimeout(activeGame.timeout);

  if (!global.db?.data?.users?.[userId]) {
    if (global.db?.data?.users) global.db.data.users[userId] = { exp: 0 };
  }
  if (global.db?.data?.users?.[userId]) {
    global.db.data.users[userId].exp = (global.db.data.users[userId].exp || 0) + 5000;
  }

  await this.sendMessage(chatId, {
    text: `✅ *إجابة صحيحة من @${userId.split('@')[0]}!*\n\n⚡ *المهارة:* ${activeGame.answer}\n👤 *اللاعب:* ${activeGame.player}\n💰 *ربحت:* 5000 XP\n\n🎯 استخدم .ايفوتبول للعب مرة أخرى`,
    mentions: [userId]
  });

  delete global._skillGames[activeGameKey];
  return false;
};

handler.help    = ['ايفوتبول'];
handler.tags    = ['games'];
handler.command = /^(ايفوتبول|evofootball|efootball)$/i;

export default handler;