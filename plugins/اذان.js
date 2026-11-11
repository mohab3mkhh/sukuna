/**
 * plugins/الصلاة.js
 * مواقيت الصلاة
 */

import axios from 'axios';
import { sendButtons, btn, getButtonId } from '../lib/buttons.js';

function format12HourTime(time24) {
  const [hours, minutes] = time24.split(':');
  let period = 'AM';
  let hours12 = parseInt(hours, 10);

  if (hours12 >= 12) {
    period = 'PM';
    if (hours12 > 12) hours12 -= 12;
  }

  return `${hours12}:${minutes} ${period}`;
}

const images = [
  'https://ar.prayerinislam.com/wp-content/uploads/المشروع-في-المسجد.jpg',
  'https://islamonline.net/wp-content/uploads/2023/02/الإمام-والمؤذن-صلاة-الجماعة.jpg',
  'https://daleelalmasjed.com/upload/3021162680-258.png',
  'https://www.al-jazirah.com/2022/20220307/ln_69_1.jpg',
  'https://www.cairo24.com/UploadCache/libfiles/66/3/600x338o/426.jpg'
];

const FOOTER = '☠️┆⛩️SUKUNA⚡️BOT⛩️┆☠️';

const handler = async (m, { conn, text, usedPrefix, command }) => {
  const randomImage = images[Math.floor(Math.random() * images.length)];

  // ✅ بناء صفوف القائمة
  const rows = [
    { title: 'القاهرة', description: 'مواقيت الصلاة في القاهرة', id: `${usedPrefix}${command} القاهرة` },
    { title: 'الرياض', description: 'مواقيت الصلاة في الرياض', id: `${usedPrefix}${command} الرياض` },
    { title: 'الدار البيضاء', description: 'مواقيت الصلاة في الدار البيضاء', id: `${usedPrefix}${command} الدار البيضاء` },
    { title: 'دبي', description: 'مواقيت الصلاة في دبي', id: `${usedPrefix}${command} دبي` },
    { title: 'بيروت', description: 'مواقيت الصلاة في بيروت', id: `${usedPrefix}${command} بيروت` },
    { title: 'تونس', description: 'مواقيت الصلاة في تونس', id: `${usedPrefix}${command} تونس` },
    { title: 'الجزائر', description: 'مواقيت الصلاة في الجزائر', id: `${usedPrefix}${command} الجزائر` },
    { title: 'بغداد', description: 'مواقيت الصلاة في بغداد', id: `${usedPrefix}${command} بغداد` },
    { title: 'عمان', description: 'مواقيت الصلاة في عمان', id: `${usedPrefix}${command} عمان` },
    { title: 'الخرطوم', description: 'مواقيت الصلاة في الخرطوم', id: `${usedPrefix}${command} الخرطوم` },
    { title: 'دمشق', description: 'مواقيت الصلاة في دمشق', id: `${usedPrefix}${command} دمشق` },
    { title: 'طرابلس', description: 'مواقيت الصلاة في طرابلس', id: `${usedPrefix}${command} طرابلس` },
    { title: 'مسقط', description: 'مواقيت الصلاة في مسقط', id: `${usedPrefix}${command} مسقط` },
    { title: 'الدوحة', description: 'مواقيت الصلاة في الدوحة', id: `${usedPrefix}${command} الدوحة` },
    { title: 'المنامة', description: 'مواقيت الصلاة في المنامة', id: `${usedPrefix}${command} المنامة` },
    { title: 'الكويت', description: 'مواقيت الصلاة في الكويت', id: `${usedPrefix}${command} الكويت` },
    { title: 'جدة', description: 'مواقيت الصلاة في جدة', id: `${usedPrefix}${command} جدة` },
    { title: 'مكة', description: 'مواقيت الصلاة في مكة', id: `${usedPrefix}${command} مكة` },
    { title: 'المدينة', description: 'مواقيت الصلاة في المدينة', id: `${usedPrefix}${command} المدينة` },
    { title: 'الشارقة', description: 'مواقيت الصلاة في الشارقة', id: `${usedPrefix}${command} الشارقة` },
    { title: 'المغرب', description: 'مواقيت الصلاة في المغرب', id: `${usedPrefix}${command} المغرب` }
  ];

  const sections = [{
    title: '「 الدول 🧞 」',
    highlight_label: 'ام الدنيا 🧞',
    rows
  }];

  // ✅ لو فيه نص، نجيب المواقيت
  if (text) {
    try {
      const prayerResponse = await axios.get(
        `http://api.aladhan.com/v1/timingsByCity?city=${encodeURIComponent(text)}&country=EG`
      );
      const prayerData = prayerResponse.data.data.timings;

      const fajr = format12HourTime(prayerData.Fajr);
      const sunrise = format12HourTime(prayerData.Sunrise);
      const dhuhr = format12HourTime(prayerData.Dhuhr);
      const asr = format12HourTime(prayerData.Asr);
      const maghrib = format12HourTime(prayerData.Maghrib);
      const isha = format12HourTime(prayerData.Isha);

      const prayerMessage = `هــذه هـيــا مـواقــت الــصـلاه فــى ${text} الــيــوم:\n` +
        `- ┇↜الـفـجــࢪ: ${fajr}\n` +
        `- ┇↜الــشـࢪوق: ${sunrise}\n` +
        `- ┇↜الــظـهـࢪ: ${dhuhr}\n` +
        `- ┇↜الــعــصـࢪ: ${asr}\n` +
        `- ┇↜الــمــغــࢪب: ${maghrib}\n` +
        `- ┇↜الــعشــاء: ${isha}`;

      // ✅ استخدام sendButtons
      await sendButtons(conn, m.chat, {
        title: '🕌 مواقيت الصلاة',
        subtitle: text,
        text: prayerMessage,
        footer: FOOTER,
        image: randomImage,
        buttons: [btn.list('قــائــمــة الــدول', sections)]
      }, m);

    } catch (error) {
      console.error('[الصلاة]', error.message);
      m.reply('عذرًا، لم أتمكن من العثور على مواقيت الصلاة لهذه المدينة.');
    }
  } else {
    // ✅ عرض القائمة فقط
    await sendButtons(conn, m.chat, {
      title: '🕌 مواقيت الصلاة',
      subtitle: 'اختر المدينة',
      text: `مــرحــبـا يــا ${m.pushName}\nاخــتــاࢪ مـن قــائــمــة الــدول 🧞`,
      footer: FOOTER,
      image: randomImage,
      buttons: [btn.list('قــائــمــة الــدول', sections)]
    }, m);
  }
};

handler.command = ['الصلاة', 'اذان', 'الصلاه'];
handler.tags = ['tools'];

export default handler;