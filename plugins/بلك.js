/**
 * plugins/بلك.js
 * .بلك  -> حظر رقم (رد / منشن / رقم)
 * .فك   -> فك الحظر
 */

const OWNERS = [
  '201036547166',
  '201016855501',
  '201066036607',
]

const num = jid => String(jid || '').split('@')[0].split(':')[0].replace(/\D/g, '')

const isOwner = m => {
  const sender = num(m.sender)
  const extra = (global.owner || []).map(o => num(Array.isArray(o) ? o[0] : o))
  return m.fromMe || OWNERS.includes(sender) || extra.includes(sender)
}

const handler = async (m, { conn, text, usedPrefix, command }) => {
  if (!isOwner(m)) return m.reply('❌ الأمر ده للمطور بس')

  const unblock = /^فك/i.test(command)

  // تحديد الشخص: منشن > رد > رقم مكتوب
  let target = m.mentionedJid?.[0] || m.quoted?.sender
  if (!target && text) {
    const digits = text.replace(/\D/g, '')
    if (digits.length >= 8) target = digits + '@s.whatsapp.net'
  }

  if (!target) {
    return m.reply(`🚫 *${unblock ? 'فك الحظر' : 'حظر'}*\n\nرد على رسالته أو منشنه أو اكتب رقمه\n💡 مثال:\n${usedPrefix}${command} 201012345678`)
  }

  const botNum = num(conn.user?.id || conn.user?.jid)
  if (num(target) === botNum || OWNERS.includes(num(target))) {
    return m.reply('❌ مينفعش تحظر البوت أو المطور')
  }

  try {
    await conn.updateBlockStatus(target, unblock ? 'unblock' : 'block')
    await conn.sendMessage(m.chat, { react: { text: unblock ? '🔓' : '🚫', key: m.key } })
    await conn.sendMessage(m.chat, {
      text: unblock
        ? `✅ تم فك الحظر عن @${num(target)}`
        : `🚫 تم حظر @${num(target)}\nمش هيقدر يكلم البوت في الخاص وصورته هتختفي عنده.`,
      mentions: [target],
    }, { quoted: m })
  } catch (e) {
    console.error('[بلك]', e)
    m.reply('❌ فشل: ' + (e?.message || e))
  }
}

handler.help = ['بلك', 'فك']
handler.tags = ['owner']
handler.command = /^(بلك|فك|فك_بلك)$/i

export default handler