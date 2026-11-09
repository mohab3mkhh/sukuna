// ═══ استبدل extractToken و getSession القديمين بالتاليين ═══

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

// ═══ وفي الـ handler غيّر السطر ده: ═══
//   form1.append(csrfFieldName, csrfToken);
// ═══ لـ: ═══
//   if (csrfFieldName && csrfToken) form1.append(csrfFieldName, csrfToken);