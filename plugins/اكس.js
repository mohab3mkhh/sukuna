import TicTacToe from '../lib/tictactoe.js'

const send = (conn, chat, text, quoted, mentions = []) =>
    conn.sendMessage(chat, { text, mentions }, { quoted })

let handler = async (m, { conn, usedPrefix, command, text }) => {
    conn.game = conn.game ? conn.game : {}

    if (Object.values(conn.game).find(room =>
        room.id.startsWith('tictactoe') &&
        [room.game.playerX, room.game.playerO].includes(m.sender)
    )) throw `❏ انت ماذلت في الجيم، لحذف الجيم اكتب : *${usedPrefix}حذف_لعبه*`

    if (!text) throw `✳️ اختر رقم الغرفة`

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
        // لاعب تاني انضم
        await send(conn, m.chat, '✅ *تم إيجاد الشخص الآخر*', m)

        room.o = m.chat
        room.game.playerO = m.sender
        room.state = 'PLAYING'

        let arr = renderBoard(room.game)
        let str = `
انتظر @${room.game.currentTurn.split('@')[0]} هو اللاعب الأول ❎

${arr.slice(0, 3).join('')}
${arr.slice(3, 6).join('')}
${arr.slice(6).join('')}

▢ *Room ID:* ${room.name}

❏ *القوانين*
‣ اصنع 3 صفوف من الرموز عموديًا أو أفقيًا أو قطريًا للفوز
‣ اكتب رقم من 1-9 لتضع رمزك
‣ اكتب *surrender* للانسحاب
`.trim()

        const mentions = conn.parseMention(str)
        if (room.x !== room.o) await send(conn, room.x, str, m, mentions)
        await send(conn, room.o, str, m, mentions)

    } else {
        // إنشاء غرفة جديدة
        room = {
            id: 'tictactoe-' + (+new Date),
            name: text,
            x: m.chat,
            o: '',
            game: new TicTacToe(m.sender, 'x'),
            state: 'WAITING'
        }
        room.game.playerX = m.sender

        await send(conn, m.chat, `❏ *تم إنشاء الغرفة!*
▢ *Room ID:* ${text}

انتظر شريك يكتب:
*${usedPrefix + command} ${text}*

❏ *الجائزة: 4999 اكس بي*`, m)

        conn.game[room.id] = room
    }
}

handler.help = ['xo <room_name>']
handler.tags = ['game']
handler.command = ['tictactoe', 'ttc', 'اكس', 'xo']

export default handler