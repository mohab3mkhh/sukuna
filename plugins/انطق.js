let handler = async (m, { conn, text, usedPrefix }) => {
  const send = (t) => conn.sendMessage(m.chat, { text: t });

  if (!text) {
    return send(`أدخل نصًا بعد الأمر.\nمثال: *${usedPrefix}انطق مرحبًا بك في البوت*`);
  }

  if (text.length > 200) {
    return send('النص طويل جداً، اكتب أقل من 200 حرف.');
  }

  try {
    const audioUrl =
      `https://translate.google.com/translate_tts?ie=UTF-8&tl=ar&client=tw-ob&q=${encodeURIComponent(text)}`;

    await conn.sendMessage(m.chat, {
      audio: { url: audioUrl },
      mimetype: 'audio/mpeg',
      ptt: true,
    });
  } catch (e) {
    console.error("حدث خطأ:", e);
    await send("حدث خطأ أثناء معالجة طلبك. يرجى المحاولة لاحقًا.");
  }
};

handler.help = ["انطق"];
handler.tags = ["tools"];
handler.command = /^انطق$/i;

export default handler;