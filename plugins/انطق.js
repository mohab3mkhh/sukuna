import fetch from "node-fetch";

let handler = async (m, { conn, text, usedPrefix }) => {
  const send = (t) => conn.sendMessage(m.chat, { text: t });

  if (!text) {
    return send(`أدخل نصًا بعد الأمر.\nمثال: *${usedPrefix}انطق مرحبًا بك في البوت*`);
  }

  try {
    const audioUrl = await generateAudio(text);
    if (audioUrl) {
      await send(`تم توليد الصوت، يمكنك الاستماع إليه: ${audioUrl}`);
    } else {
      await send("لم يتم العثور على الصوت. حاول مرة أخرى.");
    }
  } catch (e) {
    console.error("حدث خطأ:", e);
    await send("حدث خطأ أثناء معالجة طلبك. يرجى المحاولة لاحقًا.");
  }
};

handler.help = ["انطق"];
handler.tags = ["tools"];
handler.command = /^انطق$/i;

export default handler;

async function generateAudio(text) {
  const url = `https://bk9.fun/tools/tts-voices?q=${encodeURIComponent(text)}&voice=`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error("فشل الاتصال بالخدمة.");
    }

    const data = await response.json();

    if (data?.audioUrl) {
      return data.audioUrl;  // سيتم إرجاع رابط الصوت من الـ API
    } else {
      throw new Error("لم يتم العثور على رابط الصوت في الرد.");
    }
  } catch (error) {
    console.error("خطأ في التواصل مع API:", error);
    throw new Error("فشل في الحصول على الصوت من الـ API.");
  }
}