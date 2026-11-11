import { prepareWAMessageMedia, generateWAMessageFromContent } from '@whiskeysockets/baileys';
import axios from 'axios';

let handler = async (m, { conn, text, usedPrefix, command }) => {
  if (!text) return conn.sendMessage(m.chat, { text: `⚠️ الرجاء إدخال كلمة للبحث\nمثال: ${usedPrefix + command} طبيعة` }, { quoted: m });

  await conn.sendMessage(m.chat, { react: { text: '⏳', key: m.key } });

  // جلب الفيديوهات من API (تأكد من أن الرابط صحيح ويعمل)
  let videos = [];
  try {
    const res = await axios.get(`https://the-end-api.vercel.app/home/sections/Search/api/Pin/vid?q=${encodeURIComponent(text)}`);
    if (res.data?.data) {
      videos = res.data.data.slice(0, 10);
    }
  } catch (e) {
    return conn.sendMessage(m.chat, { text: '❌ حدث خطأ في جلب الفيديوهات، حاول لاحقاً.' }, { quoted: m });
  }

  if (videos.length === 0) return conn.sendMessage(m.chat, { text: `❌ لم يتم العثور على نتائج لـ "${text}"` }, { quoted: m });

  // بناء رسالة قائمة نتائج بسيطة
  let listSections = [{
    title: `نتائج بحث عن: ${text}`,
    rows: videos.map((vid, i) => ({
      title: vid.title || `فيديو رقم ${i + 1}`,
      description: `مدة: ${vid.duration || 'غير معروفة'}`,
      rowId: `.تحميلبين ${vid.video_url}`  // أمر التحميل لما تختار
    }))
  }];

  // إرسال القائمة للمستخدم
  await conn.sendMessage(m.chat, {
    text: `اختر الفيديو الذي تريد تحميله:`,
    footer: 'بـــينتريست فيديوهات',
    buttonText: 'قائمة الفيديوهات',
    sections: listSections
  }, { quoted: m });
};

// أمر تحميل الفيديو عند اختيار المستخدم
handler.command = ['بينتريست', 'pinvid'];
handler.register = true;

handler.all = async (m, { conn, command, text }) => {
  if (command === 'تحميلبين' && text) {
    await conn.sendMessage(m.chat, { react: { text: '⏳', key: m.key } });

    try {
      // تحميل الفيديو وإرساله
      const videoUrl = text.trim();

      const media = await prepareWAMessageMedia({ video: { url: videoUrl } }, { upload: conn.waUploadToServer });

      const message = generateWAMessageFromContent(m.chat, { videoMessage: media.videoMessage }, { quoted: m });

      await conn.sendMessage(m.chat, { react: { text: '✔️', key: m.key } });
      await conn.relayMessage(m.chat, message.message, { messageId: message.key.id });

    } catch (e) {
      await conn.sendMessage(m.chat, { text: '❌ فشل تحميل الفيديو، تأكد من الرابط وحاول مرة أخرى.' }, { quoted: m });
    }
  }
};

export default handler;