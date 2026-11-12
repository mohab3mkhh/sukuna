/**
 * plugins/اختار.js
 * التصويت في استطلاعات الرأي (Poll) - نسخة شغالة
 */

import * as pkg from '@whiskeysockets/baileys';
const { generateMessageIDV2, proto, aesEncryptGCM } = pkg;
import crypto from 'crypto';

if (!global.pollStore) global.pollStore = new Map();

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest();
const hmacSign = (key, data) => crypto.createHmac('sha256', key).update(data).digest();
const toBinary = (txt) => Buffer.from(txt);

function encryptPollVote({ selectedOptions }, { pollCreatorJid, pollMsgId, pollEncKey, voterJid }) {
  const sign = Buffer.concat([
    toBinary(pollMsgId),
    toBinary(pollCreatorJid),
    toBinary(voterJid),
    toBinary('Poll Vote'),
    new Uint8Array([1])
  ]);
  const key0 = hmacSign(pollEncKey, new Uint8Array(32));
  const encKey = hmacSign(sign, key0);
  const aad = toBinary(`${pollMsgId}\u0000${voterJid}`);
  const payload = proto.Message.PollVoteMessage.encode({ selectedOptions }).finish();
  const iv = crypto.randomBytes(12);
  const encrypted = aesEncryptGCM(payload, encKey, iv, aad);
  return {
    encPayload: Buffer.from(encrypted.slice(0, -16)),
    encIv: iv,
    encTag: Buffer.from(encrypted.slice(-16)),
  };
}

let handler = async (m, { conn }) => {
  const match = m.text.trim().match(/^[.!#]اختار\s+(\d+)$/u);
  if (!match) return;

  if (!m.quoted) return conn.sendMessage(m.chat, { text:'❌ لازم ترد على الـ poll.');

  const pollData = global.pollStore.get(m.quoted.id);
  if (!pollData) return conn.sendMessage(m.chat, { text:'❌ الـ poll ده مش معروف!\nلازم يكون poll بعته البوت بأمر `.تصويت`');

  const optionNumber = parseInt(match[1], 10);
  const selected = pollData.options[optionNumber - 1];
  if (!selected) return conn.sendMessage(m.chat, { text:`❌ في ${pollData.options.length} اختيارات بس.`);

  const botJid = conn.user?.jid || conn.user?.id;

  try {
    const { encPayload, encIv, encTag } = encryptPollVote(
      { selectedOptions: [sha256(Buffer.from(selected, 'utf8'))] },
      {
        pollMsgId: m.quoted.id,
        pollCreatorJid: pollData.creatorJid,
        pollEncKey: pollData.secret,
        voterJid: botJid,
      }
    );

    const pollUpdateMsg = proto.Message.fromObject({
      pollUpdateMessage: {
        pollCreationMessageKey: {
          remoteJid: pollData.chat,
          fromMe: true,
          id: m.quoted.id,
          participant: pollData.creatorJid,
        },
        vote: {
          selectedOptions: [sha256(Buffer.from(selected, 'utf8'))],
          senderTimestampMs: Date.now(),
          encPayload: Buffer.concat([encPayload, encTag]),
          encIv,
        },
      }
    });

    await conn.relayMessage(pollData.chat, pollUpdateMsg, {
      messageId: generateMessageIDV2(),
    });

    return conn.sendMessage(m.chat, { text:`✅ اخترت: ${selected}`);
  } catch (err) {
    console.log('اختار error:', err);
    return conn.sendMessage(m.chat, { text:'❌ حصل خطأ: ' + err.message);
  }
};

handler.command = /^اختار$/i;
handler.help = ['اختار <رقم>'];
handler.tags = ['tools'];

export default handler;