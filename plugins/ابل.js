/**
 * plugins/ابل.js
 * بحث من iTunes + تحميل عن طريق Spotmate
 */

import axios from 'axios';
import fetch from 'node-fetch';

// ✅ استخدام ملف الأزرار
import { sendButtons, btn } from '../lib/buttons.js';

const UA = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36';
const FB_IMG = 'https://i.postimg.cc/43Yt2ngB/Gojo-manga.jpg';

// ══════════════════════════════════════════════════
//  مساعدات
// ══════════════════════════════════════════════════
function fmtMs(ms) {
  if (!ms) return '0:00';
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

// ══════════════════════════════════════════════════
//  iTunes API
// ══════════════════════════════════════════════════
async function searchApple(query) {
  const res = await axios.get('https://itunes.apple.com/search', {
    params: { term: query, media: 'music', entity: 'song', limit: 8, country: 'us' },
    timeout: 15000,
  });
  return (res.data?.results || []).map(s => ({
    id: String(s.trackId),
    attributes: {
      name: s.trackName || 'Unknown',
      artistName: s.artistName || 'Unknown',
      albumName: s.collectionName || 'Unknown',
      durationInMillis: s.trackTimeMillis || 0,
      url: s.trackViewUrl || '',
      artwork: { url: (s.artworkUrl100 || FB_IMG).replace('100x100bb', '{w}x{h}bb') }
    }
  }));
}

// ══════════════════════════════════════════════════
//  Odesli
// ══════════════════════════════════════════════════
async function odesliGetSpotify(appleUrl) {
  const res = await axios.get('https://api.song.link/v1-alpha.1/links', {
    params: { url: appleUrl, userCountry: 'US' },
    timeout: 20000,
    validateStatus: () => true,
  });
  if (res.status !== 200) throw new Error(`Odesli ${res.status}`);
  const spotUrl = res.data?.linksByPlatform?.spotify?.url;
  if (!spotUrl) throw new Error('Odesli: ما لقى Spotify URL');
  const entity = res.data?.entitiesByUniqueId;
  const firstId = entity ? Object.keys(entity)[0] : null;
  const meta = firstId ? entity[firstId] : {};
  return {
    title: meta.title || 'Unknown',
    artist: meta.artistName || 'Unknown',
    cover: meta.thumbnailUrl || null,
    spotifyUrl: spotUrl,
  };
}

// ══════════════════════════════════════════════════
//  Spotmate
// ══════════════════════════════════════════════════
async function getSpotmateSession() {
  const res = await fetch('https://spotmate.online/en1', {
    headers: {
      'user-agent': UA,
      'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'ar-EG,ar;q=0.9,en-US;q=0.8,en;q=0.7',
    }
  });
  const html = await res.text();
  const cookies = res.headers.raw()['set-cookie'] || [];
  const cookieStr = cookies.map(c => c.split(';')[0]).join('; ');

  const csrfMatch = html.match(/"csrfToken"\s*:\s*"([^"]+)"/) ||
    html.match(/meta.*csrf-token.*content="([^"]+)"/) ||
    html.match(/csrf[_-]token['"]\s*:\s*['"]([^'"]+)/)
  const xsrfMatch = cookies.find(c => c.startsWith('XSRF-TOKEN='))
  let xsrf = ''
  if (xsrfMatch) xsrf = decodeURIComponent(xsrfMatch.split('=')[1].split(';')[0])

  return { cookieStr, csrfToken: csrfMatch?.[1] || xsrf }
}

async function spotmateDownload(spotifyUrl) {
  const { cookieStr, csrfToken } = await getSpotmateSession();

  const headers = {
    'authority': 'spotmate.online',
    'accept': '*/*',
    'accept-language': 'ar-EG,ar;q=0.9,en-US;q=0.8,en;q=0.7',
    'content-type': 'application/json',
    'cookie': cookieStr,
    'origin': 'https://spotmate.online',
    'referer': 'https://spotmate.online/en1',
    'user-agent': UA,
    'x-csrf-token': csrfToken,
  };

  const cleanUrl = spotifyUrl.split('?')[0];
  const convertRes = await fetch('https://spotmate.online/convert', {
    method: 'POST',
    headers,
    body: JSON.stringify({ urls: cleanUrl })
  });
  const convertData = await convertRes.json();

  const downloadUrl = convertData?.link ||
    convertData?.download_link ||
    convertData?.url ||
    convertData?.data?.link ||
    convertData?.data?.url ||
    Object.values(convertData || {}).find(v => typeof v === 'string' && v.startsWith('http'));

  if (!downloadUrl) throw new Error('Spotmate: ما لقى رابط التحميل');

  const audioRes = await fetch(downloadUrl, {
    headers: { 'user-agent': UA, 'referer': 'https://spotmate.online/' }
  });
  const audioBuffer = Buffer.from(await audioRes.arrayBuffer());

  if (audioBuffer.length < 10000) throw new Error('الملف صغير جداً — فشل التحميل');
  return audioBuffer;
}

