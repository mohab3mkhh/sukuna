/**
 * plugins/بينتر.js
 * بحث Pinterest: يخيّرك صور / فيديو
 *  - الصور: قائمة 10 نتايج عشوائية
 *  - الفيديوهات: كاروسيل 6 فيديوهات عشوائية (نفس طريقة إرسال أمر التيك توك)
 */

import axios from 'axios';
import * as _baileys from '@whiskeysockets/baileys';
import { sendButtons, btn, getButtonId } from '../lib/buttons.js';

const B = _baileys.generateWAMessageFromContent ? _baileys : (_baileys.default || _baileys);
const { proto, generateWAMessageFromContent, generateWAMessageContent } = B;

const PREFIX = 'pinv2_';
const IMAGE_COUNT = 10;      // أقصى حد لصفوف القائمة في واتساب = 10
const VIDEO_CARDS = 6;       // عدد كروت الفيديو في الكاروسيل
const VIDEO_POOL = 40;       // عدد الفيديوهات الاحتياطية (لو بعضها فشل تحميله)
const CONCURRENCY = 3;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

if (!global.pinCache) global.pinCache = new Map();

const genId = () => Math.random().toString(36).slice(2, 10);

const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const uniqBy = (arr, f) => {
  const seen = new Set();
  return arr.filter(x => {
    const k = f(x);
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

// يدوّر على دالة الرد السريع بأي اسم في lib/buttons.js، ولو مفيش يبني الزرار بنفسه
function quick(text, id) {
  const name = ['quickReply', 'quick_reply', 'reply', 'quick', 'button', 'cta_reply']
    .find(k => typeof btn?.[k] === 'function')
    || Object.keys(btn || {}).find(k => /quick|reply/i.test(k) && typeof btn[k] === 'function');
  if (name) return btn[name](text, id);
  console.error('[بينتر] btn keys:', Object.keys(btn || {}));
  return { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: text, id }) };
}

function cleanUrl(u) {
  if (!u || typeof u !== 'string') return '';
  const s = u.trim();
  return /^https?:\/\//i.test(s) ? s : '';
}

// يشغّل كل المصادر مع بعض (لكل مصدر مهلة صارمة) ويجمع نتايجها كلها
async function collect(fns, ms, tag) {
  const settled = await Promise.all(fns.map(([name, fn]) =>
    Promise.race([
      Promise.resolve().then(fn),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))
    ]).catch(e => {
      console.error(`[بينتر:${tag}:${name}] ${e?.message || e}`);
      return [];
    })
  ));
  return settled.flat();
}

const isMp4 = buf => buf && buf.length > 12 && buf.subarray(4, 8).toString('latin1') === 'ftyp';

async function downloadMp4(url) {
  const res = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 60000,
    maxContentLength: 64 * 1024 * 1024,
    headers: { 'User-Agent': UA, Referer: 'https://www.pinterest.com/' }
  });
  const buf = Buffer.from(res.data);
  if (buf.length < 10000) throw new Error('فيديو صغير جدًا');
  if (!isMp4(buf)) throw new Error('فيديو غير سليم');
  return buf;
}

// ━━━ Pinterest مباشرة ━━━
async function pinterestDirect(query, scope) {
  const data = { options: { query, scope, page_size: 50, no_fetch_context_on_resource: false }, context: {} };
  const res = await axios.get('https://www.pinterest.com/resource/BaseSearchResource/get/', {
    params: { source_url: `/search/${scope}/?q=${query}`, data: JSON.stringify(data), _: Date.now() },
    headers: {
      'User-Agent': UA,
      'Accept': 'application/json, text/javascript, */*, q=0.01',
      'Accept-Language': 'en-US,en;q=0.9',
      'X-Requested-With': 'XMLHttpRequest',
      'X-Pinterest-AppState': 'active',
      'X-Pinterest-PWS-Handler': 'www/search/[scope].js'
    },
    timeout: 20000
  });
  return res?.data?.resource_response?.data?.results || [];
}

