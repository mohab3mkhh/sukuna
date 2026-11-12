/**
 * plugins/بينتر.js
 * بحث وجلب صور من Pinterest
 */

import axios from 'axios';

// ✅ استخدام ملف الأزرار
import { sendButtons, btn, getButtonId } from '../lib/buttons.js';

let handler = async (m, { conn, usedPrefix, command, text }) => {
  if (!text) {
    return m.reply(`⚠️ أدخل مصطلح البحث.\n\nمثال: *${usedPrefix + command} nayeon*`);
  }

  await m.react('⌛');
  await conn.reply(m.chat, '> ⏳ جاري البحث عن الصور...', m);

  // ✅ محاولة استيراد pinterest
  let pinterest = null;
  try {
    const scraper = await import('../lib/scraper.js');
    pinterest = scraper.pinterest;
  } catch (e) {
    console.log('[بينتر] ملف scraper.js مش موجود');
  }

  const sources = [];

  // ✅ Pinterest (لو موجودة)
  if (pinterest?.search) {
    sources.push(async () => {
      const response = await pinterest.search(text, 6);
      return response.result.pins.slice(0, 6).map(pin => pin.media.images.orig.url);
    });
  }

  // ✅ APIs بديلة
  sources.push(
    async () => {
      const res = await axios.get(`https://api.siputzx.my.id/api/s/pinterest?query=${encodeURIComponent(text)}`);
      return res.data.data.slice(0, 6).map(result => result.images_url);
    },
    async () => {
      const res = await axios.get(`https://api.dorratz.com/v2/pinterest?q=${encodeURIComponent(text)}`);
      return res.data.slice(0, 6).map(result => result.image);
    },
    async () => {
      const res = await axios.get(`https://pinterest-api-one.vercel.app/?q=${encodeURIComponent(text)}`);
      return res.data.images?.slice(0, 6) || [];
    }
  );

  let images = [];
  for (const source of sources) {
    try {
      images = await source();
      if (images.length > 0) break;
    } catch (e) {
      console.error(`⚠️ خطأ أثناء البحث: ${e.message}`);
    }
  }

  if (images.length === 0) {
    await m.react('❌');
    return m.reply(`❌ لم يتم العثور على نتائج لـ *"${text}"*.`);
  }

  // ✅ بناء sections للقائمة
  const sections = [{
    title: `🔍 نتائج البحث عن: ${text}`,
    rows: images.map((img, i) => ({
      title: `📸 صورة ${i + 1}`,
      description: `نتيجة البحث رقم ${i + 1}`,
      id: `pin_pick_${i}_${encodeURIComponent(img)}`
    }))
  }];

  // ✅ إرسال باستخدام sendButtons
  await sendButtons(conn, m.chat, {
    title: '📌 Pinterest',
    subtitle: text,
    text: `🔍 *نتائج البحث عن:* ${text}\n📊 *عدد الصور:* ${images.length}\n\n> ⛩️ للنتائج الأفضل، ابحث باللغة الإنجليزية`,
    footer: '⛩️ SUKUNA BOT',
    image: images[0],
    buttons: [
      btn.list('📸 اختر صورة', sections),
      btn.url('🔗 فتح في Pinterest', `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(text)}`)
    ]
  }, m);

  await m.react('✅');
};

// ✅ معالج اختيار الصورة
handler.before = async function (m, { conn }) {
  const buttonId = getButtonId(m);
  if (!buttonId || !buttonId.startsWith('pin_pick_')) return false;

  const parts = buttonId.split('_');
  const index = parseInt(parts[2]);
  const imageUrl = decodeURIComponent(parts.slice(3).join('_'));

  await m.react('📸');

  // ✅ إرسال الصورة المختارة
  await conn.sendMessage(m.chat, {
    image: { url: imageUrl },
    caption: `📌 *الصورة رقم ${index + 1}*\n\n> ⛩️ SUKUNA BOT`
  }, { quoted: m });

  await m.react('✅');
  return true;
};

handler.help = ['بينتر <كلمة>'];
handler.tags = ['tools'];
handler.command = /^(pin|بينتر|pinterest)$/i;

export default handler;