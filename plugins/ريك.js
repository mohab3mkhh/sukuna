/**
 * plugins/ريك.js
 * تحميل أغاني من يوتيوب عبر بوت YinstaBot
 */

import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { NewMessage } from 'telegram/events/index.js';
import { Api } from 'telegram/tl/index.js';

// ✅ استخدام ملف buttons
import { sendButtons, btn, getButtonId } from '../lib/buttons.js';

import axios from 'axios';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import os from 'os';
import path from 'path';

const execAsync = promisify(exec);
const BOT_USER = 'YinstaBot';
const THUMBNAIL_URL = 'https://files.catbox.moe/i6q798.jpg';
const SYSTEM_NAME = '◜⏤͟͟͞͞ 𝙎𝙐𝙆𝙐𝙉𝘼 ✦ 𝙈𝙐𝙎𝙄𝘾 ˖࣪⃟⛩️ ◞';

let _client = null;

async function getClient() {
  if (_client?.connected) return _client;
  const session = new StringSession(process.env.TG_SESSION || '');
  _client = new TelegramClient(session, parseInt(process.env.TG_API_ID), process.env.TG_API_HASH, { connectionRetries: 5 });
  await _client.connect();
  return _client;
}

function waitForButtons(client, timeout = 40000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      client.removeEventHandler(hdl);
      reject(new Error('انتهى الوقت - ما جاش رد من البوت'));
    }, timeout);

    const hdl = async (event) => {
      const msg = event.message;
      if (!msg) return;
      try {
        const sender = await msg.getSender();
        if (sender?.username?.toLowerCase() !== BOT_USER.toLowerCase()) return;
        const buttons = msg.replyMarkup?.rows;
        if (!buttons?.length) return;
        clearTimeout(timer);
        client.removeEventHandler(hdl);
        resolve(msg);
      } catch {}
    };

    client.addEventHandler(hdl, new NewMessage({}));
  });
}

function waitForFile(client, timeout = 120000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      client.removeEventHandler(hdl);
      reject(new Error('انتهى الوقت - ما جاش الملف'));
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

async function searchYouTube(query) {
  const payload = {
    query,
    context: {
      client: {
        clientName: 'WEB',
        clientVersion: '2.20260603.00.00',
        hl: 'ar',
        gl: 'EG',
        platform: 'MOBILE',
        osName: 'Android',
        osVersion: '10',
        deviceModel: 'android 10.0'
      }
    }
  };

  const { data } = await axios.post(
    'https://www.youtube.com/youtubei/v1/search?prettyPrint=false',
    payload,
    {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36',
        'Accept': '*/*',
        'Accept-Language': 'ar,en-GB;q=0.9,en-US;q=0.8,en;q=0.7',
        'Origin': 'https://www.youtube.com',
        'Referer': 'https://www.youtube.com/',
        'x-youtube-client-name': '1',
        'x-youtube-client-version': '2.20260603.00.00',
      },
      timeout: 15000
    }
  );

  const sectionContents =
    data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents ?? [];

  let items = [];
  for (const section of sectionContents) {
    const rows = section?.itemSectionRenderer?.contents;
    if (rows?.length) { items = rows; break; }
  }

  const videos = [];
  for (const item of items) {
    const vr = item?.videoRenderer;
    if (!vr?.videoId) continue;
    const seconds = (() => {
      const t = vr.lengthText?.simpleText ?? '';
      const parts = t.split(':').map(Number);
      if (parts.length === 2) return parts[0] * 60 + parts[1];
      if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
      return 0;
    })();
    videos.push({
      videoId: vr.videoId,
      title: vr.title?.runs?.[0]?.text ?? 'بدون عنوان',
      url: `https://www.youtube.com/watch?v=${vr.videoId}`,
      timestamp: vr.lengthText?.simpleText ?? 'N/A',
      channel: vr.ownerText?.runs?.[0]?.text ?? 'N/A',
      seconds
    });
    if (videos.length >= 8) break;
  }

  return videos;
}

async function downloadAudio(url) {
  const client = await getClient();

  const buttonsPromise = waitForButtons(client);
  await client.sendMessage(BOT_USER, { message: url });
  const btnMsg = await buttonsPromise;

  let targetButton = null;
  for (const row of btnMsg.replyMarkup.rows) {
    for (const btn of row.buttons) {
      if (btn.text?.toLowerCase().includes('video')) {
        targetButton = btn;
        break;
      }
    }
    if (targetButton) break;
  }

  if (!targetButton) throw new Error('مش لاقي زرار الفيديو');

  const filePromise = waitForFile(client);
  client.invoke(new Api.messages.GetBotCallbackAnswer({
    peer: BOT_USER,
    msgId: btnMsg.id,
    data: targetButton.data,
  })).catch(() => {});

  const fileMsg = await filePromise;
  const videoBuffer = await client.downloadMedia(fileMsg.media, { workers: 4 });

  const tmpDir = os.tmpdir();
  const ts = Date.now();
  const videoPath = path.join(tmpDir, `rek_${ts}.mp4`);
  const audioPath = path.join(tmpDir, `rek_${ts}.mp3`);

  fs.writeFileSync(videoPath, Buffer.from(videoBuffer));
  await execAsync(`ffmpeg -i "${videoPath}" -vn -acodec mp3 -q:a 2 "${audioPath}"`, { timeout: 60000 });

  const audioBuffer = fs.readFileSync(audioPath);

  fs.unlinkSync(videoPath);
  fs.unlinkSync(audioPath);

  return audioBuffer;
}

