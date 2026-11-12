/**
 * plugins/eval.js
 * تنفيذ كود أو تحميل ملف من رابط
 */

const handler = async (m, { conn, text, command }) => {

  // أمر .حمل رابط — يحمل ملف من URL ويحفظه في plugins
  if (command === 'حمل') {
    const parts = text?.trim().split(' ')
    const url   = parts?.[0]
    const name  = parts?.[1]

    if (!url || !name) {
      return m.reply('⚠️ الاستخدام:\n.حمل <رابط> <اسم_الملف>\n\nمثال:\n.حمل https://raw.githubusercontent.com/.../احفظ.js احفظ')
    }

    await m.react('⏳')
    try {
      const fetch = (await import('node-fetch')).default
      const res   = await fetch(url)
      if (!res.ok) throw new Error(`فشل التحميل: ${res.status}`)
      const code  = await res.text()
      const fileName = name.endsWith('.js') ? name : `${name}.js`
      const fs = (await import('fs')).default
      fs.writeFileSync(`plugins/${fileName}`, code, 'utf8')
      await m.react('✅')
      return m.reply(`✅ تم حفظ *${fileName}* بنجاح!`)
    } catch (e) {
      await m.react('❌')
      return m.reply(`❌ ${e.message}`)
    }
  }

  // أمر .eval — تنفيذ كود JS
  try {
    let result = await eval(`(async () => { ${text} })()`)
    if (typeof result !== 'string') result = JSON.stringify(result, null, 2)
    if (!result || result === 'undefined') result = '✅ تم التنفيذ بدون نتيجة'
    await m.reply(String(result).slice(0, 3000))
  } catch (e) {
    await m.reply(`❌ ${e.message}`)
  }
}

handler.help    = ['eval <كود>', 'حمل <رابط> <اسم>']
handler.tags    = ['tools']
handler.command = /^(eval|=>|حمل)$/i

export default handler