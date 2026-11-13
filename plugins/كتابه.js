/**
 * plugins/مسابقه.js — المسابقة الجماعية (v2)
 * ✦ لوبي بأزرار: انضم / ابدأ / عدد الجولات / المتصدرين / إنهاء
 * ✦ جولات تلقائية (السؤال التالي بعد ثواني) + ختام بمنصة الفائزين
 * ✦ نقاط حسب السرعة + تلميح + تخطي + "اقتربت" بريأكشن بدل سبام
 * ✦ الأوامر القديمة شغالة: .ابدا_مسابقه .دخول .ابدا .انهاء + .مسابقه
 */

import fs from 'fs'
import similarity from 'similarity'
import { sendButtons, btn } from '../lib/buttons.js'

const FILE          = './src/game/كت.json'
const TIMEOUT       = 60_000
const NEXT_DELAY    = 5_000
const DEFAULT_ROUNDS = 10
const BASE_POINTS   = 10
const SPEED_BONUS   = 5
const HINT_FACTOR   = 0.5
const EXP_PER_WIN   = 100
const CLOSE_THRESHOLD = 0.72
const FOOTER        = '⛩️ SUKUNA BOT ⛩️'

const LINE = '*⊏─๋︩︪─๋︩︪─๋︩︪─๋︩︪─═͜⊐❪⛩️❫⊏═─๋︩︪─๋︩︪─๋︩︪─๋︩︪─๋︩︪─⊐*'
const BOX  = '*❍━━━══━━❪⛩️❫━━══━━━❍*'
const medals = ['🥇', '🥈', '🥉']

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

const games = (conn) => (conn.quizGames ||= {})

const loadQuestions = () => {
  const data = JSON.parse(fs.readFileSync(FILE, 'utf8'))
  const valid = (Array.isArray(data) ? data : []).filter(q => q?.question && q.response != null)
  if (!valid.length) throw new Error('empty')
  return valid
}

async function sendBtn(conn, chat, opts, quoted) {
  try {
    return await sendButtons(conn, chat, opts, quoted)
  } catch (e) {
    console.error('[مسابقه] buttons failed:', e?.message || e)
    return conn.sendMessage(chat, { text: opts.text, mentions: opts.mentions || [] }, { quoted })
  }
}

const react = (conn, m, emoji) => conn.sendMessage(m.chat, { react: { text: emoji, key: m.key } }).catch(() => {})

const ranking = (g) => Object.entries(g.players)
  .map(([jid, p]) => ({ jid, ...p }))
  .sort((a, b) => b.points - a.points)

function boardText(g, limit = 10) {
  const list = ranking(g).slice(0, limit)
  if (!list.length) return { text: '_مفيش مشاركين_', mentions: [] }
  const text = list.map((p, i) => `${medals[i] || `${i + 1}.`} *${p.name}* (@${num(p.jid)}) ⇇ ${p.points} نقطة`).join('\n')
  return { text, mentions: list.map(p => p.jid) }
}

const canControl = (g, m, isAdmin, isROwner) => isROwner || isAdmin || m.sender === g.owner

// ───────────── اللوبي ─────────────
function lobbyButtons() {
  return [
    btn.reply('✅ انضم', 'quiz:join'),
    btn.reply('▶️ ابدأ المسابقة', 'quiz:begin'),
    btn.list('⚙️ خيارات', [
      {
        title: 'عدد الجولات (للأدمن)',
        rows: [5, 10, 15, 20].map(n => ({ title: `${n} جولات`, description: 'عدد أسئلة المسابقة', id: `quiz:rounds:${n}` }))
      },
      {
        title: 'أخرى',
        rows: [
          { title: '🏆 المتصدرين', description: 'ترتيب المشاركين', id: 'quiz:top' },
          { title: '🏁 إنهاء المسابقة', description: 'للأدمن أو اللي بدأها', id: 'quiz:end' }
        ]
      }
    ])
  ]
}

function lobbyText(g) {
  const names = Object.values(g.players).map(p => `• ${p.name}`).join('\n') || '_لسه محدش انضم_'
  return `${LINE}\n*｢✨｣⇇ تم فتح المسابقة!*\n` +
    `*｢🎯｣⇇ الجولات↜❪${g.rounds}❫*\n` +
    `*｢🕛｣⇇ وقت السؤال↜❪${TIMEOUT / 1000} ثانية❫*\n` +
    `*｢👥｣⇇ المشاركين (${Object.keys(g.players).length}):*\n${names}\n${LINE}\n` +
    `_اضغط "انضم" وبعدها صاحب المسابقة يضغط "ابدأ"_\n${BOX}`
}

