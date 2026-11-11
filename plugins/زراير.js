// plugins/testbtn.js
// أمر تجربة للأزرار: اكتب  .زراير
import { sendButtons } from '../lib/buttons.js'

const handler = async (m, { conn }) => {
  try {
    await sendButtons(conn, m.chat, {
      text: '🎯 تجربة الأزرار\n\nلو شايف الأزرار تحت، يبقى كله تمام ✅',
      footer: '⛩️ SUKUNA BOT ⛩️',
      buttons: [
        { id: 'btn_1', text: 'زرار 1' },
        { id: 'btn_2', text: 'زرار 2' },
        { url: 'https://whatsapp.com/channel/0029VbBzSYd0AgW4AHD9j63c', text: '📢 القناة' },
      ],
      quoted: m,
    })
  } catch (e) {
    console.error('[testbtn] ERROR:', e)
    await conn.sendMessage(m.chat, { text: '❌ فشل إرسال الأزرار: ' + (e?.message || e) }, { quoted: m })
  }
}

handler.help = ['زراير']
handler.tags = ['tools']
handler.command = /^(زراير|testbtn)$/i

export default handler