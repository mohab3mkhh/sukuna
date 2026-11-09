import fetch from "node-fetch"; // أو استخدام الـ fetch المدمج في Node الحديث

const API_URL = "https://nekobot.xyz/api/image";
const REQUEST_TIMEOUT_MS = 15000;

/**
 * دالة جلب رابط الصورة من API
 */
async function fetchAnimeImage(type) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
        const response = await fetch(`${API_URL}?type=${encodeURIComponent(type)}`, {
            headers: { accept: "application/json" },
            signal: controller.signal
        });

        if (!response.ok) {
            throw new Error(`NekoBot HTTP ${response.status}`);
        }

        const payload = await response.json();
        const imageUrl = typeof payload?.message === "string" ? payload.message : payload?.url;

        if (!payload?.success || !/^https?:\/\//i.test(imageUrl || "")) {
            throw new Error("No valid image URL returned");
        }

        return imageUrl;
    } finally {
        clearTimeout(timer);
    }
}

let handler = async (m, { conn }) => {
    try {
        // 1. التفاعل على رسالة المستخدم فوراً بإيموجي
        await conn.sendMessage(m.chat, { 
            react: { text: '🔞', key: m.key } 
        }).catch(() => {});

        // 2. جلب رابط الصورة مباشرة
        const imageUrl = await fetchAnimeImage("hentai");

        // 3. إرسال الصورة بتصميم كليشة واستايل sukuna BOT المنسق
        const caption = 
`╭━━━〔 🔞 *HENTAI* 〕━━━╮\n` +
`┃\n` +
`┃ 🌸 Anime NSFW · (18+)\n` +
`┃ 🚀 بوت : 么⃝Sukuna 𝑩𝑶𝑻 🪄\n` +
`┃\n` +
`╰━━━━━━━━━━━━━━━━━━╯`;

        await conn.sendMessage(
            m.chat,
            {
                image: { url: imageUrl },
                caption
            },
            { quoted: m }
        );

        await conn.sendMessage(m.chat, { 
            react: { text: '✅', key: m.key } 
        }).catch(() => {});

        return true;

    } catch (error) {
        console.error("[GEO HENTAI ERROR]", error);

        try { 
            await conn.sendMessage(m.chat, { 
                react: { text: '❌', key: m.key } 
            }); 
        } catch {}

        return conn.reply(
            m.chat,
            `╭━━━〔 ❌ *HENTAI* 〕━━━╮\n` +
            `┃\n` +
            `┃ ⚠️ حدث خطأ أثناء جلب الصورة.\n` +
            `┃ ${error?.message || "SERVICE_UNAVAILABLE"}\n` +
            `┃\n` +
            `╰━━━━━━━━━━━━━━━━━━╯`, m
        );
    }
};

handler.help = ['hentai', 'nsfwhentai'];
handler.tags = ['18plus'];
handler.command = /^(hentai|هنتاي|nsfwhentai)$/i;

export default handler;