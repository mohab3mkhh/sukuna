import * as pkg from '@whiskeysockets/baileys';
const { generateWAMessageFromContent, prepareWAMessageMedia } = pkg;
import * as cheerio from 'cheerio';
import yts from 'yt-search';
import crypto from 'crypto';

// ✅ استخدام ملف الأزرار
import { sendButtons, btn, getButtonId } from '../lib/buttons.js';

const UA = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36';
const SIGN = `\n\n╔════════════════╗\n║  ⛩️SUKUNA BOT⛩️  ║\n╚════════════════╝`;
const BOT_CHANNEL_ID = '120363423007346962@newsletter';
const MENU_IMAGE_URL = 'https://i.ibb.co/Pzv38VJ4/gojo-1778857389943.jpg';

async function validateVideoUrl(url) {
  if (!url) return false;
  if (url.includes('.m3u8')) return false;
  try {
    const res = await fetch(url, { method: 'HEAD', headers: { 'user-agent': UA }, redirect: 'follow' });
    const ct = res.headers.get('content-type') || '';
    const cl = parseInt(res.headers.get('content-length') || '0');
    return (ct.includes('video') || ct.includes('octet-stream') || url.includes('.mp4')) && cl > 50000;
  } catch { return false; }
}

async function fetchPinData(pinId) {
  const res = await fetch('https://www.pinterest.com/resource/PinResource/get/?' + new URLSearchParams({
    source_url: `/pin/${pinId}/`,
    data: JSON.stringify({ options: { id: pinId, field_set_key: 'detailed' }, context: {} }),
    _: Date.now()
  }), {
    headers: {
      'accept': 'application/json, text/javascript, */*',
      'user-agent': UA,
      'x-app-version': '4f340f4',
      'x-requested-with': 'XMLHttpRequest',
      'referer': `https://www.pinterest.com/pin/${pinId}/`
    }
  });
  const data = await res.json();
  return data?.resource_response?.data;
}

function extractVideoUrl(pin) {
  if (!pin) return null;
  const MP4_KEYS = ['V_720P', 'V_480P', 'V_360P', 'V_EXP7', 'V_EXP6', 'V_EXP5'];
  const vl = pin?.videos?.video_list;
  if (vl) { for (const q of MP4_KEYS) if (vl[q]?.url?.includes('.mp4')) return vl[q].url; }
  for (const page of (pin?.story_pin_data?.pages || []))
    for (const block of (page?.blocks || [])) {
      const bvl = block?.video?.video_list || block?.block?.video?.video_list;
      if (bvl) { for (const q of MP4_KEYS) if (bvl[q]?.url?.includes('.mp4')) return bvl[q].url; }
    }
  if (pin?.video_url?.includes('.mp4')) return pin.video_url;
  return null;
}

