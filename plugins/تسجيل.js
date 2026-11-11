import { createHash } from 'crypto';
import fetch from 'node-fetch';
import { generateWAMessageFromContent, proto } from '@whiskeysockets/baileys';

let Reg = /\|?(.*)([.|] *?)([0-9]*)$/i;

let handler = async function (m, { conn, text, usedPrefix, command }) {
  let user = global.db.data.users[m.sender];

  // ✅ معالجة إلغاء التسجيل (لازم يكون قبل التحقق من التسجيل)
  if (text === '__unreg__') {
    user.registered = false
    user.name = ''
    user.age = 0
    user.regTime = 0
    return m.reply(`*╭──❀ ✅ ˚₊· ───❀╮*
 ✿ 𓂃 تم إلغاء تسجيلك بنجاح! 𓂃 ✿ 
 يمكنك التسجيل من جديد الآن 
*╰──❀ ✅ ˚₊· ───❀╯*`)
  }

  if (user.registered === true) {
    // ✅ عرض زر إلغاء التسجيل
    try {
      const msg = generateWAMessageFromContent(m.chat, {
        viewOnceMessage: {
          message: {
            interactiveMessage: proto.Message.InteractiveMessage.create({
              body: proto.Message.InteractiveMessage.Body.create({
                text: `*╭──❀ ⛩️ ˚₊· ───❀╮*\n ✿ 𓂃 أنت مسجل بالفعل 𓂃 ✿ \n*╰──❀ ⛩️ ˚₊· ───❀╯*\n\n⚠️ هل تريد إلغاء التسجيل والتسجيل من جديد؟`
              }),
              footer: proto.Message.InteractiveMessage.Footer.create({
                text: '⛩️ SUKUNA BOT ⛩️'
              }),
              nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
                buttons: [
                  {
                    name: 'quick_reply',
                    buttonParamsJson: JSON.stringify({
                      display_text: '❌ إلغاء التسجيل',
                      id: '__unreg__'
                    })
                  }
                ]
              })
            })
          }
        }
      }, { userJid: conn.user.jid, quoted: m })
      await conn.relayMessage(m.chat, msg.message, { messageId: msg.key.id })
    } catch(e) {
      await m.reply(`*╭──❀ ⛩️ ˚₊· ───❀╮*\n ✿ 𓂃 أنت مسجل بالفعل 𓂃 ✿ \n*╰──❀ ⛩️ ˚₊· ───❀╯*`)
    }
    return
  }

  if (!Reg.test(text)) {
    return m.reply(
      `*╔══ ∘◦ ❀ ◦∘ ══╗*\n📌 *أدخل الاسم والعمر كما يلي:*\n\n➥ *${usedPrefix + command}* محمد.25\n*╚══ ∘◦ ❀ ◦∘ ══╝*`
    );
  }

  let [_, name, splitter, age] = text.match(Reg);
  if (!name) return m.reply('*❀✧ الاسم لا يمكن أن يكون فارغًا ✧❀*');
  if (!age) return m.reply('*❀✧ العمر لا يمكن أن يكون فارغًا ✧❀*');

  age = parseInt(age);
  user.name = name.trim();
  user.age = age;
  user.regTime = +new Date();
  user.registered = true;

  let sn = createHash('md5').update(m.sender).digest('hex').slice(0, 6);

  // تحميل الصورة
  let imgUrl = `https://files.catbox.moe/u3h98g.jpg`;
  let imgBuffer;
  try {
    imgBuffer = await (await fetch(imgUrl)).buffer();
  } catch (error) {
    return m.reply('*❀ حدث خطأ أثناء تحميل الصورة، حاول لاحقًا ❀*');
  }

  let now = new Date();
  let date = now.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });

  let txt = `*╭─❀ ⛩️ ˚₊· ───❀╮*\n`;
  txt += `*│  ⛩️SUKUNA⚡️BOT⛩️*\n`;
  txt += `*╰─❀ ⛩️ ˚₊· ───❀╯*\n\n`;
  txt += `*╭── ⛩️ ˚₊· ───╮*\n`;
  txt += `❀ *الاسم:* ${name}\n`;
  txt += `❀ *العمر:* ${age} عامًا\n`;
  txt += `❀ *التاريخ:* ${date}\n`;
  txt += `❀ *الرقم التسلسلي:* ${sn}\n`;
  txt += `*╰── ⛩️ ˚₊· ───╯*\n`;

  // إرسال الصورة أولاً
  await conn.sendMessage(m.chat, {
    image: imgBuffer,
    caption: txt
  }, { quoted: m })

  // إرسال الأزرار بـ nativeFlowMessage
  try {
    const msg = generateWAMessageFromContent(m.chat, {
      viewOnceMessage: {
        message: {
          interactiveMessage: proto.Message.InteractiveMessage.create({
            body: proto.Message.InteractiveMessage.Body.create({
              text: '*❀💖 تم بواسطة فريق التطوير 💖❀*'
            }),
            footer: proto.Message.InteractiveMessage.Footer.create({
              text: '⛩️ SUKUNA BOT ⛩️'
            }),
            nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
              buttons: [
                {
                  name: 'quick_reply',
                  buttonParamsJson: JSON.stringify({
                    display_text: '｢⛩️┊اوامـر-الـبـوت┊⛩️｣',
                    id: '.اوامر'
                  })
                },
                {
                  name: 'quick_reply',
                  buttonParamsJson: JSON.stringify({
                    display_text: '｢🍷┊الــمطـور┊🍷｣',
                    id: '.owner'
                  })
                },
                {
                  name: 'quick_reply',
                  buttonParamsJson: JSON.stringify({
                    display_text: '｢🎶┊بـروفـايـلـي┊🪭｣',
                    id: `.انا @${m.sender.split('@')[0]}`
                  })
                }
              ]
            })
          })
        }
      }
    }, { userJid: conn.user.jid, quoted: m })

    await conn.relayMessage(m.chat, msg.message, { messageId: msg.key.id })
  } catch(e) {
    console.error('buttons error:', e?.message)
  }

  await m.react('✅');
};

handler.help = ['سجل'].map((v) => v + ' *<الاسم.العمر>*');
handler.tags = ['start'];
handler.command = ['verify', 'reg', 'تسجيل', 'سجل'];

export default handler;