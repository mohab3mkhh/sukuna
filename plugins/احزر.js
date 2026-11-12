// plugins/احزر.js - كويز الشخصيات (صورة + 4 أزرار: 3 خطأ + 1 صح)
// npm i axios

import axios from "axios";
import * as _baileys from "@whiskeysockets/baileys";

const B = _baileys.generateWAMessageFromContent ? _baileys : (_baileys.default || _baileys);
const { generateWAMessageFromContent, prepareWAMessageMedia, proto } = B;

const SIGN = "⛩️ *SUKUNA ⚡️ BOT* ⛩️";
const SESSION_TTL_MS = 120_000;
const REWARD_XP = 5000;
const PREFIX = "guess_answer::"; // مختلف عن أمر عين عشان ما يتداخلوش
const GIST_URL = "https://gist.githubusercontent.com/Kyutaka101/98d564d49cbf9b539fee19f744de7b26/raw/f2a3e68bbcdd2b06f9dbd5f30d70b9fda42fec14/guessflag";

function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]] } return a }
function pick(arr,n=1){ const s = shuffle(arr.slice()); return n===1 ? s[0] : s.slice(0,n) }

const FALLBACK_LIST = [
  {"img":"https://telegra.ph/file/1ad5efd1f25887764b15f.jpg","name":"روبين"},
  {"img":"https://telegra.ph/file/9d201b2142932048d44d1.jpg","name":"نير"},
  {"img":"https://telegra.ph/file/be4c3fad4268971685d81.jpg","name":"اني"},
  {"img":"https://telegra.ph/file/a60e54286732defb6347d.jpg","name":"ميدوريا"},
  {"img":"https://telegra.ph/file/a8be24815455a6033c0ff.jpg","name":"ساكورا"},
  {"img":"https://telegra.ph/file/986ac215c159b886921d9.jpg","name":"سوكونا"},
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

const GROWTH = Math.pow(Math.PI / Math.E, 1.618) * Math.E * 0.75;
function findLevelLocal(xp, multiplier = 1) {
  if (xp === Infinity) return Infinity;
  if (isNaN(xp) || xp <= 0) return -1;
  let level = 0;
  const xpRange = (l) => {
    l = Math.floor(l);
    const min = l === 0 ? 0 : Math.round(Math.pow(l, GROWTH) * multiplier) + 1;
    const max = Math.round(Math.pow(l + 1, GROWTH) * multiplier);
    return { min, max };
  };
  do { level++; } while (xpRange(level).min <= xp);
  return --level;
}

// ━━━ إرسال الصورة + أزرار native flow (proto مباشر) ━━━
async function sendButtons(conn, jid, { imageUrl, body, footer, options }) {
  const media = await prepareWAMessageMedia({ image: { url: imageUrl } }, { upload: conn.waUploadToServer });

  const interactiveMessage = proto.Message.InteractiveMessage.fromObject({
    body: { text: body },
    footer: { text: footer },
    header: { hasMediaAttachment: true, imageMessage: media.imageMessage },
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

  const relayOpts = { messageId: msg.key.id };
  if (!jid.endsWith("@g.us")) {
    relayOpts.additionalNodes = [
      { tag: "biz", attrs: {}, content: [{ tag: "interactive", attrs: { type: "native_flow", v: "1" }, content: [{ tag: "native_flow", attrs: { v: "9", name: "mixed" } }] }] },
      { tag: "bot", attrs: { biz_bot: "1" } },
    ];
  }
  await conn.relayMessage(jid, msg.message, relayOpts);
}

// ━━━ استخراج اختيار المستخدم من أي نوع رد ━━━
function unwrap(message) {
  let msg = message || {};
  msg = msg.ephemeralMessage?.message || msg;
  msg = msg.viewOnceMessage?.message || msg;
  msg = msg.viewOnceMessageV2?.message || msg;
  msg = msg.documentWithCaptionMessage?.message || msg;
  return msg;
}

function extractChoice(message) {
  const msg = unwrap(message);

  // native flow (الجديد)
  const flow = msg.interactiveResponseMessage?.nativeFlowResponseMessage;
  if (flow?.paramsJson) {
    try {
      const p = JSON.parse(flow.paramsJson);
      const id = p?.id || p?.selectedId || p?.selected_id;
      if (id) return String(id);
    } catch {}
  }
  // القديم
  if (msg.buttonsResponseMessage) return msg.buttonsResponseMessage.selectedButtonId || msg.buttonsResponseMessage.selectedDisplayText;
  if (msg.listResponseMessage) return msg.listResponseMessage.singleSelectReply?.selectedRowId;
  if (msg.templateButtonReplyMessage) return msg.templateButtonReplyMessage.selectedId;
  return null;
}

function getPlainText(message) {
  const msg = unwrap(message);
  return msg.conversation || msg.extendedTextMessage?.text || null;
}

async function reply(conn, jid, text, mentions = []) {
  await conn.sendMessage(jid, { text, mentions }).catch(() => {});
}

async function handleAnswer(conn, jid, senderJid, chosen) {
  const session = sessions.get(jid);
  if (!session || session.answered) return;

  session.answered = true;
  clearTimeout(session.timeout);
  sessions.delete(jid);

  const correct = session.answer;
  const tag = senderJid ? `@${senderJid.split("@")[0]}` : "";
  const mentions = senderJid ? [senderJid] : [];

  if (chosen === correct) {
    let extra = "";
    try {
      if (senderJid) {
        if (!global.db) global.db = { data: { users: {} } };
        if (!global.db.data) global.db.data = { users: {} };
        if (!global.db.data.users) global.db.data.users = {};
        if (!global.db.data.users[senderJid]) global.db.data.users[senderJid] = {};
        const user = global.db.data.users[senderJid];
        user.exp = (user.exp || 0) + REWARD_XP;
        const level = (typeof global.findLevel === "function") ? global.findLevel(user.exp) : findLevelLocal(user.exp);
        if (typeof global.saveDatabase === "function") await global.saveDatabase();
        extra = `\n\n✨ *+${REWARD_XP} XP*\n💾 الإجمالي: ${user.exp}\n🏅 المستوى: ${level}`;
      }
    } catch (e) {
      console.warn("[احزر] xp error:", e?.message);
    }
    await reply(conn, jid, `✅ *إجابة صحيحة يا ${tag}!*\n\n⛩️ الشخصية: *${correct}*${extra}\n\n${SIGN}`, mentions);
  } else {
    await reply(conn, jid, `❌ *إجابة خاطئة يا ${tag}!*\n\n💭 إجابتك: ${chosen}\n✅ الصحيحة: ${correct}\n\n${SIGN}`, mentions);
  }
}

export function attachConverter(conn){
  if(!conn || attached.has(conn) || !conn.ev) return;
  attached.add(conn);

  conn.ev.on("messages.upsert", async up => {
    try {
      for(const m of (up.messages || [])){
        if(!m || !m.message || m.key?.fromMe) continue;
        const jid = m.key.remoteJid;
        const session = sessions.get(jid);
        if (!session || session.answered) continue;

        const senderJid = m.key.participant || jid;

        // 1) ضغطة زرار
        const picked = (extractChoice(m.message) || "").toString().trim();
        if (picked.startsWith(PREFIX)) {
          await handleAnswer(conn, jid, senderJid, picked.slice(PREFIX.length).trim());
          continue;
        }

        // 2) لو الأزرار ما ظهرتش: إجابة كتابة (رقم 1-4 أو الاسم بالظبط)
        const typed = (getPlainText(m.message) || "").trim();
        if (typed && session.options) {
          if (/^[1-4]$/.test(typed) && session.options[Number(typed) - 1]) {
            await handleAnswer(conn, jid, senderJid, session.options[Number(typed) - 1]);
          } else if (session.options.includes(typed)) {
            await handleAnswer(conn, jid, senderJid, typed);
          }
          continue;
        }

        // تشخيص: رد من نوع مش متوقع أثناء وجود سؤال
        if (!typed) console.log("[احزر] نوع رد غير معروف:", Object.keys(unwrap(m.message)));
      }
    } catch(e) {
      console.error("[احزر] listener error:", e?.message);
    }
  });

  console.log("✅ guess converter loaded");
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
    if(!choicesList?.length){
      return conn.sendMessage(m.chat, { text: "❌ خطأ في تحميل البيانات" });
    }

    const correctItem = pick(choicesList);
    const correctName = correctItem.name;
    const imageUrl = correctItem.img;

    const wrongNames = [...new Set(choicesList.filter(i => i.name !== correctName).map(i => i.name))];
    const options = shuffle([correctName, ...shuffle(wrongNames).slice(0, 3)]);

    const caption = `⛩️ *SUKUNA  QUIZ* ⛩️\n\n🎯 *من هذه الشخصية؟*\n\n⏳ المتبقي: 120 ثانية`;

    // حفظ الجلسة قبل الإرسال (عشان أي ضغطة سريعة تتحسب)
    const old = sessions.get(m.chat);
    if (old) clearTimeout(old.timeout);

    const timeout = setTimeout(async () => {
      const s = sessions.get(m.chat);
      if(!s) return;
      if(!s.answered){
        await conn.sendMessage(m.chat, { text: `⌛ *انتهى الوقت!*\n\n✅ الإجابة الصحيحة: *${correctName}*\n\n${SIGN}` }).catch(()=>{});
      }
      sessions.delete(m.chat);
    }, SESSION_TTL_MS);

    sessions.set(m.chat, { answer: correctName, options, timeout, answered: false, createdAt: Date.now() });
    conn.quizSession = conn.quizSession || {};
    conn.quizSession[m.chat] = { answer: correctName };

    try {
      await sendButtons(conn, m.chat, { imageUrl, body: caption, footer: SIGN, options });
    } catch (e) {
      console.error("[احزر] الأزرار فشلت:", e?.message);
      // fallback: صورة + خيارات مرقمة (الإجابة برقم أو بالاسم)
      const txt = [caption, "", ...options.map((o, i) => `${i + 1}. ${o}`), "", "✍️ اكتب رقم الإجابة أو الاسم"].join("\n");
      try {
        await conn.sendMessage(m.chat, { image: { url: imageUrl }, caption: txt });
      } catch {
        await conn.sendMessage(m.chat, { text: txt });
      }
    }
  }catch(err){
    console.error("[احزر] error:", err?.message);
  }
}

handler.command = /^احزر$/i;
handler.help = ["احزر"];
handler.tags = ["quiz","fun"];

export default handler;