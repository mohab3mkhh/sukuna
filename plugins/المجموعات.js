/**
 * plugins/groups-list.js
 * قائمة المجموعات (تفاصيل + حالة أدمن البوت + لينك الجروب لو البوت أدمن)
 */

import { sendButtons, btn, getButtonId } from '../lib/buttons.js';

const imgUrl = 'https://files.catbox.moe/fk9ym6.jpg';
const CACHE_TTL = 15 * 60 * 1000;

if (!global.__grpMeta) global.__grpMeta = new Map(); // jid -> { md, t }

// ---------- أدوات ----------
const num = (j) => String(j || '').split('@')[0].split(':')[0];

// هوية البوت بكل أشكالها (رقم + LID) لأن واتساب بقى بيرجّع المشاركين بـ LID في بعض الجروبات
function botNumbers(conn) {
  const u = conn.user || {};
  return new Set([u.id, u.jid, u.lid, u.phoneNumber].filter(Boolean).map(num));
}

// المشاركين اللي هويتهم = هوية البوت (بغض النظر عن الأدمن)
function botParticipants(conn, md) {
  const ids = botNumbers(conn);
  return (md?.participants || []).filter(p =>
    [p.id, p.jid, p.lid, p.phoneNumber].filter(Boolean).some(x => ids.has(num(x)))
  );
}

function isBotAdmin(conn, md) {
  return botParticipants(conn, md).some(p => p.admin === 'admin' || p.admin === 'superadmin' || p.admin === true);
}

const DEBUG = true; // اقفلها (false) بعد ما نتأكد

function cacheSet(jid, md) {
  if (jid && md) global.__grpMeta.set(jid, { md, t: Date.now() });
}

// بيرجّع بيانات الجروب من الكاش لو لسه صالحة، ولو فشل الجلب بيرجع آخر نسخة محفوظة
async function getMeta(conn, jid) {
  const c = global.__grpMeta.get(jid);
  if (c && Date.now() - c.t < CACHE_TTL) return c.md;
  try {
    const md = await conn.groupMetadata(jid);
    if (md) { cacheSet(jid, md); return md; }
  } catch (e) {
    if (c) return c.md;
    throw e;
  }
  if (c) return c.md;
  throw new Error('البوت مش موجود في المجموعة دي (أو خرج منها)');
}

// كل المجموعات اللي البوت فيها فعلاً — طلب واحد بدل طلب لكل جروب
async function fetchGroups(conn) {
  let all = {};
  try {
    all = await conn.groupFetchAllParticipating();
  } catch (e) {
    console.error('[Groups] groupFetchAllParticipating:', e?.message);
  }

  if (!all || !Object.keys(all).length) {
    // احتياطي: من conn.chats
    for (const [jid, chat] of Object.entries(conn.chats || {})) {
      if (jid.endsWith('@g.us') && chat.isChats) {
        const md = await getMeta(conn, jid).catch(() => null);
        if (md) all[jid] = md;
      }
    }
  }

  const groups = [];
  for (const [jid, md] of Object.entries(all)) {
    cacheSet(jid, md);
    groups.push({
      jid,
      subject: md.subject || 'بدون اسم',
      participants: md.participants?.length || md.size || 0,
      isBotAdmin: isBotAdmin(conn, md)
    });
  }
  return groups;
}

