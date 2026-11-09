/**
 * XO Game - لعبة اكس او (متعددة الغرف)
 * - ملف واحد مستقل (مش محتاج lib)
 * - أي عدد غرف في نفس الوقت، حتى في نفس الجروب
 * - اللاعب الواحد بيكون في غرفة واحدة بس
 * - مهلة عدم نشاط: الغرفة بتتقفل لوحدها
 *
 * الأوامر:
 *   .xo            ← يدخل أول غرفة منتظرة في الشات، أو يعمل غرفة جديدة
 *   .xo جديد       ← يعمل غرفة جديدة دايماً
 *   .xo <رقم>      ← يدخل غرفة برقمها
 *   .xo قائمة      ← يعرض الغرف الموجودة في الشات
 *   .xo خروج       ← يخرج / يلغي غرفته
 *   اثناء اللعب: اكتب رقم من 1 لـ 9  |  اكتب "انسحب" للانسحاب
 */

const REWARD_XP = 4999
const IDLE_MS = 5 * 60 * 1000 // 5 دقايق بدون حركة = الغرفة تتقفل

const LINES = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6],
]
const NUM = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣']
const MARK = { X: '❎', O: '⭕' }

const tag = jid => '@' + jid.split('@')[0]

function getRooms(conn) {
    if (!conn.xoRooms) conn.xoRooms = {}
    return conn.xoRooms
}

function findRoomOf(conn, jid) {
    return Object.values(getRooms(conn)).find(r => r.players.includes(jid))
}

function newId(rooms) {
    let id
    do { id = String(Math.floor(1000 + Math.random() * 9000)) } while (rooms[id])
    return id
}

function renderBoard(board) {
    const cells = board.map((v, i) => (v ? MARK[v] : NUM[i]))
    return [cells.slice(0, 3).join(''), cells.slice(3, 6).join(''), cells.slice(6).join('')].join('\n')
}

function checkWinner(board) {
    for (const [a, b, c] of LINES) {
        if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a]
    }
    return null
}

function destroyRoom(conn, room) {
    clearTimeout(room.timer)
    delete getRooms(conn)[room.id]
}

function armTimer(conn, room) {
    clearTimeout(room.timer)
    room.timer = setTimeout(async () => {
        try {
            const mentions = room.players.filter(Boolean)
            destroyRoom(conn, room)
            await conn.sendMessage(room.chat, {
                text: `⌛ *الغرفة ${room.id}* اتقفلت بسبب عدم النشاط.`,
                mentions,
            })
        } catch (e) {
            console.error('XO TIMER ERROR:', e)
        }
    }, IDLE_MS)
}

function turnText(room) {
    const cur = room.players[room.turn]
    const sym = room.turn === 0 ? 'X' : 'O'
    return `🎮 *غرفة ${room.id}*\n\n${MARK.X} ${tag(room.players[0])}\n${MARK.O} ${tag(room.players[1])}\n\n${renderBoard(room.board)}\n\n👉 دور ${tag(cur)} ${MARK[sym]}\n_اكتب رقم الخانة (1-9) | "انسحب" للانسحاب_`
}

let handler = async (m, { conn, usedPrefix, command, text }) => {
    try {
        const rooms = getRooms(conn)
        const arg = (text || '').trim()
        const mine = findRoomOf(conn, m.sender)

        // ---- قائمة الغرف ----
        if (/^(list|قائمة|الغرف)$/i.test(arg)) {
            const inChat = Object.values(rooms).filter(r => r.chat === m.chat)
            if (!inChat.length) {
                return conn.sendMessage(m.chat, { text: `📭 مفيش غرف دلوقتي.\nاكتب *${usedPrefix}${command}* لعمل غرفة.` })
            }
            const lines = inChat.map(r =>
                r.state === 'WAITING'
                    ? `⏳ *${r.id}* — مستني لاعب (${tag(r.players[0])})`
                    : `🎮 *${r.id}* — ${tag(r.players[0])} ضد ${tag(r.players[1])}`
            )
            return conn.sendMessage(m.chat, {
                text: `📋 *الغرف الحالية:*\n\n${lines.join('\n')}\n\nللدخول: *${usedPrefix}${command} <رقم الغرفة>*`,
                mentions: inChat.flatMap(r => r.players.filter(Boolean)),
            })
        }

        // ---- خروج / إلغاء ----
        if (/^(leave|exit|delete|خروج|حذف|الغاء|إلغاء)$/i.test(arg)) {
            if (!mine) return conn.sendMessage(m.chat, { text: '❌ انت مش في أي غرفة.' })
            const others = mine.players.filter(p => p && p !== m.sender)
            destroyRoom(conn, mine)
            return conn.sendMessage(m.chat, {
                text: `🚪 ${tag(m.sender)} خرج من *الغرفة ${mine.id}* واتقفلت.`,
                mentions: [m.sender, ...others],
            })
        }

        // ---- لو اللاعب في غرفة بالفعل ----
        if (mine) {
            return conn.sendMessage(m.chat, {
                text: `❏ انت في *الغرفة ${mine.id}* بالفعل.\nللخروج اكتب: *${usedPrefix}${command} خروج*`,
            })
        }

        // ---- دخول غرفة برقمها ----
        if (/^\d{4}$/.test(arg)) {
            const room = rooms[arg]
            if (!room || room.chat !== m.chat) {
                return conn.sendMessage(m.chat, { text: `❌ مفيش غرفة بالرقم *${arg}* في الشات ده.` })
            }
            return joinRoom(conn, m, room)
        }

        // ---- غرفة جديدة بالإجبار ----
        const forceNew = /^(new|جديد|غرفة)$/i.test(arg)

        // ---- دخول أول غرفة منتظرة ----
        if (!forceNew) {
            const waiting = Object.values(rooms).find(r => r.chat === m.chat && r.state === 'WAITING')
            if (waiting) return joinRoom(conn, m, waiting)
        }

        // ---- إنشاء غرفة ----
        const room = {
            id: newId(rooms),
            chat: m.chat,
            players: [m.sender, null],
            board: Array(9).fill(null),
            turn: 0,
            state: 'WAITING',
            timer: null,
        }
        rooms[room.id] = room
        armTimer(conn, room)

        return conn.sendMessage(m.chat, {
            text: `🎮 *تم إنشاء غرفة ${room.id}*\n\n${tag(m.sender)} مستني لاعب تاني...\n\nللدخول اكتب:\n*${usedPrefix}${command}*  أو  *${usedPrefix}${command} ${room.id}*\n\n🏆 الجائزة: ${REWARD_XP} اكس بي`,
            mentions: [m.sender],
        })
    } catch (e) {
        console.error('XO ERROR:', e)
        await conn.sendMessage(m.chat, { text: '❌ ' + (e?.message || e) })
    }
}

