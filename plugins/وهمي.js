const handler = async (m, { conn }) => {
    await m.reply(`🔍 *sender:* \`${m.sender}\`\n🔍 *chat:* \`${m.chat}\``)
}

handler.command = /^(whoami|انا)$/i
export default handler