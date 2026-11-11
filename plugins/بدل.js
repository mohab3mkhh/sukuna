import fs from 'fs'
import path from 'path'
import axios from 'axios'

const allowedNumbers = ['201036547166@s.whatsapp.net', '201016855501@s.whatsapp.net']

// ━━━ GitHub (الحساب الأخير فقط) ━━━
// حط التوكن في متغير البيئة GITHUB_TOKEN_4 (مش في الكود)
const GITHUB_TOKEN = process.env.GITHUB_TOKEN_4
const GITHUB_REPO = 'ymatikonhach/Sukunabot'
const GITHUB_BRANCH = 'main'
const PLUGINS_DIR = 'plugins'

// ━━━ ترحيل المكتبة ━━━
// الاسم القديم مبني بالتقسيم عشان الأمر ما يعدّل نفسه
const OLD_LIB = ['angular', 'sockets'].join('')
const NEW_LIB = '@whiskeysockets/baileys'
const MIGRATE_WORD = 'ويسكي'

const headers = () => ({ Authorization: `token ${GITHUB_TOKEN}`, Accept: 'application/vnd.github.v3+json' })

const getFileSha = async filePath => {
  try {
    const res = await axios.get(
      `https://api.github.com/repos/${GITHUB_REPO}/contents/${filePath}`,
      { headers: headers(), params: { ref: GITHUB_BRANCH } }
    )
    return res.data.sha
  } catch (err) {
    if (err.response?.status === 404) return null
    throw err
  }
}

const saveToGithub = async (localPath, content) => {
  if (!GITHUB_TOKEN) throw new Error('متغير GITHUB_TOKEN_4 مش متضبط')
  const filePath = localPath.replace(/\\/g, '/')
  try {
    const sha = await getFileSha(filePath)
    const body = {
      message: sha ? `update ${filePath} via bot` : `create ${filePath} via bot`,
      content: Buffer.from(content).toString('base64'),
      branch: GITHUB_BRANCH,
    }
    if (sha) body.sha = sha
    await axios.put(`https://api.github.com/repos/${GITHUB_REPO}/contents/${filePath}`, body, { headers: headers() })
  } catch (err) {
    throw new Error(`[${err.response?.status || '?'}] ${err.response?.data?.message || err.message}`)
  }
}

const listJsFiles = dir => {
  let out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') out = out.concat(listJsFiles(full))
    } else if (entry.name.endsWith('.js')) {
      out.push(full)
    }
  }
  return out
}

// بيطبّق التحويل على كل ملفات plugins ويرفع المتغيّر منها لـ GitHub (واحد ورا التاني)
async function processFiles(transform) {
  const changed = [], errors = [], ghErrors = []
  for (const filePath of listJsFiles(PLUGINS_DIR)) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8')
      const out = transform(content)
      if (out === content) continue
      fs.writeFileSync(filePath, out, 'utf-8')
      changed.push(filePath)
      try {
        await saveToGithub(filePath, out)
      } catch (e) {
        ghErrors.push(`${filePath}: ${e.message}`)
      }
    } catch (e) {
      errors.push(`${filePath}: ${e.message}`)
    }
  }
  return { changed, errors, ghErrors }
}

const handler = async (m, { conn, text }) => {
  const send = t => conn.sendMessage(m.chat, { text: t })
  const react = async emoji => {
    try { await conn.sendMessage(m.chat, { react: { text: emoji, key: m.key } }) } catch {}
  }

  if (!allowedNumbers.includes(m.sender)) {
    return send('❌ غير مسموح لك باستخدام هذا الأمر، يا عبد 🩸')
  }

  const q = m.quoted
  const arg = text?.trim()

  // ━━━ وضع ترحيل المكتبة: .بدل ويسكي ━━━
  const isMigrate = !q && arg === MIGRATE_WORD

  if (!isMigrate && (!q || !arg)) {
    return send(
      '⚠️ *طريقة الاستخدام:*\n\n' +
      '1️⃣ ابعت الكود القديم كرسالة\n' +
      '2️⃣ رد عليه بـ `.بدل` وبعدها الكود الجديد\n\n' +
      'مثال:\n`.بدل <الكود الجديد هنا>`\n\n' +
      `🔄 لتحويل المكتبة في كل البلجنز اكتب:\n\`.بدل ${MIGRATE_WORD}\``
    )
  }

  let transform
  if (isMigrate) {
    const re = new RegExp('([\'"`])' + OLD_LIB + '(?=[/\'"`])', 'g')
    transform = content => content.replace(re, '$1' + NEW_LIB)
  } else {
    const oldCode = (q.text || q.body || '').trim()
    if (!oldCode) return send('❌ الرسالة المردود عليها فارغة أو مش نص!')
    transform = content => (content.includes(oldCode) ? content.split(oldCode).join(arg) : content)
  }

  await react('⏳')
  const { changed, errors, ghErrors } = await processFiles(transform)

  let message
  if (!changed.length) {
    message = isMigrate
      ? `⚠️ *مفيش أي ملف بيستورد ${OLD_LIB}.*`
      : '⚠️ *لم يتم العثور على الكود القديم في أي ملف.*'
  } else {
    const shown = changed.slice(0, 40).map((f, i) => `${i + 1}️⃣ ${path.relative(PLUGINS_DIR, f)}`)
    if (changed.length > 40) shown.push(`... و ${changed.length - 40} ملف تاني`)
    message =
      (isMigrate ? `✅ *تم تحويل المكتبة إلى ${NEW_LIB}*` : '✅ *تم الاستبدال بنجاح*') +
      `\n\n📁 *عدد الملفات المعدلة:* ${changed.length}\n\n📄 *الملفات:*\n${shown.join('\n')}`
  }

  if (ghErrors.length) {
    message += `\n\n⚠️ *أخطاء GitHub:*\n${ghErrors.slice(0, 10).map(e => `- ${e}`).join('\n')}`
  } else if (changed.length) {
    message += `\n\n☁️ *تم رفع التعديلات إلى GitHub (${GITHUB_REPO}) بنجاح!*`
  }
  if (errors.length) {
    message += `\n\n❌ *أخطاء محلية:*\n${errors.slice(0, 10).map(e => `- ${e}`).join('\n')}`
  }

  await react(changed.length ? '✅' : '⚠️')
  await send(message)
}

handler.help = ['بدل']
handler.tags = ['owner']
handler.command = /^بدل$/i

export default handler