async function fetchPinFromPage(pinId) {
  try {
    const res = await fetch(`https://www.pinterest.com/pin/${pinId}/`, {
      headers: { 'user-agent': UA, 'accept': 'text/html', 'accept-language': 'en-US,en;q=0.9' }
    });
    const html = await res.text();
    const mp4s = [...html.matchAll(/https?:\\?\/\\?\/[^"'\s<>]*\.mp4[^"'\s<>]*/g)]
      .map(m => m[0].replace(/\\u002F/g, '/').replace(/\\\//g, '/'))
      .filter(u => u.includes('pinimg.com'));
    if (mp4s.length) return mp4s[0];
    const jm = html.match(/<script[^>]*id="__PWS_INITIAL_PROPS__"[^>]*>([\s\S]*?)<\/script>/)
      || html.match(/<script[^>]*id="initial-state"[^>]*>([\s\S]*?)<\/script>/);
    if (jm) {
      const um = [...jm[1].matchAll(/"url"\s*:\s*"(https?:[^"]*\.mp4[^"]*)"/g)];
      if (um.length) return um[0][1].replace(/\\\//g, '/');
    }
  } catch {}
  return null;
}

async function getCsrfToken() {
  const res = await fetch('https://klickpin.com/', {
    headers: { 'user-agent': UA, 'accept': 'text/html' }
  });
  const html = await res.text();
  const $ = cheerio.load(html);
  const token = $('input[name="csrf_token"]').val()
    || html.match(/name="csrf_token"\s+value="([^"]+)"/)?.[1]
    || html.match(/csrf_token['":\s]+['"]([a-zA-Z0-9:_-]+)['"]/)?.[1];
  const cookie = res.headers.get('set-cookie') || '';
  return { token, cookie };
}

async function klickpinDownload(pinUrl, csrfToken, cookie) {
  const res = await fetch('https://klickpin.com/download', {
    method: 'POST',
    headers: {
      'user-agent': UA,
      'content-type': 'application/x-www-form-urlencoded',
      'origin': 'https://klickpin.com',
      'referer': 'https://klickpin.com/',
      'cookie': cookie
    },
    body: new URLSearchParams({ url: pinUrl, csrf_token: csrfToken }).toString()
  });
  const html = await res.text();
  const links = [];
  const $ = cheerio.load(html);
  $('a[href]').each((_, el) => {
    const h = $(el).attr('href') || '';
    if (h.includes('pinimg.com/videos') || h.includes('.mp4') || h.includes('dl.klickpin.com'))
      links.push({ href: h, quality: $(el).text().trim() });
  });
  for (const match of html.matchAll(/https?:\/\/[^\s"'<>]+\.mp4[^\s"'<>]*/g))
    links.push({ href: match[0], quality: 'auto' });
  const seen = new Set();
  return links.filter(l => { if (seen.has(l.href)) return false; seen.add(l.href); return true; });
}

async function processPin(pin, csrfToken, cookie) {
  const pinId = pin.id;
  const pinUrl = `https://www.pinterest.com/pin/${pinId}/`;
  let videoUrl = extractVideoUrl(pin);
  if (!videoUrl) { try { videoUrl = extractVideoUrl(await fetchPinData(pinId)); } catch {} }
  if (!videoUrl) { videoUrl = await fetchPinFromPage(pinId); }
  if (!videoUrl && csrfToken) {
    try {
      const links = await klickpinDownload(pinUrl, csrfToken, cookie);
      const mp4s = links.filter(l => l.href.includes('.mp4'));
      videoUrl = (mp4s.find(l => l.href.includes('720')) || mp4s.find(l => l.href.includes('480')) || mp4s[0])?.href || null;
    } catch {}
  }
  if (!videoUrl) return null;
  if (!(await validateVideoUrl(videoUrl))) return null;
  return { url: videoUrl, pinUrl, title: (pin?.title || pin?.description || '').slice(0, 80) };
}

async function searchOnePinterestQuery(query, pages = 5) {
  let allPins = [], bookmark = null;
  for (let i = 0; i < pages; i++) {
    const options = {
      query, scope: 'pins', appliedProductFilters: '---',
      auto_correction_disabled: false, rs: 'typed',
      redux_normalize_feed: true, page_size: 25, filters: 'videos'
    };
    if (bookmark) options.bookmarks = [bookmark];
    try {
      const res = await fetch('https://www.pinterest.com/resource/BaseSearchResource/get/?' + new URLSearchParams({
        source_url: `/search/pins/?q=${encodeURIComponent(query)}&rs=typed&filters=videos`,
        data: JSON.stringify({ options, context: {} }),
        _: Date.now()
      }), {
        headers: {
          'accept': 'application/json, text/javascript, */*',
          'user-agent': UA, 'x-app-version': '4f340f4',
          'x-requested-with': 'XMLHttpRequest',
          'referer': 'https://www.pinterest.com/',
          'x-pinterest-pws-handler': 'www/search/[scope].js',
          'accept-language': 'en-US,en;q=0.9'
        }
      });
      const data = (await res.json())?.resource_response?.data;
      const videoPins = (data?.results || []).filter(p =>
        p?.videos?.video_list || p?.pin_format === 'video' ||
        p?.story_pin_data?.pages?.some(pg => pg?.blocks?.some(b => b?.video?.video_list || b?.block?.video?.video_list))
      );
      allPins.push(...videoPins);
      bookmark = data?.bookmark;
      if (!bookmark) break;
    } catch (e) { console.error('[pin search]', e.message); break; }
    await new Promise(r => setTimeout(r, 350));
  }
  return allPins;
}

async function searchPinterest(baseQuery) {
  const queries = [baseQuery + ' edit', baseQuery + ' edit video', baseQuery + ' amv edit'];
  const results = await Promise.allSettled(queries.map(q => searchOnePinterestQuery(q, 5)));
  const allPins = results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
  const seen = new Set();
  return allPins.filter(p => { if (!p?.id || seen.has(p.id)) return false; seen.add(p.id); return true; });
}

async function getPinterestVideo(query) {
  try {
    const [csrfResult, pinsResult] = await Promise.allSettled([getCsrfToken(), searchPinterest(query)]);
    const csrfToken = csrfResult.status === 'fulfilled' ? csrfResult.value?.token : null;
    const cookie = csrfResult.status === 'fulfilled' ? csrfResult.value?.cookie : '';
    const allPins = pinsResult.status === 'fulfilled' ? pinsResult.value : [];
    if (!allPins.length) return null;
    for (let i = 0; i < Math.min(15, allPins.length); i++) {
      const result = await processPin(allPins[i], csrfToken, cookie);
      if (result) return result;
    }
  } catch (e) { console.error('[getPinterestVideo]', e.message); }
  return null;
}

async function safeAbsoluteUrl(u) {
  if (!u) return null;
  u = String(u).trim();
  if (u.startsWith('//')) return 'https:' + u;
  if (u.startsWith('/')) return 'https://ssstik.io' + u;
  if (!/^https?:\/\//i.test(u)) return null;
  return u;
}

async function downloadTikTok(inputUrl) {
  const errors = [];
  inputUrl = String(inputUrl || '').trim();

  try {
    const res = await fetch(`https://api.tiklydown.eu.org/api/download?url=${encodeURIComponent(inputUrl)}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const d = await res.json();
    const maybeVideo = d?.video || d?.data?.video || d?.result?.video;
    const noWm = maybeVideo?.noWatermark || maybeVideo?.no_wm || maybeVideo?.nowm;
    if (noWm && String(noWm).startsWith('http'))
      return { success: true, videoUrl: noWm, audioUrl: d?.music?.play_url || null, title: d?.title || 'TikTok Video', author: d?.author?.unique_id || 'Unknown', source: 'tiklydown' };
  } catch (e) { errors.push('Tiklydown: ' + e.message); }

  try {
    const res = await fetch('https://www.tikwm.com/api/', {
      method: 'POST',
      headers: { 'accept': 'application/json', 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8', 'user-agent': 'Mozilla/5.0' },
      body: new URLSearchParams({ url: inputUrl }).toString()
    });
    const data = (await res.json())?.data;
    let candidate = data?.hdplay || data?.play || data?.wmplay;
    if (candidate && !/^https?:\/\//i.test(candidate))
      candidate = candidate.startsWith('//') ? 'https:' + candidate : 'https://www.tikwm.com' + candidate;
    if (candidate?.startsWith('http'))
      return { success: true, videoUrl: candidate, audioUrl: data?.music || null, title: data?.title || 'TikTok Video', author: data?.author?.unique_id || 'Unknown', source: 'tikwm' };
  } catch (e) { errors.push('TikWM: ' + e.message); }

  try {
    const res = await fetch('https://ssstik.io/abc', {
      method: 'POST',
      headers: {
        'accept': '*/*', 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
        origin: 'https://ssstik.io', referer: 'https://ssstik.io/en',
        'user-agent': 'Mozilla/5.0', 'hx-request': 'true'
      },
      body: new URLSearchParams({ id: inputUrl, locale: 'en', tt: 'dmVpZEtJ' }).toString()
    });
    const html = await res.text();
    const patterns = [
      /href="([^"]+)"[^>]*>\s*(?:تنزيل|Download)[^<]*?(?:فيديو|Video)/i,
      /dlink":"([^"]+)"/i,
      /"nowm":"([^"]+)"/i,
      /<a[^>]+href='([^']+)'[^>]*>[^<]*download/i
    ];
    for (const p of patterns) {
      const mm = html.match(p);
      if (mm?.[1]) {
        const vUrl = await safeAbsoluteUrl(mm[1]);
        if (vUrl?.startsWith('http')) {
          const audioMatch = html.match(/audio":"([^"]+)"/i);
          const aUrl = audioMatch?.[1] ? (await safeAbsoluteUrl(audioMatch[1])) : null;
          return { success: true, videoUrl: vUrl, audioUrl: aUrl, title: 'TikTok Video', author: 'Unknown', source: 'ssstik' };
        }
      }
    }
  } catch (e) { errors.push('ssstik: ' + e.message); }

  try {
    const res = await fetch('https://tikdd.cc/wp-json/aio-dl/video-data/', {
      method: 'POST',
      headers: { 'accept': '*/*', 'content-type': 'application/x-www-form-urlencoded', origin: 'https://tikdd.cc', referer: 'https://tikdd.cc/', 'user-agent': 'Mozilla/5.0' },
      body: new URLSearchParams({ url: inputUrl }).toString()
    });
    const medias = (await res.json())?.medias;
    if (Array.isArray(medias) && medias.length) {
      const video = medias.find(m => (m.quality || '').toLowerCase().includes('hd')) || medias[0];
      if (video?.url) {
        const vUrl = await safeAbsoluteUrl(video.url) || video.url;
        if (vUrl?.startsWith('http'))
          return { success: true, videoUrl: vUrl, audioUrl: null, title: 'TikTok Video', author: 'Unknown', source: 'tikdd' };
      }
    }
  } catch (e) { errors.push('TikDD: ' + e.message); }

  return { success: false, errors };
}

async function getTikTokVideo(query) {
  try {
    const res = await fetch('https://www.tikwm.com/api/feed/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA },
      body: new URLSearchParams({ keywords: `${query} edit`, count: 20, cursor: 0, hd: 1 }).toString()
    });
    const videos = (await res.json())?.data?.videos || [];
    if (!videos.length) return null;

    for (const vid of videos.slice(0, 8)) {
      let candidate = vid.hdplay || vid.play;
      if (!candidate) continue;
      if (!/^https?:\/\//i.test(candidate))
        candidate = candidate.startsWith('//') ? 'https:' + candidate : null;
      if (candidate)
        return { url: candidate, title: (vid.title || vid.desc || query).slice(0, 80), author: vid.author?.unique_id || 'TikTok' };
    }

    for (const vid of videos.slice(0, 5)) {
      let videoPageUrl = null;
      if (vid.video_id && vid.author?.unique_id)
        videoPageUrl = `https://www.tiktok.com/@${vid.author.unique_id}/video/${vid.video_id}`;
      else
        videoPageUrl = vid.share_url || vid.origin_url || vid.url || '';
      if (!videoPageUrl) continue;
      const result = await downloadTikTok(videoPageUrl);
      if (result?.success && result.videoUrl)
        return { url: result.videoUrl, title: result.title || query, author: result.author };
    }
  } catch (e) { console.error('[getTikTokVideo]', e.message); }
  return null;
}

const ANU_KEY = Buffer.from('C5D58EF67A7584E4A29F6C35BBC4EB12', 'hex');
function decryptSaveTube(enc) {
  const b = Buffer.from(enc.replace(/\s/g, ''), 'base64');
  const iv = b.subarray(0, 16), data = b.subarray(16);
  const d = crypto.createDecipheriv('aes-128-cbc', ANU_KEY, iv);
  return JSON.parse(Buffer.concat([d.update(data), d.final()]).toString());
}

async function saveTubeDownload(url, quality = '360') {
  const cdnRes = await fetch('https://media.savetube.me/api/random-cdn');
  const cdn = (await cdnRes.json())?.cdn;
  if (!cdn) throw new Error('no CDN');
  const infoRes = await fetch(`https://${cdn}/v2/info`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', origin: 'https://ytsave.savetube.me', referer: 'https://ytsave.savetube.me/' },
    body: JSON.stringify({ url })
  });
  const info = await infoRes.json();
  if (!info?.status) throw new Error('invalid info');
  const json = decryptSaveTube(info.data);
  const r = await fetch(`https://${cdn}/download`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', origin: 'https://ytsave.savetube.me', referer: 'https://ytsave.savetube.me/' },
    body: JSON.stringify({ id: json.id, key: json.key, downloadType: 'video', quality: String(quality) })
  });
  const downloadUrl = (await r.json())?.data?.downloadUrl;
  if (!downloadUrl) throw new Error('no url');
  return { url: downloadUrl, title: json.title || 'video' };
}

async function vidsSaveDownload(url, quality = '360') {
  const res = await fetch('https://api.vidssave.com/api/contentsite_api/media/parse', {
    method: 'POST',
    headers: { 'user-agent': 'Mozilla/5.0', 'content-type': 'application/x-www-form-urlencoded', origin: 'https://vidssave.com', referer: 'https://vidssave.com/' },
    body: new URLSearchParams({ auth: '20250901majwlqo', domain: 'api-ak.vidssave.com', origin: 'cache', link: url }).toString()
  });
  const data = (await res.json())?.data;
  if (!data) throw new Error('invalid');
  const { title, resources } = data;
  const media = resources.find(r => r.type === 'video' && String(r.quality) === String(quality)) || resources.find(r => r.type === 'video');
  if (!media) throw new Error('no media');
  return { url: media.download_url, title };
}

async function saveNowDownload(url, format = '360') {
  const key = 'dfcb6d76f2f6a9894gjkege8a4ab232222';
  const init = await fetch(`https://p.savenow.to/ajax/download.php?copyright=0&format=${format}&url=${encodeURIComponent(url)}&api=${key}`, {
    headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://y2down.cc/' }
  });
  const data = await init.json();
  if (!data.id && !data.success) throw new Error('init failed');
  const id = data.id || data?.data?.id;
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const prog = await fetch(`https://p.savenow.to/api/progress?id=${encodeURIComponent(id)}`);
    const st = await prog.json();
    if ((st.progress === 1000 || st.progress >= 100) && st.download_url)
      return { url: st.download_url, title: data.title || 'video' };
  }
  throw new Error('timeout');
}

async function searchYouTubeStrong(query) {
  const queries = [`${query} edit amv`, `${query} edit shorts`, `${query} amv vertical`, `${query} edit 4k`];
  const allResults = await Promise.allSettled(queries.map(q => yts(q)));
  const videos = [];
  for (const r of allResults)
    if (r.status === 'fulfilled' && r.value?.videos?.length) videos.push(...r.value.videos);
  const seen = new Set();
  const unique = videos.filter(v => { if (!v.videoId || seen.has(v.videoId)) return false; seen.add(v.videoId); return true; });
  const shorts = unique.filter(v => v.seconds > 0 && v.seconds <= 90);
  const rest = unique.filter(v => v.seconds === 0 || v.seconds > 90);
  return [...shorts, ...rest];
}

async function downloadYouTubeVideo(videoUrl, quality = '720') {
  const sources = [
    () => vidsSaveDownload(videoUrl, quality),
    () => saveTubeDownload(videoUrl, quality),
    () => vidsSaveDownload(videoUrl, '360'),
    () => saveTubeDownload(videoUrl, '360'),
    () => saveNowDownload(videoUrl, quality),
    () => saveNowDownload(videoUrl, '360')
  ];
  for (const fn of sources) {
    try {
      const result = await Promise.race([fn(), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 22000))]);
      if (result?.url) return result;
    } catch {}
  }
  throw new Error('جميع مصادر يوتيوب فشلت');
}

async function getYouTubeShorts(query) {
  try {
    const videos = await searchYouTubeStrong(query);
    if (!videos.length) return null;
    for (const video of videos.slice(0, 4)) {
      try {
        const result = await downloadYouTubeVideo(video.url, '720');
        if (result?.url) return { url: result.url, title: result.title || video.title };
      } catch {}
    }
  } catch (e) { console.error('[getYouTubeShorts]', e.message); }
  return null;
}

// ══════════════════════════════════════════════════
//  Handler الرئيسي
// ══════════════════════════════════════════════════
let handler = async (m, { conn, text, usedPrefix, command }) => {
  if (command === 'ايديت') {
    if (!text?.trim())
      return m.reply(`🎬 اكتب اسم الشخصية أو الانمي بعد الأمر\nمثال: ${usedPrefix}ايديت زورو` + SIGN);

    await conn.sendMessage(m.chat, { react: { text: '🔎', key: m.key } });

    // ✅ استخدام sendButtons
    await sendButtons(conn, m.chat, {
      title: '🎥 Edit Downloader',
      subtitle: text,
      text: `✨ *بحث عن ايديت:* ${text}\n\nاختر المنصة للتحميل الفوري:`,
      footer: '🎬 نظام الإيديت السريع — ⛩️SUKUNA BOT⛩️',
      image: MENU_IMAGE_URL,
      buttons: [
        btn.reply('📌 بينترست Edit', `${usedPrefix}ايديت_بين ${text}`),
        btn.reply('🎵 تيك توك Edit', `${usedPrefix}ايديت_تيك ${text}`),
        btn.reply('▶️ يوتيوب Shorts', `${usedPrefix}ايديت_يوت ${text}`)
      ]
    }, m);

    return;
  }

  // ✅ باقي أوامر التحميل
  if (command === 'ايديت_بين') {
    if (!text?.trim()) return m.reply('❌ اكتب اسم الشخصية');
    await conn.sendMessage(m.chat, { react: { text: '🎨', key: m.key } });
    const result = await getPinterestVideo(text);
    if (!result) return m.reply('❌ مفيش نتائج على Pinterest');
    await