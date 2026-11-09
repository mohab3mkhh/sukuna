import TicTacToe from '../lib/tictactoe.js'

const reply = (conn, chat, text, quoted, mentions) =>
  conn.sendMessage(chat, { text, mentions }, { quoted })

let handler = async (m, { conn, usedPrefix, command, text }) => {
    conn.game = conn.game ? conn.game : {}

    // لو اللاعب في جيم قائم
    if (Object.values(conn.game).find(room =>
        room.id.startsWith('tictactoe') &&
        [room.game.playerX, room.game.playerO].includes(m.sender)
    )) throw `❏ انت ماذلت في الجيم، لحذف الجيم اكتب : *${usedPrefix}حذف_لعبه*`

    if (!text) throw `✳️ اختر رقم الغرفة أو اسمها`

    // دور على غرفة منتظرة باسم معين
    let room = Object.values(conn.game).find(room =>
        room.id.startsWith('tictactoe') &&
        room.state === 'WAITING' &&
        room.name === text
    )

    const renderBoard = (game) => game.render().map(v => ({
        X: '❎', O: '⭕',
        1: '1️⃣', 2: '2️⃣', 3: '3️⃣',
        4: '4️⃣', 5: '5️⃣', 6: '6️⃣',
        7: '7️⃣', 8: '8️⃣', 9: '9️⃣',
    }[v]))

    if (room) {
        // لقى غرفة → اللاعب التاني يدخل كـ O
        room.o = m.chat
        room.game.playerO = m.sender
        room.state = 'PLAYING'

        let arr = renderBoard(room.game)
        let str = `
✅ *تم بدء اللعبة!*

@${room.game.currentTurn.split('@')[0]} ابدأ أنت (❎)

${arr.slice(0, 3).join('')}
${arr.slice(3, 6).join('')}
${arr.slice(6).join('')}

▢ *Room ID:* ${room.name || room.id}

❏ *القوانين*
‣ اصنع 3 صفوف من الرموز عموديًا أو أفقيًا أو قطريًا للفوز
‣ اكتب رقم من 1-9 لتضع رمزك
‣ اكتب *surrender* للانسحاب
`.trim()
        const mentions = conn.parseMention(str)
        if (room.x !== room.o) await reply(conn, room.x, str, m, mentions)
        await reply(conn, room.o, str, m, mentions)

    } else {
        // إنشاء غرفة جديدة — اللاعب الأول هو X
        let newRoom = {
            id: 'tictactoe-' + (+new Date),
            name: text,
            x: m.chat,
            o: '',
            game: new TicTacToe(m.sender, 'x'),  // ← المهم: 'x' مش 'o'
            state: 'WAITING'
        }
        newRoom.game.playerX = m.sender  // ← تأكيد تسجيل اللاعب الأول

        const waitMsg = `
❏ *تم إنشاء الغرفة!*
▢ *Room ID:* ${text}

انتظر شريك يكتب:
*${usedPrefix + command} ${text}*

❏ *الجائزة: 4999 اكس بي*
`.trim()

        await reply(conn, m.chat, waitMsg, m)
        conn.game[newRoom.id] = newRoom
    }
}

handler.help = ['xo <room_name>']
handler.tags = ['game']
handler.command = ['tictactoe', 'ttc', 'اكس', 'xo']

export default handler