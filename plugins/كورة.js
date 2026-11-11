/**
 * plugins/كورة.js
 * لعبة تخمين اللاعب من عينه
 */

import { sendButtons, btn, getButtonId } from '../lib/buttons.js';

const questions = [
  {
    eye: 'https://i.ibb.co/jvKXJ5By/upload-1779593632646.jpg',
    full: 'https://i.ibb.co/bjxK7dhD/upload-1779593807875.jpg',
    answer: 'جابريال باتيستوتا',
    choices: ['جابريال باتيستوتا', 'بوشكاش', 'مالديني', 'فان ليستروي']
  },
  {
    eye: 'https://i.ibb.co/v63ZNYJs/upload-1779596666375.jpg',
    full: 'https://i.ibb.co/TxRGGT9Z/upload-1779596620904.jpg',
    answer: 'بوشكاش',
    choices: ['بوشكاش', 'دي ستيفانو', 'مالديني', 'بوبي تشارلتون']
  },
  {
    eye: 'https://i.ibb.co/1Yg40SNx/upload-1779596807982.jpg',
    full: 'https://i.ibb.co/mCrhW7bW/upload-1779596822997.jpg',
    answer: 'كينان يلدز',
    choices: ['كينان يلدز', 'لوكا يوفيتش', 'أردا غوار', 'فيليكس']
  },
  {
    eye: 'https://i.ibb.co/ch6R7FXQ/upload-1779623335099.jpg',
    full: 'https://i.ibb.co/v4dxH95Y/upload-1779596944877.jpg',
    answer: 'جريزمان',
    choices: ['جريزمان', 'ديمبيلي', 'بنزيمة', 'كيليان مبابي']
  },
  {
    eye: 'https://i.ibb.co/9k41R1NB/upload-1779597108813.jpg',
    full: 'https://i.ibb.co/Lz6BYXkH/upload-1779597093060.jpg',
    answer: 'صاديو ماني',
    choices: ['صاديو ماني', 'نجولو كانتي', 'بول بوجبا', 'ويلفريد زاها']
  },
  {
    eye: 'https://i.ibb.co/JjFhX6fn/upload-1779597218207.jpg',
    full: 'https://i.ibb.co/35MKQjjN/upload-1779597206241.jpg',
    answer: 'نجولو كانتي',
    choices: ['نجولو كانتي', 'صاديو ماني', 'ريس جيمس', 'بنجامين مندي']
  },
  {
    eye: 'https://i.ibb.co/yBVXvfTt/upload-1779597312409.jpg',
    full: 'https://i.ibb.co/F4rhWR9q/upload-1779597304228.jpg',
    answer: 'كلود ماكليلي',
    choices: ['كلود ماكليلي', 'زيدان', 'تيري هنري', 'باتريك فييرا']
  },
  {
    eye: 'https://i.ibb.co/2Q3z7W5/upload-1779597970622.jpg',
    full: 'https://i.ibb.co/8nmXxQbT/upload-1779597980530.jpg',
    answer: 'محمد بركات',
    choices: ['محمد بركات', 'مصطفى محمد', 'رمضان صبحي', 'أحمد حسام ميدو']
  },
  {
    eye: 'https://i.ibb.co/0yP25V0L/upload-1779598678770.jpg',
    full: 'https://i.ibb.co/twB7pF9M/upload-1779598686542.jpg',
    answer: 'رمضان صبحي',
    choices: ['رمضان صبحي', 'محمد صلاح', 'مصطفى محمد', 'محمد بركات']
  },
  {
    eye: 'https://i.ibb.co/1tsnB48n/upload-1779598779108.jpg',
    full: 'https://i.ibb.co/sJ6xjrMn/upload-1779598799971.jpg',
    answer: 'مصطفى محمد',
    choices: ['مصطفى محمد', 'رمضان صبحي', 'محمد صلاح', 'عمرو وردة']
  },
  {
    eye: 'https://i.ibb.co/Z18nty4Q/upload-1779599670306.jpg',
    full: 'https://i.ibb.co/P3TPD0d/upload-1779599682129.jpg',
    answer: 'حمزة عبد الكريم',
    choices: ['حمزة عبد الكريم', 'محمد بركات', 'إبراهيم حسن', 'أحمد الأحمدي']
  },
  {
    eye: 'https://i.ibb.co/MkLMJfwF/upload-1779599767591.jpg',
    full: 'https://i.ibb.co/tPXVm3Sy/upload-1779599779607.jpg',
    answer: 'محمد صلاح',
    choices: ['محمد صلاح', 'رمضان صبحي', 'مصطفى محمد', 'محمد بركات']
  },
  {
    eye: 'https://i.ibb.co/Kpr06SJW/upload-1779599879427.jpg',
    full: 'https://i.ibb.co/6R1HgRgZ/upload-1779599887694.jpg',
    answer: 'فرانك ريكارد',
    choices: ['فرانك ريكارد', 'رونالدينيو', 'روماريو', 'كافو']
  },
  {
    eye: 'https://i.ibb.co/kgKFbYMF/upload-1779599981545.jpg',
    full: 'https://i.ibb.co/JjrxNvbR/upload-1779600069732.jpg',
    answer: 'اليساندرو نيستا',
    choices: ['اليساندرو نيستا', 'مالديني', 'كوستاكورتا', 'كانافارو']
  },
  {
    eye: 'https://i.ibb.co/vCjjwwfR/upload-1779600149772.jpg',
    full: 'https://i.ibb.co/B5TmfJSC/upload-1779600166756.jpg',
    answer: 'روبي كين',
    choices: ['روبي كين', 'ويين روني', 'ستيفن جيرارد', 'فرانك لامبارد']
  },
  {
    eye: 'https://i.ibb.co/VYkc3vfg/upload-1779600254377.jpg',
    full: 'https://i.ibb.co/VYkc3vfg/upload-1779600254377.jpg',
    answer: 'روبن',
    choices: ['روبن', 'فان بيرسي', 'شنايدر', 'كلاس يان هونتيلار']
  },
  {
    eye: 'https://i.ibb.co/KjXvkQQT/upload-1779600327324.jpg',
    full: 'https://i.ibb.co/wFTD0xxz/upload-1779600340209.jpg',
    answer: 'روبيرتو كارلوس',
    choices: ['روبيرتو كارلوس', 'كافو', 'روماريو', 'رونالدو نازاريو']
  },
  {
    eye: 'https://i.ibb.co/HLgpY2t3/upload-1779600428131.jpg',
    full: 'https://i.ibb.co/RGk7MTn9/upload-1779600463516.jpg',
    answer: 'روبيرتسون',
    choices: ['روبيرتسون', 'ماكالستر', 'تشيلويل', 'كيران تيرني']
  },
  {
    eye: 'https://i.ibb.co/0RFY4Qts/upload-1779600628651.jpg',
    full: 'https://i.ibb.co/k2s4PgxC/upload-1779600635778.jpg',
    answer: 'روبن دياز',
    choices: ['روبن دياز', 'ستون', 'لابورت', 'كارفاخال']
  },
  {
    eye: 'https://i.ibb.co/C5pt9pFq/upload-1779600727105.jpg',
    full: 'https://i.ibb.co/jvmXnfn4/upload-1779600735465.jpg',
    answer: 'روبن نيفيز',
    choices: ['روبن نيفيز', 'بيبي', 'جواو موتينيو', 'ريكاردو كواريسما']
  },
  {
    eye: 'https://i.ibb.co/MyqMp46s/upload-1779600805767.jpg',
    full: 'https://i.ibb.co/nNqBWGwq/upload-1779600810493.jpg',
    answer: 'روبينيو',
    choices: ['روبينيو', 'كاكا', 'رونالدينيو', 'ادريانو']
  },
  {
    eye: 'https://i.ibb.co/B2ZLWNV7/upload-1779600884889.jpg',
    full: 'https://i.ibb.co/QvVbQ3Hp/upload-1779600896949.jpg',
    answer: 'روبيرتو باجيو',
    choices: ['روبيرتو باجيو', 'ديل بيرو', 'فيورة', 'توتي']
  },
  {
    eye: 'https://i.ibb.co/My134vT3/upload-1779600980167.jpg',
    full: 'https://i.ibb.co/SXrrvq3p/upload-1779601000719.jpg',
    answer: 'روبرتو فيرمينو',
    choices: ['روبرتو فيرمينو', 'ثياجو سيلفا', 'كاسيميرو', 'فابينيو']
  },
  {
    eye: 'https://i.ibb.co/xSVWPG61/upload-1779601163990.jpg',
    full: 'https://i.ibb.co/dw1qQhw6/upload-1779601168074.jpg',
    answer: 'روبرت ليفاندوفسكي',
    choices: ['روبرت ليفاندوفسكي', 'توماس مولر', 'كيميتش', 'غوريتزكا']
  },
  {
    eye: 'https://i.ibb.co/B2dj3vHx/upload-1779601254608.jpg',
    full: 'https://i.ibb.co/4ZNttdTq/upload-1779601265982.jpg',
    answer: 'بيدري',
    choices: ['بيدري', 'جافي', 'فيران توريس', 'انسو فاتي']
  },
  {
    eye: 'https://i.ibb.co/mrmnqV7H/upload-1779601436879.jpg',
    full: 'https://i.ibb.co/qYCHF9Sj/upload-1779601446142.jpg',
    answer: 'جافي',
    choices: ['جافي', 'بيدري', 'لامين يامال', 'فرمين لوبيز']
  },
  {
    eye: 'https://i.ibb.co/DHbL1WCj/upload-1779601535045.jpg',
    full: 'https://i.ibb.co/prs2BMpS/upload-1779601543595.jpg',
    answer: 'كول بالمر',
    choices: ['كول بالمر', 'فودين', 'بيدري', 'بيلينغهام']
  },
  {
    eye: 'https://i.ibb.co/DDvHQwTJ/upload-1779601602704.jpg',
    full: 'https://i.ibb.co/RkdVdFK1/upload-1779601611715.jpg',
    answer: 'فيديريكو فالفيردي',
    choices: ['فيديريكو فالفيردي', 'كروس', 'مودريتش', 'كامافينغا']
  },
  {
    eye: 'https://i.ibb.co/S4q20Ny0/upload-1779601737147.jpg',
    full: 'https://i.ibb.co/2YS6Vbbd/upload-1779601746022.jpg',
    answer: 'أردا غوار',
    choices: ['أردا غوار', 'كينان يلدز', 'هاكان تشالهانوغلو', 'بوراك يلماز']
  },
  {
    eye: 'https://i.ibb.co/HT0pQxpN/upload-1779601809730.jpg',
    full: 'https://i.ibb.co/Q7M0vDfp/upload-1779601812637.jpg',
    answer: 'تشاوميني',
    choices: ['تشاوميني', 'كامافينغا', 'ديان', 'مالياسي']
  },
  {
    eye: 'https://i.ibb.co/LXhzNvks/upload-1779601991722.jpg',
    full: 'https://i.ibb.co/HfrqykF5/upload-1779602002438.jpg',
    answer: 'كوندي',
    choices: ['كوندي', 'اوبامايانج', 'كانتي', 'فرانك كيسي']
  },
  {
    eye: 'https://i.ibb.co/9m9PFkcp/upload-1779602067976.jpg',
    full: 'https://i.ibb.co/JWTsc0Sk/upload-1779602071287.jpg',
    answer: 'الخياندرو بالدين',
    choices: ['الخياندرو بالدين', 'كول بالمر', 'بيدري', 'جافي']
  },
  {
    eye: 'https://i.ibb.co/b5GR0Qmp/upload-1779602185671.jpg',
    full: 'https://i.ibb.co/C3rN5SNv/upload-1779602189041.jpg',
    answer: 'ايريك كانتونا',
    choices: ['ايريك كانتونا', 'زيدان', 'تيري هنري', 'باتريك فييرا']
  },
  {
    eye: 'https://i.ibb.co/V0jGG7PF/upload-1779620708596.jpg',
    full: 'https://i.ibb.co/4R6nSFZB/upload-1779620717513.jpg',
    answer: 'فورلان',
    choices: ['فورلان', 'كافاني', 'سواريز', 'رودريغيز']
  },
  {
    eye: 'https://i.ibb.co/SHfqVsk/upload-1779621179872.jpg',
    full: 'https://i.ibb.co/7d8vnq9H/upload-1779621190229.jpg',
    answer: 'انسيني',
    choices: ['انسيني', 'توتي', 'ديل بيرو', 'باولو مالديني']
  },
  {
    eye: 'https://i.ibb.co/kVmnqVH9/upload-1779621248584.jpg',
    full: 'https://i.ibb.co/gbSbhWMy/upload-1779621258613.jpg',
    answer: 'زولا',
    choices: ['زولا', 'توتي', 'باجيو', 'ديل بيرو']
  },
  {
    eye: 'https://i.ibb.co/pjxGLTZP/upload-1779621411950.jpg',
    full: 'https://i.ibb.co/j952kHdZ/upload-1779621422749.jpg',
    answer: 'اليساندرو ديل بيرو',
    choices: ['اليساندرو ديل بيرو', 'روبيرتو باجيو', 'توتي', 'زولا']
  },
  {
    eye: 'https://i.ibb.co/rRLTFCVQ/upload-1779621532377.jpg',
    full: 'https://i.ibb.co/67MSsNsy/upload-1779621540848.jpg',
    answer: 'جانيوليني بوفون',
    choices: ['جانيوليني بوفون', 'كاسياس', 'اوليفر كان', 'جيانلوكا باليوكا']
  },
  {
    eye: 'https://i.ibb.co/nHBb5kT/upload-1779621593718.jpg',
    full: 'https://i.ibb.co/Y7DxWZQ4/upload-1779621597705.jpg',
    answer: 'رونالدو نازاريو',
    choices: ['رونالدو نازاريو', 'روبينيو', 'ادريانو', 'رونالدينيو']
  },
  {
    eye: 'https://i.ibb.co/fGTfNfbG/upload-1779621734334.jpg',
    full: 'https://i.ibb.co/YFbKNwj0/upload-1779621739317.jpg',
    answer: 'ريكاردو كاكا',
    choices: ['ريكاردو كاكا', 'رونالدينيو', 'روبينيو', 'فابيانو']
  },
  {
    eye: 'https://i.ibb.co/p6ZSHTB2/upload-1779621937327.jpg',
    full: 'https://i.ibb.co/67TGf9MD/upload-1779621941783.jpg',
    answer: 'ريفالدو',
    choices: ['ريفالدو', 'رونالدينيو', 'كاكا', 'روبيرتو كارلوس']
  },
  {
    eye: 'https://i.ibb.co/DgRqRzdS/upload-1779622076502.jpg',
    full: 'https://i.ibb.co/pBVFVqNy/upload-1779622079930.jpg',
    answer: 'جاتوزو',
    choices: ['جاتوزو', 'فيورة', 'بيرلو', 'امبروزيني']
  },
  {
    eye: 'https://i.ibb.co/Zz9h0bzJ/upload-1779622138400.jpg',
    full: 'https://i.ibb.co/7xWkYW4M/upload-1779622143366.jpg',
    answer: 'مسعود اوزيل',
    choices: ['مسعود اوزيل', 'توماس مولر', 'شفاينشتايجر', 'لام']
  },
  {
    eye: 'https://i.ibb.co/SDgC2sYF/upload-1779622220843.jpg',
    full: 'https://i.ibb.co/ZzW204BG/upload-1779622225470.jpg',
    answer: 'فابيو كانافارو',
    choices: ['فابيو كانافارو', 'نيستا', 'مالديني', 'كوستاكورتا']
  },
  {
    eye: 'https://i.ibb.co/FqdvCs4R/upload-1779622314180.jpg',
    full: 'https://i.ibb.co/3mWGw24c/upload-1779622321783.jpg',
    answer: 'اليساندرو كوستاكورتا',
    choices: ['اليساندرو كوستاكورتا', 'مالديني', 'كانافارو', 'نيستا']
  },
  {
    eye: 'https://i.ibb.co/XZGjrztd/upload-1779624274722.jpg',
    full: 'https://i.ibb.co/L3K0q7G/upload-1779624278297.jpg',
    answer: 'داما',
    choices: ['دوما', 'داما', 'مهند', 'ساسكي']
  },
  {
    eye: 'https://i.ibb.co/3YzW8cNx/upload-1779624444459.jpg',
    full: 'https://i.ibb.co/mMy8p0m/upload-1779624448975.jpg',
    answer: 'دوما',
    choices: ['داما', 'مهند', 'دوما', 'ادم']
  },
  {
    eye: 'https://i.ibb.co/PGdxxkXb/upload-1779625756333.jpg',
    full: 'https://i.ibb.co/jPGGBcNN/upload-1779561045170.jpg',
    answer: 'ساسكي',
    choices: ['ادم', 'ساسكي', 'مهند', 'داما']
  },
  {
    eye: 'https://i.ibb.co/gLFJJfLB/upload-1779625879637.jpg',
    full: 'https://i.ibb.co/mVHW4KFd/upload-1779625884005.jpg',
    answer: 'ادم',
    choices: ['دوما', 'ساسكي', 'داما', 'ادم']
  },
  {
    eye: 'https://i.ibb.co/B5txCtxC/upload-1779626160059.jpg',
    full: 'https://i.ibb.co/Zz2L3d9p/upload-1779626165408.jpg',
    answer: 'مهند',
    choices: ['داما', 'دوما', 'ادم', 'مهند']
  }
];

