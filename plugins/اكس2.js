const parseMention = (text = '') =>
    [...String(text).matchAll(/@([0-9]{5,16})/g)].map(v => v[1] + '@s.whatsapp.net')

let handler = m => m

handler.before = async function (m, { conn }) {
    try {
        conn.game = conn.game ? conn.game : {}

        let room = Object.values(conn.game).find(room =>
            room.id && room.game && room.state === 'PLAYING' &&
            room.id.startsWith('tictactoe') &&
            [room.game.playerX, room.game.playerO].includes(m.sender)
        )
        if (!room) return true

        let text = (m.text || '').trim().toLowerCase()
        if (!text) return true

        // انسحاب
        if (/^(surrender|give up|انسحب)$/i.test(text)) {
            let winner = m.sender === room.game.playerX ? room.game.playerO : room.game.playerX
            let msg = `@${m.sender.split('@')[0]} انسحب، والفايز @${winner.split('@')[0]} 🏆`
            let mentions = parseMention(msg)
            await conn.sendMessage(room.x, { text: msg, mentions })
            if (room.o && room.o !== room.x) await conn.sendMessage(room.o, { text: msg, mentions })
            delete conn.game[room.id]
            return true
        }

        // لازم رقم من 1 لـ 9
        if (!/^[1-9]$/.test(text)) return true

        // لازم يكون دوره
        if (m.sender !== room.game.currentTurn) return true

        let ok = room.game.turn(m.sender === room.game.playerO, parseInt(text) - 1)

        if (ok < 1) {
            let err = {
                '-3': 'اللعبة خلصت',
                '-2': 'حركة غلط',
                '-1': 'الخانة دي مش متاحة',
                '0': 'الخانة دي مش متاحة',
            }[ok]
            await conn.sendMessage(m.chat, { text: `❌ ${err}` })
            return true
        }

        let winner = room.game.winner
        let isTie = room.game.board === 511

        let arr = room.game.render().map(v => ({
            X: '❎', O: '⭕',
            1: '1️⃣', 2: '2️⃣', 3: '3️⃣',
            4: '4️⃣', 5: '5️⃣', 6: '6️⃣',
            7: '7️⃣', 8: '8️⃣', 9: '9️⃣',
        }[v]))

        let status = winner
            ? `🏆 @${winner.split('@')[0]} فاز! الجائزة 4999 اكس بي`
            : isTie
                ? `🤝 تعادل`
                : `دور @${room.game.currentTurn.split('@')[0]}`

        let str = `
${status}

${arr.slice(0, 3).join('')}
${arr.slice(3, 6).join('')}
${arr.slice(6).join('')}

▢ *Room ID* ${room.id}
`.trim()

        let mentions = parseMention(str)

        if (room.x !== room.o) await conn.sendMessage(room.x, { text: str, mentions })
        await conn.sendMessage(room.o, { text: str, mentions })

        if (winner) {
            // لو عندك نظام اكس بي عدله هنا
            try { global.db.data.users[winner].exp += 4999 } catch {}
        }

        if (winner || isTie) delete conn.game[room.id]
    } catch (e) {
        console.error('TTT MOVE ERROR:', e)
    }
    return true
}

module.exports = handler