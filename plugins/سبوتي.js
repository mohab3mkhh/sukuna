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


// إرسال نص عادي بدون اقتباس الرسالة (بيظهر على الواتس العادي والبيزنس)
const send = (conn, message, text) => conn.sendMessage(message.chat, { text });

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

  const form  = $('input[name="url"]').first().closest('form');
  const scope = form.length ? form : $('body');

  // 1) أي input مخفي جوه الفورم
  let field = '', value = '';
  scope.find('input').each((_, el) => {
    const type = ($(el).attr('type') || 'hidden').toLowerCase();
    const name = $(el).attr('name') || '';
    const val  = $(el).attr('value') || '';
    if (type === 'hidden' && name && !excluded.includes(name) && val) {
      field = name;
      value = val;
    }
  });
  if (value) return { field, value };

  // 2) توكن في meta tag
  const meta = $('meta[name="csrf-token"], meta[name="csrf"], meta[name="_token"]').first().attr('content');
  if (meta) return { field: '_token', value: meta };

  return { field: '', value: '' };
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

      const html    = typeof res.data === 'string' ? res.data : '';
      const referer = res.request?.res?.responseUrl || pageUrl;
      const { field, value } = extractToken(html);

      let cookies = '';
      const raw = res.headers['set-cookie'];
      if (raw) cookies = (Array.isArray(raw) ? raw : [raw]).map(c => c.split(';')[0]).join('; ');

      // لقينا توكن
      if (value) return { cookies, csrfFieldName: field, csrfToken: value, referer };

      // الصفحة اتفتحت وفيها خانة الرابط بس مفيش توكن ← كمّل من غيره
      if (/name=["']url["']/i.test(html)) {
        const $ = cheerio.load(html);
        console.log('[spotidown] page ok but no token. form html:',
          ($('form').first().html() || '').replace(/\s+/g, ' ').slice(0, 800));
        return { cookies, csrfFieldName: '', csrfToken: '', referer };
      }

      // حماية حقيقية (Cloudflare) مش كلمة captcha العادية
      const blocked = /just a moment|cf-chl|attention required/i.test(html);
      lastInfo = `${pageUrl} → HTTP ${res.status}, ${html.length} bytes${blocked ? ' (Cloudflare)' : ''}`;
      console.log('[spotidown] no form:', lastInfo, '|', html.slice(0, 200).replace(/\s+/g, ' '));
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

  await send(
    conn,
    message,
    sukunaStyle('🎵 𝑺 𝑷 𝑶 𝑻 𝑰 𝑭 𝒀', [
      `🔢 عدد النتائج : ${tracks.length} أغنية`
    ]) + '\n\n' + list + '\n\n📌 للتحميل اكتب: *.سبوتي_dl <رقم>*\nمثال: .سبوتي_dl 1'
  );
};