const shuffleChoices = (choices) => [...choices].sort(() => Math.random() - 0.5);

const activeGames = {};

let handler = async (m, { conn }) => {
  const id = m.chat;
  if (activeGames[id]) return m.reply('❗ في سؤال شغال دلوقتي! اكتب .كورة لبدء سؤال جديد بعد انتهاء الوقت.');

  const q = questions[Math.floor(Math.random() * questions.length)];
  const shuffled = shuffleChoices(q.choices);

  // ✅ بناء الأزرار باستخدام btn.reply
  const buttons = shuffled.map((c, i) => 
    btn.reply(`${['1️⃣','2️⃣','3️⃣','4️⃣'][i]} ${c}`, `كورة_اجابة_${c}`)
  );

  // ✅ إرسال باستخدام sendButtons
  const sentMsg = await sendButtons(conn, id, {
    text: `👁️ *احزر اللاعب من عينيه!*\n\n⏱️ عندك 60 ثانية\n💰 الإجابة الصح = *5000 XP*`,
    footer: '⚽ لعبة كورة',
    image: q.eye,
    buttons,
    mentions: [m.sender]
  }, m);

  activeGames[id] = {
    answer: q.answer,
    full: q.full,
    msgId: sentMsg.key.id,
    answeredUsers: new Set(),
    timeout: setTimeout(() => {
      if (activeGames[id]) {
        conn.sendMessage(id, {
          image: { url: activeGames[id].full },
          caption: `⏰ انتهى الوقت!\n\n✅ *الإجابة:* ${activeGames[id].answer}`
        });
        delete activeGames[id];
      }
    }, 60000)
  };
};

