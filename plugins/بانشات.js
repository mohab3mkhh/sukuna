// plugins/بانشات.js
// 🚫 .بانشات → يخلّي البوتات تتجاهل الجروب (مايقراش ولا يرد ولا يقول "محظور")
//
// ✅ لكل بوت لوحده: اختار مين يسكت
//   .بانشات                   ← المنصّبين بس يسكتوا (الأساسي يفضل شغّال)   ← الافتراضي
//   .بانشات الكل              ← الأساسي + كل المنصّبين
//   .بانشات الاساسي           ← الأساسي بس (المنصّبين يفضلوا شغّالين)
//   .بانشات 201012345678      ← بوت منصّب معيّن بس (رقمه)
//   تقدر تكتب رابط الجروب أو معرفه بعد الاختيار، أو تكتبه من جوا الجروب:
//   .بانشات الكل https://chat.whatsapp.com/XXXX      .بانشات 120363xxxxxxxxxxxx@g.us
// ♻️ .بانشاتفك [اختيار] [رابط/معرف]  ← بدون اختيار = يشيل التجاهل عن الكل
//      (لو الأساسي هو المتجاهَل لازم تكتبها من الخاص أو من جروب تاني، لأنه مبيسمعش في الجروب)
// 📋 .بانشات_قائمة  ← الجروبات المتجاهَلة وكل جروب مين فيه ساكت
//
// الأوامر بيردّ عليها البوت الأساسي بس (المنصّبين مبيعملوش حاجة لما تكتبها).
// التجاهل الفعلي:
//   - المنصّبين: بيتفحصوا في تنصيب.js (global.isIgnoredGroup(jid, sock))
//   - الأساسي: index.js / handler.js عن طريق global.isIgnoredGroup(jid) — الاختيار "الكل" بيشتغل كده زي الأول.
//     وعشان "الاساسي بس" يشتغل، خلّي النداء يمرّر البوت: global.isIgnoredGroup(jid, conn)

const isGroupJid = j => typeof j === 'string' && j.endsWith('@g.us')
const numOf = j => String(j || '').split('@')[0].split(':')[0]

const isMainConn = conn =>
  !!conn && (conn === global.conn || (conn.user?.jid && global.conn?.user?.jid && numOf(conn.user.jid) === numOf(global.conn.user.jid)))

// ✅ متاحة لـ index.js و handler.js و تنصيب.js (بتتحمّل قبل الاتصال)
global.isIgnoredGroup = (jid, conn) => {
  if (!isGroupJid(jid)) return false
  const e = global.db?.data?.ignoredGroups?.[jid]
  if (!e) return false
  // سجل قديم (قبل التقسيم) = الكل
  if (e.all || (e.main === undefined && e.subs === undefined && !e.bots)) return true
  if (!conn) return false                       // نداء من غير تحديد بوت: بنتجاهل بس لو "الكل"
  if (isMainConn(conn)) return !!e.main
  return !!e.subs || !!e.bots?.[numOf(conn.user?.jid || conn.user?.id)]
}

const store = () => {
  const d = global.db.data
  if (!d.ignoredGroups) d.ignoredGroups = {}
  return d.ignoredGroups
}

// يوحّد شكل السجل (القديم = الكل)
function normalize(e) {
  if (e.all === undefined && e.main === undefined && e.subs === undefined && !e.bots) e.all = true
  e.all = !!e.all; e.main = !!e.main; e.subs = !!e.subs; e.bots = e.bots || {}
  return e
}

function describe(e) {
  if (e.all || (e.main === undefined && e.subs === undefined && !e.bots)) return 'الكل'
  const parts = []
  if (e.main) parts.push('الأساسي')
  if (e.subs) parts.push('كل المنصّبين')
  const nums = Object.keys(e.bots || {}).filter(k => e.bots[k])
  if (nums.length) parts.push('بوتات: ' + nums.join(', '))
  return parts.join(' + ') || '—'
}

// يفصل كلمات الاختيار عن باقي النص (رابط/معرف)
function parseArgs(text) {
  let rest = String(text || '').trim()
  const scope = { all: false, main: false, subs: false, bots: [] }
  let any = false
  rest = rest.split(/\s+/).filter(tok => {
    if (/^(الكل|all)$/i.test(tok)) { scope.all = true; any = true; return false }
    if (/^(الاساسي|الأساسي|اساسي|main)$/i.test(tok)) { scope.main = true; any = true; return false }
    if (/^(المنصبين|المنصّبين|منصبين|subs?)$/i.test(tok)) { scope.subs = true; any = true; return false }
    // رقم بوت منصّب (حتى 15 رقم). معرف الجروب 16 رقم أو أكتر أو فيه @g.us / -
    if (/^\+?\d{8,15}$/.test(tok)) { scope.bots.push(tok.replace(/\D/g, '')); any = true; return false }
    return true
  }).join(' ')
  return { scope, any, rest }
}