// ━━━ جلب الصور (يجمع كل المصادر ويخلط) ━━━
async function searchPinImages(query) {
  const sources = [
    ['direct', async () => (await pinterestDirect(query, 'pins'))
      .map(p => cleanUrl(p?.images?.orig?.url || p?.images?.['736x']?.url)).filter(Boolean)],
    ['scraper', async () => {
      const scraper = await import('../lib/scraper.js');
      const r = await scraper.pinterest.search(query, 30);
      return (r?.result?.pins || []).map(pin => cleanUrl(pin?.media?.images?.orig?.url)).filter(Boolean);
    }],
    ['siputzx', async () => {
      const res = await axios.get(`https://api.siputzx.my.id/api/s/pinterest?query=${encodeURIComponent(query)}`, { timeout: 15000 });
      return (Array.isArray(res?.data?.data) ? res.data.data : []).map(r => cleanUrl(r?.images_url)).filter(Boolean);
    }],
    ['dorratz', async () => {
      const res = await axios.get(`https://api.dorratz.com/v2/pinterest?q=${encodeURIComponent(query)}`, { timeout: 15000 });
      return (Array.isArray(res?.data) ? res.data : []).map(r => cleanUrl(r?.image)).filter(Boolean);
    }],
    ['vercel', async () => {
      const res = await axios.get(`https://pinterest-api-one.vercel.app/?q=${encodeURIComponent(query)}`, { timeout: 15000 });
      return (Array.isArray(res?.data?.images) ? res.data.images : []).map(cleanUrl).filter(Boolean);
    }]
  ];
  const all = uniqBy(await collect(sources, 15000, 'صور'), x => x);
  return shuffle(all).slice(0, IMAGE_COUNT);
}

// ━━━ جلب الفيديوهات ━━━
const MP4_KEYS = ['V_720P', 'V_EXP7', 'V_EXP6', 'V_EXP5', 'V_EXP4', 'V_EXP3', 'V_480P', 'V_360P'];

function pickMp4(list) {
  if (!list || typeof list !== 'object') return '';
  for (const k of MP4_KEYS) {
    const u = cleanUrl(list[k]?.url);
    if (u && !/\.m3u8/i.test(u)) return u;
  }
  for (const v of Object.values(list)) {
    const u = cleanUrl(v?.url);
    if (u && /\.mp4/i.test(u)) return u;
  }
  return '';
}

