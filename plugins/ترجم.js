/**
 * plugins/ترجم.js
 * ترجمة النصوص لأي لغة
 */

import fetch from 'node-fetch';

// ✅ استخدام ملف الأزرار
import { sendButtons, btn, getButtonId } from '../lib/buttons.js';

const LANGUAGES = {
  "ar": "العربية", "en": "الإنجليزية", "fr": "الفرنسية", "es": "الإسبانية",
  "de": "الألمانية", "it": "الإيطالية", "ru": "الروسية", "zh": "الصينية",
  "ja": "اليابانية", "ko": "الكورية", "tr": "التركية", "fa": "الفارسية",
  "ur": "الأردية", "hi": "الهندية", "pt": "البرتغالية", "nl": "الهولندية",
  "sv": "السويدية", "pl": "البولندية", "uk": "الأوكرانية", "ro": "الرومانية",
  "el": "اليونانية", "cs": "التشيكية", "hu": "المجرية", "fi": "الفنلندية",
  "da": "الدنماركية", "no": "النرويجية", "he": "العبرية", "th": "التايلاندية",
  "vi": "الفيتنامية", "id": "الإندونيسية", "ms": "الماليزية", "bn": "البنغالية",
  "ta": "التاميلية", "te": "التيلوجو", "ml": "المالايالامية", "sw": "السواحيلية"
};

const IMAGE_URL = 'https://files.catbox.moe/hm0l6b.jpg';

// ══════════════════════════════════════════════════
//  الأمر الرئيسي
// ══════════════════════════════════════════════════
const handler = async (m, { conn, text, usedPrefix, command }) => {
  if (!text) {
    return m.reply(`❌ *يرجى إدخال النص الذي تريد ترجمته.*\n\n📌 *مثال:*\n> ${usedPrefix + command} مرحبا`);
  }

  // ✅ بناء أزرار اللغات
  const rows = Object.entries(LANGUAGES).map(([code, name]) => ({
    title: `🌍 ${name}`,
    description: `ترجمة إلى ${name}`,
    id: `trans_${code}_${encodeURIComponent(text)}`
  }));

  const sections = [{
    title: '🌍 اختر لغة الترجمة',
    rows
  }];

  // ✅ إرسال باستخدام sendButtons
  await sendButtons(conn, m.chat, {
    title: '🌐 الترجمة',
    subtitle: text.slice(0, 50),
    text: `📖 *النص:* ${text}\n\n🌍 *اختر اللغة التي تريد الترجمة إليها:*`,
    footer: '⛩️ SUKUNA BOT',
    image: IMAGE_URL,
    buttons: [btn.list('❲ قائمة اللغات ❳', sections)]
  }, m);

  await m.react('✔️');
};

// ══════════════════════════════════════════════════
//  معالج اختيار اللغة
// ══════════════════════════════════════════════════
handler.before = async function (m, { conn }) {
  const buttonId = getButtonId(m);
  if (!buttonId || !buttonId.startsWith('trans_')) return false;

  // استخراج الكود والنص
  const parts = buttonId.split('_');
  const langCode = parts[1];
  const text = decodeURIComponent(parts.slice(2).join('_'));

  const langName = LANGUAGES[langCode] || langCode;

  await m.react('⏳');

  try {
    // ✅ استخدام Google Translate API
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${langCode}&dt=t&q=${encodeURIComponent(text)}`;
    const res = await fetch(url);
    const data = await res.json();

    const translated = data[0].map(item => item[0]).join('');
    const detectedLang = data[2] || 'auto';

    // ✅ إرسال النتيجة
    await sendButtons(conn, m.chat, {
      title: '✅ الترجمة',
      subtitle: `${langName}`,
      text: `📖 *النص الأصلي:*\n${text}\n\n🌐 *الترجمة (${langName}):*\n${translated}\n\n🔍 *اللغة المكتشفة:* ${detectedLang}`,
      footer: '⛩️ SUKUNA BOT',
      buttons: [
        btn.reply('🔄 ترجمة تانية', `.ترجم ${text}`),
        btn.copy('📋 نسخ الترجمة', translated)
      ]
    }, m);

    await m.react('✅');
  } catch (e) {
    console.error('[ترجم]', e.message);
    await m.react('❌');
    await m.reply(`❌ فشل الترجمة: ${e.message}`);
  }

  return true;
};

handler.command = /^(ترجم|translate)$/i;
handler.tags = ['tools'];
handler.help = ['ترجم <نص>'];

export default handler;