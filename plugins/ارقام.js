/**
 * plugins/numbers.js
 * جيب أرقام من @Allnumbersultraplus_Bot
 */

import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { NewMessage } from 'telegram/events/index.js';
import * as pkg from '@whiskeysockets/baileys';
const { generateWAMessageFromContent, proto } = pkg;

const API_ID   = parseInt(process.env.TG_API_ID);
const API_HASH = process.env.TG_API_HASH;
const BOT_USER = 'Allnumbersultraplus_Bot';

let _client = null;

async function getClient() {
  if (_client?.connected) return _client;

  const session = new StringSession(process.env.TG_SESSION || '');
  const client  = new TelegramClient(session, API_ID, API_HASH, {
    connectionRetries: 5,
  });

  await client.connect();
  console.log('[TG] ✅ Connected');
  _client = client;
  return client;
}

// ══════════════════════════════════════════════════
//  انتظر رد من البوت
// ══════════════════════════════════════════════════
function waitForReply(client, timeout = 20000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      client.removeEventHandler(handler);
      reject(new Error('انتهى الوقت'));
    }, timeout);

    const handler = async (event) => {
      const msg = event.message;
      if (!msg) return;
      try {
        const sender = await msg.getSender();
        if (sender?.username?.toLowerCase() === BOT_USER.toLowerCase()) {
          clearTimeout(timer);
          client.removeEventHandler(handler);
          resolve(msg);
        }
      } catch (e) {}
    };

    client.addEventHandler(handler, new NewMessage({}));
  });
}

// ══════════════════════════════════════════════════
//  بعت رسالة وانتظر رد
// ══════════════════════════════════════════════════
async function sendAndWait(client, message, timeout = 20000) {
  const replyPromise = waitForReply(client, timeout);
  await client.sendMessage(BOT_USER, { message });
  return replyPromise;
}

// ══════════════════════════════════════════════════
//  اضغط زرار inline
// ══════════════════════════════════════════════════
async function clickButton(client, msg, btnData) {
  const replyPromise = waitForReply(client, 20000);
  await msg.click({ data: btnData });
  return replyPromise;
}

// ══════════════════════════════════════════════════
//  Handler
// ══════════════════════════════════════════════════
const handler = async (m, { conn, text, usedPrefix, command }) => {
  const input = (text || '').trim();

  try {
    const client = await getClient();

    // لو مفيش input، بعت /start وبعت القائمة
    if (!input) {
      await m.react('⏳');
      const startMsg = await sendAndWait(client, '/start');
      const buttons  = startMsg.replyMarkup?.rows?.flatMap(r => r.buttons) || [];

      if (!buttons.length) {
        return conn.sendMessage(m.chat, { text:startMsg.text || 'مفيش أزرار');
      }

      // بعت القائمة للمستخدم
      const list = buttons.map((b, i) => `*${i + 1}.* ${b.text}`).join('\n');

      // احفظ الأزرار
      if (!global._tgButtons) global._tgButtons = {};
      global._tgButtons[m.sender] = { buttons, msg: startMsg };

      await conn.sendMessage(m.chat, { text:
        `🌍 *اختار الدولة:*\n\n${list}\n\n` +
        `ابعت الرقم أو اسم الدولة\n` +
        `مثال: \`${usedPrefix}${command} 1\``
      );
      await m.react('✅');
      return;
    }

    // لو في input، دور على الزرار المناسب
    await m.react('⏳');

    const saved  = global._tgButtons?.[m.sender];
    let targetBtn = null;
    let startMsg  = null;

    if (saved) {
      const { buttons, msg } = saved;
      // بحث بالرقم أو الاسم
      const idx = parseInt(input) - 1;
      if (!isNaN(idx) && buttons[idx]) {
        targetBtn = buttons[idx];
        startMsg  = msg;
      } else {
        targetBtn = buttons.find(b => b.text?.toLowerCase().includes(input.toLowerCase()));
        startMsg  = msg;
      }
    }

    // لو مش لاقي، ابعت /start من أول
    if (!targetBtn) {
      startMsg      = await sendAndWait(client, '/start');
      const buttons = startMsg.replyMarkup?.rows?.flatMap(r => r.buttons) || [];
      const idx     = parseInt(input) - 1;
      targetBtn     = !isNaN(idx) ? buttons[idx] : buttons.find(b => b.text?.toLowerCase().includes(input.toLowerCase()));
    }

    if (!targetBtn) {
      await m.react('❌');
      return conn.sendMessage(m.chat, { text:`❌ مش لاقي "${input}" — بعت \`${usedPrefix}${command}\` عشان تشوف القائمة`);
    }

    console.log('[TG] Clicking:', targetBtn.text);

    // اضغط الزرار
    const numbersMsg = await clickButton(client, startMsg, targetBtn.data);
    const text2      = numbersMsg.text || numbersMsg.message || 'مفيش رد';

    await conn.sendMessage(m.chat, { text:`📱 *${targetBtn.text}*\n\n${text2}`);
    await m.react('✅');

    // احفظ الأزرار الجديدة لو في
    const newBtns = numbersMsg.replyMarkup?.rows?.flatMap(r => r.buttons) || [];
    if (newBtns.length) {
      if (!global._tgButtons) global._tgButtons = {};
      global._tgButtons[m.sender] = { buttons: newBtns, msg: numbersMsg };
    }

  } catch (e) {
    console.error('[Numbers]', e.message);
    await m.react('❌');
    await conn.sendMessage(m.chat, { text:`❌ *فشل*\n\n⚠️ ${e.message}`);
  }
};

handler.help    = ['نمبر'];
handler.tags    = ['tools'];
handler.command = /^(نمبر|number|numbers|ارقام)$/i;
export default handler;