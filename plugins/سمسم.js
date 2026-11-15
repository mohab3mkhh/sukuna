"use strict";

const axios = require("axios");

/* ═══════════════════════════════════════
   𝑮𝒆𝒐 SIMSIMI
═══════════════════════════════════════ */

function panel(title, body) {
    return `🌊 *${title}*\n\n${body}`;
}

/* ═══════════════════════════════════════
   REACTION
═══════════════════════════════════════ */

async function react(geo, m, emoji) {
    try {
        if (typeof m.react === "function") {
            await m.react(emoji);
            return;
        }

        await geo.sendMessage(m.chat, {
            react: {
                text: emoji,
                key: m.key
            }
        });
    } catch {}
}

/* ═══════════════════════════════════════
   SEND
═══════════════════════════════════════ */

async function send(geo, m, text) {
    return geo.sendMessage(
        m.chat,
        { text },
        { quoted: m.msg || m }
    );
}

/* ═══════════════════════════════════════
   SIMSIMI API
═══════════════════════════════════════ */

async function getSimSimiResponse(query) {
    try {
        const response = await axios.get("https://engez.a7a.online/api/v1/ai/ai/simsimi", {
            params: {
                action: "تكلم",
                message: query
            },
            timeout: 15000
        });

        const data = response.data;

        if (data && data.success && data.response?.reply) {
            return String(data.response.reply);
        }

        return "مش لاقي رد مناسب للكلام ده 🤔";

    } catch (error) {
        console.error(
            "[𝑮𝒆𝒐 SIMSIMI ERROR]",
            error.response?.data || error.message
        );

        throw new Error("API Connection Failed");
    }
}

/* ═══════════════════════════════════════
   COMMAND
═══════════════════════════════════════ */

module.exports = {
    name: "سمسم.ب",

    aliases: ["سمسم", "سيمسيم", "simsimi"],

    category: "ai",

    description: "𝑮𝒆𝒐 𝑺𝒊𝒎𝒔𝒊𝒎𝒊 - الدردشة مع سمسمي.",

    async run({ geo, m, args, text }) {
        try {
            const query = (
                text ||
                (Array.isArray(args) ? args.join(" ") : "") ||
                ""
            ).trim();

            // رسالة المساعدة عند طلب الأمر بدون نص
            if (!query) {
                await react(geo, m, "🐤");

                return await send(
                    geo,
                    m,
                    panel(
                        "𝑮𝒆𝒐 𝑺𝒊𝒎𝒔𝒊𝒎𝒊",
                        `🐤 أهلاً بيك في سمسمي!

📍 اكتب رسالتك بعد الأمر.

⟢ مثال:
.سمسم عامل إيه؟`
                    )
                );
            }

            // رياكشن الانتظار
            await react(geo, m, "🕰");

            // جلب الرد من الـ API
            const reply = await getSimSimiResponse(query);

            // رياكشن النجاح
            await react(geo, m, "☑️");

            // إرسال الرد بتنسيق 𝑮𝒆𝒐 الرسمي
            await send(
                geo,
                m,
                panel(
                    "𝑮𝒆𝒐 𝑺𝒊𝒎𝒔𝒊𝒎𝒊",
                    `🐤 *سمسم:* ${reply}`
                )
            );

        } catch (error) {
            console.error(
                "[𝑮𝒆𝒐 SIMSIMI COMMAND ERROR]",
                error.stack || error.message || error
            );

            await react(geo, m, "🚫");

            return await send(
                geo,
                m,
                panel(
                    "𝑮𝒆𝒐 𝑺𝒊𝒎𝒔𝒊𝒎𝒊",
                    `🔶️ جيو في وقت الصيانة الآن، حاول مرة أخرى بعد قليل.`
                )
            );
        }
    }
};