const downloadAndSend = async (conn, message, track) => {
  const { name, artist, album, duration, cover, extractedData, extractedBase, extractedToken, fields, cookies, referer } = track;

  const form2 = new FormData();
  if (fields && Object.keys(fields).length) {
    for (const [k, v] of Object.entries(fields)) form2.append(k, v);
  } else {
    form2.append('data',  extractedData);
    form2.append('base',  extractedBase);
    form2.append('token', extractedToken);
  }

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
    return send(conn, message, sukunaStyle('❌ 𝑬 𝑹 𝑹 𝑶 𝑹', [
      `فشل /action/track : ${e?.response?.status || e.message}`
    ]), message);
  }

  const trackData = trackRes.data;
  console.log('[spotidown] track response:', JSON.stringify(trackData).slice(0, 1500));
  let downloadUrl = '';

  const htmlStr = typeof trackData === 'string'
    ? trackData
    : (typeof trackData?.data === 'string' ? trackData.data : '');

  if (htmlStr) {
    const $t = cheerio.load(htmlStr);
    $t('a').each((_, el) => {
      let href = $t(el).attr('href') || '';
      if (!downloadUrl && /rapid\.spotidown\.app|\.mp3|\/download|\/dl/i.test(href)) {
        if (href.startsWith('/')) href = 'https://spotidown.app' + href;
        downloadUrl = href;
      }
    });
    if (!downloadUrl) {
      const m = htmlStr.match(/https?:\/\/rapid\.spotidown\.app[^"'\s<>\\]+/i);
      if (m) downloadUrl = m[0];
    }
  }

  if (!downloadUrl && trackData?.token) {
    downloadUrl = `https://rapid.spotidown.app/v2?token=${trackData.token}`;
  }
  if (!downloadUrl && (trackData?.url || trackData?.link)) {
    downloadUrl = trackData.url || trackData.link;
  }

  if (!downloadUrl) {
    return send(conn, message, sukunaStyle('❌ 𝑬 𝑹 𝑹 𝑶 𝑹', [
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
    return send(conn, message, sukunaStyle('❌ 𝑬 𝑹 𝑹 𝑶 𝑹', [
      'فشل تحميل الملف الصوتي'
    ]), message);
  }

  const contentType = mp3Res.headers['content-type'] || '';
  if (!contentType.includes('audio') && !contentType.includes('octet')) {
    return send(conn, message, sukunaStyle('❌ 𝑬 𝑹 𝑹 𝑶 𝑹', [
      'الرابط لم يُرجع ملفاً صوتياً'
    ]), message);
  }

  const mp3Buffer  = Buffer.from(mp3Res.data);
  const cleanCover = cover?.replace(/\\\//g, '/');

  const caption = sukunaStyle('🎵 𝑻 𝑹 𝑨 𝑪 𝑲', [
    `🎶 ${name}`,
    `👤 ${artist}`,
    `💿 ${album || '—'}`,
    `⏱️ ${duration || '—'}`
  ]);

  let cardSent = false;
  if (cleanCover && !cleanCover.includes('null')) {
    try {
      const thumbRes = await axios.get(cleanCover, { responseType: 'arraybuffer', timeout: 10000 });
      await conn.sendMessage(message.chat, { image: Buffer.from(thumbRes.data), caption });
      cardSent = true;
    } catch {}
  }
  if (!cardSent) await send(conn, message, caption);

  await conn.sendMessage(message.chat, {
    audio: mp3Buffer,
    mimetype: 'audio/mpeg',
    fileName: `${name} - ${artist}.mp3`,
    ptt: false
  });
};

const handler = async (message, { conn, command, text }) => {
  const userId = message.sender || message.key?.participant || message.key?.remoteJid;

  // اختيار أغنية من القائمة: .سبوتي_dl <رقم>
  if (/^سبوتي_dl$/i.test(command)) {
    const index  = parseInt(text?.trim()) - 1;
    const tracks = pendingSelections.get(userId);
    if (!tracks || isNaN(index) || !tracks[index]) {
      return send(conn, message, sukunaStyle('⚠️ 𝑬 𝑿 𝑷 𝑰 𝑹 𝑬 𝑫', [
        'انتهت صلاحية القائمة أو الرقم خاطئ'
      ]), message);
    }
    return downloadAndSend(conn, message, tracks[index]);
  }

  if (!/^سبوتي$/i.test(command)) return;

  if (!text) {
    return send(conn, message, sukunaStyle('🎵 𝑺 𝑷 𝑶 𝑻 𝑰 𝑭 𝒀', [
      'أرسل رابط أو اسم أغنية',
      'مثال: .سبوتي https://open.spotify.com/track/...',
      'أو: .سبوتي اسم الأغنية'
    ]), message);
  }

  const input = text.trim();
  let spotifyUrl = input;
  if (input.includes('spotify.com/track')) spotifyUrl = input.split('?')[0];

  try {
    const { cookies, csrfFieldName, csrfToken, referer } = await getSession();

    const form1 = new FormData();
    form1.append('url', spotifyUrl);
    form1.append('g-recaptcha-response', '');
    if (csrfFieldName && csrfToken) form1.append(csrfFieldName, csrfToken);

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
      return send(conn, message, sukunaStyle('❌ 𝑬 𝑹 𝑹 𝑶 𝑹', [
        `فشل /action : ${e?.response?.status || e.message}`
      ]), message);
    }

    const actionData = actionRes.data;
    const tracks = [];

    // دمج الكوكيز اللي رجعت من /action مع كوكيز الصفحة
    let allCookies = cookies;
    const setCk = actionRes.headers['set-cookie'];
    if (setCk) {
      const extra = (Array.isArray(setCk) ? setCk : [setCk]).map(c => c.split(';')[0]).join('; ');
      allCookies = [cookies, extra].filter(Boolean).join('; ');
    }

    if (actionData?.data && typeof actionData.data === 'string') {
      const $a = cheerio.load(actionData.data);
      $a('form[name="submitspurl"]').each((_, formEl) => {
        const extractedData  = $a(formEl).find('input[name="data"]').val()  || '';
        const extractedBase  = $a(formEl).find('input[name="base"]').val()  || '';
        const extractedToken = $a(formEl).find('input[name="token"]').val() || '';
        if (!extractedData || !extractedToken) return;

        const fields = {};
        $a(formEl).find('input').each((_, inp) => {
          const n = $a(inp).attr('name');
          if (n) fields[n] = $a(inp).attr('value') || '';
        });
        console.log('[spotidown] result form fields:', Object.keys(fields).join(', '));

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
          fields,
          cookies: allCookies,
          referer,
        });
      });
    }

    if (tracks.length === 0) {
      return send(conn, message, sukunaStyle('❌ 𝑵 𝑶 𝑻  𝑭 𝑶 𝑼 𝑵 𝑫', [
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
    await send(conn, message, sukunaStyle('❌ 𝑬 𝑹 𝑹 𝑶 𝑹', [msg]), message);
  }
};

handler.command = /^(سبوتي|سبوتي_dl)$/i;
handler.group   = false;

export default handler;