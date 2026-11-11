/**
 * plugins/numbers.js
 * جلب أرقام من @Allnumbersultraplus_Bot
 */

import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { NewMessage } from 'telegram/events/index.js';

// ✅ استخدام ملف الأزرار
import { sendButtons, btn, getButtonId } from '../lib/buttons.js';

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

async function sendAndWait(client, message, timeout = 20000) {
  const replyPromise = waitForReply(client, timeout);
  await client.sendMessage(BOT_USER, { message });
  return replyPromise;
}

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
  const userId = m.sender;

  // ✅ الأول: لو في اختيار محفوظ من قائمة سابقة
  if (global._tgButtons?.[userId]) {
    const saved = global._tgButtons[userId];
    const idx = parseInt(input) - 1;
    let targetBtn = null;

    if (!isNaN(idx) && saved.buttons[idx]) {
      targetBtn = saved.buttons[idx];
    } else {
      targetBtn = saved.buttons.find(b => b.text?.toLowerCase().includes(input.toLowerCase()));
    }

    if (targetBtn) {
      try {
        await m.react('⏳');
        const client = await getClient();
        console.log('[TG] Clicking:', targetBtn.text);

        const numbersMsg = await clickButton(client, saved.msg, targetBtn.data);
        const text2 = numbersMsg.text || numbersMsg.message || 'مفيش رد';

        await sendButtons(conn, m.chat, {
          title: '📱 نتيجة البحث',
          subtitle: targetBtn.text,
          text: text2,
          footer: '⛩️ SUKUNA BOT',
          buttons: [
            btn.reply('🔄 طلب جديد', `.${command}`),
            btn.reply('📋 القائمة', `.${command} قائمة`)
          ]
        }, m);

        await m.react('✅');

        // حفظ الأزرار الجديدة لو في
        const newBtns = numbersMsg.replyMarkup?.rows?.flatMap(r => r.buttons) || [];
        if (newBtns.length) {
          global._tgButtons[userId] = { buttons: newBtns, msg: numbersMsg };
        } else {
          delete global._tgButtons[userId];
        }

        return;
      } catch (e) {
        console.error('[Numbers]', e.message);
        await m.react('❌');
        await m.reply(`❌ *فشل*\n\n⚠️ ${e.message}`);
        return;
      }
    }
  }

  // ✅ لو مفيش input، بعت /start وبعت القائمة
  if (!input || input === 'قائمة') {
    try {
      await m.react('⏳');
      const client = await getClient();
      const startMsg = await sendAndWait(client, '/start');
      const buttons = startMsg.replyMarkup?.rows?.flatMap(r => r.buttons) || [];

      if (!buttons.length) {
        await m.react('❌');
        return m.reply(startMsg.text || 'مفيش أزرار');
      }

      // ✅ حفظ الأزرار
      if (!global._tgButtons) global._tgButtons = {};
      global._tgButtons[userId] = { buttons, msg: startMsg };

      // ✅ بناء أزرار القائمة باستخدام btn.list
      const rows = buttons.map((b, i) => ({
        title: `${i + 1}. ${b.text}`,
        description: 'اختر هذا الخيار',
        id: `numbers_pick_${i}`
      }));

      await sendButtons(conn, m.chat, {
        title: '🌍 الأرقام المتاحة',
        subtitle: 'اختر الدولة',
        text: `اختر الدولة اللي عايز أرقام منها:`,
        footer: '⛩️ SUKUNA BOT',
        buttons: [btn.list('📋 قائمة الدول', [{
          title: 'الدول',
          rows
        }])]
      }, m);

      await m.react('✅');
      return;

    } catch (e) {
      console.error('[Numbers]', e.message);
      await m.react('❌');
      await m.reply(`❌ *فشل*\n\n⚠️ ${e.message}`);
      return;
    }
  }

  // ✅ لو في input بس مفيش saved buttons، نجيب /start ونختار
  try {
    await m.react('⏳');
    const client = await getClient();
    const startMsg = await sendAndWait(client, '/start');
    const buttons = startMsg.replyMarkup?.rows?.flatMap(r => r.buttons) || [];

    if (!buttons.length) {
      await m.react('❌');
      return m.reply(startMsg.text || 'مفيش أزرار');
    }

    // البحث عن الزر
    const idx = parseInt(input) - 1;
    let targetBtn = null;

    if (!isNaN(idx) && buttons[idx]) {
      targetBtn = buttons[idx];
    } else {
      targetBtn = buttons.find(b => b.text?.toLowerCase().includes(input.toLowerCase()));
    }

    if (!targetBtn) {
      await m.react('❌');
      return m.reply(`❌ مش لاقي "${input}" — بعت \`${usedPrefix}${command}\` عشان تشوف القائمة`);
    }

    console.log('[TG] Clicking:', targetBtn.text);

    const numbersMsg = await clickButton(client, startMsg, targetBtn.data);
    const text2 = numbersMsg.text || numbersMsg.message || 'مفيش رد';

    await sendButtons(conn, m.chat, {
      title: '📱 نتيجة البحث',
      subtitle: targetBtn.text,
      text: text2,
      footer: '⛩️ SUKUNA BOT',
      buttons: [
        btn.reply('🔄 طلب جديد', `.${command}`),
        btn.reply('📋 القائمة', `.${command} قائمة`)
      ]
    }, m);

    await m.react('✅');

    // حفظ الأزرار الجديدة
    const newBtns = numbersMsg.replyMarkup?.rows?.flatMap(r => r.buttons) || [];
    if (newBtns.length) {
      if (!global._tgButtons) global._tgButtons = {};
      global._tgButtons[userId] = { buttons: newBtns, msg: numbersMsg };
    }

  } catch (e) {
    console.error('[Numbers]', e.message);
    await m.react('❌');
    await m.reply(`❌ *فشل*\n\n⚠️ ${e.message}`);
  }
};

