/**
 * plugins/لاعب.js
 * لعبة تخمين اللاعب من الصورة
 */

import pkg from '@whiskeysockets/baileys';
const { generateWAMessageFromContent } = pkg;

// ✅ استخدام ملف الأزرار
import { sendButtons, btn, getButtonId } from '../lib/buttons.js';

const PLAYERS = [
  { name: 'اوزيل', img: 'https://files.catbox.moe/gb8lop.jpg', hair: 'black', skin: 'white' },
  { name: 'فينيسيوس جونير', img: 'https://files.catbox.moe/i66qsk.jpg', hair: 'black', skin: 'black' },
  { name: 'بيكيه', img: 'https://files.catbox.moe/l15sni.jpg', hair: 'black', skin: 'white' },
  { name: 'تشافي سيمونز', img: 'https://files.catbox.moe/c7dw1j.jpg', hair: 'black', skin: 'white' },
  { name: 'ماريو غوتزة', img: 'https://files.catbox.moe/s2vepi.jpg', hair: 'brown', skin: 'white' },
  { name: 'لامبارد', img: 'https://files.catbox.moe/qofy0n.jpg', hair: 'blonde', skin: 'white' },
  { name: 'فان بيرسي', img: 'https://files.catbox.moe/kfpibc.jpg', hair: 'black', skin: 'white' },
  { name: 'جواو فيليكس', img: 'https://files.catbox.moe/y3xmao.jpg', hair: 'brown', skin: 'white' },
  { name: 'كيفين دي بروين', img: 'https://files.catbox.moe/mdwuqq.jpg', hair: 'blonde', skin: 'white' },
  { name: 'روديريغو', img: 'https://files.catbox.moe/oz22fg.jpg', hair: 'black', skin: 'black' },
  { name: 'تشافي', img: 'https://files.catbox.moe/shv659.jpg', hair: 'black', skin: 'white' },
  { name: 'باو كوبارسي', img: 'https://files.catbox.moe/jh9ira.jpg', hair: 'brown', skin: 'white' },
  { name: 'خوان غارسيا', img: 'https://files.catbox.moe/f2d1v6.jpg', hair: 'black', skin: 'white' },
  { name: 'اندري شيفشينكو', img: 'https://files.catbox.moe/nox9vm.jpg', hair: 'blonde', skin: 'white' },
  { name: 'مانويل نوير', img: 'https://files.catbox.moe/2bdmub.jpg', hair: 'blonde', skin: 'white' },
  { name: 'دوكو', img: 'https://files.catbox.moe/3dbl5g.jpg', hair: 'black', skin: 'black' },
  { name: 'تشواميني', img: 'https://files.catbox.moe/xv8awj.jpg', hair: 'black', skin: 'black' },
  { name: 'جمال موسيالا', img: 'https://files.catbox.moe/3eyslg.jpg', hair: 'black', skin: 'black' },
  { name: 'ابراهيم دياز', img: 'https://files.catbox.moe/re519z.jpg', hair: 'black', skin: 'black' },
  { name: 'ايكر كاسياس', img: 'https://files.catbox.moe/sqcad0.jpg', hair: 'black', skin: 'white' },
  { name: 'ماركو رويس', img: 'https://files.catbox.moe/39iyyk.jpg', hair: 'black', skin: 'white' },
  { name: 'دي روسي', img: 'https://files.catbox.moe/tfjp0h.jpg', hair: 'black', skin: 'white' },
  { name: 'توتي', img: 'https://files.catbox.moe/bp1yx8.jpg', hair: 'black', skin: 'white' },
  { name: 'فالفيردي', img: 'https://files.catbox.moe/vs3aiu.jpg', hair: 'brown', skin: 'white' },
  { name: 'مارك كوكوريا', img: 'https://files.catbox.moe/2ovzxj.jpg', hair: 'black', skin: 'white' },
  { name: 'تيري هنري', img: 'https://files.catbox.moe/l45moz.jpg', hair: 'black', skin: 'black' },
  { name: 'جابريل باتيستوتا', img: 'https://files.catbox.moe/5c51ak.jpg', hair: 'brown', skin: 'white' },
  { name: 'مايكل اوليسي', img: 'https://files.catbox.moe/o5mhd9.jpg', hair: 'black', skin: 'black' },
  { name: 'اوين', img: 'https://files.catbox.moe/fk9ym6.jpg', hair: 'brown', skin: 'white' },
  { name: 'بيكهام', img: 'https://files.catbox.moe/i9zt1b.jpg', hair: 'brown', skin: 'white' },
  { name: 'سواريز', img: 'https://files.catbox.moe/lavcya.jpg', hair: 'brown', skin: 'white' },
  { name: 'ساديو ماني', img: 'https://files.catbox.moe/qstavl.jpg', hair: 'black', skin: 'black' },
  { name: 'إيفان راكيتيتش', img: 'https://files.catbox.moe/6gt9cf.jpg', hair: 'black', skin: 'white' },
  { name: 'تيفيز', img: 'https://files.catbox.moe/uclgnb.jpg', hair: 'black', skin: 'white' },
  { name: 'بوسكيتس', img: 'https://files.catbox.moe/qa4bjg.jpg', hair: 'brown', skin: 'white' },
  { name: 'مارادونا', img: 'https://files.catbox.moe/hauprc.jpg', hair: 'black', skin: 'white' },
  { name: 'كارفخال', img: 'https://files.catbox.moe/c3nlez.jpg', hair: 'black', skin: 'white' },
  { name: 'روبينهو', img: 'https://files.catbox.moe/1ndziq.jpg', hair: 'black', skin: 'black' },
  { name: 'بالوتيلي', img: 'https://files.catbox.moe/gyfjr4.jpg', hair: 'black', skin: 'black' },
  { name: 'ماك اليستر', img: 'https://files.catbox.moe/g8og2s.jpg', hair: 'brown', skin: 'white' }
];

