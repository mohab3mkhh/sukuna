// ملف: joy.js

const decorateTitle = (title) => `『 ${title} 』`;
const FOOTER = `\n\n╭───────────────╮\n│ 😈 𝙱𝚢 : mohab ⚡\n╰───────────────╯ 💀🔥`;
const withCredit = (text) => `${text}${FOOTER}`;

const handler = async (m) => {
    const input = m.text.trim();
    
    let answer = "";

    if (input.includes("انا امتي هفرح")) {
        answer = "قريباً جداً.";
    } else if (input.includes("فين الفرحه")) {
        answer = "جواك.";
    } else if (input.includes("منين الاقي الفرحه")) {
        answer = "من الرضا.";
    } else if (input.includes("الفرحه مع دكتور سحس")) {
        answer = "أكيد، دكتور سحس هو الأساس.";
    } else if (input.includes("امتي يرجعلي الدوبامين")) {
        answer = "لما تبعد عن النكد.";
    }

    return m.reply(withCredit(`${decorateTitle("أنا والفرحة 🌸")}\n\n${answer}`));
};

handler.help = ['أنا_والفرحة'];
handler.tags = ['fun'];
handler.command = /^(انا امتي هفرح|فين الفرحه|منين الاقي الفرحه|الفرحه مع دكتور سحس|امتي يرجعلي الدوبامين)$/i;

export default handler;