/**
 * plugins/الصلاة.js
 * مواقيت الصلاة — دول عربية + محافظات
 */

import axios from 'axios';
import { sendButtons, btn } from '../lib/buttons.js';

// ════════════════════════════════════════════
// 🗺️ الدول والمحافظات
// ════════════════════════════════════════════
const COUNTRIES = {
  'مصر': {
    code: 'EG',
    cities: ['القاهرة','الجيزة','الإسكندرية','الإسماعيلية','السويس','بورسعيد','المنصورة','طنطا','الزقازيق','دمياط','أسيوط','سوهاج','الأقصر','أسوان','المنيا','بني سويف','الفيوم','شرم الشيخ','الغردقة','مرسى مطروح','العريش','قنا','دمنهور']
  },
  'السعودية': {
    code: 'SA',
    cities: ['الرياض','جدة','مكة المكرمة','المدينة المنورة','الدمام','الخبر','الظهران','تبوك','أبها','الطائف','الجبيل','ينبع','خميس مشيط','نجران','جازان','حائل','عرعر','سكاكا','بريدة','القطيف']
  },
  'الإمارات': {
    code: 'AE',
    cities: ['أبوظبي','دبي','الشارقة','عجمان','رأس الخيمة','الفجيرة','أم القيوين','العين','الظفرة']
  },
  'الكويت': {
    code: 'KW',
    cities: ['الكويت','حولي','الفروانية','الأحمدي','الجهراء','مبارك الكبير']
  },
  'قطر': {
    code: 'QA',
    cities: ['الدوحة','الريان','الوكرة','الخور','الشمال','الشيلة','مسيعيد','أم صلال']
  },
  'البحرين': {
    code: 'BH',
    cities: ['المنامة','المحرق','الرفاع','مدينة عيسى','مدينة حمد','سترة','الحد']
  },
  'عُمان': {
    code: 'OM',
    cities: ['مسقط','صلالة','نزوى','صحار','السيب','البريمي','مطرح','صور','إبراء','الرستاق']
  },
  'اليمن': {
    code: 'YE',
    cities: ['صنعاء','عدن','تعز','الحديدة','إب','ذمار','المكلا','مأرب','سعدة','حجة']
  },
  'العراق': {
    code: 'IQ',
    cities: ['بغداد','البصرة','الموصل','أربيل','كركوك','النجف','كربلاء','الحلة','الناصرية','العمارة','السماوة','الديوانية','الرمادي','تكريت','الفلوجة','الكوت']
  },
  'سوريا': {
    code: 'SY',
    cities: ['دمشق','حلب','حمص','اللاذقية','حماة','دير الزور','الرقة','الحسكة','درعا','طرطوس','إدلب','السويداء','القامشلي']
  },
  'لبنان': {
    code: 'LB',
    cities: ['بيروت','طرابلس','صيدا','صور','زحلة','جونيه','النبطية','بعلبك','جبيل']
  },
  'الأردن': {
    code: 'JO',
    cities: ['عمّان','إربد','الزرقاء','العقبة','المفرق','الكرك','السلط','معان','جرش','مادبا']
  },
  'فلسطين': {
    code: 'PS',
    cities: ['غزة','رام الله','نابلس','الخليل','جنين','طولكرم','بيت لحم','أريحا','طوباس','قلقيلية']
  },
  'المغرب': {
    code: 'MA',
    cities: ['الرباط','الدار البيضاء','فاس','مراكش','مكناس','أكادير','طنجة','وجدة','القنيطرة','تطوان','الجديدة','سطات','بني ملال','نادور','خريبكة']
  },
  'الجزائر': {
    code: 'DZ',
    cities: ['الجزائر العاصمة','وهران','قسنطينة','عنابة','بليدة','سطيف','تلمسان','بجاية','مستغانم','سيدي بلعباس','باتنة','بسكرة','تيزي وزو','المدية','المسيلة']
  },
  'تونس': {
    code: 'TN',
    cities: ['تونس','صفاقس','سوسة','القيروان','بنزرت','قابس','أريانة','نابل','مدنين','قفصة','سيدي بوزيد','سليانة','الكاف','زغوان','توزر']
  },
  'ليبيا': {
    code: 'LY',
    cities: ['طرابلس','بنغازي','مصراتة','الزاوية','سرت','البيضاء','طبرق','الخمس','زليتن','غريان','سبها','درنة']
  },
  'السودان': {
    code: 'SD',
    cities: ['الخرطوم','أم درمان','بحري','بورتسودان','كسلا','الأبيض','ود مدني','القضارف','عطبرة','الفاشر']
  },
  'الصومال': {
    code: 'SO',
    cities: ['مقديشو','هرجيسا','بربرة','بوصاصو','كيسمايو','بيدوا','غالكعيو','بايدهابو']
  },
  'موريتانيا': {
    code: 'MR',
    cities: ['نواكشوط','نواذيبو','روصو','كيفة','ألاك','سيليبابي','زويرات','تجكجة']
  },
  'جيبوتي': {
    code: 'DJ',
    cities: ['جيبوتي','علي صبيح','ديخيل','تاجورة','عوبوك','أرتا']
  },
  'جزر القمر': {
    code: 'KM',
    cities: ['موروني','فومبوني','موتساموودو']
  }
};

