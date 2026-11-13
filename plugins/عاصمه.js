/**
 * plugins/عاصمه.js  — تحدي العواصم (v2)
 * ✦ 4 اختيارات بأزرار + قائمة خيارات (تلميح / تخطي / متصدرين / إنهاء)
 * ✦ نقاط حسب السرعة + كومبو + لوحة متصدرين للجلسة
 * ✦ لاعب واحد = محاولة واحدة في كل سؤال، وممكن الإجابة بالكتابة كمان
 * ✦ مفيش تكرار للأسئلة لحد ما تخلص
 */

import fs from 'fs'
import { sendButtons, btn } from '../lib/buttons.js'

const FILE         = './src/game/عواصم.json'
const TIMEOUT      = 60_000
const BASE         = 500
const MAX_BONUS    = 200     // بونص السرعة
const COMBO_STEP   = 50      // بونص كل فوز متتالي (لحد 4)
const HINT_FACTOR  = 0.6     // التلميح بيخصم 40% من النقاط
const TOP_N        = 5
const FOOTER       = '⛩️ SUKUNA BOT ⛩️'

const LINE = '*⊏─๋︩︪─๋︩︪─๋︩︪─๋︩︪─═͜⊐❪⛩️❫⊏═─๋︩︪─๋︩︪─๋︩︪─๋︩︪─๋︩︪─⊐*'
const BOX  = '*❍━━━══━━❪⛩️❫━━══━━━❍*'

// ───────────── أدوات ─────────────
const num = (jid) => String(jid || '').split('@')[0].split(':')[0]

const norm = (s) => String(s ?? '')
  .toLowerCase()
  .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
  .replace(/[أإآٱ]/g, 'ا')
  .replace(/ة/g, 'ه')
  .replace(/ى/g, 'ي')
  .replace(/\s+/g, ' ')
  .trim()

const shuffle = (arr) => {
  const r = [...arr]
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]]
  }
  return r
}

const loadQuestions = () => {
  const data = JSON.parse(fs.readFileSync(FILE, 'utf8'))
  const valid = (Array.isArray(data) ? data : []).filter(q => q?.question && q.response != null)
  if (!valid.length) throw new Error('empty')
  return valid
}

const games  = (conn) => (conn.capitalGames  ||= {})
const scores = (conn, chat) => ((conn.capitalScores ||= {})[chat] ||= { round: 0, points: {}, last: null, combo: 0 })

// يبني 4 اختيارات (الإجابة + 3 مشتتات)
function buildOptions(json, all) {
  const answer = String(json.response)
  let wrong = []

  if (Array.isArray(json.choices) && json.choices.length >= 2) {
    wrong = json.choices.map(String).filter(c => norm(c) !== norm(answer))
  }
  if (wrong.length < 3) {
    const pool = [...new Set(all.map(q => String(q.response)))].filter(c => norm(c) !== norm(answer) && !wrong.includes(c))
    wrong = [...wrong, ...shuffle(pool)]
  }
  const options = shuffle([answer, ...shuffle([...new Set(wrong)]).slice(0, 3)])
  return { options, answerIdx: options.findIndex(o => o === answer) }
}

async function sendBtn(conn, chat, opts, quoted, fallbackText) {
  try {
    return await sendButtons(conn, chat, opts, quoted)
  } catch (e) {
    console.error('[عاصمه] buttons failed:', e?.message || e)
    return conn.sendMessage(chat, { text: fallbackText || opts.text, mentions: opts.mentions || [] }, { quoted })
  }
}

const react = (conn, m, emoji) => conn.sendMessage(m.chat, { react: { text: emoji, key: m.key } }).catch(() => {})

const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟']

function boardText(S) {
  const top = Object.entries(S.points).sort((a, b) => b[1] - a[1]).slice(0, TOP_N)
  if (!top.length) return { text: '*｢📭｣⇇ لسه محدش سجّل نقاط*', mentions: [] }
  const text = top.map(([jid, pts], i) => `${medals[i]} @${num(jid)} ⇇ *${pts}* نقطة`).join('\n')
  return { text, mentions: top.map(([jid]) => jid) }
}

const afterButtons = () => [
  btn.reply('▶️ سؤال جديد', 'cap:new'),
  btn.reply('🏆 المتصدرين', 'cap:top')
]