async function createLobby(conn, m) {
  const G = games(conn)
  if (G[m.chat]) {
    return sendBtn(conn, m.chat, {
      text: `${BOX}\n*｢❗｣⇇ توجد مسابقة بالفعل*\n${BOX}`,
      footer: FOOTER,
      buttons: [btn.reply('🏆 المتصدرين', 'quiz:top'), btn.reply('🏁 إنهاء', 'quiz:end')]
    }, m)
  }
  const g = { owner: m.sender, players: {}, rounds: DEFAULT_ROUNDS, round: 0, current: null, used: new Set(), next: null }
  g.players[m.sender] = { name: (m.pushName || num(m.sender)).slice(0, 20), points: 0 }
  G[m.chat] = g

  await sendBtn(conn, m.chat, {
    title: '🧠 المسابقة الجماعية',
    subtitle: `من تنظيم @${num(m.sender)}`,
    text: lobbyText(g),
    footer: FOOTER,
    buttons: lobbyButtons(),
    mentions: [m.sender]
  }, m)
}

function joinPlayer(g, m, nickname) {
  const exists = !!g.players[m.sender]
  const name = (nickname || g.players[m.sender]?.name || m.pushName || num(m.sender)).slice(0, 20)
  g.players[m.sender] = { name, points: g.players[m.sender]?.points || 0 }   // ما يصفّرش النقاط
  return { exists, name }
}

// ───────────── الأسئلة ─────────────
async function nextQuestion(conn, chat) {
  const g = games(conn)[chat]
  if (!g || g.current) return
  clearTimeout(g.next)

  if (g.round >= g.rounds) return endGame(conn, chat, g, 'done')

  let all
  try { all = loadQuestions() } catch {
    return conn.sendMessage(chat, { text: '*┇⌗╎ملف الأسئلة غير موجود أو فاضي*' })
  }

  let pool = all.map((_, i) => i).filter(i => !g.used.has(i))
  if (!pool.length) { g.used.clear(); pool = all.map((_, i) => i) }
  const idx = pool[Math.floor(Math.random() * pool.length)]
  g.used.add(idx)
  const q = all[idx]

  g.round++
  const qid = Math.random().toString(36).slice(2, 6)
  const cur = { qid, q, answer: String(q.response), startedAt: Date.now(), hintUsed: false, closed: new Set(), timer: null, msg: null }
  g.current = cur

  const text =
    `*｢❖｣⇇ السؤال ${g.round}/${g.rounds}↶*\n> ❀ ${q.question} ❀\n${LINE}\n` +
    `*｢🕛｣⇇ الوقت↜❪${TIMEOUT / 1000} ثانية❫*\n` +
    `*｢⚡｣⇇ كل ما جاوبت أسرع، نقاطك أكتر*\n` +
    `_اكتب إجابتك في الشات (للمنضمين فقط)_\n${BOX}`

  cur.msg = await sendBtn(conn, chat, {
    title: '🧠 المسابقة',
    subtitle: `الجولة ${g.round} من ${g.rounds}`,
    text,
    footer: FOOTER,
    buttons: [
      btn.reply('💡 تلميح', `quiz:hint:${qid}`),
      btn.reply('⏭️ تخطي', `quiz:skip:${qid}`),
      btn.reply('🏆 المتصدرين', 'quiz:top')
    ]
  })

  cur.timer = setTimeout(() => closeQuestion(conn, chat, g, cur, 'timeout'), TIMEOUT)
}

async function closeQuestion(conn, chat, g, cur, how, winner) {
  if (games(conn)[chat] !== g || g.current !== cur) return
  clearTimeout(cur.timer)
  g.current = null

  const last = g.round >= g.rounds
  const head =
    how === 'timeout' ? '*｢🌀｣⇇ انتهى الوقت💔*' :
    how === 'skip'    ? '*｢⏭️｣⇇ تم تخطي السؤال*' : ''

  if (how === 'win') return   // رسالة الفوز اتبعتت من winQuestion

  await sendBtn(conn, chat, {
    title: how === 'timeout' ? '⌛ انتهى الوقت' : '⏭️ تم التخطي',
    text: `${LINE}\n${head}\n*｢🍡｣⇇ الإجابة↜❪${cur.answer}❫*\n${LINE}\n` +
      (last ? '_دي كانت آخر جولة..._' : `_السؤال التالي بعد ${NEXT_DELAY / 1000} ثواني_`),
    footer: FOOTER,
    buttons: [btn.reply('⏭️ التالي الآن', 'quiz:next'), btn.reply('🏆 المتصدرين', 'quiz:top'), btn.reply('🏁 إنهاء', 'quiz:end')]
  }, cur.msg)

  g.next = setTimeout(() => nextQuestion(conn, chat), NEXT_DELAY)
}