const handler = async (m, { conn, usedPrefix, command, text }) => {
  const query = (text || '').trim();

  if (!query) {
    return m.reply(
      `╭┈➤🎧 *تحميل الأغاني من يوتيوب* 🎶\n` +
      `╰┈──────────── ೄྀ࿐ ˊˎ-\n\n` +
      `• ${usedPrefix}${command} <اسم الأغنية> - للبحث والتحميل\n` +
      `• ${usedPrefix}${command} <رابط يوتيوب> - للتحميل المباشر`
    );
  }

  if (query.includes('youtube.com/watch') || query.includes('youtu.be/')) {
    await m.react('⏳');
    await m.reply('⏳ جاري تحميل الأغنية...');
    try {
      const buffer = await downloadAudio(query);
      await conn.sendMessage(m.chat, {
        audio: Buffer.from(buffer),
        mimetype: 'audio/mpeg',
        fileName: 'audio.mp3',
      }, { quoted: m });
      await m.react('✅');
    } catch (e) {
      await m.react('❌');
      await m.reply(`╭┈➤💥 *${e.message}*\n╰┈──────────── ೄྀ࿐ ˊˎ-`);
    }
    return;
  }

  try {
    await m.react('🔎');
    const results = await searchYouTube(query);

    if (!results.length) {
      await m.react('❌');
      return m.reply(`╭┈➤💥 *مفيش نتايج لـ "${query}"*\n╰┈──────────── ೄྀ࿐ ˊˎ-`);
    }

    const filtered = results.filter(v => v.seconds <= 900);
    if (!filtered.length) {
      await m.react('❌');
      return m.reply('❌ كل النتائج أطول من 15 دقيقة!');
    }

    // ✅ بناء أزرار القائمة باستخدام btn.list من ملفك
    const sections = [{
      title: '🎶 نتائج البحث',
      rows: filtered.map((v, i) => ({
        title: `${i + 1}. ${v.title.slice(0, 50)}${v.title.length > 50 ? '…' : ''}`,
        description: `⏱️ ${v.timestamp} | 📺 ${v.channel}`,
        id: `rek|${v.url}|${v.title}`
      }))
    }];

    // ✅ إرسال باستخدام sendButtons
    await sendButtons(conn, m.chat, {
      title: '🔍 نتائج البحث',
      subtitle: query,
      text: `╭┈➤🔍 *نتائج البحث عن:* ${query}\n╰┈──────────── ೄྀ࿐ ˊˎ-\n\nاختر الأغنية:`,
      footer: SYSTEM_NAME,
      image: THUMBNAIL_URL,
      buttons: [btn.list('🎵 اختر أغنية', sections)]
    }, m);

    await m.react('✅');

  } catch (err) {
    console.error('[ريك Search]', err);
    await m.react('❌');
    await m.reply('❌ حدث خطأ أثناء البحث');
  }
}

handler.before = async function (m, { conn }) {
  try {
    // ✅ استخدام getButtonId من ملفك
    const selectedId = getButtonId(m);

    if (!selectedId || !selectedId.startsWith('rek|')) return;

    const [, url, title] = selectedId.split('|');

    await m.react('⏳');
    await conn.sendMessage(m.chat, {
      text: `⏳ *جاري تحميل:*\n🎵 ${title}`
    }, { quoted: m });

    try {
      const buffer = await downloadAudio(url);

      await conn.sendMessage(m.chat, {
        audio: Buffer.from(buffer),
        mimetype: 'audio/mpeg',
        fileName: `${title.slice(0, 30)}.mp3`,
        caption: `╭┈➤✅ *تم التحميل*\n🎵 ${title}\n╰┈──────────── ೄྀ࿐ ˊˎ-`
      }, { quoted: m });

      await m.react('✅');
    } catch (e) {
      console.error('[ريك Download]', e.message);
      await m.react('❌');
      await conn.sendMessage(m.chat, {
        text: `╭┈➤💥 *فشل التحميل: ${e.message}*\n╰┈──────────── ೄྀ࿐ ˊˎ-`
      }, { quoted: m });
    }

    return true;
  } catch (e) {
    console.error('[ريك before]', e.message);
  }
}

handler.help = ['ريك <اسم الأغنية>'];
handler.tags = ['tools'];
handler.command = /^(ريك)$/i;

export default handler;