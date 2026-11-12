import fetch from "node-fetch";
import pkg from '@whiskeysockets/baileys';
const { prepareWAMessageMedia } = pkg;

// ✅ استخدام ملف الأزرار
import { sendButtons, btn } from '../lib/buttons.js';

const handler = async (m, { conn, text }) => {
    if (!text) return m.reply(`╔══════════════════════════════════════╗
      ≪  ❪ ⛩️ 𝑺𝑼𝑲𝑼𝑵𝑨 𝑩𝑶𝑻 ⛩️ ❫  ≫
╚══════════════════════════════════════╝

  ⚠️ ⌈ 𝑬𝒓𝒓𝒐𝒓 ⌋ ⇢ *يُرجى كتابة اسم أو رقم السورة!*
  ⛩️ ⌈ 𝑬𝒙𝒂𝒎𝒑𝒍𝒆 ⌋ ⇢ *تفسير 1*

  ✦ O Human… This Is Your World ✦

◜⏤͟͟͞͞ 𝑺𝑼𝑲𝑼𝑵𝑨 ⚡ 𝑩𝑶𝑻 ˖࣪⃟⛩️ ◞`);

    let channelLink = "https://whatsapp.com/channel/0029Vb8ZbJSFSAsyDyL8Wr0F";
    let imageUrl = 'https://files.catbox.moe/e6qogi.jpg';

    try {
        let surahNumber = isNaN(text) ? await getSurahNumber(text) : text;
        if (!surahNumber) return m.reply(`╔══════════════════════════════════════╗
      ≪  ❪ ⛩️ 𝑺𝑼𝑲𝑼𝑵𝑨 𝑩𝑶𝑻 ⛩️ ❫  ≫
╚══════════════════════════════════════╝

  ╟「 ❌ 」↬ *لم يتم العثور على السورة، تأكد من الاسم!*`);

        let apiUrl = `https://api.alquran.cloud/v1/surah/${surahNumber}/ar.muyassar`;
        let response = await fetch(apiUrl);
        let data = await response.json();

        if (!data || !data.data || !data.data.ayahs) {
            return m.reply(`╔══════════════════════════════════════╗
      ≪  ❪ ⛩️ 𝑺𝑼𝑲𝑼𝑵𝑨 𝑩𝑶𝑻 ⛩️ ❫  ≫
╚══════════════════════════════════════╝

  ╟「 ❌ 」↬ *عذرًا، لا يوجد تفسير متاح لهذه السورة!*`);
        }

        // ✅ زخرفة النص بتاع التفسير
        let tafsirText = data.data.ayahs.map(ayah => `⛩️ *[${ayah.numberInSurah}]* ${ayah.text}`).join("\n\n");

        // ✅ تقسيم النص لو طويل
        let message = `╔══════════════════════════════════════╗
      ≪  ❪ ⛩️ 𝑺𝑼𝑲𝑼𝑵𝑨 𝑩𝑶𝑻 ⛩️ ❫  ≫
╚══════════════════════════════════════╝

  📖 ⌈ 𝑻𝒂𝒇𝒔𝒊𝒓 ⌋ ⇢ *تفسير سورة ${data.data.englishName}*
  ⛩️ ⌈ 𝑺𝒖𝒓𝒂𝒉 𝑵𝒖𝒎𝒃𝒆𝒓 ⌋ ⇢ *${data.data.number}*

⌬──══─┈•⤣⛩️⤤•┈─══──⌬

${tafsirText.substring(0, 1800)}

⌬──══─┈•⤣⛩️⤤•┈─══──⌬

  ✦ O Human… This Is Your World ✦

◜⏤͟͟͞͞ 𝑺𝑼𝑲𝑼𝑵𝑨 ⚡ 𝑩𝑶𝑻 ˖࣪⃟⛩️ ◞`;

        // ✅ إرسال باستخدام sendButtons
        await sendButtons(conn, m.chat, {
            title: '📖 تفسير القرآن',
            subtitle: data.data.englishName,
            text: message,
            footer: '⛩️ 𝑺𝑼𝑲𝑼𝑵𝑨 ✦ 𝑩𝑶𝑻 ⛩️',
            image: imageUrl,
            buttons: [
                btn.url('⛩️ قناة سوكونا ⛩️', channelLink)
            ]
        }, m);

        await m.react('⛩️');

    } catch (error) {
        console.error(error);
        m.reply(`╔══════════════════════════════════════╗
      ≪  ❪ ⛩️ 𝑺𝑼𝑲𝑼𝑵𝑨 𝑩𝑶𝑻 ⛩️ ❫  ≫
╚══════════════════════════════════════╝

  ╟「 ❌ 」↬ *حدث خطأ أثناء جلب التفسير، حاول مجددًا لاحقًا!*`);
    }
};

const getSurahNumber = async (surahName) => {
    try {
        let response = await fetch("https://api.alquran.cloud/v1/surah");
        let data = await response.json();
        let surah = data.data.find(s => s.englishName.toLowerCase() === surahName.toLowerCase() || s.name.includes(surahName));
        return surah ? surah.number : null;
    } catch (error) {
        console.error(error);
        return null;
    }
};

handler.command = /^تفسير$/i;
handler.tags = ['islamic'];
handler.help = ['تفسير <اسم أو رقم السورة>'];

export default handler;