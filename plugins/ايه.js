/**
 * plugins/ايه.js
 * ⛩️ SUKUNA BOT - .ايه <اسم السورة> [اسم الآية]
 * جلب الآية المحددة: تحميل الصوت مؤقتاً وإرساله كملف صوتي يعمل بكفاءة + النص رسالة نصية
 */

import fetch from 'node-fetch';
import axios from 'axios';
import fs from 'fs';
import os from 'os';
import path from 'path';

const TMP = os.tmpdir();
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36';

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

const toArabicDigits = n => String(n).replace(/\d/g, d => '٠١ي٢٣٤٥٦٧٨٩'[d]);

// توحيد الحروف
const normalizeArabic = (str = '') =>
  str
    .replace(/[\u064B-\u065F\u0670]/g, '')
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

// دالة تحميل الصوت على الجهاز مؤقتاً بنفس طريقة أمر سورة لضمان عمله
async function downloadAudioToFile(url, filePath) {
    const res = await axios.get(url, {
        headers: { 'User-Agent': UA },
        responseType: 'stream',
        timeout: 30000
    });
    return new Promise((resolve, reject) => {
        const writer = fs.createWriteStream(filePath);
        res.data.pipe(writer);
        writer.on('finish', resolve);
        writer.on('error', reject);
    });
}

const handler = async (m, { conn }) => {
  const args = m.text.trim().split(/\s+/).slice(1);

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

  const react = async e => { try { await conn.sendMessage(m.chat, { react: { text: e, key: m.key } }) } catch {} }
  await react('⏳');

  const file = path.join(TMP, `ayah_${Date.now()}.mp3`);

  try {
    const ayah = await fetchAyah(surahNumber, ayahNumber);
    const sName = surahNames[surahNumber - 1];

    // تحميل ملف الصوت محلياً أولاً
    await downloadAudioToFile(ayah.audio, file);

    const fileName = `سورة ${sName} - آية ${ayahNumber}.mp3`;

    // إرسال الصوت بنفس طريقة أمر سورة (بالملف المحلي المضمن)
    await conn.sendMessage(
      m.chat,
      {
        audio: { url: file },
        mimetype: 'audio/mpeg',
        fileName: fileName,
        ptt: false,
      },
      { quoted: m }
    );

    // إرسال النص كرسالة نصية عادية في الشات
    await conn.sendMessage(
      m.chat,
      {
        text: `📖 *سورة ${sName}* - الآية (${ayahNumber})\n\n${ayah.textUthmani} ﴿${toArabicDigits(ayahNumber)}﴾\n\n⛩️ SUKUNA BOT ⛩️`
      },
      { quoted: m }
    );

    await react('✅');

  } catch (err) {
    console.error(err);
    await react('❌');
    if (err.message === 'HTTP_404' || err.message === 'BAD_RESPONSE') {
      m.reply(`❌ رقم الآية ${ayahNumber} غير موجود في سورة ${surahNames[surahNumber - 1]}.`);
    } else {
      m.reply('❌ حصل خطأ أثناء جلب الآية، حاول تاني بعد شوية.');
    }
  } finally {
    // تنظيف الملف المؤقت بعد الإرسال بدقائق
    setTimeout(() => { try { fs.unlinkSync(file) } catch {} }, 5 * 60 * 1000);
  }
};

handler.help = ['ايه <اسم السورة> <رقم الآية>'];
handler.tags = ['islam'];
handler.command = /^ايه$/i;

export default handler;