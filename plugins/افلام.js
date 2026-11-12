import { exec as _exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const exec = promisify(_exec).bind(null);

const handler = async (m, { conn, text }) => {
  if (!text) {
    return m.reply('❌ يرجى إدخال رابط الفيديو أو الفيلم من يوتيوب.\nمثال: .يوتيوب https://youtube.com/...');
  }

  // التأكد من أن النص يحتوي على رابط
  const urlRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+$/;
  if (!urlRegex.test(text.trim())) {
    return m.reply('❌ الرابط غير صحيح! تأكد أنه رابط يوتيوب فعال.');
  }

  await m.reply('⏳ جاري جاري تحميل ومعالجة الفيديو... قد يستغرق الأمر بعض الوقت بناءً على حجم الفيلم.');

  const outputDir = './downloads/';
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const fileName = `yt_${Date.now()}.mp4`;
  const outputPath = path.join(outputDir, fileName);

  try {
    // أمر التحميل باستخدام yt-dlp مع تحديد الجودة والصيغة mp4
    // تم تحديد جودة متوسطة لعدم استهلاك سيرفر البوت (18 ترمز لـ 360p أو mp4 مدمج الصوت)
    // يمكنك تعديل الجودة حسب رغبتك
    await exec(`yt-dlp -f "best[ext=mp4]/best" "${text.trim()}" -o "${outputPath}"`);

    if (!fs.existsSync(outputPath)) {
      throw new Error('لم يتم العثور على الملف المحمل.');
    }

    // إرسال الفيديو للمستخدم
    await conn.sendMessage(m.chat, {
      video: fs.readFileSync(outputPath),
      mimetype: 'video/mp4',
      caption: '🎬 تم تحميل الفيلم/المقطع بنجاح!'
    }, { quoted: m });

    // حذف الملف بعد الإرسال لتوفير المساحة
    fs.unlinkSync(outputPath);

  } catch (e) {
    // تنظيف في حالة حدوث خطأ
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    return m.reply(`❌ حدث خطأ أثناء التحميل: ${e.message}`);
  }
};

handler.help = ['افلام *<الرابط>*'];
handler.tags = ['downloader'];
handler.command = /^(افلام|تحميل-افلام|yt)$/i;

export default handler;