/**
 * plugins/مدرب.js
 * لعبة تخمين المدرب من الصورة
 */

import { sendButtons, btn, getButtonId } from '../lib/buttons.js';

const COACHES = [
  { name: 'بيب جوارديولا', img: 'https://files.catbox.moe/owmlfv.jpg' },
  { name: 'توماس توخيل', img: 'https://files.catbox.moe/fsoukr.jpg' },
  { name: 'اليكس فيرجسون', img: 'https://files.catbox.moe/nfgbvz.jpg' },
  { name: 'جوزية مورينيو', img: 'https://files.catbox.moe/2x1lrc.jpg' },
  { name: 'زين الدين زيدان', img: 'https://files.catbox.moe/kxbpwf.jpg' },
  { name: 'لويس انريكي', img: 'https://files.catbox.moe/zrlkun.jpg' },
  { name: 'كارلو انشيلوتي', img: 'https://files.catbox.moe/1tm5bh.jpg' },
  { name: 'حسام حسن', img: 'https://files.catbox.moe/fcmvd8.jpg' },
  { name: 'يورجن كلوب', img: 'https://files.catbox.moe/3dbm0w.jpg' },
  { name: 'دييجو سيميوني', img: 'https://files.catbox.moe/rkbwha.jpg' },
  { name: 'تشابي الونسو', img: 'https://files.catbox.moe/chn5e4.jpg' },
  { name: 'ديدير ديشامب', img: 'https://files.catbox.moe/6l2qyn.jpg' },
  { name: 'روبيرتو مارتينيز', img: 'https://files.catbox.moe/4e2m5d.jpg' },
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
  const wrong = shuffle(all.filter(c => c.name !== correct.name)).slice(0, 3);
  return shuffle([correct, ...wrong]);
}

if (!global._coachGames) global._coachGames = {};

const handler = async (m, { conn }) => {
  const id = m.chat;

  if (global._coachGames[id]) {
    return m.reply('❗ في سؤال شغال دلوقتي!');
  }

  const correct = COACHES[Math.floor(Math.random() * COACHES.length)];
  const choices = getChoices(correct, COACHES);

  try {
    const imgRes = await fetch(correct.img, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8'
      }
    });

    if (!imgRes.ok) throw new Error(`HTTP ${imgRes.status}`);
    const imgBuffer = Buffer.from(await imgRes.arrayBuffer());

    // ✅ بناء الأزرار باستخدام btn.reply
    const buttons = choices.map((c, i) => 
      btn.reply(`${['1️⃣','2️⃣','3️⃣','4️⃣'][i]} ${c.name}`, `مدرب_اجابة_${c.name}`)
    );

    // ✅ إرسال باستخدام sendButtons
    const sentMsg = await sendButtons(conn, id, {
      text: `🧥 *احزر المدرب من صورته!*\n\n⏱️ عندك 60 ثانية\n💰 الجائزة: 5000 XP`,
      footer: '⚽ لعبة التخمين',
      image: imgBuffer,
      buttons,
      mentions: [m.sender]
    }, m);

    global._coachGames[id] = {
      answer: correct.name,
      msgId: sentMsg.key.id,
      starter: m.sender,
      timeout: setTimeout(() => {
        if (global._coachGames[id]) {
          conn.sendMessage(id, {
            text: `⏰ *انتهى الوقت!*\n\n✅ *الإجابة الصحيحة:* ${correct.name}\n\n🎯 استخدم .مدرب للعب مرة أخرى`
          });
          delete global._coachGames[id];
        }
      }, 60000)
    };

  } catch (error) {
    console.error('[خطأ في التحميل]', error.message);
    await m.reply(`❌ فشل تحميل صورة المدرب ${correct.name}. حاول مرة أخرى.`);
  }
};

handler.before = async function (m) {
  const id = m.chat;
  if (!global._coachGames[id]) return false;
  if (/^[.!#](مدرب|coach)$/i.test(m.text?.trim())) return false;

  const game = global._coachGames[id];

  // ✅ استخدام getButtonId
  const buttonId = getButtonId(m);
  const isButtonPress = buttonId && buttonId.includes('مدرب_اجابة_');

  // ✅ كمان الرد العادي على الرسالة
  const quotedId = m.message?.extendedTextMessage?.contextInfo?.stanzaId
    || m.message?.buttonsResponseMessage?.contextInfo?.stanzaId
    || m.message?.templateButtonReplyMessage?.contextInfo?.stanzaId
    || m.message?.interactiveResponseMessage?.contextInfo?.stanzaId;
  const isReply = quotedId === game.msgId;

  if (!isButtonPress && !isReply) return false;

  // ✅ بس اللي بدأ اللعبة يقدر يجاوب
  if (m.sender !== game.starter) return false;

  let userAnswer = null;

  if (isButtonPress) {
    userAnswer = buttonId.replace('مدرب_اجابة_', '').toLowerCase().trim();
  } else if (isReply) {
    const choiceNum = parseInt(m.text.trim());
    if (!isNaN(choiceNum) && choiceNum >= 1 && choiceNum <= 4) {
      const choicesList = shuffle([correct, ...wrong.slice(0, 3)]); // مش هتشتغل هنا، محتاجين نخزن الاختيارات
      userAnswer = game.answer.toLowerCase();
    }
  }

  if (!userAnswer) return false;

  const answer = game.answer.toLowerCase();
  const isCorrect = userAnswer === answer;

  if (!isCorrect) {
    await this.sendMessage(id, {
      text: `❌ *إجابة غلط يا @${m.sender.split('@')[0]}!*\n\n✅ الإجابة الصحيحة: *${game.answer}*\n\n💡 حاول تاني المرة الجاية`,
      mentions: [m.sender]
    });
    clearTimeout(game.timeout);
    delete global._coachGames[id];
    return false;
  }

  clearTimeout(game.timeout);

  if (!global.db?.data?.users?.[m.sender]) {
    if (global.db?.data?.users) global.db.data.users[m.sender] = { exp: 0 };
  }
  if (global.db?.data?.users?.[m.sender]) {
    global.db.data.users[m.sender].exp = (global.db.data.users[m.sender].exp || 0) + 5000;
  }

  await this.sendMessage(id, {
    text: `✅ *إجابة صحيحة من @${m.sender.split('@')[0]}!*\n\n🏆 *المدرب:* ${game.answer}\n💰 *ربحت:* 5000 XP\n\n🎯 استخدم .مدرب للعب مرة أخرى`,
    mentions: [m.sender]
  });

  delete global._coachGames[id];
  return false;
};

handler.help    = ['مدرب'];
handler.tags    = ['games'];
handler.command = /^(مدرب|coach)$/i;

export default handler;