/**
 * plugins/ايه.js
 * ⛩️ SUKUNA BOT - .ايه <اسم السورة> <رقم الآية>
 * جلب آية معينة نصاً (رسم عثماني) وصوتاً (مشاري العفاسي)
 */

import fetch from 'node-fetch';

const surahNames = [
  'الفاتحة', 'البقرة', 'آل عمران', 'النساء', 'المائدة', 'الأنعام', 'الأعراف', 'الأنفال', 'التوبة', 'يونس',
  'هود', 'يوسف', 'الرعد', 'إبراهيم', 'الحجر', 'النحل', 'الإسراء', 'الكهف', 'مريم', 'طه',
  'الأنبياء', 'الحج', 'المؤمنون', 'النور', 'الفرقان', 'الشعراء', 'النمل', 'القصص', 'العنكبوت', 'الروم',
  'لقمان', 'السجدة', 'الأحزاب', 'سبأ', 'فاطر', 'يس', 'الصافات', 'ص', 'الزمر', 'غافر',
  'فصلت', 'الشورى', 'الزخرف', 'الدخان', 'الجاثية', 'الأحقاف', 'محمد', 'الفتح', 'الحجرات', 'ق',
  'الذاريات', 'الطور', 'النجم', 'القمر', 'الرحمن', 'الواقعة', 'الحديد', 'المجادلة', 'الحشر', 'الممتحنة',
  'الصف', 'الجمعة', 'المنافقون', 'التغابن', 'الطلاق', 'التحريم', 'الملك', 'القلم', 'الحاقة', 'المعارج',
  'نوح', 'الجن', 'المزمل', 'المدثر', 'القيامة', 'الإنسان', 'المرسلات', 'النبأ', 'النازعات', 'عبس',
  'التكوير', 'الإنفطار', 'المطففين', 'الإنشقاق', 'البروج', 'الطارق', 'الأعلى', 'الغاشية', 'الفجر', 'البلد',
  'الشمس', 'الليل', 'الضحى', 'الشرح', 'التين', 'العلق', 'القدر', 'البينة', 'الزلزلة', 'العاديات',
  'القارعة', 'التكاثر', 'العصر', 'الهمزة', 'الفيل', 'قريش', 'الماعون', 'الكوثر', 'الكافرون', 'النصر',
  'المسد', 'الإخلاص', 'الفلق', 'الناس',
];

// توحيد الحروف عشان يقبل أشكال مختلفة من كتابة الاسم (بهمزة أو من غيرها.. إلخ)
const normalizeArabic = (str = '') =>
  str
    .replace(/[\u064B-\u065F\u0670]/g, '') // إزالة التشكيل
    .replace(/[إأآا]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, '')
    .trim();

const findSurahNumber = (name) => {
  const target = normalizeArabic(name);
  if (!target) return null;
  let idx = surahNames.findIndex((s) => normalizeArabic(s) === target);
  if (idx === -1) idx = surahNames.findIndex((s) => normalizeArabic(s) === normalizeArabic('ال' + name));
  if (idx === -1) idx = surahNames.findIndex((s) => normalizeArabic(s).includes(target));
  return idx === -1 ? null : idx + 1;
};

// نجيب النص برسم عثماني (quran-uthmani) + الصوت في طلب واحد
const fetchAyah = async (surahNumber, ayahNumber) => {
  const response = await fetch(
    `https://api.alquran.cloud/v1/ayah/${surahNumber}:${ayahNumber}/editions/quran-uthmani,ar.alafasy`
  );
  if (!response.ok) throw new Error(`HTTP_${response.status}`);
  const json = await response.json();
  if (json.code !== 200 || !json.data) throw new Error('BAD_RESPONSE');

  const [uthmaniData, audioData] = json.data;
  return {
    textUthmani: uthmaniData.text,
    audio: audioData.audio,
    numberInSurah: uthmaniData.numberInSurah,
  };
};

const handler = async (m, { conn }) => {
  const args = m.text.trim().split(/\s+/).slice(1); // إزالة كلمة الأمر "ايه"

  if (args.length < 2) {
    m.reply('❌ الصيغة غير صحيحة.\nمثال:\n.ايه البقرة 255');
    return;
  }

  const ayahNumber = parseInt(args[args.length - 1]);
  const surahName = args.slice(0, -1).join(' ');

  if (isNaN(ayahNumber) || ayahNumber < 1) {
    m.reply('❌ رقم الآية غير صحيح.\nمثال:\n.ايه البقرة 255');
    return;
  }

  const surahNumber = findSurahNumber(surahName);
  if (!surahNumber) {
    m.reply(`❌ لم أتعرف على اسم السورة "${surahName}".\nمثال صحيح:\n.ايه البقرة 255`);
    return;
  }

  try {
    const ayah = await fetchAyah(surahNumber, ayahNumber);

    await m.reply(`📖 *${surahNames[surahNumber - 1]}* - الآية ${ayahNumber}:\n${ayah.textUthmani}`);

    await conn.sendMessage(
      m.chat,
      {
        audio: { url: ayah.audio },
        mimetype: 'audio/mpeg',
        filename: 'quran_audio.mp3',
        ptt: true,
      },
      { quoted: m }
    );
  } catch (err) {
    console.error(err);
    if (err.message === 'HTTP_404' || err.message === 'BAD_RESPONSE') {
      m.reply(`❌ رقم الآية ${ayahNumber} غير موجود في سورة ${surahNames[surahNumber - 1]}.`);
    } else {
      m.reply('❌ حصل خطأ أثناء جلب الآية، حاول تاني بعد شوية.');
    }
  }
};

handler.help = ['ايه <اسم السورة> <رقم الآية>'];
handler.tags = ['islam'];
handler.command = /^ايه$/i;

export default handler;