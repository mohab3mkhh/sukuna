import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

// ===== إعدادات Zona Scraper =====
// الموقع بيشتغل على subdomain متغير (w140, w148, y6, etc.)
// نجرب أكتر من واحد
const ZONA_MIRRORS = [
  'https://y6.zona.plus',
  'https://w148.zona.plus',
  'https://w140.zona.plus',
];

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ru,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
};

// ===== جلب أفضل mirror يرد =====
async function getWorkingMirror() {
  for (const mirror of ZONA_MIRRORS) {
    try {
      const res = await fetch(`${mirror}/movies`, { headers: HEADERS, timeout: 8000 });
      if (res.ok) return mirror;
    } catch {}
  }
  throw new Error('كل مرايا Zona غير متاحة حالياً، حاول مرة أخرى.');
}

// ===== البحث بـ scraping =====
async function searchZona(query, type = 'all') {
  const base = await getWorkingMirror();
  
  // Zona بيدعم بحث عبر URL
  const searchUrl = `${base}/search?q=${encodeURIComponent(query)}`;
  const res = await fetch(searchUrl, { headers: HEADERS, timeout: 10000 });
  
  if (!res.ok) throw new Error(`فشل الاتصال بـ Zona (${res.status})`);
  
  const html = await res.text();
  const $ = cheerio.load(html);
  const results = [];

  // ===== parse نتائج البحث =====
  // Zona بيعرض المحتوى في .movies-list أو .items
  $('.item, .movie-item, .content-item, [class*="item"]').each((i, el) => {
    if (i >= 10) return false; // أقصى 10 نتائج

    const $el = $(el);
    const titleEl = $el.find('a[href*="/movies/"], a[href*="/tvseries/"], a[href*="/games/"]').first();
    const href = titleEl.attr('href') || $el.find('a').first().attr('href') || '';
    
    if (!href || (!href.includes('/movies/') && !href.includes('/tvseries/') && !href.includes('/games/'))) return;

    const title = titleEl.attr('title') || titleEl.text().trim() || $el.find('.title, .name, h2, h3').first().text().trim();
    const rating = $el.find('.rating, .score, [class*="rating"]').first().text().trim();
    const year = $el.find('.year, [class*="year"]').first().text().trim();
    const img = $el.find('img').first().attr('src') || $el.find('img').first().attr('data-src') || '';

    // تحديد النوع من الـ URL
    let contentType = 'movie';
    if (href.includes('/tvseries/')) contentType = 'series';
    else if (href.includes('/games/')) contentType = 'game';

    if (title && href) {
      results.push({
        title: title.replace(/\s+/g, ' ').trim(),
        href: href.startsWith('http') ? href : `${base}${href}`,
        slug: href.split('/').filter(Boolean).pop(),
        type: contentType,
        rating: rating || '',
        year: year || '',
        image: img.startsWith('http') ? img : img ? `${base}${img}` : '',
      });
    }
  });

  // لو مفيش نتايج من السيليكتور ده، جرب طريقة تانية
  if (results.length === 0) {
    $('a[href*="/movies/"], a[href*="/tvseries/"], a[href*="/games/"]').each((i, el) => {
      if (i >= 10) return false;
      const $el = $(el);
      const href = $el.attr('href') || '';
      const title = $el.attr('title') || $el.text().trim();
      
      if (!title || title.length < 2) return;
      
      let contentType = href.includes('/tvseries/') ? 'series' : href.includes('/games/') ? 'game' : 'movie';
      
      // استخرج التقييم والسنة من النص لو موجودين
      const text = $el.text();
      const yearMatch = text.match(/\b(19|20)\d{2}\b/);
      const ratingMatch = text.match(/\b([1-9]\.\d)\b/);

      results.push({
        title: title.split('\n')[0].trim(),
        href: href.startsWith('http') ? href : `https://w140.zona.plus${href}`,
        slug: href.split('/').filter(Boolean).pop(),
        type: contentType,
        rating: ratingMatch ? ratingMatch[1] : '',
        year: yearMatch ? yearMatch[0] : '',
        image: '',
      });
    });
  }

  // فلتر النوع لو محدد
  if (type !== 'all') {
    return results.filter(r => r.type === type);
  }

  return results;
}

// ===== جلب تفاصيل محتوى معين (torrent links) =====
async function getZonaContent(url) {
  const res = await fetch(url, { headers: HEADERS, timeout: 10000 });
  if (!res.ok) throw new Error(`فشل فتح الصفحة (${res.status})`);
  
  const html = await res.text();
  const $ = cheerio.load(html);

  const title = $('h1').first().text().trim() || $('title').text().split('|')[0].trim();
  const description = $('meta[name="description"]').attr('content') || 
                      $('.description, .synopsis, .plot').first().text().trim() || '';
  const rating = $('.rating, .imdb-rating, [class*="rating"]').first().text().trim() || '';
  const year = $('.year, [class*="year"]').first().text().trim() || '';
  const image = $('meta[property="og:image"]').attr('content') || 
                $('.poster img, .cover img').first().attr('src') || '';

  // ===== جلب روابط التورنت أو التحميل =====
  const downloadLinks = [];
  
  // جرب روابط magnet أو torrent
  $('a[href*="magnet:"], a[href*=".torrent"]').each((i, el) => {
    const href = $(el).attr('href');
    const label = $(el).text().trim() || $(el).closest('tr, .quality').find('.quality, .resolution').text().trim();
    if (href) downloadLinks.push({ label: label || `رابط ${i+1}`, href });
  });

  // جرب روابط تحميل مباشر
  $('a[href*="/download/"], a[href*="download"], .download-btn a').each((i, el) => {
    const href = $(el).attr('href');
    const label = $(el).text().trim();
    if (href && !downloadLinks.find(d => d.href === href)) {
      downloadLinks.push({ label: label || `تحميل ${i+1}`, href });
    }
  });

  return { title, description, rating, year, image, downloadLinks, url };
}

