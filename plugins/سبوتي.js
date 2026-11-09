import axios from 'axios';
import * as cheerio from 'cheerio';
import FormData from 'form-data';

const UA = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36';
const LIST_IMAGE = 'https://files.catbox.moe/i6q798.jpg';

// الموقع غيّر رابط الصفحة (ar4 → ar5)، فبنجرب أكتر من رابط
const PAGE_CANDIDATES = [
  'https://spotidown.app/ar5',
  'https://spotidown.app/en7',
  'https://spotidown.app/',
];

const SYSTEM_NAME = '◜⏤͟͟͞͞ 𝙈𝙤𝙝𝙖𝙗 ✦ 𝙎𝙋𝙊𝙏𝙄𝙁𝙔 ✦ 𝘿𝙊𝙒𝙉𝙇𝙊𝘼𝘿 ˖࣪⃟⛩️ ◞';

function sukunaStyle(title, lines = []) {
  const top = `╔════ ≪ ━ ─ ❪ ⛩️ ${title} ⛩️ ❫ ─ ━ ≫ ════╗\n║ ✧ ━━━━━ ❪ 𝐒 𝐔 𝐊 𝐔 𝐍 𝐀 ⚡ 𝐁 𝐎 𝐓 ❫ ━━━━━ ✧ ║\n╚════ ≪ ━ ─ ❪ 🔪 𝐌 𝐨 𝐡 𝐚 𝐛 🔪 ❫ ─ ━ ≫ ════╝\n⋮\n`;
  const mid = lines.map(l => `╟「 🎵 」↬ ${l}`).join('\n');
  const bot = `\n⋮\n╰─── ≪ ━ ─ ❪ ⛩️ ❪ 🔪 ❫ ⛩️ ❫ ─ ━ ≫ ───╯\n${SYSTEM_NAME}`;
  return top + mid + bot;
}

const pendingSelections = new Map();
const pendingTimeouts   = new Map();

const setPendingWithTimeout = (userId, tracks) => {
  const old = pendingTimeouts.get(userId);
  if (old) clearTimeout(old);
  pendingSelections.set(userId, tracks);
  const t = setTimeout(() => {
    pendingSelections.delete(userId);
    pendingTimeouts.delete(userId);
  }, 3 * 60 * 1000);
  pendingTimeouts.set(userId, t);
};

// ═══ استخراج الـ CSRF من الصفحة ═══
const extractToken = (html) => {
  if (!html) return { field: '', value: '' };
  const $ = cheerio.load(html);
  const excluded = ['url', 'g-recaptcha-response', 'no-name'];

  // الأول ندور جوه الفورم اللي فيه حقل url، لو مش لاقيه ندور في الصفحة كلها
  const form = $('input[name="url"]').first().closest('form');
  const scope = form.length ? form : $('body');

  let field = '', value = '';
  scope.find('input[type="hidden"]').each((_, el) => {
    const name = $(el).attr('name') || '';
    const val  = $(el).val() || '';
    if (name && !excluded.includes(name) && val) {
      field = name;
      value = val;
    }
  });
  return { field, value };
};

// ═══ فتح جلسة مع الموقع (كوكيز + توكن) ═══
const getSession = async () => {
  let lastInfo = '';

  for (const pageUrl of PAGE_CANDIDATES) {
    try {
      const res = await axios.get(pageUrl, {
        headers: {
          'User-Agent': UA,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'ar-EG,ar;q=0.9,en-US;q=0.8,en;q=0.7',
        },
        timeout: 30000,
        maxRedirects: 5,
      });

      const html = typeof res.data === 'string' ? res.data : '';
      const referer = res.request?.res?.responseUrl || pageUrl;
      const { field, value } = extractToken(html);

      if (value) {
        let cookies = '';
        const raw = res.headers['set-cookie'];
        if (raw) {
          cookies = (Array.isArray(raw) ? raw : [raw]).map(c => c.split(';')[0]).join('; ');
        }
        return { cookies, csrfFieldName: field, csrfToken: value, referer };
      }

      const blocked = /cloudflare|just a moment|challenge|captcha/i.test(html);
      lastInfo = `${pageUrl} → HTTP ${res.status}, ${html.length} bytes${blocked ? ' (حماية ضد السيرفر)' : ''}`;
      console.log('[spotidown] no token:', lastInfo, '|', html.slice(0, 200).replace(/\s+/g, ' '));
    } catch (e) {
      lastInfo = `${pageUrl} → ${e?.response?.status || e.message}`;
      console.log('[spotidown] page fail:', lastInfo);
    }
  }

  throw new Error('NO_TOKEN: ' + lastInfo);
};

