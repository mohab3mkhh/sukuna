import fs from 'fs';
import path from 'path';
import axios from 'axios';

const allowedNumbers = ['201036547166@s.whatsapp.net', '201016855501@s.whatsapp.net'];

// نفس إعدادات أمر احفظ (حساب جيت هاب الجديد)
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
    return { status: 'success' };
  } catch (err) {
    throw new Error(`[${err.response?.status}] ${err.response?.data?.message || err.message}`);
  }
};

const handler = async (m, { conn, text }) => {
  if (!allowedNumbers.includes(m.sender)) {
    return conn.sendMessage(m.chat, { text: `❌ غير مسموح لك باستخدام هذا الأمر، يا عبد 🩸` }, { quoted: m });
  }

  const q = m.quoted
  const newCode = text?.trim()

  if (!q || !newCode) {
    return m.reply(
      '⚠️ *طريقة الاستخدام:*\n\n' +
      '1️⃣ ابعت الكود القديم كرسالة\n' +
      '2️⃣ رد عليه بـ `.بدل` وبعدها الكود الجديد\n\n' +
      'مثال:\n`.بدل <الكود الجديد هنا>`'
    )
  }

  const oldCode = (q.text || q.body || '').trim()
  if (!oldCode) return m.reply('❌ الرسالة المردود عليها فارغة أو مش نص!')

  await m.react('⏳')

  const basePath = 'plugins'
  const files = fs.readdirSync(basePath).filter(f => f.endsWith('.js'))
  let changedFiles = [], errors = [], githubErrors = []

  for (const file of files) {
    const filePath = path.join(basePath, file)
    try {
      const content = fs.readFileSync(filePath, 'utf-8')
      if (content.includes(oldCode)) {
        const newContent = content.split(oldCode).join(newCode)
        fs.writeFileSync(filePath, newContent, 'utf-8')
        changedFiles.push(file)
        try {
          await saveToGithub(filePath, newContent)
        } catch (e) {
          githubErrors.push({ file, error: e.message })
        }
      }
    } catch (e) {
      errors.push({ file, error: e.message })
    }
  }

  let message = changedFiles.length === 0
    ? `⚠️ *لم يتم العثور على الكود القديم في أي ملف.*`
    : `✅ *تم الاستبدال بنجاح*\n\n📁 *عدد الملفات المعدلة:* ${changedFiles.length}\n\n📄 *الملفات:*\n${changedFiles.map((f,i) => `${i+1}️⃣ ${f}`).join('\n')}`

  if (githubErrors.length) message += `\n\n⚠️ *أخطاء GitHub:*\n${githubErrors.map(e => `- ${e.file}: ${e.error}`).join('\n')}`
  else if (changedFiles.length) message += `\n\n☁️ *تم رفع التعديلات إلى GitHub بنجاح!*`

  if (errors.length) message += `\n\n❌ *أخطاء محلية:*\n${errors.map(e => `- ${e.file}: ${e.error}`).join('\n')}`

  await m.react('✅')
  await m.reply(message)
}

handler.help = ['بدل']
handler.tags = ['owner']
handler.command = /^بدل$/i

export default handler;