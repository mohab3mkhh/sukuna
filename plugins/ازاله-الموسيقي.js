// plugins/remove-music.js
// إزالة الموسيقى من الأغاني عبر بوت تليجرام

import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { NewMessage } from 'telegram/events/index.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tmpDir = path.join(__dirname, '../tmp');
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

const BOT_USER = 'Master_Voice_remover_bot';
let _client = null;

async function getClient() {
  if (_client?.connected) return _client;
  const session = new StringSession(process.env.TG_SESSION || '');
  _client = new TelegramClient(session, parseInt(process.env.TG_API_ID), process.env.TG_API_HASH, { connectionRetries: 5 });
  await _client.connect();
  return _client;
}

function waitForFile(client, timeout = 60000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      client.removeEventHandler(hdl);
      reject(new Error('انتهى الوقت - ما جاش الرد من البوت'));
    }, timeout);

    const hdl = async (event) => {
      const msg = event.message;
      if (!msg) return;
      try {
        const sender = await msg.getSender();
        if (sender?.username?.toLowerCase() !== BOT_USER.toLowerCase()) return;
        if (!msg.media) return;
        clearTimeout(timer);
        client.removeEventHandler(hdl);
        resolve(msg);
      } catch {}
    };

    client.addEventHandler(hdl, new NewMessage({}));
  });
}

const handler = async (m, { conn }) => {
  // التأكد من وجود ملف صوتي (مقتبس أو مرفق)
  const quoted = m.quoted || m;
  const mime = quoted.mimetype || '';
  
  if (!mime.startsWith('audio/') && !mime.startsWith('voice/')) {
    return m.reply(`🎵 *طريقة الاستخدام:*\n\nرد على رسالة صوتية أو أغنية واكتب:\n.ازاله-الموسيقي\n\n📌 *مثال:*\n• رد على أغنية واكتب .ازاله-الموسيقي\n• البوت هيبعتلك الأغنية بدون موسيقى`);
  }

  try {
    await m.react('⏳');
    await m.reply('⏳ *جاري معالجة الأغنية...*\nسيتم إرسال صوت المغني فقط والأغنية بدون موسيقى');

    const client = await getClient();
    
    // تحميل الملف الصوتي
    const buffer = await quoted.download();
    const tmpPath = path.join(tmpDir, `audio_${Date.now()}.mp3`);
    fs.writeFileSync(tmpPath, buffer);

    // انتظار الرد من البوت
    const filePromise = waitForFile(client, 90000);
    
    // إرسال الملف لبوت إزالة الموسيقى
    await client.sendFile(BOT_USER, { file: tmpPath });

    // استقبال الردود (البوت بيرد بملفين)
    const results = [];
    
    for (let i = 0; i < 2; i++) {
      try {
        const msg = await waitForFile(client, 45000);
        const mediaBuffer = await client.downloadMedia(msg.media, { workers: 4 });
        results.push(mediaBuffer);
      } catch (e) {
        console.error('[ازاله-الموسيقي] انتظار الملف:', e.message);
        break;
      }
    }

    // تنظيف الملف المؤقت
    try { fs.unlinkSync(tmpPath); } catch {}

    if (results.length === 0) {
      await m.react('❌');
      return m.reply('❌ فشل في الحصول على الرد من البوت');
    }

    // إرسال النتائج
    for (let i = 0; i < results.length; i++) {
      const label = i === 0 ? '🎤 *صوت المغني فقط*' : '🎵 *الأغنية بدون موسيقى*';
      await conn.sendMessage(m.chat, {
        audio: Buffer.from(results[i]),
        mimetype: 'audio/mpeg',
        ptt: true,
        caption: label
      }, { quoted: m });
      // انتظار بين كل إرسال والتاني
      await new Promise(r => setTimeout(r, 1000));
    }

    await m.react('✅');
    await m.reply('✅ *تمت المعالجة بنجاح!*\nتم إرسال صوت المغني والأغنية بدون موسيقى');

  } catch (error) {
    console.error('[ازاله-الموسيقي]', error.message);
    await m.react('❌');
    await m.reply(`❌ *فشل المعالجة*\n\n⚠️ ${error.message}`);
  }
};

handler.help = ['ازاله-الموسيقي'];
handler.tags = ['tools'];
handler.command = /^(ازاله-الموسيقي|ازالة-الموسيقي|remove-music)$/i;

export default handler;