async function winQuestion(conn, m, g, cur) {
  clearTimeout(cur.timer)
  g.current = null

  const remaining = Math.max(0, 1 - (Date.now() - cur.startedAt) / TIMEOUT)
  let pts = BASE_POINTS + Math.round(SPEED_BONUS * remaining)
  if (cur.hintUsed) pts = Math.max(1, Math.round(pts * HINT_FACTOR))

  const p = g.players[m.sender]
  p.points += pts

  const db = global.db?.data?.users
  if (db) {
    if (!db[m.sender]) db[m.sender] = { exp: 0 }
    db[m.sender].exp = (db[m.sender].exp || 0) + EXP_PER_WIN
  }

  const last = g.round >= g.rounds
  await sendBtn(conn, m.chat, {
    title: '✅ إجابة صحيحة',
    text:
      `${LINE}\n*｢✅｣⇇ إجابة صحيحة من:* @${num(m.sender)} (${p.name})\n` +
      `*｢🧠｣⇇ الجواب:* ${cur.answer}\n` +
      `*｢⚜️｣⇇ النقاط:* +${pts}${cur.hintUsed ? ' _(بتلميح)_' : ''}\n` +
      `*｢✨｣⇇ مجموعه:* ${p.points} نقطة\n${LINE}\n` +
      (last ? '_دي كانت آخر جولة..._' : `_السؤال التالي بعد ${NEXT_DELAY / 1000} ثواني_`),
    footer: FOOTER,
    buttons: [btn.reply('⏭️ التالي الآن', 'quiz:next'), btn.reply('🏆 المتصدرين', 'quiz:top'), btn.reply('🏁 إنهاء', 'quiz:end')],
    mentions: [m.sender]
  }, cur.msg || m)

  g.next = setTimeout(() => nextQuestion(conn, m.chat), NEXT_DELAY)
}

async function endGame(conn, chat, g, reason) {
  clearTimeout(g.current?.timer)
  clearTimeout(g.next)
  delete games(conn)[chat]

  const { text, mentions } = boardText(g)
  await sendBtn(conn, chat, {
    title: reason === 'done' ? '🏁 انتهت المسابقة' : '🛑 تم إنهاء المسابقة',
    text: `${LINE}\n*｢🏁｣⇇ ${reason === 'done' ? 'انتهت المسابقة!' : 'تم إنهاء المسابقة'}*\n\n*｢🏆｣⇇ النتيجة النهائية*\n${text}\n${LINE}`,
    footer: FOOTER,
    buttons: [btn.reply('🔁 مسابقة جديدة', 'quiz:new')],
    mentions
  })
}

// ───────────── الأوامر ─────────────
const handler = async (m, { conn, command, args, isAdmin, isROwner }) => {
  const chat = m.chat
  const g = games(conn)[chat]

  if (command === 'ابدا_مسابقه' || command === 'مسابقه' || command === 'مسابقة') {
    return createLobby(conn, m)
  }

  if (command === 'دخول') {
    if (!g) return m.reply('❗ لا توجد مسابقة مفعلة. اكتب ".مسابقه" أولاً.')
    const { exists, name } = joinPlayer(g, m, args.join(' ').trim())
    return m.reply(exists ? `✅ تم تحديث لقبك: ${name}` : `✅ تم تسجيلك بلقب: ${name}`)
  }

  if (command === 'ابدا') {
    if (!g) return m.reply('❗ لا توجد مسابقة مفعلة.')
    if (!canControl(g, m, isAdmin, isROwner)) return m.reply('❗ فقط من بدأ المسابقة أو الأدمن يقدر يبدأ الأسئلة.')
    if (g.current) return m.reply('❗ يوجد سؤال قيد الإجابة.')
    return nextQuestion(conn, chat)
  }

  if (command === 'انهاء') {
    if (!g) return m.reply('❗ لا توجد مسابقة مفعلة.')
    if (!canControl(g, m, isAdmin, isROwner)) return m.reply('❗ فقط من بدأ المسابقة أو الأدمن يقدر ينهيها.')
    return endGame(conn, chat, g, 'manual')
  }
}

