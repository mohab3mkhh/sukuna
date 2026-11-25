/**
 * plugins/بينتر.js
 * بحث وجلب صور وفيديوهات من Pinterest مع اختيار النوع (صورة / فيديو)
 */

import axios from 'axios';
import { sendButtons, btn, getButtonId } from '../lib/buttons.js';

const PREFIX = 'pinv2_';
if (!global.pinCache) global.pinCache = new Map();

const genId = () => Math.random().toString(36).slice(2, 10);

function cleanUrl(u) {
  if (!u || typeof u !== 'string') return '';
  const s = u.trim();
  return /^https?:\/\//i.test(s) ? s : '';
}

// ━━━ جلب الصور ━━━
async function searchPinImages(query) {
  let pinterest = null;
  try {
    const scraper = await import('../lib/scraper.js');
    pinterest = scraper.pinterest;
  } catch {}

  const sources = [];

  if (pinterest?.search) {
    sources.push(async () => {
      const response = await pinterest.search(query, 6);
      return (response?.result?.pins || [])
        .slice(0, 6)
        .map(pin => cleanUrl(pin?.media?.images?.orig?.url))
        .filter(Boolean);
    });
  }

  sources.push(
    async () => {
      const res = await axios.get(`https://api.siputzx.my.id/api/s/pinterest?query=${encodeURIComponent(query)}`, { timeout: 15000 });
      const arr = Array.isArray(res?.data?.data) ? res.data.data : [];
      return arr.slice(0, 6).map(r => cleanUrl(r?.images_url)).filter(Boolean);
    },
    async () => {
      const res = await axios.get(`https://api.dorratz.com/v2/pinterest?q=${encodeURIComponent(query)}`, { timeout: 15000 });
      const arr = Array.isArray(res?.data) ? res.data : [];
      return arr.slice(0, 6).map(r => cleanUrl(r?.image)).filter(Boolean);
    },
    async () => {
      const res = await axios.get(`https://pinterest-api-one.vercel.app/?q=${encodeURIComponent(query)}`, { timeout: 15000 });
      const arr = Array.isArray(res?.data?.images) ? res.data.images : [];
      return arr.slice(0, 6).map(cleanUrl).filter(Boolean);
    }
  );

  for (const fn of sources) {
    try {
      const imgs = await fn();
      if (imgs.length) return imgs;
    } catch (e) {
      console.error(`[بينتر:صور] ${e?.message || e}`);
    }
  }
  return [];
}

// ━━━ جلب الفيديوهات (مُصلّح مع بدائل) ━━━
async function searchPinVideos(query) {
  const sources = [
    async () => {
      const res = await axios.get(
        `https://the-end-api.vercel.app/home/sections/Search/api/Pin/vid?q=${encodeURIComponent(query)}`,
        { timeout: 15000 }
      );
      const raw = res?.data?.data || res?.data?.result || [];
      if (!Array.isArray(raw)) return [];
      return raw
        .map((vid, i) => ({
          title: vid?.title || `فيديو رقم ${i + 1}`,
          duration: vid?.duration || 'غير معروفة',
          video_url: cleanUrl(vid?.video_url || vid?.url || vid?.download_url),
          thumb: cleanUrl(vid?.thumbnail || vid?.image || vid?.cover)
        }))
        .filter(v => v.video_url)
        .slice(0, 8);
    },
    async () => {
      const res = await axios.get(
        `https://api.siputzx.my.id/api/s/pinterest?query=${encodeURIComponent(query + ' video')}`,
        { timeout: 15000 }
      );
      const raw = Array.isArray(res?.data?.data) ? res.data.data : [];
      return raw
        .map((item, i) => ({
          title: item?.title || `فيديو رقم ${i + 1}`,
          duration: item?.duration || 'غير معروفة',
          video_url: cleanUrl(item?.video_url || item?.videos?.url || ''),
          thumb: cleanUrl(item?.images_url || item?.image || '')
        }))
        .filter(v => v.video_url && /\.(mp4|mov|webm)|video/i.test(v.video_url))
        .slice(0, 8);
    }
  ];

  for (const fn of sources) {
    try {
      const vids = await fn();
      if (vids.length) return vids;
    } catch (e) {
      console.error(`[بينتر:فيديو] ${e?.message || e}`);
    }
  }
  return [];
}

// ━━━ عرض قائمة الصور ━━━
async function sendImageList(conn, m, query, images) {
  const rows = images.map((img, i) => {
    const id = genId();
    global.pinCache.set(id, { type: 'send_image', index: i + 1, url: img, createdAt: Date.now() });
    return {
      title: `📸 صورة ${i + 1}`,
      description: `نتيجة البحث رقم ${i + 1}`,
      id: `${PREFIX}${id}`
    };
  });

  await sendButtons(conn, m.chat, {
    title: '📌 Pinterest - صور',
    subtitle: query,
    text: `🔍 *نتائج الصور لـ:* ${query}\n📊 *العدد:* ${images.length}`,
    footer: '⛩️ SUKUNA BOT',
    image: images[0],
    buttons: [
      btn.list('📸 اختر صورة', [{ title: 'الصور', rows }]),
      btn.url('🔗 فتح في Pinterest', `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(query)}`)
    ]
  }, m);
}

