import fetch from 'node-fetch'

let handler = async (m, { conn }) => {
  await m.react('⏳')
  await m.reply('🔍 جاري فحص الشبكة...')

  const sites = [
    'https://api.imgbb.com',
    'https://0x0.st',
    'https://uguu.se',
    'https://tmpfiles.org',
    'https://file.io',
    'https://catbox.moe',
    'https://litterbox.catbox.moe',
    'https://transfer.sh',
    'https://gofile.io',
    'https://www.google.com'
  ]

  let results = []
  for (const site of sites) {
    try {
      const res = await fetch(site, {
        method: 'GET',
        timeout: 5000,
        headers: { 'user-agent': 'Mozilla/5.0' }
      })
      results.push(`✅ ${site} (${res.status})`)
    } catch (e) {
      results.push(`❌ ${site} - ${e.message.slice(0, 30)}`)
    }
  }

  await m.react('✅')
  m.reply(`╭─「 🌐 فحص الشبكة 」\n│\n${results.map(r => `│  ${r}`).join('\n')}\n│\n╰──────────────`)
}

handler.help = ['testnet']
handler.tags = ['owner']
handler.command = ['testnet']

export default handler