// ═══ قائمة النتائج كنص (بتظهر على الواتس العادي والبيزنس) ═══
const sendTrackList = async (conn, message, tracks) => {
  const list = tracks.map((t, i) =>
    `*${i + 1}.* ${t.name} — ${t.artist}${t.duration ? ` (${t.duration})` : ''}`
  ).join('\n');

  await conn.reply(
    message.chat,
    sukunaStyle('🎵 𝑺 𝑷 𝑶 𝑻 𝑰 𝑭 𝒀', [
      `🔢 عدد النتائج : ${tracks.length} أغنية`
    ]) + '\n\n' + list + '\n\n📌 للتحميل اكتب: *.سبوتي_dl <رقم>*\nمثال: .سبوتي_dl 1',
    message
  );
};

const downloadAndSend = async (conn, message, track) => {
  const { name, artist, album, duration, cover, extractedData, extractedBase, extractedToken, cookies, referer } = track;

  await conn.reply(message.chat, sukunaStyle('⬇️ 𝑫 𝑶 𝑾 𝑵 𝑳 𝑶 𝑨 𝑫', [
    `جاري تحميل : ${name}`,
    `الفنان      : ${artist}`
  ]), message);

  const form2 = new FormData();
  form2.append('data',  extractedData);
  form2.append('base',  extractedBase);
  form2.append('token', extractedToken);

  let trackRes;
  try {
    trackRes = await axios.post('https://spotidown.app/action/track', form2, {
      headers: {
        ...form2.getHeaders(),
        'User-Agent': UA,
        'Origin': 'https://spotidown.app',
        'Referer': referer || 'https://spotidown.app/ar5',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Accept-Language': 'ar-EG,ar;q=0.9,en-US;q=0.8,en;q=0.7',
        'X-Requested-With': 'XMLHttpRequest',
        ...(cookies ? { Cookie: cookies } : {}),
      },
      timeout: 35000,
    });
  } catch (e) {
    return conn.reply(message.chat, sukunaStyle('❌ 𝑬 𝑹 𝑹 𝑶 𝑹', [
      `فشل /action/track : ${e?.response?.status || e.message}`
    ]), message);
  }

  const trackData = trackRes.data;
  let downloadUrl = '';

  if (trackData?.data && typeof trackData.data === 'string') {
    const $t = cheerio.load(trackData.data);
    $t('a.abutton').each((_, el) => {
      const href = $t(el).attr('href') || '';
      if (href.includes('rapid.spotidown.app') && !downloadUrl) downloadUrl = href;
    });
  }

  if (!downloadUrl && trackData?.token) {
    downloadUrl = `https://rapid.spotidown.app/v2?token=${trackData.token}`;
  }

  if (!downloadUrl) {
    return conn.reply(message.chat, sukunaStyle('❌ 𝑬 𝑹 𝑹 𝑶 𝑹', [
      'فشل استخراج رابط التحميل النهائي'
    ]), message);
  }

  let mp3Res;
  try {
    mp3Res = await axios.get(downloadUrl, {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': UA,
        'Referer': 'https://spotidown.app/',
        'Accept': 'audio/mpeg,audio/*;q=0.9,*/*;q=0.8',
      },
      timeout: 60000,
      maxContentLength: 50 * 1024 * 1024,
      maxBodyLength:    50 * 1024 * 1024,
    });
  } catch (e) {
    return conn.reply(message.chat, sukunaStyle('❌ 𝑬 𝑹 𝑹 𝑶 𝑹', [
      'فشل تحميل الملف الصوتي'
    ]), message);
  }

  const contentType = mp3Res.headers['content-type'] || '';
  if (!contentType.includes('audio') && !contentType.includes('octet')) {
    return conn.reply(message.chat, sukunaStyle('❌ 𝑬 𝑹 𝑹 𝑶 𝑹', [
      'الرابط لم يُرجع ملفاً صوتياً'
    ]), message);
  }

  const mp3Buffer  = Buffer.from(mp3Res.data);
  const cleanCover = cover?.replace(/\\\//g, '/');

  if (cleanCover && !cleanCover.includes('null')) {
    try {
      const thumbRes = await axios.get(cleanCover, { responseType: 'arraybuffer', timeout: 10000 });
      await conn.sendMessage(message.chat, {
        image: Buffer.from(thumbRes.data),
        caption: sukunaStyle('🎵 𝑻 𝑹 𝑨 𝑪 𝑲', [
          `🎶 ${name}`,
          `👤 ${artist}`,
          `💿 ${album || '—'}`,
          `⏱️ ${duration || '—'}`
        ])
      }, { quoted: message });
    } catch {}
  }

  await conn.sendMessage(message.chat, {
    audio: mp3Buffer,
    mimetype: 'audio/mpeg',
    fileName: `${name} - ${artist}.mp3`,
    ptt: false,
    contextInfo: {
      externalAdReply: {
        title: name,
        body: artist,
        thumbnailUrl: cleanCover || LIST_IMAGE,
        mediaType: 1,
        showAdAttribution: false,
        renderLargerThumbnail: true,
      }
    }
  }, { quoted: message });
};

