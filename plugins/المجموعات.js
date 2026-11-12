/**
 * plugins/groups-list.js
 * قائمة المجموعات
 */

import { sendButtons, btn, getButtonId } from '../lib/buttons.js';

const GROUP_OWNER_ID = '201500564191@s.whatsapp.net';
const GROUP_DEVELOPERS = ['201500564191@s.whatsapp.net'];

const imgUrl = 'https://files.catbox.moe/fk9ym6.jpg';

const handler = async (m, { text, conn, usedPrefix, command }) => {
  // ✅ جلب المجموعات
  const groups = [];
  for (const [jid, chat] of Object.entries(conn.chats)) {
    if (jid.endsWith('@g.us') && chat.isChats) {
      try {
        const metadata = await conn.groupMetadata(jid).catch(() => null);
        if (metadata) {
          groups.push({
            jid: jid,
            subject: metadata.subject,
            participants: metadata.participants?.length || 0,
            isBotAdmin: metadata.participants?.some(p => p.id === conn.user.jid && p.admin) || false
          });
        }
      } catch (e) {
        console.error(e);
      }
    }
  }

  if (groups.length === 0) {
    return m.reply('❌ البوت ليس عضواً في أي مجموعة حالياً.');
  }

  // ✅ بناء sections للقائمة
  const sections = [{
    title: '「 قائمة المجموعات 」',
    highlight_label: '📋',
    rows: groups.map(g => ({
      title: g.subject.length > 30 ? g.subject.slice(0, 27) + '...' : g.subject,
      description: `👥 ${g.participants} عضو | 🤖 ${g.isBotAdmin ? 'أدمن ✅' : 'عضو فقط ❌'}`,
      id: `${usedPrefix}${command} ${g.jid}`
    }))
  }];

  // ✅ إرسال باستخدام sendButtons
  await sendButtons(conn, m.chat, {
    title: '📋 قائمة المجموعات',
    subtitle: `إجمالي: ${groups.length}`,
    text: `📊 *إجمالي المجموعات:* ${groups.length}\n\nاختر مجموعة لعرض تفاصيلها:`,
    footer: `🕒 ${new Date().toLocaleString('ar-EG')}`,
    image: imgUrl,
    buttons: [btn.list('📋 قائمة المجموعات', sections)]
  }, m);
};

// ✅ معالج اختيار المجموعة
handler.before = async function (m, { conn, usedPrefix, command }) {
  const buttonId = getButtonId(m);
  if (!buttonId || !buttonId.includes('@g.us')) return false;

  // استخراج JID من الزر
  const match = buttonId.match(/(\d+@g\.us)/);
  if (!match) return false;

  const groupJid = match[1];

  try {
    const metadata = await conn.groupMetadata(groupJid).catch(() => null);
    if (!metadata) return m.reply('❌ مش قادر أجيب بيانات المجموعة');

    const owner = metadata.owner || metadata.subjectOwner || '';
    const creation = metadata.creation || null;
    const desc = metadata.desc || '';

    let msg = `📋 *معلومات المجموعة*\n\n`;
    msg += `👥 *الاسم:* ${metadata.subject}\n`;
    msg += `🆔 *المعرف:*\n\`\`\`${groupJid}\`\`\`\n`;
    msg += `📊 *الأعضاء:* ${metadata.participants?.length || 0}\n`;

    if (owner) {
      msg += `👤 *المنشئ:* @${String(owner).split('@')[0]}\n`;
    }
    if (creation) {
      const d = new Date(creation * 1000);
      msg += `📅 *تاريخ الإنشاء:* ${d.toLocaleDateString('ar-EG')}\n`;
    }
    if (desc) {
      msg += `📝 *الوصف:* ${desc.slice(0, 100)}${desc.length > 100 ? '...' : ''}\n`;
    }

    return conn.sendMessage(m.chat, {
      text: msg,
      mentions: owner ? [owner] : []
    }, { quoted: m });

  } catch (e) {
    console.error('[Groups]', e);
    return m.reply(`❌ فشل: ${e.message}`);
  }
};

handler.help = ['groups', 'grouplist'];
handler.tags = ['info'];
handler.command = ['المجموعات', 'الجروبات'];
handler.rowner = true;

export default handler;