// ══════════════════════════════════════════════════
//  تحميل كامل
// ══════════════════════════════════════════════════
async function fullDownload(conn, m, appleUrl) {
  try {
    const loadMsg = await conn.sendMessage(m.chat, { text: '🔍 جاري جلب بيانات الأغنية...' }, { quoted: m });
    const edit = t => conn.sendMessage(m.chat, { text: t, edit: loadMsg.key }).catch(() => {});

    await edit('🔗 جاري البحث عن رابط التحميل...');
    let song;
    try {
      song = await odesliGetSpotify(appleUrl);
    } catch (e) {
      throw new Error('تعذّر الحصول على بيانات الأغنية — تأكد من الرابط');
    }

    await edit(`🍎 *${song.title}*\n👤 ${song.artist}\n📥 جاري التحميل...`);
    const buf = await spotmateDownload(song.spotifyUrl);

    await conn.sendMessage(m.chat, {
      audio: buf,
      mimetype: 'audio/mpeg',
      fileName: `${song.title} - ${song.artist}.mp3`,
      contextInfo: song.cover ? {
        externalAdReply: {
          title: song.title,
          body: song.artist,
          thumbnailUrl: song.cover,
          mediaType: 1,
          renderLargerThumbnail: true
        }
      } : undefined
    }, { quoted: m });

    await m.react('✅');

  } catch (e) {
    console.error('[Apple DL]', e.message);
    await m.react('❌');
    await m.reply(`❌ *فشل التحميل*\n\n⚠️ ${e.message}`).catch(() => {});
  }
}

// ══════════════════════════════════════════════════
//  إرسال قائمة نتائج البحث (بأزرار)
// ══════════════════════════════════════════════════
async function sendSearchList(conn, m, songs, query, pre, cmd) {
  const firstArt = songs[0].attributes.artwork;
  const coverUrl = firstArt
    ? firstArt.url.replace('{w}', '600').replace('{h}', '600')
    : FB_IMG;

  const bodyText = songs.map((s, i) => {
    const a = s.attributes;
    return `*${i + 1}. ${a.name}*\n   👤 ${a.artistName} • ⏱ ${fmtMs(a.durationInMillis)}`;
  }).join('\n\n');

  // ✅ بناء sections لملف الأزرار
  const sections = [{
    title: `🎵 نتائج البحث (${songs.length})`,
    rows: songs.map((s, i) => {
      const a = s.attributes;
      return {
        title: `${i + 1}. ${a.name}`,
        description: `👤 ${a.artistName} • ⏱ ${fmtMs(a.durationInMillis)}`,
        id: `apple_pick_${i}_${encodeURIComponent(a.url)}`
      };
    }),
  }];

  try {
    await sendButtons(conn, m.chat, {
      title: '🍎 Apple Music',
      subtitle: query,
      text: `🔍 *نتائج البحث في Apple Music*\n🎤 ${query}\n\n${bodyText}`,
      footer: '🍎 اختر أغنية لتحميلها',
      image: coverUrl,
      buttons: [btn.list('🎵 اختر أغنية', sections)]
    }, m);
  } catch (e) {
    const txt = songs.map((s, i) => {
      const a = s.attributes;
      return `*${i + 1}. ${a.name}* — ${a.artistName}\n${pre}${cmd} --url ${encodeURIComponent(a.url)}`;
    }).join('\n\n');
    return m.reply(`🎵 *نتائج البحث*\n\n${txt}`);
  }
}

// ══════════════════════════════════════════════════
//  Handler الرئيسي
// ══════════════════════════════════════════════════
const handler = async (m, { conn, text, usedPrefix, command }) => {
  const input = (text || '').trim();

  if (!input) {
    return m.reply(
      `🍎 *Apple Music Bot*\n\n` +
      `*بحث:*\n${usedPrefix}${command} اسم الأغنية\n\n` +
      `*تحميل مباشر:*\n${usedPrefix}${command} رابط Apple Music\n\n` +
      `*مثال:*\n${usedPrefix}${command} shape of you\n` +
      `${usedPrefix}${command} https://music.apple.com/us/album/...`
    );
  }

  const flags = {};
  const flagRx = /--(\w+)\s+((?:(?!--).)+)/g;
  let fx;
  while ((fx = flagRx.exec(input)) !== null) flags[fx[1]] = fx[2].trim();

  if (flags.url) {
    await m.react('🍎');
    return fullDownload(conn, m, decodeURIComponent(flags.url));
  }

  if (/music\.apple\.com/i.test(input)) {
    await m.react('🍎');
    return fullDownload(conn, m, input);
  }

  const query = input.replace(/--\w+\s+(?:(?!--).)+/g, '').trim();
  if (!query) return m.reply('❌ اكتب اسم الأغنية بعد الأمر');

  await m.react('🎵');

  try {
    await m.reply(`🔍 جاري البحث عن:\n"${query}"`);
    const songs = await searchApple(query);
    if (!songs.length) {
      await m.react('❌');
      return m.reply('❌ *لم يتم العثور على نتائج*');
    }
    await sendSearchList(conn, m, songs, query, usedPrefix, command);
    await m.react('✅');
  } catch (e) {
    console.error('[Apple Search]', e.message);
    await m.react('❌');
    await m.reply(`❌ *حدث خطأ أثناء البحث*\n\n⚠️ ${e.message}`);
  }
};

// ══════════════════════════════════════════════════
//  معالج اختيار الأغنية من القائمة
// ══════════════════════════════════════════════════
handler.before = async function (m, { conn }) {
  const buttonId = getButtonId(m);
  if (!buttonId || !buttonId.startsWith('apple_pick_')) return false;

  const parts = buttonId.split('_');
  const index = parseInt(parts[2]);
  const appleUrl = decodeURIComponent(parts.slice(3).join('_'));

  await m.react('🍎');
  await conn.sendMessage(m.chat, {
    text: `⏳ *جاري تحميل الأغنية رقم ${index + 1}...*`
  }, { quoted: m });

  await fullDownload(conn, m, appleUrl);
  return true;
};

handler.help = ['ابل <اسم أغنية أو رابط>'];
handler.tags = ['downloader'];
handler.command = /^(ابل|apple|applemusic|ابلميوزك)$/i;

export default handler;