// ════════════════════════════════════════════
// 🕐 تحويل الوقت
// ════════════════════════════════════════════
function format12HourTime(time24) {
  const [hours, minutes] = time24.split(':');
  let period = 'ص';
  let h = parseInt(hours, 10);
  if (h >= 12) { period = 'م'; if (h > 12) h -= 12; }
  if (h === 0) h = 12;
  return `${h}:${minutes} ${period}`;
}

const FOOTER = '☠️┆⛩️SUKUNA⚡️BOT⛩️┆☠️';
const IMAGES = [
  'https://ar.prayerinislam.com/wp-content/uploads/المشروع-في-المسجد.jpg',
  'https://islamonline.net/wp-content/uploads/2023/02/الإمام-والمؤذن-صلاة-الجماعة.jpg',
  'https://daleelalmasjed.com/upload/3021162680-258.png'
];

// ════════════════════════════════════════════
// 🔧 مساعدات
// ════════════════════════════════════════════
function randomImage() {
  return IMAGES[Math.floor(Math.random() * IMAGES.length)];
}

// تقسيم المصفوفة لمجموعات
function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

// بناء sections للقائمة (max 10 عناصر لكل section)
function buildSections(items, prefix, labelFn) {
  const chunks = chunkArray(items, 10);
  return chunks.map((chunk, i) => ({
    title: `「 ${i + 1} 」`,
    rows: chunk.map(item => ({
      title: item,
      description: labelFn ? labelFn(item) : item,
      id: `${prefix}${item}`
    }))
  }));
}

// ════════════════════════════════════════════
// 🕌 Handler
// ════════════════════════════════════════════
const handler = async (m, { conn, text, usedPrefix, command }) => {
  const img = randomImage();

  // ━━━ لا يوجد نص → عرض قائمة الدول ━━━
  if (!text) {
    const countryNames = Object.keys(COUNTRIES);
    const sections = buildSections(countryNames, `${usedPrefix}${command} `, c => `مواقيت الصلاة في ${c}`);

    return sendButtons(conn, m.chat, {
      title: '🕌 مواقيت الصلاة',
      subtitle: 'اختر الدولة',
      text: `مرحباً يا ${m.pushName} 🌙\nاختر دولتك من القائمة 👇`,
      footer: FOOTER,
      image: img,
      buttons: [btn.list('🌍 قائمة الدول', sections)]
    }, m);
  }

  const input = text.trim();

  // ━━━ الإدخال دولة → عرض محافظاتها ━━━
  const countryData = COUNTRIES[input];
  if (countryData) {
    const sections = buildSections(
      countryData.cities,
      `${usedPrefix}${command} `,
      c => `مواقيت الصلاة في ${c}`
    );

    return sendButtons(conn, m.chat, {
      title: `🕌 مواقيت الصلاة — ${input}`,
      subtitle: 'اختر المدينة',
      text: `اخترت *${input}* 🌙\nاختر مدينتك من القائمة 👇`,
      footer: FOOTER,
      image: img,
      buttons: [btn.list(`🏙️ مدن ${input}`, sections)]
    }, m);
  }

  // ━━━ الإدخال مدينة → جيب المواقيت ━━━
  // نبحث عن الدولة المرتبطة بالمدينة
  let countryCode = 'EG'; // افتراضي
  for (const [, data] of Object.entries(COUNTRIES)) {
    if (data.cities.includes(input)) {
      countryCode = data.code;
      break;
    }
  }

  try {
    const res = await axios.get(
      `http://api.aladhan.com/v1/timingsByCity?city=${encodeURIComponent(input)}&country=${countryCode}`,
      { timeout: 10000 }
    );
    const t = res.data.data.timings;
    const date = res.data.data.date.readable;

    const prayerText =
      `📅 *${date}*\n` +
      `🏙️ *${input}*\n\n` +
      `🌙 الفجر:    ${format12HourTime(t.Fajr)}\n` +
      `☀️ الشروق:  ${format12HourTime(t.Sunrise)}\n` +
      `🌤️ الظهر:   ${format12HourTime(t.Dhuhr)}\n` +
      `🌥️ العصر:   ${format12HourTime(t.Asr)}\n` +
      `🌆 المغرب:  ${format12HourTime(t.Maghrib)}\n` +
      `🌃 العشاء:  ${format12HourTime(t.Isha)}`;

    // زر للرجوع لقائمة الدول
    const countryNames = Object.keys(COUNTRIES);
    const sections = buildSections(countryNames, `${usedPrefix}${command} `, c => `مواقيت الصلاة في ${c}`);

    await sendButtons(conn, m.chat, {
      title: '🕌 مواقيت الصلاة',
      subtitle: input,
      text: prayerText,
      footer: FOOTER,
      image: img,
      buttons: [btn.list('🔙 تغيير المدينة', sections)]
    }, m);

  } catch (err) {
    console.error('[الصلاة]', err.message);
    await conn.sendMessage(m.chat, {
      text: `❌ تعذّر جلب مواقيت *${input}*\nتأكد من كتابة اسم المدينة بالعربي الصحيح.`
    }, { quoted: m });
  }
};

handler.command = ['الصلاة', 'اذان', 'الصلاه'];
handler.tags = ['tools'];

export default handler;