async function resolveGroup(conn, m, text) {
  const t = String(text || '').trim()

  const code = t.match(/chat\.whatsapp\.com\/([A-Za-z0-9_-]{10,})/i)?.[1]
  if (code) {
    const info = await conn.groupGetInviteInfo(code)
    return { jid: info.id, name: info.subject || '' }
  }

  const idm = t.match(/\b(\d{16,}(?:-\d{6,})?)(?:@g\.us)?\b/) || t.match(/\b(\d{10,}-\d{6,})(?:@g\.us)?\b/)
  if (idm) {
    const jid = `${idm[1]}@g.us`
    const meta = await conn.groupMetadata(jid).catch(() => null)
    return { jid, name: meta?.subject || '' }
  }

  if (m.isGroup) {
    const meta = await conn.groupMetadata(m.chat).catch(() => null)
    return { jid: m.chat, name: meta?.subject || '' }
  }
  return null
}

const handler = async (m, { conn, text, command }) => {
  // الأوامر دي بيتعامل معاها البوت الأساسي بس (عشان المنصّبين مايردوش معاه)
  if (global.conn?.user?.jid && conn?.user?.jid && !isMainConn(conn)) return

  const list = store()
  const reply = (t, to = m.chat) => conn.sendMessage(to, { text: t }, to === m.chat ? { quoted: m } : {}).catch(() => {})

  // 📋 القائمة
  if (command === 'بانشات_قائمة') {
    const items = Object.entries(list)
    return reply(items.length
      ? `🚫 *الجروبات المتجاهَلة (${items.length})*\n\n` + items.map(([jid, v], i) => `${i + 1}. ${v?.name || 'بدون اسم'}\n   ${jid}\n   🔇 ساكت: ${describe(v)}`).join('\n')
      : '✅ مفيش جروبات متجاهَلة')
  }

  const unban = command === 'بانشاتفك'
  const { scope, any, rest } = parseArgs(text)

  let target = null
  try { target = await resolveGroup(conn, m, rest) }
  catch (e) { return reply(`❌ مقدرتش أجيب بيانات الجروب: ${e?.message || e}`) }

  if (!target) {
    return reply(`🚫 *بانشات*\n\n• .بانشات ← المنصّبين بس يسكتوا\n• .بانشات الكل ← الكل\n• .بانشات الاساسي ← الأساسي بس\n• .بانشات <رقم البوت> ← بوت معيّن\n• ضيف رابط الجروب أو معرفه لو مش جواه\n• فك: .بانشاتفك [نفس الاختيارات]\n• القائمة: .بانشات_قائمة`)
  }

  // لو الأساسي نفسه هيتجاهل الجروب ده: الرد بيتبعت خاص (الجروب مبيشوفش أي رد)
  const mainSilenced = scope.all || scope.main
  const inTarget = m.isGroup && target.jid === m.chat
  const say = t => reply(t, inTarget && (mainSilenced || unban) ? m.sender : m.chat)

  const e = list[target.jid]

  if (unban) {
    if (!e) return say('ℹ️ الجروب ده مش متجاهَل أصلاً')
    if (!any) delete list[target.jid]                   // من غير اختيار: شيل كل حاجة
    else {
      normalize(e)
      if (e.all && !scope.all) { e.all = false; e.main = true; e.subs = true }   // "الكل" يتفكّك لأساسي + منصّبين عشان نفك جزء بس
      if (scope.all) { e.all = false; e.main = false; e.subs = false; e.bots = {} }
      if (scope.main) e.main = false
      if (scope.subs) { e.subs = false; e.bots = {} }
      for (const n of scope.bots) delete e.bots[n]
      if (!e.all && !e.main && !e.subs && !Object.keys(e.bots).length) delete list[target.jid]
    }
    await global.db.write?.().catch(() => {})
    const left = list[target.jid]
    return say(`♻️ *تم التعديل*\n${target.name || target.jid}\n` + (left ? `لسه ساكت: ${describe(left)}` : 'كل البوتات هترد فيه تاني.'))
  }

  // بانشات: من غير اختيار = المنصّبين
  const sc = any ? scope : { all: false, main: false, subs: true, bots: [] }
  const cur = normalize(e || { name: target.name, at: Date.now() , all: false })
  cur.name = target.name || cur.name
  if (sc.all) cur.all = true
  if (sc.main) cur.main = true
  if (sc.subs) cur.subs = true
  for (const n of sc.bots) cur.bots[n] = true
  list[target.jid] = cur
  await global.db.write?.().catch(() => {})
  return say(`🚫 *تم التجاهل*\n${target.name || target.jid}\n${target.jid}\n\n🔇 ساكت: ${describe(cur)}\n` +
    (cur.all || cur.main ? '\nللرجوع: .بانشاتفك من الخاص أو من جروب تاني.' : '\nللرجوع: .بانشاتفك (من الجروب نفسه).'))
}

handler.help = ['بانشات', 'بانشاتفك', 'بانشات_قائمة']
handler.tags = ['owner']
handler.command = ['بانشات', 'بانشاتفك', 'بانشات_قائمة']
handler.rowner = true

export default handler