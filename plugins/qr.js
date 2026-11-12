/**
 * plugins/qr.js - توليد QR Code عبر @QRcodegen_bot
 */

import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { NewMessage } from 'telegram/events/index.js';

const BOT_USER = 'QRcodegen_bot';
let _client = null;

async function getClient() {
  if (_client?.connected) return _client;
  const session = new StringSession(process.env.TG_SESSION || '');
  _client = new TelegramClient(session, parseInt(process.env.TG_API_ID), process.env.TG_API_HASH, { connectionRetries: 5 });
  await _client.connect();
  return _client;
}

function waitForPhoto(client, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      client.removeEventHandler(hdl);
      reject(new Error('انتهى الوقت - ما جاش QR'));
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
  const url = m.text.split(' ').slice(1).join(' ').trim();
  if (!url) return m.reply('ابعت الرابط مع الأمر\nمثال: `.qr https://...`');

  try {
    const client = await getClient();
    await m.react('⏳');

    const photoPromise = waitForPhoto(client);
    await client.sendMessage(BOT_USER, { message: url });
    const photoMsg = await photoPromise;

    const buffer = await client.downloadMedia(photoMsg.media, { workers: 2 });

    await conn.sendMessage(m.chat, {
      image: Buffer.from(buffer),
      caption: `🔗 *QR Code*\n${url}`,
    }, { quoted: m });

    await m.react('✅');
  } catch (e) {
    console.error('[QR]', e.message);
    await m.react('❌');
    await m.reply(`❌ فشل\n⚠️ ${e.message}`);
  }
};

handler.help = ['qr'];
handler.tags = ['tools'];
handler.command = /^(qr|كيوار)$/i;

export default handler;