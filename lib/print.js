import pkg from '@whiskeysockets/baileys';
const { WAMessageStubType } = pkg;
import PhoneNumber from 'awesome-phonenumber';
import chalk from 'chalk';

export default async function (m, conn = { user: {} }) {
  try {
    const senderJid = (m.isGroup && m.fromMe) ? (conn.user?.jid || m.sender) : m.sender;
    const senderNumber = (senderJid || '').replace(/@.+$/, '');
    const plusPrefixed = senderNumber.startsWith('+') ? senderNumber : ('+' + senderNumber)
    const intl = PhoneNumber(plusPrefixed).getNumber('international') || plusPrefixed;
    const _name = await safeGetName(conn, senderJid);
    const sender = `${intl}${_name ? ' ~' + _name : ''}`;
    const chat = await safeGetName(conn, m.chat);
    const filesize = calculateFileSize(m);
    const user = global.db?.data?.users?.[senderJid] || global.db?.data?.users?.[m.sender];
    const myNumRaw = String(conn.user?.jid || '').replace('@s.whatsapp.net', '')
    const me = PhoneNumber(myNumRaw.startsWith('+') ? myNumRaw : ('+' + myNumRaw)).getNumber('international');
    logMessage(me, conn.user.name, m, chat, filesize, sender, user);
    await handleTextFormatting(m, conn);
  } catch (error) {
    console.error('Error processing message:', error);
  }
}

async function safeGetName(conn, jid) {
  try {
    return await Promise.resolve(conn.getName(jid));
  } catch {
    return '';
  }
}

function calculateFileSize(m) {
  return (m.msg?.vcard?.length || m.msg?.fileLength?.low || m.msg?.text?.length || 0) || 0;
}

function logMessage(me, name, m, chat, filesize, sender, user) {
  console.log(`
  ♾️ ${chalk.hex('#9400FF').bold('%s')}
  │⏰ ${chalk.black(chalk.bgHex('#FFD700')('%s'))}
  │📑 ${chalk.black(chalk.bgHex('#00FFFF')('%s'))}
  │📊 ${chalk.hex('#9400FF')('%s [%s %sB]')}
  │📤 ${chalk.hex('#00FFFF')('%s')}
  │📪 ${chalk.hex('#FFD700')('%s%s')}
  │📥 ${chalk.hex('#00FFFF')('%s')}
  │💬 ${chalk.black(chalk.bgHex('#FFD700')('%s'))}
  │📜 ${chalk.hex('#9400FF')('%s')}
  🔱──────···⚡ SUKUNA BOT ⚡···──────♾️
  `.trim(),
    `🔱 SUKUNA BOT | ${me} ~ ${name}`,
    (m.messageTimestamp ? new Date(1000 * (m.messageTimestamp.low || m.messageTimestamp)) : new Date()).toTimeString(),
    m.messageStubType ? WAMessageStubType[m.messageStubType] : '',
    filesize,
    filesize === 0 ? 0 : (filesize / 1009 ** Math.floor(Math.log(filesize) / Math.log(1000))).toFixed(1),
    ['', ...'KMGTP'][Math.floor(Math.log(filesize) / Math.log(1000))] || '',
    sender,
    m?.exp || '?',
    user ? `|${user.exp}| |${user.limit}` : `| |`,
    m.chat + (chat ? ' ~' + chat : ''),
    m.mtype ? m.mtype.replace(/message$/i, '').replace('audio', m.msg?.ptt ? 'PTT' : 'audio').replace(/^./, v => v.toUpperCase()) : '',
    m.text || ''
  );
}

async function handleTextFormatting(m, conn) {
  if (typeof m.text === 'string' && m.text) {
    let log = m.text.replace(/‎+/g, '');
  }
}
