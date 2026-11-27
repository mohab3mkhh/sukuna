// plugins/مضاد_جهات.js
// .مضاد_جهات اون  → أي حد يبعت جهة اتصال (كارت رقم) في الجروب يتطرد علطول + تتمسح رسالته
// .مضاد_جهات اوف  → يوقف
//
// بيكشف: جهة اتصال واحدة أو أكتر (contactMessage / contactsArrayMessage) حتى لو جوه رسالة مؤقتة أو عرض مرة واحدة.
// مستثنى: البوت نفسه، المطورين، وصاحب الجروب. (لو عايز تستثني كل المشرفين: متغير ANTICONTACT_SKIP_ADMINS=1)
// لازم البوت يكون مشرف في الجروب عشان يطرد.

import fs from 'fs'
import path from 'path'

const FILE = path.join(process.cwd(), 'anticontact.json')
const norm = j => String(j || '').split('@')[0].split(':')[0]

function load() { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')) } catch { return {} } }
function save(d) { try { fs.writeFileSync(FILE, JSON.stringify(d)) } catch (e) { console.error('[مضاد_جهات] حفظ:', e.message) } }
if (!global._anticontact) global._anticontact = load()
const store = () => global._anticontact

function unwrap(message) {
    let x = message || {}
    for (let i = 0; i < 4; i++) {
        const inner = x.ephemeralMessage?.message || x.viewOnceMessage?.message || x.viewOnceMessageV2?.message || x.viewOnceMessageV2Extension?.message || x.documentWithCaptionMessage?.message || x.editedMessage?.message
        if (!inner) break
        x = inner
    }
    return x
}
const isContact = message => { const x = unwrap(message); return !!(x.contactMessage || x.contactsArrayMessage) }

function findParticipant(meta, jid) {
    const n = norm(jid)
    return meta.participants.find(p => [p.id, p.lid, p.jid, p.phoneNumber].some(x => x && norm(x) === n))
}
const ownerNumbers = () => (global.owner || global.owners || []).map(x => norm(Array.isArray(x) ? x[0] : x))

/* ══════ الأمر ══════ */
const handler = async (m, { conn, args }) => {
    if (!(m.isGroup ?? String(m.chat || '').endsWith('@g.us')))
        return conn.sendMessage(m.chat, { text: '❌ الأمر ده للجروبات بس.' }, { quoted: m })

    if (!global._anticontactL || global._anticontactL.conn !== conn) attach(conn)
    const meta = await conn.groupMetadata(m.chat)
    const me = findParticipant(meta, m.sender)
    if (!(me?.admin || m.fromMe || ownerNumbers().includes(norm(m.sender))))
        return conn.sendMessage(m.chat, { text: '⛔ الأمر ده للمشرفين بس.' }, { quoted: m })

    const arg = String(args?.[0] || '').toLowerCase()
    const on = ['اون', 'on', 'تشغيل', 'فعل'].includes(arg)
    const off = ['اوف', 'off', 'ايقاف', 'إيقاف', 'وقف'].includes(arg)
    const db = store()

    if (!on && !off) {
        return conn.sendMessage(m.chat, {
            text: `📇 *مضاد جهات الاتصال*\n\nالحالة: ${db[m.chat] ? '✅ شغّال' : '❌ مقفول'}\n\n• .مضاد_جهات اون\n• .مضاد_جهات اوف\n\n> ⛩️ SUKUNA BOT ⛩️`,
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
            ? `✅ *تم تشغيل مضاد جهات الاتصال*\nأي حد يبعت جهة اتصال هيتطرد علطول.${warn}\n\n> ⛩️ SUKUNA BOT ⛩️`
            : `❌ *تم إيقاف مضاد جهات الاتصال*\nمحدش هيتطرد.\n\n> ⛩️ SUKUNA BOT ⛩️`,
    }, { quoted: m })
}

/* ══════ الكشف والطرد (مباشرة من messages.upsert، مستقل عن الـ handler) ══════ */
const seen = new Set()
const once = id => { if (seen.has(id)) return false; seen.add(id); setTimeout(() => seen.delete(id), 120000); return true }

async function check(conn, chat, sender, key, message) {
    try {
        if (!store()[chat]) return
        if (!isContact(message)) return
        if (!sender || norm(sender) === norm(conn.user?.id) || ownerNumbers().includes(norm(sender))) return
        if (!once(key.id)) return
        console.log('[مضاد_جهات] جهة اتصال من', sender)

        const meta = await conn.groupMetadata(chat)
        const bot = findParticipant(meta, conn.user?.id) || findParticipant(meta, conn.user?.lid)
        if (bot && !bot.admin) { console.log('[مضاد_جهات] البوت مش مشرف، مش هيعرف يطرد'); return }
        const target = findParticipant(meta, sender)
        if (target?.admin === 'superadmin') { console.log('[مضاد_جهات] صاحب الجروب، تخطي'); return }
        if (target?.admin && process.env.ANTICONTACT_SKIP_ADMINS === '1') return

        // امسح الرسالة الأول
        try { await conn.sendMessage(chat, { delete: key }) } catch {}

        const jid = target?.id || sender
        try {
            await conn.groupParticipantsUpdate(chat, [jid], 'remove')
        } catch (e1) {
            console.log('[مضاد_جهات] الطرد المباشر فشل:', e1?.message, '← بجرّب demote')
            await conn.groupParticipantsUpdate(chat, [jid], 'demote')
            await conn.groupParticipantsUpdate(chat, [jid], 'remove')
        }
        await conn.sendMessage(chat, {
            text: `🚫 *مضاد جهات الاتصال*\nتم طرد @${norm(jid)} (بعت جهة اتصال)\n\n> ⛩️ SUKUNA BOT ⛩️`,
            mentions: [jid],
        })
    } catch (e) {
        console.error('[مضاد_جهات]', e?.message || e)
    }
}

function attach(conn) {
    if (!conn?.ev?.on) return
    if (global._anticontactL) { try { global._anticontactL.conn.ev.off('messages.upsert', global._anticontactL.fn) } catch {} }
    const fn = ({ messages, type }) => {
        if (type && type !== 'notify') return
        for (const msg of messages || []) {
            const key = msg.key || {}
            if (key.fromMe || !String(key.remoteJid || '').endsWith('@g.us')) continue
            check(conn, key.remoteJid, key.participantPn || key.participantAlt || key.participant, key, msg.message)
        }
    }
    conn.ev.on('messages.upsert', fn)
    global._anticontactL = { conn, fn }
    console.log('[مضاد_جهات] المستمع اتسجّل')
}
if (global.conn) attach(global.conn)

handler.before = async function (m, extra = {}) {
    const conn = extra.conn || this
    if (!global._anticontactL || global._anticontactL.conn !== conn) attach(conn)
    return false
}

handler.command = /^(مضاد_جهات|مضاد-جهات|anticontact)$/i
handler.group = true
handler.tags = ['group']
handler.help = ['مضاد_جهات اون', 'مضاد_جهات اوف']

export default handler