const handler = async (m, { conn, usedPrefix, command }) => {
  const groups = await fetchGroups(conn);

  if (groups.length === 0) {
    return m.reply('❌ البوت ليس عضواً في أي مجموعة حالياً.');
  }

  groups.sort((a, b) => Number(b.isBotAdmin) - Number(a.isBotAdmin) || b.participants - a.participants);

  const rowOf = g => ({
    title: g.subject.length > 30 ? g.subject.slice(0, 27) + '...' : g.subject,
    description: `👥 ${g.participants} عضو | 🤖 ${g.isBotAdmin ? 'أدمن ✅' : 'عضو فقط ❌'}`,
    id: `${usedPrefix}${command} ${g.jid}`
  });

  // أقسام كل واحد 10 مجموعات
  const sections = [];
  for (let i = 0; i < groups.length; i += 10) {
    sections.push({
      title: `「 مجموعات ${i + 1}-${Math.min(i + 10, groups.length)} 」`,
      highlight_label: '📋',
      rows: groups.slice(i, i + 10).map(rowOf)
    });
  }

  const adminCount = groups.filter(g => g.isBotAdmin).length;

  await sendButtons(conn, m.chat, {
    title: '📋 قائمة المجموعات',
    subtitle: `إجمالي: ${groups.length}`,
    text: `📊 *إجمالي المجموعات:* ${groups.length}\n🤖 *البوت أدمن في:* ${adminCount}\n\nاختر مجموعة لعرض تفاصيلها:`,
    footer: `🕒 ${new Date().toLocaleString('ar-EG')}`,
    image: imgUrl,
    buttons: [btn.list('📋 قائمة المجموعات', sections)]
  }, m);
};

// ✅ معالج اختيار المجموعة
handler.before = async function (m, { conn }) {
  const buttonId = getButtonId(m);
  if (!buttonId || !buttonId.includes('@g.us')) return false;

  const match = buttonId.match(/([\d-]+@g\.us)/);
  if (!match) return false;

  const groupJid = match[1];

  try {
    const md = await getMeta(conn, groupJid);

    const owner = md.ownerPn || md.owner || md.subjectOwner || '';
    const creation = md.creation || null;
    const desc = md.desc || '';
    const botAdmin = isBotAdmin(conn, md);

    let msg = `📋 *معلومات المجموعة*\n\n`;
    msg += `👥 *الاسم:* ${md.subject}\n`;
    msg += `🆔 *المعرف:*\n\`\`\`${groupJid}\`\`\`\n`;
    msg += `📊 *الأعضاء:* ${md.participants?.length || 0}\n`;
    msg += `🤖 *البوت:* ${botAdmin ? 'أدمن ✅' : 'عضو فقط ❌'}\n`;
    if (DEBUG) {
      const me = botParticipants(conn, md).map(p => ({ id: p.id, lid: p.lid, pn: p.phoneNumber, admin: p.admin }));
      msg += `\n🧪 ids: ${[...botNumbers(conn)].join(', ')}\n🧪 matched: ${JSON.stringify(me)}\n🧪 user: ${JSON.stringify({ id: conn.user?.id, jid: conn.user?.jid, lid: conn.user?.lid })}\n`;
    }

    if (owner) {
      msg += `👤 *المنشئ:* @${num(owner)}\n`;
    }
    if (creation) {
      const d = new Date(creation * 1000);
      msg += `📅 *تاريخ الإنشاء:* ${d.toLocaleDateString('ar-EG')}\n`;
    }
    if (desc) {
      msg += `📝 *الوصف:* ${desc.slice(0, 100)}${desc.length > 100 ? '...' : ''}\n`;
    }

    if (botAdmin) {
      try {
        const code = await conn.groupInviteCode(groupJid);
        if (code) msg += `\n🔗 *اللينك:*\nhttps://chat.whatsapp.com/${code}\n`;
      } catch (e) {
        console.error('[Groups] invite:', e?.message);
      }
    }

    return conn.sendMessage(m.chat, {
      text: msg,
      mentions: owner ? [owner] : []
    }, { quoted: m });

  } catch (e) {
    console.error('[Groups]', e);
    return m.reply(`❌ مش قادر أجيب بيانات المجموعة\n_${String(e?.message || e).slice(0, 120)}_`);
  }
};

handler.help = ['groups', 'grouplist'];
handler.tags = ['info'];
handler.command = ['المجموعات', 'الجروبات'];
handler.rowner = true;

export default handler;