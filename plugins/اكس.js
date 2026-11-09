import TicTacToe from '../lib/tictactoe.js'

const reply = (conn, chat, text, quoted, mentions) =>
  conn.sendMessage(chat, { text, mentions }, { quoted })

let handler = async (m, { conn, usedPrefix, command, text }) => {
    conn.game = conn.game ? conn.game : {}
    if (Object.values(conn.game).find(room => room.id.startsWith('tictactoe') && [room.game.playerX, room.game.playerO].includes(m.sender)))
        throw `❏ انت ماذلت في الجيم, لحذف الجيم اكتب : *${usedPrefix}حذففف*`
    if (!text) throw `✳️ اختر رقم الغرفه`

    let room = Object.values(conn.game).find(room => room.state === 'WAITING' && (text ? room.name === text : true))

    if (room) {
        await reply(conn, m.chat, '*تم ايجاد الشخص الاخر*', m)
        room.o = m.chat
        room.game.playerO = m.sender
        room.state = 'PLAYING'
        let arr = room.game.render().map(v => {
            return {
                X: '❎',
                O: '⭕',
                1: '1️⃣',
                2: '2️⃣',
                3: '3️⃣',
                4: '4️⃣',
                5: '5️⃣',
                6: '6️⃣',
                7: '7️⃣',
                8: '8️⃣',
                9: '9️⃣',
            }[v]
        })
        let str = `
انتظر @${room.game.currentTurn.split('@')[0]} هو اللاعب الاول

${arr.slice(0, 3).join('')}
${arr.slice(3, 6).join('')}
${arr.slice(6).join('')}

▢ *Room ID* ${room.id}

❏ *القوانين*
‣ اصنع 3 صفوف من الرموز عموديا, أفقيا او انحرافي للفوز ‣ اكتب *surrender* للانسحاب
`.trim()
        const mentions = conn.parseMention(str)
        if (room.x !== room.o) await reply(conn, room.x, str, m, mentions)
        await reply(conn, room.o, str, m, mentions)
    } else {
        room = {
            id: 'tictactoe-' + (+new Date),
            x: m.chat,
            o: '',
            game: new TicTacToe(m.sender, 'o'),
            state: 'WAITING'
        }
        if (text) room.name = text

        const waitMsg = `❏ *توقع الشريك*\nاكتب الامر التالي للدخول في نفس الجيم
❏ *${usedPrefix + command} ${text}*

❏ *الجائزه: 4999* اكس بي`

        await reply(conn, m.chat, waitMsg, m, conn.parseMention(text))
        conn.game[room.id] = room
    }
}

handler.help = ['tictactoe <tag number>']
handler.tags = ['game']
handler.command = ['tictactoe', 'ttc', 'اكس', 'xo']

export default handler