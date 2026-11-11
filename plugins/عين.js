// plugins/quiz-ultimate.js - أزرار native flow (شغالة مع whiskeysockets)
// npm i axios

import axios from "axios";
import * as _baileys from "@whiskeysockets/baileys";

const B = _baileys.generateWAMessageFromContent ? _baileys : (_baileys.default || _baileys);
const { generateWAMessageFromContent, proto, prepareWAMessageMedia } = B;

const SIGN = " ⛩️ *SUKUNA ⚡️ BOT* ⛩️";
const SESSION_TTL_MS = 120_000;
const REWARD_XP = 5000;
const PREFIX = "quiz_answer::";
const GIST_URL = "https://gist.githubusercontent.com/Kyutaka101/4e01c190b7d67225ad7a86d388eeedf6/raw/67f0de059cea4b965a3f3bf211c12fc9c48043e5/gistfile1.txt";

function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]] } return a }
function pick(arr,n=1){ const s = shuffle(arr.slice()); return n===1 ? s[0] : s.slice(0,n) }

const ABILITIES = {
  "غوجو": ["تقنية اللاحدود (Limitless)", "المجال اللانهائي (Infinity)"],
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

// ━━━ إرسال أزرار native flow (quick_reply) ━━━
async function sendButtons(conn, jid, { imageUrl, body, footer, options }) {
  let header;
  if (imageUrl) {
    const media = await prepareWAMessageMedia({ image: { url: imageUrl } }, { upload: conn.waUploadToServer });
    header = proto.Message.InteractiveMessage.Header.create({
      hasMediaAttachment: true,
      imageMessage: media.imageMessage,
    });
  } else {
    header = proto.Message.InteractiveMessage.Header.create({ hasMediaAttachment: false });
  }

  const interactiveMessage = proto.Message.InteractiveMessage.fromObject({
    body: { text: body },
    footer: { text: footer },
    header,
    nativeFlowMessage: {
      buttons: options.slice(0, 4).map(opt => ({
        name: "quick_reply",
        buttonParamsJson: JSON.stringify({ display_text: opt, id: PREFIX + opt }),
      })),
    },
  });

  const msg = generateWAMessageFromContent(jid, {
    viewOnceMessage: {
      message: {
        messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
        interactiveMessage,
      },
    },
  }, { userJid: conn.user?.id || conn.user?.jid });

  // نفس طريقة المنيو: في الجروبات من غير additionalNodes، وفي الخاص بنضيفها
  const relayOpts = { messageId: msg.key.id };
  if (!jid.endsWith("@g.us")) {
    relayOpts.additionalNodes = [
      { tag: "biz", attrs: {}, content: [{ tag: "interactive", attrs: { type: "native_flow", v: "1" }, content: [{ tag: "native_flow", attrs: { v: "9", name: "mixed" } }] }] },
      { tag: "bot", attrs: { biz_bot: "1" } },
    ];
  }

  console.log("[عين] إرسال أزرار native flow ->", jid);
  await conn.relayMessage(jid, msg.message, relayOpts);
}

// لو الأزرار فشلت: قائمة نصية
async function sendFallback(conn, jid, caption, options) {
  const txt = [caption, "", ...options.map((o, i) => `${i + 1}. ${o}`)].join("\n");
  await conn.sendMessage(jid, { text: txt });
}

// ━━━ استقبال ضغطات الأزرار ━━━
function extractChoice(message) {
  let msg = message || {};
  msg = msg.ephemeralMessage?.message || msg;
  msg = msg.viewOnceMessage?.message || msg;
  msg = msg.viewOnceMessageV2?.message || msg;
  msg = msg.documentWithCaptionMessage?.message || msg;

  // native flow (الجديد)
  const ir = msg.interactiveResponseMessage;
  if (ir?.nativeFlowResponseMessage?.paramsJson) {
    try {
      const p = JSON.parse(ir.nativeFlowResponseMessage.paramsJson);
      if (p?.id) return String(p.id);
    } catch {}
  }
  // القديم
  if (msg.buttonsResponseMessage) return msg.buttonsResponseMessage.selectedButtonId || msg.buttonsResponseMessage.selectedDisplayText;
  if (msg.listResponseMessage) return msg.listResponseMessage.singleSelectReply?.selectedRowId;
  if (msg.templateButtonReplyMessage) return msg.templateButtonReplyMessage.selectedId;
  return null;
}

export function attachConverter(conn){
  if(!conn || attached.has(conn) || !conn.ev) return;
  attached.add(conn);

  conn.ev.on("messages.upsert", async up => {
    try {
      for(const m of (up.messages || [])){
        if(!m || !m.message || m.key?.fromMe) continue;

        const final = (extractChoice(m.message) || "").toString().trim();
        if (!final.startsWith(PREFIX)) continue;

        const chosen = final.slice(PREFIX.length).trim();
        const jid = m.key.remoteJid;
        if (!jid) continue;

        const session = sessions.get(jid);
        if (!session || session.answered) continue;

        session.answered = true;
        clearTimeout(session.timeout);
        sessions.delete(jid);

        const correct = session.answer;
        const senderJid = m.key.participant || m.key.remoteJid;

        if(chosen === correct){
          let total = null;
          try {
            if (!global.db) global.db = { data: { users: {} } };
            if (!global.db.data) global.db.data = { users: {} };
            if (!global.db.data.users) global.db.data.users = {};
            if (!global.db.data.users[senderJid]) global.db.data.users[senderJid] = {};
            const user = global.db.data.users[senderJid];
            user.exp = (user.exp || 0) + REWARD_XP;
            total = user.exp;
            if (typeof global.saveDatabase === 'function') await global.saveDatabase();
          } catch (e) {
            console.warn('quiz xp error:', e?.message);
          }

          let feedback = `✅ إجابة صحيحة يا @${senderJid.split('@')[0]}!\nالإجابة: *${correct}*\n\n🎉 حصلت على *${REWARD_XP} XP*!`;
          if (total !== null) feedback += `\nمجموع XP: *${total}*`;
          feedback += `\n\n${SIGN}`;
          await conn.sendMessage(jid, { text: feedback, mentions: [senderJid] }).catch(()=>{});
        } else {
          await conn.sendMessage(jid, {
            text: `❌ إجابة خاطئة يا @${senderJid.split('@')[0]}.\nإجابتك: *${chosen}*\nالإجابة الصحيحة: *${correct}*\n\n${SIGN}`,
            mentions: [senderJid],
          }).catch(()=>{});
        }
      }
    } catch(e) {
      console.error("quiz converter error:", e?.message);
    }
  });

  console.log("✅ quiz converter attached");
}

async function loadChoices(){
  try{
    const r = await axios.get(GIST_URL, { timeout: 8000 });
    const data = Array.isArray(r.data) ? r.data : JSON.parse(r.data);
    if(Array.isArray(data) && data.length >= 6) return data;
  }catch(e){}
  return FALLBACK_LIST.slice();
}

function startSession(conn, jid, answer, type) {
  const timeout = setTimeout(async () => {
    const s = sessions.get(jid);
    if (!s) return;
    if (!s.answered) {
      await conn.sendMessage(jid, { text: `⌛ انتهى الوقت! الإجابة الصحيحة: *${answer}*\n\n${SIGN}` }).catch(()=>{});
    }
    sessions.delete(jid);
  }, SESSION_TTL_MS);

  const old = sessions.get(jid);
  if (old) clearTimeout(old.timeout);
  sessions.set(jid, { answer, timeout, answered: false, type, createdAt: Date.now() });
}

async function handler(m, { conn }){
  try{
    if(!conn) return;
    attachConverter(conn);

    // ━━━ كويز الصور ━━━
    const choicesList = await loadChoices();
    if(!choicesList || choicesList.length < 4){
      return conn.sendMessage(m.chat, { text: "❌ فشل تحميل قائمة الشخصيات." });
    }

    const qtype = "image";

    if(qtype === "image"){
      const correct = pick(choicesList);
      const correctName = correct.name;

      const poolNames = choicesList.map(x=>x.name).filter(n=>n !== correctName);
      const wrongs = shuffle([...new Set(poolNames)]).slice(0, 3);
      const options = shuffle([correctName, ...wrongs]);

      const caption = `⛩️ *SUKUNA QUIZ* ⛩️\n\n🎯 من هذه الشخصية؟\n⏳ لديك 120 ثانية`;

      try {
        await sendButtons(conn, m.chat, { imageUrl: correct.img, body: caption, footer: SIGN, options });
      } catch (e) {
        console.error("quiz buttons error:", e?.message);
        try {
          await conn.sendMessage(m.chat, { image: { url: correct.img }, caption: caption + "\n\n" + options.map((o, i) => `${i + 1}. ${o}`).join("\n") });
        } catch {
          await sendFallback(conn, m.chat, caption, options);
        }
      }

      startSession(conn, m.chat, correctName, qtype);
      return;
    }

    // ━━━ كويز القدرات (غير مفعّل حالياً) ━━━
    const correctName = pick(Object.keys(ABILITIES));
    const correctAbility = pick(ABILITIES[correctName]);
    const others = [...new Set(Object.entries(ABILITIES).filter(([k]) => k !== correctName).flatMap(([, v]) => v))];
    const options = shuffle([correctAbility, ...shuffle(others).slice(0, 3)]);
    const caption = `⛩️ *ABILITY QUIZ* ⛩️\n\n💪 قدرة *${correctName}*\n⏳ لديك 120 ثانية`;

    try {
      await sendButtons(conn, m.chat, { body: caption, footer: SIGN, options });
    } catch (e) {
      await sendFallback(conn, m.chat, caption, options);
    }
    startSession(conn, m.chat, correctAbility, "ability");

  }catch(err){
    console.error("quiz error:", err?.message);
  }
}

handler.command = /^عين$/i;
handler.help = ["عين"];
handler.tags = ["quiz","fun"];

export default handler;