// ===== تحديد نوع المحتوى =====
function getTypeAr(type) {
  const map = { movie: '🎬 فيلم', series: '📺 مسلسل', game: '🎮 لعبة' };
  return map[type] || '🎯 محتوى';
}

// ===== الهاندلر الرئيسي =====
const handler = async (m, { conn, text }) => {

  if (!text) {
    return m.reply(`
╭━━━━━「 🎬 *Zona Downloader* 」━━━━━╮
┃
┃  *الأوامر المتاحة:*
┃
┃  🔍 *.zona <اسم>*
┃     بحث عام في كل المحتوى
┃
┃  🎬 *.zona فيلم <اسم>*
┃     بحث في الأفلام فقط
┃
┃  📺 *.zona مسلسل <اسم>*
┃     بحث في المسلسلات فقط
┃
┃  🎮 *.zona لعبة <اسم>*
┃     بحث في الألعاب فقط
┃
┃  📥 *.zona رابط <URL>*
┃     جلب روابط التحميل من صفحة معينة
┃
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━╯
    `.trim());
  }

  const args = text.trim().split(' ');
  const sub = args[0]?.toLowerCase();

  // ===== جلب روابط من صفحة مباشرة =====
  if (sub === 'رابط' || sub === 'link') {
    const url = args[1];
    if (!url || !url.startsWith('http')) return m.reply('❌ يرجى إدخال رابط صحيح.\nمثال: `.zona رابط https://w140.zona.plus/movies/inception`');

    await m.reply('⏳ جاري جلب روابط التحميل...');
    try {
      const content = await getZonaContent(url);
      
      let msg = `╭━━━「 📥 *روابط التحميل* 」━━━╮\n`;
      msg += `┃ 🎬 *${content.title}*\n`;
      if (content.year) msg += `┃ 📅 ${content.year}\n`;
      if (content.rating) msg += `┃ ⭐ ${content.rating}\n`;
      msg += `╰━━━━━━━━━━━━━━━━━━━━━╯\n\n`;

      if (content.downloadLinks.length === 0) {
        msg += `⚠️ لم يتم العثور على روابط تحميل مباشرة.\n`;
        msg += `🔗 يمكنك فتح الصفحة مباشرة:\n${url}`;
      } else {
        content.downloadLinks.forEach(dl => {
          msg += `📥 *${dl.label}*\n${dl.href}\n\n`;
        });
      }

      return conn.sendMessage(m.chat, { text: msg.trim() }, { quoted: m });
    } catch (e) {
      return m.reply(`❌ خطأ: ${e.message}`);
    }
  }

  // ===== تحديد نوع البحث =====
  let searchType = 'all';
  let query = text;

  if (sub === 'فيلم' || sub === 'movie') {
    searchType = 'movie';
    query = args.slice(1).join(' ');
  } else if (sub === 'مسلسل' || sub === 'series') {
    searchType = 'series';
    query = args.slice(1).join(' ');
  } else if (sub === 'لعبة' || sub === 'game') {
    searchType = 'game';
    query = args.slice(1).join(' ');
  }

  if (!query?.trim()) return m.reply(`❌ يرجى إدخال اسم المحتوى.`);

  await m.reply(`🔍 جاري البحث عن: *${query}*...`);

  try {
    const results = await searchZona(query, searchType);

    if (!results.length) {
      return m.reply(`❌ لم يتم العثور على نتائج لـ: *${query}*\n\nجرب كتابة الاسم بالروسية أو الإنجليزية لأن Zona موقع روسي.`);
    }

    let msg = `╭━━━「 🔍 *نتائج Zona* 」━━━╮\n`;
    msg += `┃ 🔎 بحث: ${query}\n`;
    msg += `┃ 📊 النتائج: ${results.length}\n`;
    msg += `╰━━━━━━━━━━━━━━━━━━━━━╯\n\n`;

    results.slice(0, 8).forEach((item, i) => {
      const type = getTypeAr(item.type);
      msg += `*[${i + 1}]* ${type}\n`;
      msg += `📌 *${item.title}*`;
      if (item.year) msg += ` (${item.year})`;
      msg += '\n';
      if (item.rating) msg += `⭐ ${item.rating}\n`;
      msg += `🔗 ${item.href}\n`;
      msg += `📥 للتحميل: \`.zona رابط ${item.href}\`\n`;
      msg += `─────────────────\n`;
    });

    msg += `\n💡 للحصول على روابط التحميل:\n_.zona رابط <الرابط>_`;

    return conn.sendMessage(m.chat, { text: msg.trim() }, { quoted: m });

  } catch (e) {
    return m.reply(`❌ خطأ أثناء البحث:\n${e.message}\n\n💡 ملاحظة: Zona موقع روسي، جرب البحث بالإنجليزي أو الروسي.`);
  }
};

handler.help = ['zona *<بحث|فيلم|مسلسل|لعبة|رابط>*'];
handler.tags = ['downloader', 'media'];
handler.command = /^(zona|زونا)$/i;

export default handler;