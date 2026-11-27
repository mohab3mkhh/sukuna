// plugins/بانشات.js
// 🚫 .بانشات  → البوت يتجاهل الجروب تماماً (مايقراش رسايله ولا يرد ولا حتى يقول "محظور")
//    من جوا الجروب:      .بانشات
//    برابط الجروب:        .بانشات https://chat.whatsapp.com/XXXXXXXX
//    بمعرف الجروب:        .بانشات 120363xxxxxxxxxxxx@g.us   (أو الأرقام بس)
// ♻️ .بانشاتفك <رابط أو معرف>  → يرجّع الجروب (لازم من الخاص أو من جروب تاني، لأن الجروب المتجاهَل مبيسمعش)
// 📋 .بانشات_قائمة            → يعرض الجروبات المتجاهَلة
// التجاهل الفعلي بيحصل في index.js / handler.js عن طريق global.isIgnoredGroup

const isGroupJid = j => typeof j === 'string' && j.endsWith('@g.us')

// ✅ متاحة لـ index.js و handler.js (بتتحمّل قبل الاتصال)
global.isIgnoredGroup = jid => isGroupJid(jid) && !!global.db?.data?.ignoredGroups?.[jid]

const store = () => {
  const d = global.db.data
  if (!d.ignoredGroups) d.ignoredGroups = {}
  return d.ignoredGroups
}

async function resolveGroup(conn, m, text) {
  const t = String(text || '').trim()

  // 1) رابط الجروب
  const code = t.match(/chat\.whatsapp\.com\/([A-Za-z0-9_-]{10,})/i)?.[1]
  if (code) {
    const info = await conn.groupGetInviteInfo(code)
    return { jid: info.id, name: info.subject || '' }
  }

  // 2) معرف الجروب (120363...@g.us أو أرقام بس)
  const idm = t.match(/\b(\d{10,}(?:-\d{6,})?)(?:@g\.us)?\b/)
  if (idm) {
    const jid = `${idm[1]}@g.us`
    const meta = await conn.groupMetadata(jid).catch(() => null)
    return { jid, name: meta?.subject || '' }
  }

  // 3) الجروب الحالي
  if (m.isGroup) {
    const meta = await conn.groupMetadata(m.chat).catch(() => null)
    return { jid: m.chat, name: meta?.subject || '' }
  }
  return null
}

const handler = async (m, { conn, text, command }) => {
  const list = store()

  // 📋 القائمة
  if (command === 'بانشات_قائمة') {
    const items = Object.entries(list)
    return conn.sendMessage(m.chat, {
      text: items.length
        ? `🚫 *الجروبات المتجاهَلة (${items.length})*\n\n` + items.map(([jid, v], i) => `${i + 1}. ${v?.name || 'بدون اسم'}\n   ${jid}`).join('\n')
        : '✅ مفيش جروبات متجاهَلة'
    }, { quoted: m })
  }

  const unban = command === 'بانشاتفك'

  let target = null
  try { target = await resolveGroup(conn, m, text) }
  catch (e) { return conn.sendMessage(m.chat, { text: `❌ مقدرتش أجيب بيانات الجروب: ${e?.message || e}` }, { quoted: m }) }

  if (!target) {
    return conn.sendMessage(m.chat, {
      text: `🚫 *بانشات*\n\n• من جوا الجروب: .بانشات\n• برابط: .بانشات <رابط الجروب>\n• بمعرف: .بانشات <معرف الجروب>\n• فك: .بانشاتفك <رابط أو معرف>\n• القائمة: .بانشات_قائمة`
    }, { quoted: m })
  }

  // لو الأمر اتكتب جوا نفس الجروب المتجاهَل: الرد بيتبعت لك خاص (عشان الجروب نفسه مايشوفش أي رد)
  const inTarget = m.isGroup && target.jid === m.chat
  const say = async t => {
    const to = inTarget ? m.sender : m.chat
    await conn.sendMessage(to, { text: t }, to === m.chat ? { quoted: m } : {}).catch(() => {})
  }

  if (unban) {
    if (!list[target.jid]) return say('ℹ️ الجروب ده مش متجاهَل أصلاً')
    delete list[target.jid]
    await global.db.write?.().catch(() => {})
    return say(`♻️ *تم إرجاع الجروب*\n${target.name || target.jid}\nالبوت هيرد فيه تاني.`)
  }

  if (list[target.jid]) return say('ℹ️ الجروب ده متجاهَل بالفعل')
  list[target.jid] = { name: target.name, at: Date.now() }
  await global.db.write?.().catch(() => {})
  return say(`🚫 *تم تجاهل الجروب تماماً*\n${target.name || target.jid}\n${target.jid}\n\nالبوت مش هيقرا ولا يرد على أي حاجة فيه.\nللرجوع: .بانشاتفك <رابط أو معرف> من الخاص.`)
}

handler.help = ['بانشات', 'بانشاتفك', 'بانشات_قائمة']
handler.tags = ['owner']
handler.command = ['بانشات', 'بانشاتفك', 'بانشات_قائمة']
handler.rowner = true

export default handler