handler.before = async function (m) {
  const id = m.chat;
  if (!activeGames[id]) return false;
  if (!m.text) return false;
  if (/^[.!#](كورة)$/i.test(m.text.trim())) return false;

  const game = activeGames[id];

  // ✅ استخدام getButtonId
  const buttonId = getButtonId(m);
  const isButtonPress = buttonId && buttonId.includes('كورة_اجابة_');

  // ✅ كمان الرد العادي على الرسالة
  const quotedId = m.message?.extendedTextMessage?.contextInfo?.stanzaId
    || m.message?.buttonsResponseMessage?.contextInfo?.stanzaId
    || m.message?.templateButtonReplyMessage?.contextInfo?.stanzaId
    || m.message?.interactiveResponseMessage?.contextInfo?.stanzaId;
  const isReply = quotedId === game.msgId;

  if (!isButtonPress && !isReply) return false;

  if (game.answeredUsers.has(m.sender)) return false;
  game.answeredUsers.add(m.sender);

  let userAnswer = null;

  if (isButtonPress) {
    userAnswer = buttonId.replace('كورة_اجابة_', '').toLowerCase().trim();
  } else if (isReply) {
    const choiceNum = parseInt(m.text.trim());
    if (!isNaN(choiceNum) && choiceNum >= 1 && choiceNum <= 4) {
      userAnswer = game.answer.toLowerCase();
    }
  }

  if (!userAnswer) return false;

  const answer = game.answer.toLowerCase();
  const isCorrect = userAnswer.includes(answer) || answer.includes(userAnswer);

  if (!isCorrect) {
    await this.sendMessage(id, {
      text: `❌ *إجابة غلط يا @${m.sender.split('@')[0]}!*\n\n💡 الإجابة الصحيحة: *${game.answer}*`,
      mentions: [m.sender]
    }, { quoted: m });
    return false;
  }

  clearTimeout(game.timeout);

  if (!global.db.data.users[m.sender]) global.db.data.users[m.sender] = { exp: 0 };
  global.db.data.users[m.sender].exp = (global.db.data.users[m.sender].exp || 0) + 5000;

  await this.sendMessage(id, {
    image: { url: game.full },
    caption: `✅ *إجابة صحيحة من @${m.sender.split('@')[0]}!*\n\n🏆 *اللاعب:* ${game.answer}\n💰 *ربحت:* 5000 XP`,
    mentions: [m.sender]
  }, { quoted: m });

  delete activeGames[id];
  return false;
};

handler.help = ['كورة'];
handler.tags = ['game'];
handler.command = /^(كورة)$/i;

export default handler;