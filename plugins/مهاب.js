const OWNER_ID = '201036547166@s.whatsapp.net'

const handler = async (m, { conn }) => {}

handler.before = async function(m) {
  try {
    const text = (m.text || m.body || m.msg?.text || '').trim()
    if (!text) return false

    const lower = text.toLowerCase()

    if (lower.includes('مهاب')) {
      await this.sendMessage(m.chat, {
        text: `عايز ايه من جوزي 😤💍`
      }, { quoted: m })
      return false
    }

    if (lower.includes('مراتي') && m.sender === OWNER_ID) {
      await this.sendMessage(m.chat, {
        text: `نعم يجوزي 😍👰`
      }, { quoted: m })
      return false
    }
  } catch(e) {
    console.error('[مهاب]', e.message)
  }
  return false
}

handler.command = /^(مهاب_dummy_لايوجد)$/i

export default handler