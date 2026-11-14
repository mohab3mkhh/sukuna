// plugins/quiz-ultimate.js - نسخة مصححة الأزرار
// npm i axios

import axios from "axios";

const SIGN = " ⛩️ *SUKUNA ⚡️ BOT* ⛩️";
const SESSION_TTL_MS = 120_000;
const GIST_URL = "https://gist.githubusercontent.com/Kyutaka101/4e01c190b7d67225ad7a86d388eeedf6/raw/67f0de059cea4b965a3f3bf211c12fc9c48043e5/gistfile1.txt";

function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]] } return a }
function pick(arr,n=1){ const s = shuffle(arr.slice()); return n===1 ? s[0] : s.slice(0,n) }

const ABILITIES = {
  "سوكونا": ["تقنية اللاحدود (Limitless)", "المجال اللانهائي (Infinity)"],
  "سوكونا": ["لعنات متعددة", "تحكم بالأصابع الملعونة"],
  "ناروتو": ["راسينغان", "تحمل شاكرا الهوكاجي"],
  "لوفي": ["جيل-جيلا فاكهة الشيطان", "المطاط"],
  "ساسكي": ["شانينغان", "تشيدوري"],
  "غون": ["هجوم الرصاصة", "حياة صياد"],
  "ايتاتشي": ["أماتيراسو", "تسكرية الشارينغان"],
  "نوزوكو": ["تعافي سريع", "تحول شيطاني"],
};

const FALLBACK_LIST = [
  {"img":"https://telegra.ph/file/1ad5efd1f25887764b15f.jpg","name":"روبين"},
  {"img":"https://telegra.ph/file/9d201b2142932048d44d1.jpg","name":"نير"},
  {"img":"https://telegra.ph/file/be4c3fad4268971685d81.jpg","name":"اني"},
  {"img":"https://telegra.ph/file/a60e54286732defb6347d.jpg","name":"ميدوريا"},
  {"img":"https://telegra.ph/file/a8be24815455a6033c0ff.jpg","name":"ساكورا"},
  {"img":"https://telegra.ph/file/986ac215c159b886921d9.jpg","name":"سوكونا"},
  {"img":"https://telegra.ph/file/7879f8170935d592d3836.jpg","name":"سوكونا"},
  {"img":"https://telegra.ph/file/67fa6b4cff5b65068f2f9.jpg","name":"ايس"},
  {"img":"https://telegra.ph/file/ff37828726e424fc5753e.jpg","name":"ساسكي"},
  {"img":"https://telegra.ph/file/4fdcd9b65bf25f918775f.jpg","name":"غارا"},
  {"img":"https://telegra.ph/file/309901e0b8e96c594281b.jpg","name":"نيزوكو"},
  {"img":"https://telegra.ph/file/831a834a4446d3f5fe683.jpg","name":"ناروتو"},
  {"img":"https://telegra.ph/file/a56c29f4cfc4fa251bbb0.jpg","name":"لوفي"},
  {"img":"https://telegra.ph/file/41190693f191ab092d361.jpg","name":"كايدو"},
  {"img":"https://telegra.ph/file/4a033549870058c71c35d.jpg","name":"لولوش"}
];

const attached = new WeakSet();
const sessions = new Map();

