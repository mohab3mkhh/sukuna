// plugins/اكس_او.js
// ❌⭕ لعبة إكس أو داخل واتساب (من غير أي مكتبات خارجية)
//   .اكس_او        ← ضد البوت
//   .اكس_او 2      ← لاعبين: أنت ❌ وأول واحد تاني يلعب بيبقى ⭕
//   .اكس_او وقف    ← إنهاء اللعبة
// الاختيار بيتم من قايمة الخانات الفاضية.

import { sendList } from '../lib/buttons.js'

const FOOTER = '⛩️ SUKUNA BOT ⛩️'
const NUM = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣']
const WINS = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]]
const GAME_TTL = 15 * 60_000

if (!global.xoGames) global.xoGames = new Map()   // chat → game

const norm = j => String(j || '').split('@')[0].split(':')[0]
const mark = v => (v === 'X' ? '❌' : v === 'O' ? '⭕' : null)

function winner(b) {
  for (const [a, c, d] of WINS) if (b[a] && b[a] === b[c] && b[a] === b[d]) return { p: b[a], line: [a, c, d] }
  return b.every(Boolean) ? { p: 'D', line: [] } : null
}

function drawBoard(b, line = []) {
  let out = ''
  for (let r = 0; r < 3; r++) {
    out += b.slice(r * 3, r * 3 + 3).map((v, i) => mark(v) || NUM[r * 3 + i]).join('  ') + '\n'
  }
  return out.trim()
}

// البوت: يكسب لو يقدر، يمنع خسارته، المركز، زاوية، أي خانة
function botMove(b) {
  const free = b.map((v, i) => (v ? -1 : i)).filter(i => i >= 0)
  for (const who of ['O', 'X']) {
    for (const i of free) { const t = [...b]; t[i] = who; if (winner(t)?.p === who) return i }
  }
  if (!b[4]) return 4
  const corners = [0, 2, 6, 8].filter(i => !b[i])
  if (corners.length) return corners[Math.floor(Math.random() * corners.length)]
  return free[Math.floor(Math.random() * free.length)]
}

async function sendBoard(conn, m, g, usedPrefix, note = '') {
  const turnName = g.turn === 'X' ? '❌' : '⭕'
  const who = g.mode === 'bot' ? (g.turn === 'X' ? 'دورك' : 'دور البوت') : `دور ${turnName}`
  const text = `❌⭕ *إكس أو* ${g.mode === 'bot' ? '(ضد البوت)' : '(لاعبين)'}\n\n${drawBoard(g.board)}\n\n${note ? note + '\n' : ''}${who} ${turnName}\nاختار خانة من القايمة 👇`
  const rows = g.board.map((v, i) => (v ? null : { header: `خانة ${i + 1}`, title: `${NUM[i]}  خانة رقم ${i + 1}`, description: 'اضغط للعب هنا', id: `${usedPrefix}xoplay ${i + 1}` })).filter(Boolean)
  await sendList(conn, m.chat, {
    text, footer: FOOTER, title: '❌⭕ إكس أو', buttonText: '「 اختار الخانة 」',
    sections: [{ title: 'الخانات الفاضية', highlight_label: 'SUKUNA BOT', rows }], quoted: m
  })
}

const handler = async (m, { conn, args, usedPrefix = '.', command }) => {
  const reply = t => conn.sendMessage(m.chat, { text: `${t}\n\n> ${FOOTER}` }, { quoted: m })
  const me = norm(m.sender)
  let g = global.xoGames.get(m.chat)
  if (g && Date.now() - g.ts > GAME_TTL) { global.xoGames.delete(m.chat); g = null }

  // ───── لعب خانة ─────
  if (/^xoplay$/i.test(command)) {
    if (!g) return reply('⌛ مفيش لعبة شغالة. ابدأ بـ *' + usedPrefix + 'اكس_او*')
    const idx = parseInt(args?.[0]) - 1
    if (!(idx >= 0 && idx < 9)) return
    if (g.board[idx]) return reply('❌ الخانة دي مشغولة.')

    // تحديد اللاعب
    if (g.mode === 'bot') {
      if (me !== g.x) return reply('⛔ اللعبة دي مش بتاعتك، ابدأ لعبتك بعد ما تخلص.')
    } else {
      if (g.turn === 'X') { if (me !== g.x) return reply('⛔ دلوقتي دور ❌.') }
      else {
        if (!g.o) { if (me === g.x) return reply('⛔ دلوقتي دور ⭕.'); g.o = me }
        else if (me !== g.o) return reply('⛔ دلوقتي دور ⭕.')
      }
    }

    g.ts = Date.now()
    g.board[idx] = g.turn
    let w = winner(g.board)

    if (!w && g.mode === 'bot') {
      g.board[botMove(g.board)] = 'O'
      w = winner(g.board)
    } else if (!w) g.turn = g.turn === 'X' ? 'O' : 'X'

    if (w) {
      global.xoGames.delete(m.chat)
      const res = w.p === 'D' ? '🤝 تعادل!'
        : g.mode === 'bot' ? (w.p === 'X' ? '🎉 كسبت!' : '🤖 البوت كسب!')
        : `🏆 الفايز: ${mark(w.p)}`
      return reply(`❌⭕ *إكس أو*\n\n${drawBoard(g.board)}\n\n${res}\nللعب تاني: *${usedPrefix}اكس_او*`)
    }
    return sendBoard(conn, m, g, usedPrefix)
  }

  // ───── إنهاء ─────
  if (/^(وقف|stop|الغاء)$/i.test(args?.[0] || '')) {
    if (!g) return reply('مفيش لعبة شغالة.')
    global.xoGames.delete(m.chat)
    return reply('🛑 اتوقفت اللعبة.')
  }

  // ───── لعبة جديدة / عرض الحالية ─────
  if (g) return sendBoard(conn, m, g, usedPrefix, '▶️ فيه لعبة شغالة بالفعل:')
  const mode = String(args?.[0] || '') === '2' ? '2p' : 'bot'
  g = { mode, board: Array(9).fill(''), turn: 'X', x: me, o: null, ts: Date.now() }
  global.xoGames.set(m.chat, g)
  return sendBoard(conn, m, g, usedPrefix, mode === 'bot' ? 'أنت ❌ والبوت ⭕' : 'اللاعب الأول ❌، وأول واحد تاني يلعب بيبقى ⭕')
}

handler.command = /^(اكس_او|اكس-او|xo|ttt|xoplay)$/i
handler.help = ['اكس_او']
handler.tags = ['game']
export default handler