// ───────────── بدء جولة ─────────────
async function startRound(conn, m) {
  const G = games(conn)
  const chat = m.chat

  if (G[chat]) {
    return conn.sendMessage(chat, {
      text: `${BOX}\n*｢❤️｣⇇ مازال هناك سؤال هنا*\n${BOX}`
    }, { quoted: G[chat].msg || m })
  }

  let all
  try { all = loadQuestions() } catch {
    return conn.sendMessage(chat, { text: '*┇⌗╎ملف الأسئلة غير موجود أو فاضي*' }, { quoted: m })
  }

  // بدون تكرار
  const used = ((conn.capitalUsed ||= {})[chat] ||= new Set())
  let pool = all.map((_, i) => i).filter(i => !used.has(i))
  if (!pool.length) { used.clear(); pool = all.map((_, i) => i) }
  const idx = pool[Math.floor(Math.random() * pool.length)]
  used.add(idx)
  const json = all[idx]

  const { options, answerIdx } = buildOptions(json, all)
  const S = scores(conn, chat)
  S.round++

  const gid = Math.random().toString(36).slice(2, 6)
  const game = { gid, json, options, answerIdx, starter: m.sender, startedAt: Date.now(), hintUsed: false, locked: new Set(), msg: null, timer: null }
  G[chat] = game   // قبل الإرسال عشان الضغط المزدوج ما يبدأش جولتين

  const caption =
    `*｢🍭｣⇇ السؤال↶*\n> ❀ ${json.question} ❀\n${LINE}\n` +
    `*｢🎯｣⇇ الجولة↜❪${S.round}❫*\n` +
    `*｢👤｣⇇ اللاعب↜❪@${num(m.sender)}❫*\n` +
    `*｢🕛｣⇇ الوقت↜❪${TIMEOUT / 1000} ثانية❫*\n` +
    `*｢⚜️｣⇇ الجائزة↜❪حتى ${BASE + MAX_BONUS} نقطة❫*\n` +
    `*｢⚡｣⇇ كل ما جاوبت أسرع، نقاطك أكتر*\n${LINE}\n` +
    `*｢👑｣⇇ المطور: MOHAB*\n${BOX}`

  const fallback = caption + '\n\n' + options.map((c, i) => `*${i + 1}.* ${c}`).join('\n') + '\n\n_اكتب الإجابة في الشات_'

  const buttons = [
    ...options.map((c, i) => btn.reply(c.slice(0, 30), `cap:${gid}:a:${i}`)),
    btn.list('⚙️ خيارات', [{
      title: 'خيارات اللعبة',
      rows: [
        { title: '💡 تلميح', description: 'أول حرف وعدد الحروف (-40% نقاط)', id: `cap:${gid}:hint` },
        { title: '⏭️ تخطي', description: 'للأدمن أو اللي بدأ اللعبة', id: `cap:${gid}:skip` },
        { title: '🏆 المتصدرين', description: 'ترتيب اللاعبين', id: 'cap:top' },
        { title: '🛑 إنهاء اللعبة', description: 'للأدمن أو اللي بدأ اللعبة', id: `cap:${gid}:stop` }
      ]
    }])
  ]

  try {
    game.msg = await sendBtn(conn, chat, {
      title: '🌍 تحدي العواصم',
      subtitle: `الجولة ${S.round}`,
      text: caption,
      footer: FOOTER,
      buttons,
      mentions: [m.sender]
    }, m, fallback)
  } catch (e) {
    delete G[chat]
    throw e
  }

  game.timer = setTimeout(() => timeoutRound(conn, chat, game), TIMEOUT)
}

const finish = (conn, chat, game) => {
  clearTimeout(game.timer)
  if (games(conn)[chat] === game) delete games(conn)[chat]
}

async function timeoutRound(conn, chat, game) {
  if (games(conn)[chat] !== game) return
  finish(conn, chat, game)
  const S = scores(conn, chat)
  S.last = null; S.combo = 0
  await sendBtn(conn, chat, {
    title: '⌛ انتهى الوقت',
    text: `${LINE}\n*｢🌀｣⇇ انتهى الوقت💔*\n*｢🍡｣⇇ الإجابة↜❪${game.json.response}❫*\n${LINE}`,
    footer: FOOTER,
    buttons: afterButtons()
  }, game.msg).catch(() => {})
}

// ───────────── فوز ─────────────
async function winRound(conn, m, game, how) {
  const chat = m.chat
  finish(conn, chat, game)

  const S = scores(conn, chat)
  const remaining = Math.max(0, 1 - (Date.now() - game.startedAt) / TIMEOUT)
  const speed = Math.round(MAX_BONUS * remaining)

  if (S.last === m.sender) S.combo++; else { S.last = m.sender; S.combo = 1 }
  const comboBonus = Math.min(S.combo - 1, 4) * COMBO_STEP

  let pts = BASE + speed + comboBonus
  if (game.hintUsed) pts = Math.round(pts * HINT_FACTOR)

  S.points[m.sender] = (S.points[m.sender] || 0) + pts

  const user = global.db?.data?.users?.[m.sender]
  if (user) user.exp = (user.exp || 0) + pts

  await sendBtn(conn, chat, {
    title: '🎉 إجابة صحيحة',
    text:
      `${LINE}\n*｢🎉｣⇇ إجابة صحيحة!*\n` +
      `*｢👤｣⇇ الفائز:* @${num(m.sender)}\n` +
      `*｢✅｣⇇ الإجابة:* ${game.json.response}\n` +
      `*｢⚜️｣⇇ النقاط:* +${pts}${game.hintUsed ? ' _(بتلميح)_' : ''}\n` +
      `*｢⚡｣⇇ بونص السرعة:* +${speed}\n` +
      (S.combo > 1 ? `*｢🔥｣⇇ كومبو x${S.combo}:* +${comboBonus}\n` : '') +
      `*｢💰｣⇇ مجموعك:* ${S.points[m.sender]}\n${LINE}`,
    footer: FOOTER,
    buttons: afterButtons(),
    mentions: [m.sender]
  }, game.msg || m)
}

