/**
 * plugins/numbers2.js
 */

import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { NewMessage } from 'telegram/events/index.js';

const API_ID   = parseInt(process.env.TG_API_ID);
const API_HASH = process.env.TG_API_HASH;
const BOT_USER = 'Mwew1bot';

let _client2 = null;

async function getClient() {
  if (_client2?.connected) return _client2;
  const session = new StringSession(process.env.TG_SESSION || '');
  const client  = new TelegramClient(session, API_ID, API_HASH, { connectionRetries: 5 });
  await client.connect();
  _client2 = client;
  return client;
}

async function isFromBot(msg) {
  try {
    const fromId = msg.peerId?.userId?.toString() || msg.fromId?.userId?.toString() || '';
    if (global._tgBotId2 && fromId === global._tgBotId2) return true;
    const sender = await msg.getSender();
    if (sender?.username?.toLowerCase() === BOT_USER.toLowerCase()) {
      if (fromId) global._tgBotId2 = fromId;
      return true;
    }
  } catch {}
  return false;
}

function waitForReply(client, checkFn = () => true, timeout = 25000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      client.removeEventHandler(hdl);
      reject(new Error('انتهى الوقت'));
    }, timeout);
    const hdl = async (event) => {
      const msg = event.message;
      if (!msg) return;
      if (!(await isFromBot(msg))) return;
      if (!checkFn(msg)) return;
      clearTimeout(timer);
      client.removeEventHandler(hdl);
      resolve(msg);
    };
    client.addEventHandler(hdl, new NewMessage({}));
  });
}

async function sendAndWait(client, message, checkFn = () => true, timeout = 25000) {
  const p = waitForReply(client, checkFn, timeout);
  await new Promise(r => setTimeout(r, 500));
  await client.sendMessage(BOT_USER, { message });
  return p;
}

// استخرج الأرقام من أزرار الرسالة
function extractNumbersFromButtons(msg) {
  const btns = msg.replyMarkup?.rows?.flatMap(r => r.buttons) || [];
  return btns
    .map(b => b.text?.trim())
    .filter(t => t && /\+\d{7,}/.test(t))
    .map(t => t.replace(/[^\d+]/g, '').trim());
}

// poll على الرسالة وانتظر لما تظهر أرقام في الأزرار
async function clickAndWaitForNumbers(client, msg, btnData, timeout = 60000) {
  await msg.click({ data: btnData });

  const start = Date.now();
  while (Date.now() - start < timeout) {
    await new Promise(r => setTimeout(r, 1500));
    try {
      const msgs = await client.getMessages(BOT_USER, { limit: 3 });
      for (const m of msgs || []) {
        const numbers = extractNumbersFromButtons(m);
        if (numbers.length > 0) {
          console.log('[TG2] Found numbers:', numbers);
          return { msg: m, numbers };
        }
      }
    } catch (e) {
      console.log('[Poll error]', e.message);
    }
  }
  throw new Error('انتهى الوقت — مش لاقي أرقام');
}

function findBtn(allBtns, query) {
  const idx = parseInt(query) - 1;
  if (!isNaN(idx) && allBtns[idx]) return allBtns[idx];
  return allBtns.find(b => b.text?.toLowerCase().includes(query.toLowerCase()));
}

async function getCountryList(client) {
  const countryMsg = await sendAndWait(
    client,
    '📞 الحصول على رقم',
    msg => {
      const btns = msg.replyMarkup?.rows?.flatMap(r => r.buttons) || [];
      return btns.length > 2;
    }
  );
  const allBtns  = countryMsg.replyMarkup?.rows?.flatMap(r => r.buttons) || [];
  const filtered = allBtns.filter(b =>
    !b.text?.includes('رجوع') &&
    !b.text?.includes('الأرقام النشطة') &&
    !b.text?.includes('تغيير اللغة')
  );
  return { buttons: filtered, allBtns, msg: countryMsg };
}

const handler = async (m, { text, usedPrefix, command }) => {
  const input = (text || '').trim();

  try {
    const client = await getClient();
    await m.react('⏳');

    if (!input) {
      const { buttons, allBtns, msg } = await getCountryList(client);
      if (!global._tgCache2) global._tgCache2 = {};
      global._tgCache2[m.sender] = { buttons, allBtns, msg };

      const list = buttons.map((b, i) => `*${i + 1}.* ${b.text}`).join('\n');
      await m.reply(
        `🌍 *Tech Universe — اختار الدولة:*\n\n${list}\n\n` +
        `مثال: \`${usedPrefix}${command} 1\` أو \`${usedPrefix}${command} sudan\``
      );
      await m.react('✅');
      return;
    }

    let cached = global._tgCache2?.[m.sender];
    if (!cached) {
      const result = await getCountryList(client);
      cached = result;
      if (!global._tgCache2) global._tgCache2 = {};
      global._tgCache2[m.sender] = cached;
    }

    const targetBtn = findBtn(cached.allBtns, input);
    if (!targetBtn) {
      await m.react('❌');
      return m.reply(`❌ مش لاقي "${input}"\nابعت \`${usedPrefix}${command}\` تشوف القائمة`);
    }

    console.log('[TG2] Clicking:', targetBtn.text);
    const { msg: resultMsg, numbers } = await clickAndWaitForNumbers(client, cached.msg, targetBtn.data);

    const txt = resultMsg.text || resultMsg.message || '';
    const reply =
      `📱 *${targetBtn.text}*\n\n` +
      `${txt}\n\n` +
      `📞 *الأرقام:*\n${numbers.join('\n')}`;

    await m.reply(reply);
    await m.react('✅');

    // حدث الـ cache
    const newBtns = resultMsg.replyMarkup?.rows?.flatMap(r => r.buttons) || [];
    if (newBtns.length) {
      global._tgCache2[m.sender] = { buttons: newBtns, allBtns: newBtns, msg: resultMsg };
    }

  } catch (e) {
    console.error('[Numbers2]', e.message);
    await m.react('❌');
    await m.reply(`❌ *فشل*\n\n⚠️ ${e.message}`);
  }
};

handler.help    = ['ارقام2'];
handler.tags    = ['tools'];
handler.command = /^(نمبر2|number2|numbers2|ارقام2)$/i;
export default handler;