function getSimilarPlayers(correct, all) {
  return all.filter(p => p.name !== correct.name && p.hair === correct.hair && p.skin === correct.skin);
}

function shuffle(arr) {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function getChoices(correct, all) {
  const similar = getSimilarPlayers(correct, all);
  let wrong = [];
  
  if (similar.length >= 3) {
    wrong = shuffle(similar).slice(0, 3);
  } else {
    wrong = [...similar];
    const others = shuffle(all.filter(p => p.name !== correct.name && !similar.find(s => s.name === p.name)));
    while (wrong.length < 3 && others.length) {
      wrong.push(others.shift());
    }
  }
  
  const choices = [correct, ...wrong.slice(0, 3)];
  return shuffle(choices);
}

if (!global._playerGames) global._playerGames = {};

const handler = async (m, { conn }) => {
  const chatId = m.chat;
  const userId = m.sender;
  const gameKey = `${chatId}_${userId}`;

  if (global._playerGames[gameKey]) {
    return m.reply('❗ عندك سؤال شغال دلوقتي! جاوب عليه قبل ما تبدأ سؤال جديد.');
  }

  const correct = PLAYERS[Math.floor(Math.random() * PLAYERS.length)];
  const choices = getChoices(correct, PLAYERS);

  try {
    const imgRes = await fetch(correct.img, {
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8'
      }
    });
    
    if (!imgRes.ok) throw new Error(`HTTP ${imgRes.status}`);
    const imgBuffer = Buffer.from(await imgRes.arrayBuffer());

    // ✅ بناء الأزرار باستخدام btn.reply من ملف buttons
    const buttons = choices.map((p, i) => 
      btn.reply(`${['1️⃣','2️⃣','3️⃣','4️⃣'][i]} ${p.name}`, `لاعب_اجابة_${p.name}`)
    );

    // ✅ إرسال الرسالة باستخدام sendButtons
    const sentMsg = await sendButtons(conn, chatId, {
      text: `🏟️ *@${userId.split('@')[0]} بدأ اللعبة!*\n\n⏱️ عندك 60 ثانية\n💰 الجائزة: 5000 XP`,
      footer: '⚽ لعبة التخمين',
      image: imgBuffer,
      buttons,
      mentions: [userId]
    }, m);

    // ✅ حفظ اللعبة
    global._playerGames[gameKey] = {
      answer: correct.name,
      choices: choices.map(c => c.name),
      starter: userId,
      messageId: sentMsg.key.id,
      chatId: chatId,
      timeout: setTimeout(() => {
        if (global._playerGames[gameKey]) {
          conn.sendMessage(chatId, {
            text: `⏰ *انتهى وقت @${userId.split('@')[0]}!*\n\n✅ *الإجابة الصحيحة:* ${correct.name}\n\n🎯 استخدم .لاعب للعب مرة أخرى`,
            mentions: [userId]
          });
          delete global._playerGames[gameKey];
        }
      }, 60000)
    };
    
  } catch (error) {
    console.error('[خطأ في اللعبة]', error.message);
    await m.reply(`❌ فشل تحميل صورة اللاعب ${correct.name}. حاول مرة أخرى.`);
  }
};

handler.before = async function (m) {
  const chatId = m.chat;
  const userId = m.sender;
  
  let activeGameKey = null;
  let activeGame = null;
  
  for (const key in global._playerGames) {
    const game = global._playerGames[key];
    if (game.starter === userId && game.chatId === chatId) {
      activeGameKey = key;
      activeGame = game;
      break;
    }
  }
  
  if (!activeGame) return false;
  
  // ✅ استخدام getButtonId من ملف buttons
  const buttonId = getButtonId(m);
  const isButtonPress = buttonId && buttonId.includes('لاعب_اجابة_');
  
  const isReplyingToGame = m.quoted && m.quoted.key && m.quoted.key.id === activeGame.messageId;
  const isNumberReply = isReplyingToGame && /^[1-4]$/.test((m.text || '').trim());
  
  if (!isButtonPress && !isNumberReply) return false;
  
  let userAnswer = null;
  
  if (isButtonPress) {
    userAnswer = buttonId.replace('لاعب_اجابة_', '').toLowerCase().trim();
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
      text: `❌ *إجابة غلط يا @${userId.split('@')[0]}!*\n\n✅ الإجابة الصحيحة: *${activeGame.answer}*\n\n💡 حاول تاني المرة الجاية`,
      mentions: [userId]
    });
    clearTimeout(activeGame.timeout);
    delete global._playerGames[activeGameKey];
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
    text: `✅ *إجابة صحيحة من @${userId.split('@')[0]}!*\n\n🏆 *اللاعب:* ${activeGame.answer}\n💰 *ربحت:* 5000 XP\n\n🎯 استخدم .لاعب للعب مرة أخرى`,
    mentions: [userId]
  });

  delete global._playerGames[activeGameKey];
  return false;
};

handler.help = ['لاعب'];
handler.tags = ['games'];
handler.command = /^(لاعب|player)$/i;

export default handler;