// ✅ معالج الأزرار والقوائم (نفس أسلوب celebration)
export function attachConverter(conn){
  if(!conn || attached.has(conn) || !conn.ev) return;
  attached.add(conn);
  
  conn.ev.on("messages.upsert", async up => {
    try {
      const msgs = up.messages || [];
      for(const m of msgs){
        if(!m || !m.message || m.key?.fromMe) continue;
        
        // ✅ استخراج الزر بطرق متعددة
        let selectedText = null;
        let selectedId = null;

        // الطريقة 1: buttonsResponseMessage
        if (m.message?.buttonsResponseMessage) {
          selectedText = m.message.buttonsResponseMessage.selectedDisplayText;
          selectedId = m.message.buttonsResponseMessage.selectedButtonId;
        }

        // الطريقة 2: listResponseMessage
        if (!selectedText && m.message?.listResponseMessage) {
          selectedText = m.message.listResponseMessage?.singleSelectReply?.selectedDisplayText;
          selectedId = m.message.listResponseMessage?.singleSelectReply?.selectedRowId;
        }

        // الطريقة 3: templateButtonReplyMessage
        if (!selectedText && m.message?.templateButtonReplyMessage) {
          selectedText = m.message.templateButtonReplyMessage.selectedDisplayText;
          selectedId = m.message.templateButtonReplyMessage.selectedId;
        }

        // الطريقة 4: interactiveMessage
        if (!selectedText && m.message?.interactiveMessage) {
          const im = m.message.interactiveMessage;
          if (im.buttonsResponseMessage) {
            selectedText = im.buttonsResponseMessage.selectedDisplayText;
            selectedId = im.buttonsResponseMessage.selectedButtonId;
          } else if (im.listResponseMessage) {
            selectedText = im.listResponseMessage?.singleSelectReply?.selectedDisplayText;
            selectedId = im.listResponseMessage?.singleSelectReply?.selectedRowId;
          }
        }

        const final = (selectedId || selectedText || '').toString().trim();
        if (!final) continue;

        // ✅ تحقق من أنه يبدأ بـ "quiz_answer::"
        if (!final.startsWith("quiz_answer::")) continue;

        const payload = final.slice("quiz_answer::".length).trim();
        const jid = m.key.remoteJid;
        if (!jid) continue;

        const session = sessions.get(jid);
        if (!session || session.answered) continue;

        session.answered = true;
        clearTimeout(session.timeout);

        const chosen = String(payload);
        const correct = session.answer;

        if(chosen === correct){
          // ✅ منح XP
          try {
            const senderJid = m.key.participant || m.key.remoteJid;
            if (senderJid) {
              if (!global.db) global.db = { data: { users: {} } };
              if (!global.db.data) global.db.data = { users: {} };
              if (!global.db.data.users) global.db.data.users = {};
              if (!global.db.data.users[senderJid]) global.db.data.users[senderJid] = {};

              const user = global.db.data.users[senderJid];
              user.exp = (user.exp || 0) + 5000;

              if (typeof global.saveDatabase === 'function') await global.saveDatabase();
            }
          } catch (e) {
            console.warn('quiz xp error:', e?.message);
          }

          let feedback = `✅ إجابة صحيحة!\nالشخصية: *${correct}*\n\n🎉 حصلت على *5000 XP*!`;
          
          try {
            const senderJid = m.key.participant || m.key.remoteJid;
            if (senderJid && global.db?.data?.users?.[senderJid]) {
              const newTotal = global.db.data.users[senderJid].exp || 0;
              feedback += `\nمجموع XP: *${newTotal}*`;
            }
          } catch (_) {}

          feedback += `\n\n${SIGN}`;
          await conn.sendMessage(jid, { text: feedback }, { quoted: m }).catch(()=>{});
        } else {
          await conn.sendMessage(jid, { 
            text: `❌ إجابة خاطئة.\nإجابتك: *${chosen}*\nالإجابة الصحيحة: *${correct}*\n\n${SIGN}` 
          }, { quoted: m }).catch(()=>{});
        }
        sessions.delete(jid);
      }
    } catch(e) {
      console.error("converter error:", e?.message);
    }
  });

  console.log("✅ quiz converter attached");
}

function buildQuickButtons(options){
  return options.slice(0, 4).map(opt => ({
    buttonId: `quiz_answer::${opt}`,
    buttonText: { displayText: opt },
    type: 1
  }));
}

async function loadChoices(){
  try{
    const r = await axios.get(GIST_URL, { timeout: 8000 });
    const data = Array.isArray(r.data) ? r.data : JSON.parse(r.data);
    if(Array.isArray(data) && data.length >= 6) return data;
  }catch(e){}
  return FALLBACK_LIST.slice();
}

