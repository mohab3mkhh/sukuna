// • Feature : veo3
// • Developers : izana x radio
// • Channel : https://whatsapp.com/channel/0029Vb7EcdO5Ui2ZfjnAue2o
import fetch from "node-fetch";

let handler = async (m, { conn, text, usedPrefix, command }) => {
  // تحقق من وجود النص
  if (!text) {
    return m.reply(`🎬 *الاستخدام:* ${usedPrefix + command} <وصف الفيديو>\n📌 *مثال:*\n${usedPrefix + command} قطة تجري بسرعة`);
  }

  // رسالة انتظار
  await m.reply("⏳ *جاري إنشاء الفيديو باستخدام Veo3...*\nيرجى الانتظار قليلاً 🔄");

  try {
    // استدعاء API
    const api = `https://dark-api-x.vercel.app/api/v1/ai/veo3?prompt=${encodeURIComponent(text)}`;
    const res = await fetch(api);
    const data = await res.json();

    // تحقق من النتيجة
    if (!data.status || !data.videoUrl) {
      return m.reply(`❌ *فشل في إنشاء الفيديو.*\n📄 *السبب:* ${data.message || "غير معروف"}`);
    }

    // إرسال الفيديو للمستخدم
    await conn.sendMessage(m.chat, {
      video: { url: data.videoUrl },
      caption: `✅ *تم إنشاء الفيديو بنجاح!*\n🎞️ *الوصف:* ${data.prompt}\n⚙️ *المصدر:* ${data.source}`
    }, { quoted: m });

  } catch (err) {
    // عرض الخطأ الفعلي
    console.error(err);
    m.reply(`⚠️ *حدث خطأ أثناء إنشاء الفيديو:*\n${err.message}`);
  }
};

handler.help = ["veo3"];
handler.tags = ["ai"];
handler.command = ["veo3"];

export default handler;