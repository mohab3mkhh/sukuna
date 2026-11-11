import fetch from 'node-fetch';
import { generateWAMessageFromContent } from '@whiskeysockets/baileys';

const handler = async (m, { conn, text, usedPrefix, command }) => {
    if (!text) throw `❌ *يرجى إدخال النص الذي تريد ترجمته.*\n\n📌 *مثال:* \n> ${usedPrefix + command} مرحبا`;

    const languages = {
        "af": "Afrikaans", "sq": "Albanian", "am": "Amharic", "ar": "Arabic", "hy": "Armenian", "az": "Azerbaijani", 
        "eu": "Basque", "be": "Belarusian", "bn": "Bengali", "bs": "Bosnian", "bg": "Bulgarian", "ca": "Catalan",
        "ceb": "Cebuano", "ny": "Chichewa", "zh": "Chinese", "co": "Corsican", "hr": "Croatian", "cs": "Czech",
        "da": "Danish", "nl": "Dutch", "en": "English", "eo": "Esperanto", "et": "Estonian", "tl": "Filipino",
        "fi": "Finnish", "fr": "French", "fy": "Frisian", "gl": "Galician", "ka": "Georgian", "de": "German",
        "el": "Greek", "gu": "Gujarati", "ht": "Haitian Creole", "ha": "Hausa", "haw": "Hawaiian", "iw": "Hebrew",
        "hi": "Hindi", "hmn": "Hmong", "hu": "Hungarian", "is": "Icelandic", "ig": "Igbo", "id": "Indonesian",
        "ga": "Irish", "it": "Italian", "ja": "Japanese", "jw": "Javanese", "kn": "Kannada", "kk": "Kazakh",
        "km": "Khmer", "rw": "Kinyarwanda", "ko": "Korean", "ku": "Kurdish", "ky": "Kyrgyz", "lo": "Lao",
        "la": "Latin", "lv": "Latvian", "lt": "Lithuanian", "lb": "Luxembourgish", "mk": "Macedonian", "mg": "Malagasy",
        "ms": "Malay", "ml": "Malayalam", "mt": "Maltese", "mi": "Maori", "mr": "Marathi", "mn": "Mongolian",
        "my": "Myanmar (Burmese)", "ne": "Nepali", "no": "Norwegian", "or": "Odia", "ps": "Pashto", "fa": "Persian",
        "pl": "Polish", "pt": "Portuguese", "pa": "Punjabi", "ro": "Romanian", "ru": "Russian", "sm": "Samoan",
        "gd": "Scots Gaelic", "sr": "Serbian", "st": "Sesotho", "sn": "Shona", "sd": "Sindhi", "si": "Sinhala",
        "sk": "Slovak", "sl": "Slovenian", "so": "Somali", "es": "Spanish", "su": "Sundanese", "sw": "Swahili",
        "sv": "Swedish", "tg": "Tajik", "ta": "Tamil", "tt": "Tatar", "te": "Telugu", "th": "Thai", "tr": "Turkish",
        "tk": "Turkmen", "uk": "Ukrainian", "ur": "Urdu", "ug": "Uyghur", "uz": "Uzbek", "vi": "Vietnamese",
        "cy": "Welsh", "xh": "Xhosa", "yi": "Yiddish", "yo": "Yoruba", "zu": "Zulu"
    };

    const imagurl = 'https://files.catbox.moe/hm0l6b.jpg';
    let chname = '𝑅𝐴𝐷𝐼𝑂 𝐷𝐸𝑀𝑂𝑁';
    let chid = '120363376982425324@newsletter';

    let caption = `📖 *النص:* ${text}\n🌍 *اختر اللغة التي تريد الترجمة إليها:*`;

    const interactiveMessage = {
        body: { text: caption },
        footer: { text: '🔄 الترجمة باستخدام Popcat API' },
        header: {
            title: `*❲ الترجمة ❳*`,
            hasMediaAttachment: false,
        },
        contextInfo: {
            mentionedJid: await conn.parseMention(caption),
            isForwarded: true,
            forwardingScore: 1,
            forwardedNewsletterMessageInfo: {
                newsletterJid: chid,
                newsletterName: chname,
                serverMessageId: 100
            },
            externalAdReply: {
                showAdAttribution: true,
                title: "𝐀𝐁𝐘𝐒𝐒_𝐁𝐎𝐓",
                body: "❲ التــرجمة ❳",
                thumbnailUrl: imagurl,
                mediaUrl: imagurl,
                mediaType: 1,
                sourceUrl: 'https://whatsapp.com/channel/0029VaumDtWJZg4B8jLyMK2q',
                renderLargerThumbnail: false
            }
        },
        nativeFlowMessage: {
            buttons: [
                {
                    name: 'single_select',
                    buttonParamsJson: JSON.stringify({
                        title: '❲ قائمة اللغات ❳',
                        sections: [
                            {
                                title: "🌍 اختر لغة الترجمة",
                                rows: Object.keys(languages).map(lang => ({
                                    header: languages[lang],
                                    title: `🔄 ترجمة إلى ${languages[lang]}`,
                                    description: '',
                                    id: `.تنفيذ_الترجمة ${lang} ${text}`
                                }))
                            }
                        ]
                    })
                }
            ],
            messageParamsJson: ''
        }
    };

    let msg = generateWAMessageFromContent(m.chat, {
        viewOnceMessage: {
            message: {
                interactiveMessage,
            },
        },
    }, { userJid: conn.user.jid, quoted: m });

    await conn.sendMessage(m.chat, { react: { text: '✔️', key: m.key } });
    conn.relayMessage(m.chat, msg.message, { messageId: msg.key.id });
};

handler.command = /^(ترجم|translate)$/i;
export default handler;