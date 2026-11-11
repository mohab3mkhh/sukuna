/**
 * plugins/ابل.js
 * بحث من iTunes + تحميل عن طريق Spotmate
 */

import axios  from 'axios';
import fetch  from 'node-fetch';
import pkg    from '@whiskeysockets/baileys';
const { generateWAMessageFromContent, proto, prepareWAMessageMedia } = pkg;

const UA      = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36';
const FB_IMG  = 'https://i.postimg.cc/43Yt2ngB/Gojo-manga.jpg';

// ══════════════════════════════════════════════════
//  مساعدات
// ══════════════════════════════════════════════════
function fmtMs(ms) {
  if (!ms) return '0:00';
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

// ══════════════════════════════════════════════════
//  ✅ iTunes API — بحث بدون توكن
// ══════════════════════════════════════════════════
async function searchApple(query) {
  const res = await axios.get('https://itunes.apple.com/search', {
    params: { term: query, media: 'music', entity: 'song', limit: 8, country: 'us' },
    timeout: 15000,
  });
  return (res.data?.results || []).map(s => ({
    id:         String(s.trackId),
    attributes: {
      name:             s.trackName      || 'Unknown',
      artistName:       s.artistName     || 'Unknown',
      albumName:        s.collectionName || 'Unknown',
      durationInMillis: s.trackTimeMillis || 0,
      url:              s.trackViewUrl   || '',
      artwork:          { url: (s.artworkUrl100 || FB_IMG).replace('100x100bb', '{w}x{h}bb') }
    }
  }));
}

// ══════════════════════════════════════════════════
//  Odesli — Apple URL → Spotify URL + بيانات
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
  const entity  = res.data?.entitiesByUniqueId;
  const firstId = entity ? Object.keys(entity)[0] : null;
  const meta    = firstId ? entity[firstId] : {};
  return {
    title:      meta.title        || 'Unknown',
    artist:     meta.artistName   || 'Unknown',
    cover:      meta.thumbnailUrl || null,
    spotifyUrl: spotUrl,
  };
}

// ══════════════════════════════════════════════════
//  Spotmate — session
// ══════════════════════════════════════════════════
async function getSpotmateSession() {
  const res = await fetch('https://spotmate.online/en1', {
    headers: {
      'user-agent':      UA,
      'accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'ar-EG,ar;q=0.9,en-US;q=0.8,en;q=0.7',
    }
  });
  const html      = await res.text();
  const cookies   = res.headers.raw()['set-cookie'] || [];
  const cookieStr = cookies.map(c => c.split(';')[0]).join('; ');

  const csrfMatch = html.match(/"csrfToken"\s*:\s*"([^"]+)"/) ||
                    html.match(/meta.*csrf-token.*content="([^"]+)"/) ||
                    html.match(/csrf[_-]token['"]\s*:\s*['"]([^'"]+)/)
  const xsrfMatch = cookies.find(c => c.startsWith('XSRF-TOKEN='))
  let xsrf = ''
  if (xsrfMatch) xsrf = decodeURIComponent(xsrfMatch.split('=')[1].split(';')[0])

  return { cookieStr, csrfToken: csrfMatch?.[1] || xsrf }
}

// ══════════════════════════════════════════════════
//  Spotmate — تحميل من Spotify URL
// ══════════════════════════════════════════════════
async function spotmateDownload(spotifyUrl) {
  const { cookieStr, csrfToken } = await getSpotmateSession();

  const headers = {
    'authority':       'spotmate.online',
    'accept':          '*/*',
    'accept-language': 'ar-EG,ar;q=0.9,en-US;q=0.8,en;q=0.7',
    'content-type':    'application/json',
    'cookie':          cookieStr,
    'origin':          'https://spotmate.online',
    'referer':         'https://spotmate.online/en1',
    'user-agent':      UA,
    'x-csrf-token':    csrfToken,
  };

  // جيب رابط التحميل
  const cleanUrl   = spotifyUrl.split('?')[0];
  const convertRes = await fetch('https://spotmate.online/convert', {
    method: 'POST',
    headers,
    body: JSON.stringify({ urls: cleanUrl })
  });
  const convertData = await convertRes.json();
  console.log('[Spotmate] convert:', JSON.stringify(convertData).slice(0, 200));

  const downloadUrl = convertData?.link ||
                      convertData?.download_link ||
                      convertData?.url ||
                      convertData?.data?.link ||
                      convertData?.data?.url ||
                      Object.values(convertData || {}).find(v => typeof v === 'string' && v.startsWith('http'));

  if (!downloadUrl) throw new Error('Spotmate: ما لقى رابط التحميل');

  // تحميل الـ MP3
  const audioRes    = await fetch(downloadUrl, {
    headers: { 'user-agent': UA, 'referer': 'https://spotmate.online/' }
  });
  const audioBuffer = Buffer.from(await audioRes.arrayBuffer());

  if (audioBuffer.length < 10000) throw new Error('الملف صغير جداً — فشل التحميل');
  return audioBuffer;
}