// ✅ معالج الضغط على أزرار القائمة
handler.before = async function (m, { conn }) {
  const userId = m.sender;
  const buttonId = getButtonId(m);
  
  if (!buttonId || !buttonId.startsWith('numbers_pick_')) return false;

  try {
    const idx = parseInt(buttonId.replace('numbers_pick_', ''));
    const saved = global._tgButtons?.[userId];
    
    if (!saved) return m.reply('❌ مفيش قائمة محفوظة، ابعت الأمر تاني');

    const targetBtn = saved.buttons[idx];
    if (!targetBtn) return m.reply('❌ الخيار غير موجود');

    await m.react('⏳');
    const client = await getClient();
    console.log('[TG] Clicking:', targetBtn.text);

    const numbersMsg = await clickButton(client, saved.msg, targetBtn.data);
    const text2 = numbersMsg.text || numbersMsg.message || 'مفيش رد';

    await sendButtons(conn, m.chat, {
      title: '📱 نتيجة البحث',
      subtitle: targetBtn.text,
      text: text2,
      footer: '⛩️ SUKUNA BOT',
      buttons: [
        btn.reply('🔄 طلب جديد', '.نمبر'),
        btn.reply('📋 القائمة', '.نمبر قائمة')
      ]
    }, m);

    await m.react('✅');

    // حفظ الأزرار الجديدة
    const newBtns = numbersMsg.replyMarkup?.rows?.flatMap(r => r.buttons) || [];
    if (newBtns.length) {
      global._tgButtons[userId] = { buttons: newBtns, msg: numbersMsg };
    } else {
      delete global._tgButtons[userId];
    }

    return true;
  } catch (e) {
    console.error('[Numbers]', e.message);
    await m.react('❌');
    await m.reply(`❌ *فشل*\n\n⚠️ ${e.message}`);
    return true;
  }
};

handler.help    = ['نمبر'];
handler.tags    = ['tools'];
handler.command = /^(نمبر|number|numbers|ارقام)$/i;

export default handler;