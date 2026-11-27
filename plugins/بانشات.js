// plugins/بانشات.js
// 🚫 .بانشات → البوت اللي بتكتبله الأمر *هو بس* يتجاهل الجروب (مايقراش ولا يرد). باقي البوتات بتتكلم عادي.
//
// ✅ الطريقة: كلّم البوت اللي عايزه يسكت في الخاص واكتب:
//     .بانشات https://chat.whatsapp.com/XXXXXXXX        ← برابط الجروب
//     .بانشات 120363xxxxxxxxxxxx@g.us                      ← بمعرف الجروب (أو الأرقام بس)
//     (لو كتبتها جوه الجروب نفسه: كل بوت فيه بيسمعها هيتجاهله)
// ♻️ .بانشاتفك <رابط أو معرف>        ← البوت اللي كلمته يرجع يتكلم في الجروب ده
//     .بانشاتفك الكل <رابط أو معرف>  ← يرجّع كل البوتات للجروب
// 📋 .بانشات_قائمة                    ← الجروبات اللي البوت ده متجاهلها
//     .بانشات_قائمة الكل              ← كل الجروبات وكل بوت ساكت فين
//
// التنفيذ: الملف ده بيفلتر رسايل الجروب المتجاهَل من أحداث كل بوت لوحده (من غير تعديل في index.js/handler.js).
// global.isIgnoredGroup(jid) القديمة لسه شغالة: الجروبات اللي اتعملها بانشات بالنسخة القديمة بتفضل متجاهلة للكل.

const isGroupJid = j => typeof j === 'string' && j.endsWith('@g.us')
const numOf = j => String(j || '').split('@')[0].split(':')[0]
const botNum = conn => numOf(conn?.user?.jid || conn?.user?.id)

const entryOf = jid => global.db?.data?.ignoredGroups?.[jid]

// البوت ده متجاهل الجروب ده؟
function ignoredFor(jid, conn) {
  if (!isGroupJid(jid)) return false
  const e = entryOf(jid)
  if (!e) return false
  if (!e.bots) return true                    // سجل قديم = كل البوتات
  return !!conn && !!e.bots[botNum(conn)]
}

// ✅ لـ index.js / handler.js القديمة: بدون بوت = بتتجاهل بس الجروبات اللي متجاهَلة للكل (السجلات القديمة)
global.isIgnoredGroup = (jid, conn) => ignoredFor(jid, conn)

/* ───────── فلتر الأحداث لكل بوت ───────── */
function patchConn(conn) {
  const ev = conn?.ev
  if (!ev || ev.__bnPatched || typeof ev.emit !== 'function') return
  const orig = ev.emit.bind(ev)
  ev.emit = (event, data) => {
    try {
      if (event === 'messages.upsert' && Array.isArray(data?.messages)) {
        const kept = data.messages.filter(msg => !ignoredFor(msg?.key?.remoteJid, conn))
        if (kept.length !== data.messages.length) {
          if (!kept.length) return false
          data = { ...data, messages: kept }
        }
      }
    } catch {}
    return orig(event, data)
  }
  ev.__bnPatched = true
}

function patchAll() {
  patchConn(global.conn)
  for (const c of global.conns || []) patchConn(c)
}
patchAll()
if (global.__bnTimer) clearInterval(global.__bnTimer)
global.__bnTimer = setInterval(patchAll, 3000)   // بيلحق أي اتصال جديد (إعادة اتصال / بوت منصّب جديد)
global.__bnTimer.unref?.()

/* ───────── الأمر ───────── */
const store = () => {
  const d = global.db.data
  if (!d.ignoredGroups) d.ignoredGroups = {}
  return d.ignoredGroups
}