// ══════════════════════════════════════════════════
//  تحميل كامل من Apple URL
// ══════════════════════════════════════════════════
async function fullDownload(conn, m, appleUrl) {
  try {
    const loadMsg = await conn.sendMessage(m.chat, { text: '🔍 جاري جلب بيانات الأغنية...' }, { quoted: m });
    const edit    = t => conn.sendMessage(m.chat, { text: t, edit: loadMsg.key }).catch(() => {});

    // المرحلة 1: جلب Spotify URL عن طريق Odesli
    await edit('🔗 جاري البحث عن رابط التحميل...');
    let song;
    try {
      song = await odesliGetSpotify(appleUrl);
      console.log('[Apple] ✅ Odesli نجح:', song.title);
    } catch (e) {
      console.warn('[Apple] ⚠️ Odesli فشل:', e.message);
      throw new Error('تعذّر الحصول على بيانات الأغنية — تأكد من الرابط');
    }

    // المرحلة 2: التحميل عن طريق Spotmate
    await edit(`🍎 *${song.title}*\n👤 ${song.artist}\n📥 جاري التحميل...`);
    const buf = await spotmateDownload(song.spotifyUrl);

    // المرحلة 3: الإرسال
    await conn.sendMessage(m.chat, {
      audio:    buf,
      mimetype: 'audio/mpeg',
      fileName: `${song.title} - ${song.artist}.mp3`,
      contextInfo: song.cover ? {
        externalAdReply: {
          title:                song.title,
          body:                 song.artist,
          thumbnailUrl:         song.cover,
          mediaType:            1,
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
//  إرسال قائمة نتائج البحث
// ══════════════════════════════════════════════════
async function sendSearchList(conn, m, songs, query, pre, cmd) {
  const firstArt = songs[0].attributes.artwork;
  const coverUrl = firstArt
    ? firstArt.url.replace('{w}', '600').replace('{h}', '600')
    : FB_IMG;

  const bodyText = songs.map((s, i) => {
    const a = s.attributes;
    return `*${i + 1}. ${a.name}*\n   👤 ${a.artistName}  •  ⏱ ${fmtMs(a.durationInMillis)}`;
  }).join('\n\n');

  const sections = [{
    title: `🎵 نتائج البحث (${songs.length})`,
    rows: songs.map((s, i) => {
      const a = s.attributes;
      return {
        header:      `${i + 1}. ${a.name}`,
        title:       a.artistName,
        description: `⏱ ${fmtMs(a.durationInMillis)}  •  💿 ${a.albumName}`,
        id:          `${pre}${cmd} --url ${encodeURIComponent(a.url)}`,
      };
    }),
  }];

  try {
    const media = await prepareWAMessageMedia(
      { image: { url: coverUrl } },
      { upload: conn.waUploadToServer }
    );
    const msg = generateWAMessageFromContent(m.chat, {
      viewOnceMessage: {
        message: {
          interactiveMessage: proto.Message.InteractiveMessage.create({
            body:   proto.Message.InteractiveMessage.Body.create({
              text: `🔍 *نتائج البحث في Apple Music*\n🎤 ${query}\n\n${bodyText}`
            }),
            footer: proto.Message.InteractiveMessage.Footer.create({ text: '🍎 اختر أغنية لتحميلها' }),
            header: proto.Message.InteractiveMessage.Header.create({
              title: '🍎 Apple Music',
              hasMediaAttachment: true,
              imageMessage: media.imageMessage
            }),
            nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
              buttons: [{
                name: 'single_select',
                buttonParamsJson: JSON.stringify({ title: '🎵 اختر أغنية', sections })
              }],
            }),
          })
        }
      }
    }, { userJid: m.sender, quoted: m });
    return conn.relayMessage(m.chat, msg.message, { messageId: msg.key.id });
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

  const flags  = {};
  const flagRx = /--(\w+)\s+((?:(?!--).)+)/g;
  let   fx;
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

handler.help    = ['ابل <اسم أغنية أو رابط>'];
handler.tags    = ['downloader'];
handler.command = /^(ابل|apple|applemusic|ابلميوزك)$/i;
export default handler;