// ━━━ عرض قائمة الفيديوهات ━━━
async function sendVideoList(conn, m, query, videos) {
  const rows = videos.map((vid, i) => {
    const id = genId();
    global.pinCache.set(id, {
      type: 'send_video',
      title: vid.title,
      url: vid.video_url,
      createdAt: Date.now()
    });
    return {
      title: `${i + 1}. ${String(vid.title).slice(0, 50)}`,
      description: `⏱️ المدة: ${vid.duration}`,
      id: `${PREFIX}${id}`
    };
  });

  const previewImg = videos[0]?.thumb || `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(query)}`;

  await sendButtons(conn, m.chat, {
    title: '🎬 Pinterest - فيديوهات',
    subtitle: query,
    text: `🔍 *نتائج الفيديوهات لـ:* ${query}\n📊 *العدد:* ${videos.length}`,
    footer: '⛩️ SUKUNA BOT',
    image: previewImg,
    buttons: [
      btn.list('🎬 اختر فيديو', [{ title: 'الفيديوهات', rows }]),
      btn.url('🔗 فتح في Pinterest', `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(query)}`)
    ]
  }, m);
}

// ━━━ معالج الأزرار ━━━
let before = async function (m, { conn }) {
  try {
    const buttonId = getButtonId(m);
    if (!buttonId || !buttonId.startsWith(PREFIX)) return false;

    const key = buttonId.slice(PREFIX.length);
    const data = global.pinCache.get(key);
    if (!data) return false;

    if (data.type === 'choose_image') {
      global.pinCache.delete(key);
      await m.react('⏳');
      const images = await searchPinImages(data.query);
      if (!images.length) {
        await m.react('❌');
        await m.reply(`❌ لم يتم العثور على صور لـ *"${data.query}"*.`);
        return true;
      }
      await sendImageList(conn, m, data.query, images);
      await m.react('✅');
      return true;
    }

    if (data.type === 'choose_video') {
      global.pinCache.delete(key);
      await m.react('⏳');
      const videos = await searchPinVideos(data.query);
      if (!videos.length) {
        await m.react('❌');
        await m.reply(`❌ لم يتم العثور على فيديوهات لـ *"${data.query}"* حالياً، جرب كلمة ثانية.`);
        return true;
      }
      await sendVideoList(conn, m, data.query, videos);
      await m.react('✅');
      return true;
    }

    if (data.type === 'send_image') {
      await m.react('📸');
      await conn.sendMessage(m.chat, {
        image: { url: data.url },
        caption: `📌 *الصورة رقم ${data.index}*\n\n> ⛩️ SUKUNA BOT`
      }, { quoted: m });
      await m.react('✅');
      return true;
    }

    if (data.type === 'send_video') {
      await m.react('🎬');
      await conn.sendMessage(m.chat, {
        video: { url: data.url },
        mimetype: 'video/mp4',
        caption: `🎬 *${String(data.title).slice(0, 80)}*\n\n> ⛩️ SUKUNA BOT`
      }, { quoted: m });
      await m.react('✅');
      return true;
    }

    return false;
  } catch (e) {
    console.error('[بينتر:before]', e?.message || e);
    await m.react('❌');
    await m.reply('❌ حدث خطأ أثناء تنفيذ الاختيار، حاول مرة أخرى.');
    return true;
  }
};

// ━━━ الأمر الرئيسي: يخيّر بين صورة أو فيديو ━━━
let handler = async (m, { conn, usedPrefix, command, text }) => {
  const query = (text || '').trim();
  if (!query) {
    return m.reply(`⚠️ أدخل مصطلح البحث.\n\nمثال: *${usedPrefix + command} nayeon*`);
  }

  await m.react('⌛');

  const imgId = genId();
  const vidId = genId();
  global.pinCache.set(imgId, { type: 'choose_image', query, createdAt: Date.now() });
  global.pinCache.set(vidId, { type: 'choose_video', query, createdAt: Date.now() });

  await sendButtons(conn, m.chat, {
    title: '📌 Pinterest',
    subtitle: query,
    text: `🔍 *البحث عن:* ${query}\n\nاختر النوع الذي تريد جلبه:`,
    footer: '⛩️ SUKUNA BOT',
    buttons: [
      btn.quickReply('📸 صورة', `${PREFIX}${imgId}`),
      btn.quickReply('🎬 فيديو', `${PREFIX}${vidId}`)
    ]
  }, m);

  await m.react('✅');
};

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of global.pinCache.entries()) {
    if (now - (v.createdAt || 0) > 30 * 60 * 1000) global.pinCache.delete(k);
  }
}, 5 * 60 * 1000);

handler.before = before;
handler.help = ['بينتر <كلمة>'];
handler.tags = ['tools'];
handler.command = /^(pin|بينتر|pinterest)$/i;

export default handler;