async function joinRoom(conn, m, room) {
    if (room.state !== 'WAITING') {
        return conn.sendMessage(m.chat, { text: '❌ الغرفة دي اللعب فيها بدأ بالفعل.' })
    }
    if (room.players[0] === m.sender) {
        return conn.sendMessage(m.chat, { text: '❌ مينفعش تلعب ضد نفسك 😅' })
    }
    room.players[1] = m.sender
    room.state = 'PLAYING'
    // مين يبدأ؟ عشوائي
    room.turn = Math.random() < 0.5 ? 0 : 1
    armTimer(conn, room)

    return conn.sendMessage(m.chat, {
        text: `✅ *تم إيجاد لاعب!*\n\n${turnText(room)}`,
        mentions: room.players,
    })
}

// ---- استقبال الحركات ----
handler.before = async function (m, { conn }) {
    try {
        if (!m.text) return true
        const room = findRoomOf(conn, m.sender)
        if (!room || room.state !== 'PLAYING' || room.chat !== m.chat) return true

        const text = m.text.trim().toLowerCase()
        const myIndex = room.players.indexOf(m.sender)

        // انسحاب
        if (/^(surrender|give up|انسحب|استسلم)$/i.test(text)) {
            const winner = room.players[1 - myIndex]
            destroyRoom(conn, room)
            await conn.sendMessage(room.chat, {
                text: `🏳️ ${tag(m.sender)} انسحب من *الغرفة ${room.id}*\n🏆 الفايز: ${tag(winner)}`,
                mentions: [m.sender, winner],
            })
            return true
        }

        if (!/^[1-9]$/.test(text)) return true

        if (room.turn !== myIndex) {
            await conn.sendMessage(room.chat, {
                text: `⏳ مش دورك يا ${tag(m.sender)}، استنى ${tag(room.players[room.turn])}`,
                mentions: [m.sender, room.players[room.turn]],
            })
            return true
        }

        const cell = parseInt(text) - 1
        if (room.board[cell]) {
            await conn.sendMessage(room.chat, { text: '❌ الخانة دي متاخدة، اختار خانة تانية.' })
            return true
        }

        room.board[cell] = myIndex === 0 ? 'X' : 'O'
        const win = checkWinner(room.board)
        const full = room.board.every(Boolean)

        if (win) {
            const winner = room.players[myIndex]
            const loser = room.players[1 - myIndex]
            try { global.db.data.users[winner].exp += REWARD_XP } catch (e) { /* مفيش نظام xp */ }
            const board = renderBoard(room.board)
            destroyRoom(conn, room)
            await conn.sendMessage(room.chat, {
                text: `🏆 *غرفة ${room.id} - انتهت!*\n\n${board}\n\n🎉 الفايز: ${tag(winner)}\n💔 الخاسر: ${tag(loser)}\n💰 الجائزة: ${REWARD_XP} اكس بي`,
                mentions: [winner, loser],
            })
            return true
        }

        if (full) {
            const board = renderBoard(room.board)
            const players = [...room.players]
            destroyRoom(conn, room)
            await conn.sendMessage(room.chat, {
                text: `🤝 *غرفة ${room.id} - تعادل!*\n\n${board}\n\n${tag(players[0])} و ${tag(players[1])}`,
                mentions: players,
            })
            return true
        }

        room.turn = 1 - room.turn
        armTimer(conn, room)
        await conn.sendMessage(room.chat, { text: turnText(room), mentions: room.players })
    } catch (e) {
        console.error('XO MOVE ERROR:', e)
    }
    return true
}

handler.help = ['xo', 'xo <room id>', 'xo list', 'xo leave']
handler.tags = ['game']
handler.command = ['xo', 'اكس', 'ttt', 'tictactoe', 'ttc']

module.exports = handler