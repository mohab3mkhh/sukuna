// plugins/مضاد_البوتات.js
// .مضاد_البوتات اون  → يطرد أي بوت من أول رسالة يبعتها في الجروب
// .مضاد_البوتات اوف  → يوقف الطرد
// (الأمر للمشرفين/المالك بس، والبوت لازم يكون مشرف عشان يطرد)

import fs from 'fs'
import path from 'path'

const FILE = path.join(process.cwd(), 'antibot.json')
const norm = j => String(j || '').split('@')[0].split(':')[0]

/* ── التخزين: بيتحفظ في ملف عشان يفضل بعد الريستارت (على Railway ده بيفضل لحد الـ redeploy) ── */
function load() { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')) } catch { return {} } }
function save(d) { try { fs.writeFileSync(FILE, JSON.stringify(d)) } catch (e) { console.error('[مضاد_البوتات] حفظ:', e.message) } }
if (!global._antibot) global._antibot = load()
const store = () => global._antibot

/* ── كشف البوت من شكل id الرسالة ──
   رسايل مكتبات البوتات (Baileys وأخواتها) ليها بصمة مختلفة عن واتساب الرسمي (أندرويد/آيفون = 32 حرف) */
function isBotMessage(m) {
    if (m.isBaileys) return true
    const id = String(m.id || m.key?.id || '')
    if (!id) return false
    if (id.startsWith('BAE5') && id.length === 16) return true   // Baileys القديمة
    if (id.startsWith('NJX-')) return true
    if (id.startsWith('B24E') && id.length === 20) return true
    if (id.startsWith('SUKUNA') || id.startsWith('MOHAB')) return true
    if (id.startsWith('3EB0') && id.length === 22) return true   // Baileys الجديدة (مش واتساب ويب)
    return false
}

function findParticipant(meta, jid) {
    const n = norm(jid)
    return meta.participants.find(p => [p.id, p.lid, p.jid, p.phoneNumber].some(x => x && norm(x) === n))
}

function ownerNumbers() {
    const o = global.owner || []
    return o.map(x => norm(Array.isArray(x) ? x[0] : x))
}

/* ══════ الأمر ══════ */
const handler = async (m, { conn, args }) => {
    if (!m.isGroup) return conn.sendMessage(m.chat, { text: '❌ الأمر ده للجروبات بس.' }, { quoted: m })

    const meta = await conn.groupMetadata(m.chat)
    const me = findParticipant(meta, m.sender)
    const allowed = me?.admin || m.fromMe || ownerNumbers().includes(norm(m.sender))
    if (!allowed) return conn.sendMessage(m.chat, { text: '⛔ الأمر ده للمشرفين بس.' }, { quoted: m })

    const arg = String(args?.[0] || '').toLowerCase()
    const on = ['اون', 'on', 'تشغيل', 'فعل'].includes(arg)
    const off = ['اوف', 'off', 'ايقاف', 'إيقاف', 'وقف'].includes(arg)

    const db = store()
    if (!on && !off) {
        return conn.sendMessage(m.chat, {
            text: `🛡️ *مضاد البوتات*\n\nالحالة: ${db[m.chat] ? '✅ شغّال' : '❌ مقفول'}\n\n• .مضاد_البوتات اون\n• .مضاد_البوتات اوف\n\n> ⛩️ SUKUNA BOT ⛩️`,
        }, { quoted: m })
    }

    if (on) db[m.chat] = true; else delete db[m.chat]
    save(db)

    let warn = ''
    if (on) {
        const bot = findParticipant(meta, conn.user?.id) || findParticipant(meta, conn.user?.lid)
        if (!bot?.admin) warn = '\n\n⚠️ البوت مش مشرف في الجروب، اعمله مشرف عشان يقدر يطرد.'
    }
    return conn.sendMessage(m.chat, {
        text: on
            ? `✅ *تم تشغيل مضاد البوتات*\nأي بوت هيبعت رسالة هيتطرد علطول.${warn}\n\n> ⛩️ SUKUNA BOT ⛩️`
            : `❌ *تم إيقاف مضاد البوتات*\nمحدش هيتطرد.\n\n> ⛩️ SUKUNA BOT ⛩️`,
    }, { quoted: m })
}

/* ══════ الكشف: بيتنفذ على كل رسالة في الجروبات ══════ */
handler.before = async function (m, extra = {}) {
    const conn = extra.conn || this
    try {
        if (!m.isGroup || m.fromMe || !store()[m.chat]) return false
        if (!isBotMessage(m)) return false

        const sender = m.sender
        const botNum = norm(conn.user?.id)
        if (!sender || norm(sender) === botNum || ownerNumbers().includes(norm(sender))) return false

        const meta = await conn.groupMetadata(m.chat)
        const bot = findParticipant(meta, conn.user?.id) || findParticipant(meta, conn.user?.lid)
        if (!bot?.admin) return false                       // مش مشرف، مش هيعرف يطرد
        const target = findParticipant(meta, sender)
        if (!target || target.admin === 'superadmin') return false  // صاحب الجروب مايتطردش

        const jid = target.id || sender
        try {
            await conn.groupParticipantsUpdate(m.chat, [jid], 'remove')
        } catch {
            // لو هو مشرف: نشيل إشرافه الأول وبعدين نطرده
            await conn.groupParticipantsUpdate(m.chat, [jid], 'demote')
            await conn.groupParticipantsUpdate(m.chat, [jid], 'remove')
        }
        await conn.sendMessage(m.chat, {
            text: `🤖🚫 *مضاد البوتات*\nتم طرد البوت @${norm(jid)}\n\n> ⛩️ SUKUNA BOT ⛩️`,
            mentions: [jid],
        })
        console.log('[مضاد_البوتات] اتطرد:', jid, 'في', m.chat)
    } catch (e) {
        console.error('[مضاد_البوتات]', e?.message || e)
    }
    return false
}

handler.command = /^(مضاد_البوتات|مضاد-البوتات|antibot)$/i
handler.group = true
handler.tags = ['group']
handler.help = ['مضاد_البوتات اون', 'مضاد_البوتات اوف']

export default handler