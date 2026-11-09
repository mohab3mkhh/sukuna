import fs from 'fs';
import axios from 'axios';

const GITHUB_TOKEN  = process.env.GITHUB_TOKEN;
const GITHUB_REPO   = process.env.GITHUB_REPO || 'mohab3mkhh/sukuna';
const GITHUB_BRANCH = 'main';

const reply = async (m, conn, text) => {
  await conn.sendMessage(m.chat, { text }, { quoted: m });
};

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

const deleteFromGithub = async (filePath) => {
  try {
    const sha = await getFileSha(filePath);
    if (!sha) return { status: 'not_found' };
    await axios.delete(`https://api.github.com/repos/${GITHUB_REPO}/contents/${filePath}`, {
      headers: { Authorization: `token ${GITHUB_TOKEN}`, Accept: 'application/vnd.github.v3+json' },
      data: { message: `delete ${filePath} via bot`, sha, branch: GITHUB_BRANCH }
    });
    return { status: 'success' };
  } catch (err) {
    throw new Error(`[${err.response?.status}] ${err.response?.data?.message || err.message}`);
  }
};

const handler = async (m, { conn, text, usedPrefix, command }) => {
  if (!text) throw `〘 ❗ 〙 يرجى إدخال اسم الملف`;

  const q = m.quoted || m;
  const mime = q.mimetype || '';
  const isTextMessage = q.text;
  const filePath = `plugins/${text}.js`;
  let fileContent = '';

  switch (command) {
    case 'احفظ':
      if (!q || (!isTextMessage && !mime)) throw `〘 ❗ 〙 يرجى الرد على رسالة نصية أو مستند ليتم حفظه كملف`;
      try {
        if (isTextMessage) {
          fileContent = isTextMessage.trim();
          if (!fileContent) throw `〘 ❗ 〙 النص المستلم فارغ.`;
        } else if (mime === 'application/javascript') {
          const buffer = await q.download();
          fileContent = buffer.toString('utf8');
          if (!fileContent.trim()) throw `〘 ❗ 〙 الملف المرفق فارغ أو لا يحتوي على نصوص صالحة.`;
        } else {
          throw `〘 ❗ 〙 الملف المرفق غير مدعوم.`;
        }
        fs.writeFileSync(filePath, fileContent, 'utf8');
        await saveToGithub(filePath, fileContent);
        await reply(m, conn, `〘 ✅ 〙 تم حفظ الملف محلياً ورفعه على GitHub: "${filePath}"`);
      } catch (error) {
        throw `〘 ❗ 〙 حدث خطأ: ${error.message || error}`;
      }
      break;

    case 'امسح':
      if (!fs.existsSync(filePath)) throw `〘 ❗ 〙 الملف "${filePath}" غير موجود لحذفه`;
      try {
        fs.unlinkSync(filePath);
        await deleteFromGithub(filePath);
        await reply(m, conn, `〘 ✅ 〙 تم حذف الملف محلياً ومن GitHub: "${filePath}"`);
      } catch (error) {
        throw `〘 ❗ 〙 حدث خطأ أثناء الحذف: ${error.message || error}`;
      }
      break;

    default:
      throw `〘 ❗ 〙 الأمر غير معروف\nاستخدم:\n- ${usedPrefix}احفظ\n- ${usedPrefix}امسح`;
  }
};

handler.help = ['احفظ', 'امسح'];
handler.tags = ['owner'];
handler.command = ['احفظ', 'امسح'];
handler.owner = true;

export default handler;
  