// ───────────── الأمر ─────────────
const handler = async (m, { conn }) => {
  await startRound(conn, m)
}

// ───────────── الأزرار + الإجابة بالكتابة ─────────────
handler.before = async function (m, { conn, isAdmin, isROwner } = {}) {
  conn = conn || this
  // بعض الأحداث بتنده before برسالة خام، نتجاهلها
  if (!m || typeof m.text !== 'string' || !m.chat || m.fromMe) return false

  const text = m.text.trim()
  const chat = m.chat
  const G = games(conn)
  const game = G[chat]

  // ── ضغطات الأزرار ──
  if (text.startsWith('cap:')) {
    const parts = text.split(':')

    if (parts[1] === 'new') { await startRound(conn, m); return true }

    if (parts[1] === 'top') {
      const { text: t, mentions } = boardText(scores(conn, chat))
      await conn.sendMessage(chat, { text: `${LINE}\n*｢🏆｣⇇ المتصدرين*\n\n${t}\n${LINE}`, mentions }, { quoted: m })
      return true
    }

    const [, gid, action, idx] = parts
    if (!game || game.gid !== gid) { await react(conn, m, '⌛'); return true }

    const canControl = isAdmin || isROwner || m.sender === game.starter

    if (action === 'a') {
      if (game.locked.has(m.sender)) { await react(conn, m, '🚫'); return true }
      if (Number(idx) === game.answerIdx) {
        await winRound(conn, m, game, 'button')
      } else {
        game.locked.add(m.sender)
        await conn.sendMessage(chat, {
          text: `*｢❌｣⇇ إجابة خاطئة* @${num(m.sender)}\n_مفيش محاولة تانية ليك في السؤال ده_`,
          mentions: [m.sender]
        }, { quoted: m })
      }
      return true
    }

    if (action === 'hint') {
      if (game.hintUsed) { await react(conn, m, '💡'); return true }
      game.hintUsed = true
      const ans = String(game.json.response)
      const shown = [...ans].map((ch, i) => (i === 0 ? ch : (ch === ' ' ? '  ' : '_'))).join(' ')
      await conn.sendMessage(chat, {
        text: `*｢💡｣⇇ تلميح*\n${shown}\n_عدد الحروف: ${[...ans].filter(c => c !== ' ').length} — النقاط -40%_`
      }, { quoted: game.msg || m })
      return true
    }

    if (action === 'skip' || action === 'stop') {
      if (!canControl) {
        await conn.sendMessage(chat, { text: '*｢⛔｣⇇ ده للأدمن أو اللي بدأ اللعبة بس*' }, { quoted: m })
        return true
      }
      finish(conn, chat, game)
      const S = scores(conn, chat)
      S.last = null; S.combo = 0

      if (action === 'skip') {
        await sendBtn(conn, chat, {
          title: '⏭️ تم التخطي',
          text: `${LINE}\n*｢⏭️｣⇇ تم تخطي السؤال*\n*｢🍡｣⇇ الإجابة↜❪${game.json.response}❫*\n${LINE}`,
          footer: FOOTER,
          buttons: afterButtons()
        }, game.msg || m)
      } else {
        const { text: t, mentions } = boardText(S)
        delete conn.capitalScores[chat]
        delete conn.capitalUsed?.[chat]
        await conn.sendMessage(chat, {
          text: `${LINE}\n*｢🛑｣⇇ انتهت اللعبة*\n*｢🍡｣⇇ الإجابة↜❪${game.json.response}❫*\n\n*｢🏆｣⇇ النتيجة النهائية*\n${t}\n${LINE}`,
          mentions
        }, { quoted: m })
      }
      return true
    }

    return true
  }

  // ── إجابة بالكتابة ──
  if (game && text && text.length <= 50 && !game.locked.has(m.sender) && norm(text) === norm(game.json.response)) {
    await winRound(conn, m, game, 'text')
    return true
  }

  return false
}

handler.help    = ['عاصمه']
handler.tags    = ['game']
handler.command = /^(عاصمه|عاصمة)$/i

export default handler