async function handler(m, { conn }){
  try{
    if(!conn) return;
    attachConverter(conn);

    const choicesList = await loadChoices();
    if(!choicesList || choicesList.length < 4){
      return conn.sendMessage(m.chat, { text: "❌ فشل تحميل قائمة الشخصيات." }, { quoted: m }).catch(()=>{});
    }

    const types = ["image"];
    const qtype = pick(types);

    if(qtype === "image"){
      // ✅ اختيار صحيح
      const correct = pick(choicesList);
      const correctName = correct.name;
      const imageUrl = correct.img;

      // ✅ اختيار 3 أسماء غلط مختلفة
      const poolNames = choicesList.map(x=>x.name).filter(n=>n !== correctName);
      const uniqueWrongs = [...new Set(poolNames)];
      const wrongs = shuffle(uniqueWrongs).slice(0, 3);
      const options = shuffle([correctName, ...wrongs]);

      // ✅ تأكد من وجود الإجابة الصحيحة
      if (!options.includes(correctName)) {
        options[0] = correctName;
      }

      const caption = `⛩️ *SUKUNA QUIZ* ⛩️\n\n🎯 من هذه الشخصية؟\n⏳ لديك 120 ثانية\n\n${SIGN}`;

      // ✅ بناء الأزرار
      try {
        const buttons = buildQuickButtons(options);
        await conn.sendMessage(m.chat, {
          image: { url: imageUrl },
          caption,
          buttons,
          headerType: 4
        }, { quoted: m });
      } catch (e) {
        const txt = [caption, "", ...options.map((o, i) => `${i + 1}. ${o}`)].join("\n");
        await conn.sendMessage(m.chat, { text: txt }, { quoted: m });
      }

      // ✅ حفظ الجلسة
      const timeout = setTimeout(async () => {
        const s = sessions.get(m.chat);
        if(!s) return;
        if(!s.answered){
          try { 
            await conn.sendMessage(m.chat, { 
              text: `⌛ انتهى الوقت! الإجابة الصحيحة: *${correctName}*\n\n${SIGN}` 
            }, { quoted: m }); 
          } catch(_) {}
        }
        sessions.delete(m.chat);
      }, SESSION_TTL_MS);

      sessions.set(m.chat, { 
        answer: correctName, 
        timeout, 
        answered: false, 
        type: qtype, 
        createdAt: Date.now() 
      });
      return;
    }

    // === ability quiz ===
    const namesWithAbilities = Object.keys(ABILITIES);
    if(namesWithAbilities.length === 0) return;

    const correctName = pick(namesWithAbilities);
    const correctAbilities = ABILITIES[correctName] || ["قدرة"];
    const correctAbility = pick(correctAbilities);
    
    const otherAbilities = [];
    for(const [k, arr] of Object.entries(ABILITIES)){
      if(k === correctName) continue;
      otherAbilities.push(...arr);
    }
    
    const uniqueAbilities = [...new Set(otherAbilities)];
    while(uniqueAbilities.length < 3) uniqueAbilities.push(`قدرة سرية ${uniqueAbilities.length}`);
    const wrongs = shuffle(uniqueAbilities).slice(0, 3);
    const options = shuffle([correctAbility, ...wrongs]);

    if (!options.includes(correctAbility)) {
      options[0] = correctAbility;
    }

    const caption = `⛩️ *ABILITY QUIZ*  ⛩️\n\n💪 قدرة *${correctName}*\n⏳ لديك 120 ثانية\n\n${SIGN}`;

    try {
      const buttons = buildQuickButtons(options);
      await conn.sendMessage(m.chat, {
        text: caption,
        buttons
      }, { quoted: m });
    } catch (e) {
      const txt = [caption, "", ...options.map((o, i) => `${i + 1}. ${o}`)].join("\n");
      await conn.sendMessage(m.chat, { text: txt }, { quoted: m });
    }

    const timeout = setTimeout(async () => {
      const s = sessions.get(m.chat);
      if(!s) return;
      if(!s.answered){
        try { 
          await conn.sendMessage(m.chat, { 
            text: `⌛ انتهى الوقت! الإجابة الصحيحة: *${correctAbility}*\n\n${SIGN}` 
          }, { quoted: m }); 
        } catch(_) {}
      }
      sessions.delete(m.chat);
    }, SESSION_TTL_MS);

    sessions.set(m.chat, { 
      answer: correctAbility, 
      timeout, 
      answered: false, 
      type: qtype, 
      createdAt: Date.now() 
    });

  }catch(err){
    console.error("quiz error:", err?.message);
  }
}

handler.command = /^عين$/i;
handler.help = ["عين"];
handler.tags = ["quiz","fun"];

export default handler;