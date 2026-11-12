let handler = async (m, { conn }) => {
    try {

        const sleep = (ms) => new Promise(res => setTimeout(res, ms))

        const users = m.mentionedJid

        if (!users || users.length < 4) {
            return m.reply("⚠️ أقل عدد للعبة الإبادة هو 4 لاعبين")
        }

        if (users.length > 10) {
            return m.reply("⚠️ أقصى عدد 10 لاعبين فقط")
        }

        // ☠︎ رسالة البداية (تصحيح كامل)
        let introMsg = await conn.sendMessage(m.chat, {
            text:
`☠︎ *رسالة من سوكونا:*

"*أنتم لستم مقاتلين*…
*أنتم مجرد أرقام ستُمحى داخل هذه الساحة*.

ستبدأ الإبادة بعد: 10 ثواني"
— 𝑺𝑼𝑲𝑼𝑵𝑨 ⚡️`
        })

        // ⏳ العد التنازلي (مصقول)
        const sleepEdit = async (t) => {
            await conn.sendMessage(m.chat, {
                text:
`☠︎ *رسالة من سوكونا*:

"*أنتم داخل ساحة لا مكان فيها للرحمة*…

*لا أحد منكم مهم بما يكفي ليُستثنى،*
*ولا أحد منكم قوي بما يكفي ليُضمن بقاؤه.*

*ستبدأ الاباده بعد: ${t} ثواني*…
*وأنا وحدي من سيقرر من يستمر ومن يُمحى*."
— 𝑺𝑼𝑲𝑼𝑵𝑨 ⚡️`,
                edit: introMsg.key
            })
        }

        for (let i = 9; i >= 1; i--) {
            await sleep(1000)
            await sleepEdit(i)
        }

        await sleep(1000)

        // 🔥 بداية اللعبة
        await conn.sendMessage(m.chat, {
            text: `🔥🔥 *بدأت لعبة الإبادة* 🔥🔥`,
            edit: introMsg.key
        })

        // ⚔️ اللاعبين
        let players = users.map(u => ({
            jid: u,
            num: u.split('@')[0]
        }))

        let currentPlayers = [...players]
        let mentions = users

        // 🟡 الساحة
        let gameMsg = await conn.sendMessage(m.chat, {
            text:
`⚔️ ساحة الإبادة

👥 اللاعبين:
${players.map(p => `👤 @${p.num}`).join('\n')}

☠︎ سوكونا يراقب بصمت...`,
            mentions
        })

        const edit = async (txt) => {
            await conn.sendMessage(m.chat, {
                text: txt,
                edit: gameMsg.key,
                mentions
            })
        }

        //  تايمر نظيف (بدون تكرار مزعج)
        const timer = async (baseText) => {
            for (let t = 5; t >= 1; t--) {
                await sleep(1000)
                await edit(`${baseText}\n\n⏳ المرحلة التالية خلال: ${t}`)
            }
        }

        let stage = 1

        // ⚔️ اللعبة
        while (currentPlayers.length > 1) {

            let stageText =
`⚔️ المرحلة (${stage})

👥 اللاعبين:
${currentPlayers.map(p => `👤 @${p.num}`).join('\n')}

☠︎ *سوكونا:*
"*البقاء لا يُمنح… بل يُنتزع. والباقي يُمحى بصمت*."`

            await edit(stageText)

            await timer(stageText)

            // 🎲 عشوائية قوية (Shuffle)
            for (let i = currentPlayers.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1))
                ;[currentPlayers[i], currentPlayers[j]] = [currentPlayers[j], currentPlayers[i]]
            }

            // 💀 حذف لاعب
            currentPlayers.shift()

            stage++
        }

        // 👑 *الفائز*
        let winner = currentPlayers[0]

        await edit(
`👑 *نهاية الإبادة*

🏆 *الفائز:*
👤 @${winner.num}

☠︎ *حكم سوكونا*:
*هذا الناجي لم يكن الأقوى…بل كان الأكثر حظاً فقط.*

— 𓆩𝑹𝒀𝑶𝑴𝑬𝑵🩸𝑺𝑼𝑲𝑼𝑵𝑨𓆪`
        )

    } catch (e) {
        console.error('[SUKUNA FIXED GAME]', e.message)
    }
}

handler.command = ['اباده', 'الإبادة', 'ابادة']

export default handler