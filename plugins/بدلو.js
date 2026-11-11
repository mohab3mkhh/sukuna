import fs from 'fs';
import path from 'path';
import axios from 'axios';

const allowedNumbers = ['201036547166@s.whatsapp.net', '201016855501@s.whatsapp.net'];

// نفس إعدادات احفظ / بدل (حساب جيت هاب الجديد)
const GITHUB_TOKEN  = process.env.GITHUB_TOKEN;
const GITHUB_REPO   = process.env.GITHUB_REPO || 'mohab3mkhh/sukuna';
const GITHUB_BRANCH = 'main';

const getFileSha = async (filePath) => {
  try {
    const res = await axios.get(
      `https://api.github.com/repos/${GITHUB_REPO}/contents/${filePath}`,
      { headers: { Authorization: `token ${GITHUB_TOKEN}`, Accept: 'application/vnd.github.v3+json' }, params: { ref: GITHUB_BRANCH } }
    );
    return res.data.sha;
  } catch (err) {
    if (err.response?.status === 404) return null;
    throw err;
  }
};

const saveToGithub = async (filePath, content) => {
  try {
    const sha = await getFileSha(filePath);
    const body = {
      message: sha ? `update ${filePath} via bot` : `create ${filePath} via bot`,
      content: Buffer.from(content).toString('base64'),
      branch: GITHUB_BRANCH
    };
    if (sha) body.sha = sha;
    await axios.put(`https://api.github.com/repos/${GITHUB_REPO}/contents/${filePath}`, body, {
      headers: { Authorization: `token ${GITHUB_TOKEN}`, Accept: 'application/vnd.github.v3+json' }
    });
  } catch (err) {
    throw new Error(`[${err.response?.status}] ${err.response?.data?.message || err.message}`);
  }
};

const handler = async (m, { conn, text, isROwner }) => {
  // isROwner بييجي من handler.js وبيفهم الـ LID، فالمالك يشتغل من أي نوع واتساب
  if (!isROwner && !allowedNumbers.includes(m.sender)) {
    return conn.sendMessage(m.chat, { text: `❌ غير مسموح لك باستخدام هذا الأمر، يا عبد 🩸` }, { quoted: m });
  }

  if (!text || !text.includes('|')) {
    return conn.sendMessage(m.chat, {
      text: '⚠️ يرجى كتابة الأمر بالشكل التالي:\n\n`.بدلو الكلمة_القديمة|الكلمة_الجديدة`'
    }, { quoted: m });
  }

  // أول | بس هو الفاصل (عشان الكلمة الجديدة ممكن يبقى فيها |)
  const idx = text.indexOf('|');
  const oldWord = text.slice(0, idx).trim();
  const newWord = text.slice(idx + 1).trim();

  if (!oldWord || !newWord) {
    return conn.sendMessage(m.chat, {
      text: '⚠️ تأكد من أنك أدخلت الكلمتين بشكل صحيح (قديم|جديد).'
    }, { quoted: m });
  }

  await m.react('⏳');

  const basePath = 'plugins';
  const files = fs.readdirSync(basePath).filter(f => f.endsWith('.js'));
  let changedFiles = [], errors = [], githubErrors = [];

  for (const file of files) {
    const filePath = path.join(basePath, file);
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      if (content.includes(oldWord)) {
        const newContent = content.split(oldWord).join(newWord);
        fs.writeFileSync(filePath, newContent, 'utf-8');
        changedFiles.push(file);
        try {
          await saveToGithub(filePath, newContent);
        } catch (e) {
          githubErrors.push({ file, error: e.message });
        }
      }
    } catch (e) {
      errors.push({ file, error: e.message });
    }
  }

  let message = changedFiles.length === 0
    ? `⚠️ *لم يتم العثور على "${oldWord}" في أي ملف.*`
    : `✅ *تم استبدال "${oldWord}" بـ "${newWord}"*\n\n📁 *عدد الملفات المعدلة:* ${changedFiles.length}\n\n📄 *الملفات:*\n${changedFiles.map((f, i) => `${i + 1}️⃣ ${f}`).join('\n')}`;

  if (errors.length) message += `\n\n⚠️ *أخطاء محلية:*\n${errors.map(e => `- ${e.file}: ${e.error}`).join('\n')}`;
  if (githubErrors.length) message += `\n\n⚠️ *أخطاء GitHub:*\n${githubErrors.map(e => `- ${e.file}: ${e.error}`).join('\n')}`;
  else if (changedFiles.length) message += `\n\n☁️ *تم رفع التعديلات إلى GitHub بنجاح!*`;

  await m.react('✅');
  await conn.sendMessage(m.chat, { text: message }, { quoted: m });
};

handler.help = ['بدلو *<قديم>|<جديد>*'];
handler.tags = ['owner'];
handler.command = /^بدلو$/i;

export default handler;