const handler = async (message, { conn, command, text }) => {
  const userId = message.sender || message.key?.participant || message.key?.remoteJid;

  // اختيار أغنية من القائمة: .سبوتي_dl <رقم>
  if (/^سبوتي_dl$/i.test(command)) {
    const index  = parseInt(text?.trim()) - 1;
    const tracks = pendingSelections.get(userId);
    if (!tracks || isNaN(index) || !tracks[index]) {
      return conn.reply(message.chat, sukunaStyle('⚠️ 𝑬 𝑿 𝑷 𝑰 𝑹 𝑬 𝑫', [
        'انتهت صلاحية القائمة أو الرقم خاطئ'
      ]), message);
    }
    return downloadAndSend(conn, message, tracks[index]);
  }

  if (!/^سبوتي$/i.test(command)) return;

  if (!text) {
    return conn.reply(message.chat, sukunaStyle('🎵 𝑺 𝑷 𝑶 𝑻 𝑰 𝑭 𝒀', [
      'أرسل رابط أو اسم أغنية',
      'مثال: .سبوتي https://open.spotify.com/track/...',
      'أو: .سبوتي اسم الأغنية'
    ]), message);
  }

  const input = text.trim();
  let spotifyUrl = input;
  if (input.includes('spotify.com/track')) spotifyUrl = input.split('?')[0];

  try {
    await conn.reply(message.chat, sukunaStyle('🔍 𝑺 𝑬 𝑨 𝑹 𝑪 𝑯', [
      'جاري البحث عن الأغنية...'
    ]), message);

    const { cookies, csrfFieldName, csrfToken, referer } = await getSession();

    const form1 = new FormData();
    form1.append('url', spotifyUrl);
    form1.append('g-recaptcha-response', '');
    form1.append(csrfFieldName, csrfToken);

    let actionRes;
    try {
      actionRes = await axios.post('https://spotidown.app/action', form1, {
        headers: {
          ...form1.getHeaders(),
          'User-Agent': UA,
          'Origin': 'https://spotidown.app',
          'Referer': referer,
          'Accept': 'application/json, text/javascript, */*; q=0.01',
          'X-Requested-With': 'XMLHttpRequest',
          ...(cookies ? { Cookie: cookies } : {}),
        },
        timeout: 25000,
      });
    } catch (e) {
      return conn.reply(message.chat, sukunaStyle('❌ 𝑬 𝑹 𝑹 𝑶 𝑹', [
        `فشل /action : ${e?.response?.status || e.message}`
      ]), message);
    }

    const actionData = actionRes.data;
    const tracks = [];

    if (actionData?.data && typeof actionData.data === 'string') {
      const $a = cheerio.load(actionData.data);
      $a('form[name="submitspurl"]').each((_, formEl) => {
        const extractedData  = $a(formEl).find('input[name="data"]').val()  || '';
        const extractedBase  = $a(formEl).find('input[name="base"]').val()  || '';
        const extractedToken = $a(formEl).find('input[name="token"]').val() || '';
        if (!extractedData || !extractedToken) return;

        let info = {};
        try {
          info = JSON.parse(Buffer.from(extractedData, 'base64').toString('utf-8'));
        } catch {}

        tracks.push({
          name:          info.name     || 'Unknown',
          artist:        info.artist   || 'Unknown',
          album:         info.album    || '',
          duration:      info.duration || '',
          cover:         info.cover    || '',
          extractedData,
          extractedBase: extractedBase || spotifyUrl,
          extractedToken,
          cookies,
          referer,
        });
      });
    }

    if (tracks.length === 0) {
      return conn.reply(message.chat, sukunaStyle('❌ 𝑵 𝑶 𝑻  𝑭 𝑶 𝑼 𝑵 𝑫', [
        'لم يتم العثور على نتائج'
      ]), message);
    }

    if (tracks.length === 1) {
      return downloadAndSend(conn, message, tracks[0]);
    }

    setPendingWithTimeout(userId, tracks);
    await sendTrackList(conn, message, tracks);

  } catch (err) {
    console.error('[spoti handler]', err);
    const status = err?.response?.status;
    const msg =
      err.message?.startsWith('NO_TOKEN') ? 'مش قادر أفتح صفحة الموقع (ممكن يكون حاطط حماية ضد السيرفر أو غيّر شكله)' :
      status === 429 ? 'تم تجاوز الحد، انتظر دقيقة' :
      status === 403 ? 'تم حظر الطلب (403)'          :
      status === 404 ? 'الأغنية غير موجودة'          :
      err.message    || 'خطأ غير معروف';
    await conn.reply(message.chat, sukunaStyle('❌ 𝑬 𝑹 𝑹 𝑶 𝑹', [msg]), message);
  }
};

handler.command = /^(سبوتي|سبوتي_dl)$/i;
handler.group   = false;

export default handler;