import * as pkg from '@whiskeysockets/baileys';
const { generateWAMessageFromContent } = pkg;

let handler = async (m, { conn }) => {}

handler.participantsUpdate = async ({ id, participants, action }) => {
    let conn = global.conn;
    if (!conn) return;

    for (let user of participants) {
        let metadata = await conn.groupMetadata(id).catch(() => ({}));
        let groupName = metadata.subject || "المجموعة";
        let userTag = `@${user.split("@")[0]}`;

        // ✅ تحميل الصورة كـ Buffer
        let imageBuffer;
        try {
            const response = await fetch('https://files.catbox.moe/u95jdx.jpg');
            if (response.ok) {
                imageBuffer = Buffer.from(await response.arrayBuffer());
            } else {
                // صورة بديلة لو فشل التحميل
                const fallbackRes = await fetch('https://telegra.ph/file/1c36b4b2f7e4a91915b18.jpg');
                imageBuffer = Buffer.from(await fallbackRes.arrayBuffer());
            }
        } catch {
            // صورة بديلة لو فشل الكل
            const fallbackRes = await fetch('https://telegra.ph/file/1c36b4b2f7e4a91915b18.jpg');
            imageBuffer = Buffer.from(await fallbackRes.arrayBuffer());
        }

        const sendMsg = async (text) => {
            const message = generateWAMessageFromContent(id, {
                extendedTextMessage: {
                    text,
                    contextInfo: {
                        mentionedJid: [user],
                        externalAdReply: {
                            title: '👑 SUKUNA BOT',
                            body: '⚔️ KING OF CURSES',
                            thumbnail: imageBuffer,
                            mediaType: 1,
                            renderLargerThumbnail: true
                        }
                    }
                }
            }, { quoted: null });

            await conn.relayMessage(id, message.message, { messageId: message.key.id });
        };

        if (action === "add") {
            let memberCount = metadata.participants?.length || 0;
            let welcomeMessage = 
`╔═══━━━══━━━❪🔥❫━━━══━━━═══╗
║  ❪👑❫ *𝑾𝑬𝑳𝑪𝑶𝑴𝑬*            ║
║  ❪⚔️❫ *𝑻𝑶 𝑻𝑯𝑬 𝑮𝑹𝑶𝑼𝑷*        ║
╚═══━━━══━━━❪🔥❫━━━══━━━═══╝

╔═══━━━══━━━❪🩸❫━━━══━━━═══╗
║  ❪👹❫ *مَرْحَبَاً بِكَ يَا*  ║
║  ❪🔥❫ ${userTag}              ║
║  ──━━━══━━━──                  ║
║  ❪⛩️❫ فِي مَجمُوعَة           ║
║  ❪👑❫ *${groupName}*           ║
║  ──━━━══━━━──                  ║
║  ❪🔱❫ أَنتَ العُضوُ رَقم:     ║
║  ❪⚡️❫ *${memberCount}*         ║
╚═══━━━══━━━❪🩸❫━━━══━━━═══╝

╔═══━━━══━━━❪💀❫━━━══━━━═══╗
║  ❪☠️❫ نَتَمَنَّى لَكَ        ║
║  ❪🔥❫ إِقَامَةً طَيِّبَة     ║
║  ──━━━══━━━──                  ║
║  ❪📜❫ اِقرَأ قَوَانِين        ║
║  ❪👹❫ وَاحتَرِم الجَمِيع     ║
║  ──━━━══━━━──                  ║
║  ❪😈❫ اِستَمتِع بِوَقتِك     ║
║  ❪🩸❫ بَينَنَا               ║
╚═══━━━══━━━❪💀❫━━━══━━━═══╝

╔═══━━━══━━━❪👑❫━━━══━━━═══╗
║  ❝ فَلْتَكُنْ رِحْلَتُكَ    ║
║  فِي هَذَا المَكَانِ        ║
║  مَلِيئَةً بِالمَغَامَرَاتِ ║
║  وَالأَلْقَابِ وَالمَجْدِ ❞ ║
╚═══━━━══━━━❪👑❫━━━══━━━═══╝

╔═══━━━══━━━❪⚡️❫━━━══━━━═══╗
║  ❪🔥❫ *𝑺𝑼𝑲𝑼𝑵𝑨 𝑩𝑶𝑻*        ║
║  ❪👹❫ *𝑲𝑰𝑵𝑮 𝑶𝑭 𝑪𝑼𝑹𝑺𝑬𝑺*     ║
╚═══━━━══━━━❪⚡️❫━━━══━━━═══╝`;
            await sendMsg(welcomeMessage);
        }

        if (action === "remove") {
            let byeMessage = 
`╔═══━━━══━━━❪🔥❫━━━══━━━═══╗
║  ❪👑❫ *𝑮𝑶𝑶𝑫𝑩𝒀𝑬*             ║
║  ❪⚔️❫ *𝑴𝒀 𝑭𝑹𝑰𝑬𝑵𝑫*           ║
╚═══━━━══━━━❪🔥❫━━━══━━━═══╝

╔═══━━━══━━━❪💀❫━━━══━━━═══╗
║  ❪😢❫ أَوه لَا!              ║
║  ❪☠️❫ ${userTag}              ║
║  ──━━━══━━━──                  ║
║  ❪🩸❫ غَادَرَ المَجمُوعَة    ║
║  ❪👹❫ *${groupName}*           ║
║  ──━━━══━━━──                  ║
║  ❪⚡️❫ كَانَتْ رِحْلَةً        ║
║  ❪🔥❫ لَا تُنْسَى             ║
╚═══━━━══━━━❪💀❫━━━══━━━═══╝

╔═══━━━══━━━❪😈❫━━━══━━━═══╗
║  ❪👹❫ اِتعَرَف مَاذَا       ║
║  ❪🔥❫ يَعنِي هَذَا!          ║
║  ──━━━══━━━──                  ║
║  ❪☠️❫ إِنَّكَ جَنَيتَ        ║
║  ❪⚡️❫ عَلَى نَفسِك!          ║
║  ──━━━══━━━──                  ║
║  ❪👹❫ رِيوكِي تِينكَاي        ║
║  ❪🩸❫ فُوكُومَا!             ║
╚═══━━━══━━━❪😈❫━━━══━━━═══╝

╔═══━━━══━━━❪👑❫━━━══━━━═══╗
║  ❝ رُبَّمَا نَلْتَقِي       ║
║  فِي مَعْرَكَةٍ أُخْرَى    ║
║  فِي زَمَانٍ آخَرَ         ║
║  وَعَالَمٍ آخَرَ ❞         ║
╚═══━━━══━━━❪👑❫━━━══━━━═══╝

╔═══━━━══━━━❪⚡️❫━━━══━━━═══╗
║  ❪🔥❫ *𝑺𝑼𝑲𝑼𝑵𝑨 𝑩𝑶𝑻*        ║
║  ❪👹❫ *𝑲𝑰𝑵𝑮 𝑶𝑭 𝑪𝑼𝑹𝑺𝑬𝑺*     ║
╚═══━━━══━━━❪⚡️❫━━━══━━━═══╝`;
            await sendMsg(byeMessage);
        }
    }
}

export default handler;