// ───────────── الأزرار + الإجابات ─────────────
handler.before = async function (m, { conn, isAdmin, isROwner } = {}) {
  conn = conn || this
  if (!m || typeof m.text !== 'string' || !m.chat || m.fromMe) return false

  const text = m.text.trim()
  const chat = m.chat
  const g = games(conn)[chat]

  // ── ضغطات الأزرار ──
  if (text.startsWith('quiz:')) {
    const [, action, arg] = text.split(':')

    if (action === 'new') { await createLobby(conn, m); return true }
    if (!g) { await react(conn, m, '⌛'); return true }

    const ctl = canControl(g, m, isAdmin, isROwner)

    if (action === 'join') {
      const { exists, name } = joinPlayer(g, m)
      if (exists) { await react(conn, m, '✅'); return true }
      await conn.sendMessage(chat, {
        text: `*｢✅｣⇇ انضم* @${num(m.sender)} *بلقب* ${name}\n*｢👥｣⇇ المشاركين:* ${Object.keys(g.players).length}`,
        mentions: [m.sender]
      }, { quoted: m })
      return true
    }

    if (action === 'rounds') {
      if (!ctl) { await conn.sendMessage(chat, { text: '*｢⛔｣⇇ ده للأدمن أو اللي بدأ المسابقة بس*' }, { quoted: m }); return true }
      if (g.round > 0) { await react(conn, m, '🚫'); return true }
      g.rounds = Math.max(1, Math.min(50, Number(arg) || DEFAULT_ROUNDS))
      await conn.sendMessage(chat, { text: `*｢🎯｣⇇ تم ضبط عدد الجولات:* ${g.rounds}` }, { quoted: m })
      return true
    }

    if (action === 'begin') {
      if (!ctl) { await conn.sendMessage(chat, { text: '*｢⛔｣⇇ ده للأدمن أو اللي بدأ المسابقة بس*' }, { quoted: m }); return true }
      if (g.round > 0 || g.current) { await react(conn, m, '🚫'); return true }
      await nextQuestion(conn, chat)
      return true
    }

    if (action === 'next') {
      if (!ctl) { await conn.sendMessage(chat, { text: '*｢⛔｣⇇ ده للأدمن أو اللي بدأ المسابقة بس*' }, { quoted: m }); return true }
      if (g.current) { await react(conn, m, '🚫'); return true }
      await nextQuestion(conn, chat)
      return true
    }

    if (action === 'top') {
      const { text: t, mentions } = boardText(g)
      await conn.sendMessage(chat, { text: `${LINE}\n*｢🏆｣⇇ المتصدرين*\n\n${t}\n${LINE}`, mentions }, { quoted: m })
      return true
    }

    if (action === 'end') {
      if (!ctl) { await conn.sendMessage(chat, { text: '*｢⛔｣⇇ ده للأدمن أو اللي بدأ المسابقة بس*' }, { quoted: m }); return true }
      await endGame(conn, chat, g, 'manual')
      return true
    }

    if (action === 'hint' || action === 'skip') {
      const cur = g.current
      if (!cur || cur.qid !== arg) { await react(conn, m, '⌛'); return true }

      if (action === 'hint') {
        if (cur.hintUsed) { await react(conn, m, '💡'); return true }
        cur.hintUsed = true
        const shown = [...cur.answer].map((ch, i) => (i === 0 ? ch : (ch === ' ' ? '  ' : '_'))).join(' ')
        await conn.sendMessage(chat, {
          text: `*｢💡｣⇇ تلميح*\n${shown}\n_عدد الحروف: ${[...cur.answer].filter(c => c !== ' ').length} — النقاط -50%_`
        }, { quoted: cur.msg || m })
        return true
      }

      if (!ctl) { await conn.sendMessage(chat, { text: '*｢⛔｣⇇ ده للأدمن أو اللي بدأ المسابقة بس*' }, { quoted: m }); return true }
      await closeQuestion(conn, chat, g, cur, 'skip')
      return true
    }

    return true
  }

  // ── إجابة بالكتابة ──
  const cur = g?.current
  if (!cur || !g.players[m.sender] || !text) return false
  if (/^[.!#/]/.test(text) || text.length > 80) return false   // أوامر أو رسائل طويلة مش إجابات

  const userAnswer = norm(text)
  const correct = norm(cur.answer)

  if (userAnswer === correct) {
    await winQuestion(conn, m, g, cur)
    return false
  }

  if (similarity(userAnswer, correct) >= CLOSE_THRESHOLD && !cur.closed.has(m.sender)) {
    cur.closed.add(m.sender)
    await react(conn, m, '🔥')   // "اقتربت" — بريأكشن بدل رسالة
  }
  return false
}

handler.help    = ['مسابقه']
handler.tags    = ['game']
handler.command = /^(ابدا_مسابقه|مسابقه|مسابقة|دخول|ابدا|انهاء)$/i
handler.group   = true

export default handler