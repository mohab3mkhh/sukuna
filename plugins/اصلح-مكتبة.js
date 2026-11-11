import fs from 'fs'
import path from 'path'

const MODS = '@whiskeysockets\\/baileys|@adiwajshing\\/baileys|baileys'
const HAS = new RegExp(`(['"\`])(?:${MODS})\\1`)

const toDestructure = (names) =>
  names
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => s.replace(/\s+as\s+/, ': '))
    .join(', ')

export const convert = (src) => {
  let n = 0

  // import X, { a, b } from 'baileys'
  src = src.replace(
    new RegExp(`import\\s+(\\w+)\\s*,\\s*\\{([^}]*)\\}\\s*from\\s*(['"])(?:${MODS})\\3;?`, 'g'),
    (_, def, names) => `import ${def} from '@whiskeysockets/baileys'\nconst { ${toDestructure(names)} } = ${def};`
  )

  // import { a, b as c } from 'baileys'
  src = src.replace(
    new RegExp(`import\\s*\\{([^}]*)\\}\\s*from\\s*(['"])(?:${MODS})\\2;?`, 'g'),
    (_, names) => {
      n++
      return `import __bs${n} from '@whiskeysockets/baileys'\nconst { ${toDestructure(names)} } = __bs${n};`
    }
  )

  // أي استخدام تاني (default / namespace / dynamic import)
  return src.replace(new RegExp(`(['"\`])(?:${MODS})\\1`, 'g'), "'@whiskeysockets/baileys'")
}

const handler = async (m, { args }) => {
  const dir = './plugins'
  const dry = args[0] === 'فحص'
  const backupDir = './tmp/plugins_backup'
  if (!dry) fs.mkdirSync(backupDir, { recursive: true })

  const changed = []
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.js'))) {
    const p = path.join(dir, file)
    const src = fs.readFileSync(p, 'utf8')
    if (!HAS.test(src)) continue
    const out = convert(src)
    if (out === src) continue
    changed.push(file)
    if (!dry) {
      fs.copyFileSync(p, path.join(backupDir, file))
      fs.writeFileSync(p, out, 'utf8')
    }
  }

  if (!changed.length) return m.reply('✅ مفيش ملفات فيها whiskeysockets/baileys')

  m.reply(
    `${dry ? '🔍 ملفات هتتعدل' : '✅ تم تعديل'} ${changed.length} ملف:\n\n` +
    changed.map(f => `◈ ${f}`).join('\n') +
    (dry ? '\n\nاكتب الأمر من غير "فحص" للتنفيذ' : `\n\n📦 نسخة احتياطية في ${backupDir}`)
  )
}

handler.help = ['اصلح-مكتبة']
handler.tags = ['owner']
handler.command = /^(اصلح-مكتبة|fixlib)$/i
handler.owner = true

export default handler