async function resolveGroup(conn, m, text) {
  const t = String(text || '').trim()

  const code = t.match(/chat\.whatsapp\.com\/([A-Za-z0-9_-]{10,})/i)?.[1]
  if (code) {
    const info = await conn.groupGetInviteInfo(code)
    return { jid: info.id, name: info.subject || '' }
  }

  const idm = t.match(/\b(\d{10,}(?:-\d{6,})?)(?:@g\.us)?\b/)
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
  const list = store()
  const me = botNum(conn)
  const reply = (t, to = m.chat) => conn.sendMessage(to, { text: t }, to === m.chat ? { quoted: m } : {}).catch(() => {})
  const allFlag = /(^|\s)(الكل|all)(\s|$)/i.test(String(text || ''))
  const cleanText = String(text || '').replace(/(^|\s)(الكل|all)(?=\s|$)/gi, ' ').trim()

  // 📋 القائمة
  if (command === 'بانشات_قائمة') {
    const rows = Object.entries(list)
      .map(([jid, v]) => ({ jid, v, bots: !v.bots ? ['الكل'] : Object.keys(v.bots).filter(k => v.bots[k]) }))
      .filter(r => allFlag || !r.v.bots || r.v.bots?.[me])
    return reply(rows.length
      ? `🚫 *الجروبات المتجاهَلة${allFlag ? ' (كل البوتات)' : ' للبوت ده'} (${rows.length})*\n\n` +
        rows.map((r, i) => `${i + 1}. ${r.v?.name || 'بدون اسم'}\n   ${r.jid}${allFlag ? `\n   🔇 ساكت: ${r.bots.join(', ')}` : ''}`).join('\n')
      : '✅ مفيش جروبات متجاهَلة')
  }

  const unban = command === 'بانشاتفك'

  let target = null
  try { target = await resolveGroup(conn, m, cleanText) }
  catch (e) { return reply(`❌ مقدرتش أجيب بيانات الجروب: ${e?.message || e}`) }

  if (!target) {
    return reply(`🚫 *بانشات*\n\nكلّم البوت اللي عايزه يسكت في الخاص:\n• .بانشات <رابط الجروب>\n• .بانشات <معرف الجروب>\n• فك: .بانشاتفك <رابط أو معرف> (أو "الكل" لكل البوتات)\n• القائمة: .بانشات_قائمة`)
  }

  // لو الأمر اتكتب جوه الجروب المتجاهَل: الرد بيتبعت خاص (الجروب مبيشوفش أي رد)
  const inTarget = m.isGroup && target.jid === m.chat
  const say = t => reply(t, inTarget ? m.sender : m.chat)
  const e = list[target.jid]

  if (unban) {
    if (!e) return say('ℹ️ الجروب ده مش متجاهَل أصلاً')
    if (allFlag) delete list[target.jid]
    else {
      if (!e.bots) {                      // سجل قديم (للكل): نحوّله لقايمة بوتات بدل ما نمسحه كله
        const known = [botNum(global.conn), ...(global.conns || []).map(botNum)].filter(Boolean)
        e.bots = Object.fromEntries(known.map(n => [n, true]))
      }
      delete e.bots[me]
      if (!Object.keys(e.bots).length) delete list[target.jid]
    }
    await global.db.write?.().catch(() => {})
    return say(`♻️ *تم الرجوع*\n${target.name || target.jid}\n${allFlag ? 'كل البوتات' : 'البوت ده'} هيرد فيه تاني.`)
  }

  const cur = e || { name: target.name, at: Date.now(), bots: {} }
  if (!cur.bots) { say('ℹ️ الجروب ده متجاهَل بالفعل لكل البوتات'); return }
  cur.name = target.name || cur.name
  cur.bots[me] = true
  list[target.jid] = cur
  await global.db.write?.().catch(() => {})
  return say(`🚫 *تم التجاهل (البوت ده بس)*\n${target.name || target.jid}\n${target.jid}\n\n🔇 البوت ده مش هيقرا ولا يرد على أي حاجة في الجروب.\nباقي البوتات بتتكلم عادي.\nللرجوع: .بانشاتفك <رابط أو معرف> (من الخاص).`)
}

handler.help = ['بانشات', 'بانشاتفك', 'بانشات_قائمة']
handler.tags = ['owner']
handler.command = ['بانشات', 'بانشاتفك', 'بانشات_قائمة']
handler.rowner = true

export default handler