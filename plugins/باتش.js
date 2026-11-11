import { exec as _exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';

const exec = promisify(_exec).bind(null);

const handler = async (m, { conn, text }) => {
  const allowedUsers = [
    "201016855501@s.whatsapp.net",
    "201036547166@s.whatsapp.net",
    "201150572826@s.whatsapp.net",
    "201515023210@s.whatsapp.net"
  ];

  if (!allowedUsers.includes(m.sender)) {
    return m.reply('❌ هذا الأمر خاص بـ *مهاب* فقط.');
  }

  const pluginsDir = './plugins/';
  const files = fs.readdirSync(pluginsDir).filter(f => f.endsWith('.js')).map(f => f.replace('.js',''));

  if (!text) {
    return m.reply(`
╭─「 قائمة الملفات المتاحة 」─╮
│ عدد الملفات: ${files.length}
╰────────────────────────────╯
${files.map((f, i) => `│ [${i+1}] ${f}`).join('\n')}
`.trim());
  }

  if (!files.includes(text)) {
    return m.reply(`❌ الملف "${text}" غير موجود.\nيرجى اختيار أحد الملفات المتاحة.`);
  }

  try {
    const { stdout, stderr } = await exec(`cat ${pluginsDir}${text}.js`);
    
    if (stdout) {
      const msg = await conn.sendMessage(m.chat, { text: stdout }, { quoted: m });
      await conn.sendMessage(m.chat, {
        document: fs.readFileSync(`${pluginsDir}${text}.js`),
        mimetype: 'application/javascript',
        fileName: `${text}.js`
      }, { quoted: msg });
    }

    if (stderr) {
      const msgErr = await conn.sendMessage(m.chat, { text: stderr }, { quoted: m });
      await conn.sendMessage(m.chat, {
        document: fs.readFileSync(`${pluginsDir}${text}.js`),
        mimetype: 'application/javascript',
        fileName: `${text}.js`
      }, { quoted: msgErr });
    }
  } catch (e) {
    return m.reply(`❌ حدث خطأ أثناء فتح الملف: ${e.message}`);
  }
};

handler.help = ['باتش *<اسم الملف>*'];
handler.tags = ['owner'];
handler.command = /^(باتش|gp)$/i;
handler.owner = true;

export default handler;