function fmtDuration(ms) {
  const n = Number(ms);
  if (!n) return '';
  const s = Math.round(n > 1000 ? n / 1000 : n);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

async function searchPinVideos(query) {
  const sources = [
    ['direct', async () => {
      const out = [];
      for (const pin of await pinterestDirect(query, 'videos')) {
        const storyVideo = pin?.story_pin_data?.pages?.[0]?.blocks?.find(b => b?.video)?.video;
        const video_url = pickMp4(pin?.videos?.video_list || storyVideo?.video_list);
        if (!video_url) continue;
        out.push({
          title: pin?.grid_title || pin?.title || pin?.description?.slice(0, 60) || 'Pinterest Video',
          duration: fmtDuration(pin?.videos?.duration || pin?.story_pin_data?.total_video_duration || storyVideo?.duration),
          video_url
        });
      }
      return out;
    }],
    ['scraper', async () => {
      const scraper = await import('../lib/scraper.js');
      const r = await scraper.pinterest.search(query, 40);
      return (r?.result?.pins || [])
        .map(pin => ({
          title: pin?.title || 'Pinterest Video',
          duration: fmtDuration(pin?.videos?.duration),
          video_url: pickMp4(pin?.videos?.video_list) || cleanUrl(pin?.media?.videos?.url)
        }))
        .filter(v => v.video_url);
    }],
    ['the-end', async () => {
      const res = await axios.get(
        `https://the-end-api.vercel.app/home/sections/Search/api/Pin/vid?q=${encodeURIComponent(query)}`,
        { timeout: 15000 }
      );
      const raw = res?.data?.data || res?.data?.result || [];
      if (!Array.isArray(raw)) return [];
      return raw
        .map(vid => ({
          title: vid?.title || 'Pinterest Video',
          duration: typeof vid?.duration === 'string' ? vid.duration : fmtDuration(vid?.duration),
          video_url: cleanUrl(vid?.video_url || vid?.url || vid?.download_url)
        }))
        .filter(v => v.video_url);
    }]
  ];
  const all = uniqBy(await collect(sources, 15000, 'فيديو'), v => v.video_url);
  return shuffle(all).slice(0, VIDEO_POOL);
}

// ━━━ قائمة الصور ━━━
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

// ━━━ كاروسيل الفيديوهات (نفس طريقة أمر التيك توك) ━━━
async function processVideo(video, conn) {
  const buffer = await downloadMp4(video.video_url);
  const mediaMsg = await generateWAMessageContent(
    { video: buffer, mimetype: 'video/mp4' },
    { upload: conn.waUploadToServer }
  );
  const title = String(video.title || 'Pinterest Video').replace(/\s+/g, ' ').trim();
  return {
    buffer,
    info: video,
    card: {
      body: proto.Message.InteractiveMessage.Body.fromObject({
        text: `📌 Pinterest${video.duration ? ` | ⏱️ ${video.duration}` : ''}`
      }),
      footer: proto.Message.InteractiveMessage.Footer.fromObject({ text: '⛩️ SUKUNA BOT ⛩️' }),
      header: proto.Message.InteractiveMessage.Header.fromObject({
        title: title.slice(0, 40),
        hasMediaAttachment: true,
        videoMessage: mediaMsg.videoMessage
      }),
      nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({ buttons: [] })
    }
  };
}

async function buildCards(videos, conn) {
  const results = [];
  let idx = 0;
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (results.length < VIDEO_CARDS) {
      const i = idx++;
      if (i >= videos.length) break;
      try {
        const item = await processVideo(videos[i], conn);
        if (results.length < VIDEO_CARDS) results.push(item);
      } catch (e) {
        console.error(`[بينتر:كارت ${i}] ${e?.message || e}`);
      }
    }
  });
  await Promise.all(workers);
  return results;
}

async function sendVideoCarousel(conn, m, query, videos) {
  const items = await buildCards(videos, conn);
  if (!items.length) throw new Error('كل الفيديوهات فشل تحميلها، جرب تاني أو كلمة تانية');
  const cards = items.map(i => i.card);

  try {
    const msg = generateWAMessageFromContent(m.chat, {
      viewOnceMessage: {
        message: {
          messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
          interactiveMessage: proto.Message.InteractiveMessage.fromObject({
            body: proto.Message.InteractiveMessage.Body.create({ text: `🎬 *Pinterest: ${query}*\n${cards.length} فيديو` }),
            footer: proto.Message.InteractiveMessage.Footer.create({ text: 'SukunaBot' }),
            header: proto.Message.InteractiveMessage.Header.create({ hasMediaAttachment: false }),
            carouselMessage: proto.Message.InteractiveMessage.CarouselMessage.fromObject({ cards })
          })
        }
      }
    }, {});
    await conn.relayMessage(m.chat, msg.message, { messageId: msg.key.id });
  } catch (err) {
    console.error('[بينتر:الكاروسيل فشل]', err?.message);
    for (const it of items.slice(0, 3)) {
      await conn.sendMessage(m.chat, {
        video: it.buffer,
        mimetype: 'video/mp4',
        caption: `🎬 *${String(it.info.title).slice(0, 80)}*\n\n> ⛩️ SUKUNA BOT`
      }, { quoted: m });
    }
  }
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
      await sendVideoCarousel(conn, m, data.query, videos);
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

    return false;
  } catch (e) {
    console.error('[بينتر:before]', e?.message || e);
    await m.react('❌');
    await m.reply(`❌ ${e?.message || 'حدث خطأ أثناء تنفيذ الاختيار، حاول مرة أخرى.'}`);
    return true;
  }
};

// ━━━ الأمر الرئيسي ━━━
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
      quick('📸 صورة', `${PREFIX}${imgId}`),
      quick('🎬 فيديو', `${PREFIX}${vidId}`)
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