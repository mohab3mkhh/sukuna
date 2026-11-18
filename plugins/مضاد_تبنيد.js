// plugins/مضاد_تبنيد.js
// .مضاد_تبنيد اون  → أي حد يبعت أمر تبنيد لوحده في رسالة يتطرد علطول
// .مضاد_تبنيد اوف  → يوقف
//
// بيتطرد لو الرسالة كلها واحد من الأوامر دي (ببادئة . ! # /):
//   بند، باند، band، طير، زود، نيكو، b، m، فنش، زرف، ازرف، نيك
// ".فنش" ← يتطرد   |   ".فنش يعم عامل ايه" أو "اي يعم فنش الجروب دة" ← مايتطردش (هزار)

import fs from 'fs'
import path from 'path'

const FILE = path.join(process.cwd(), 'antiban.json')
const norm = j => String(j || '').split('@')[0].split(':')[0]

function load() { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')) } catch { return {} } }
function save(d) { try { fs.writeFileSync(FILE, JSON.stringify(d)) } catch (e) { console.error('[مضاد_تبنيد] حفظ:', e.message) } }
if (!global._antiban) global._antiban = load()
const store = () => global._antiban

const BAN_CMDS = ['بند', 'باند', 'band', 'طير', 'زود', 'نيكو', 'b', 'm', 'فنش', 'زرف', 'ازرف', 'نيك']
const BAN_RE = new RegExp('^[.!#/]\\s*(' + BAN_CMDS.join('|') + ')$', 'i')

function textOf(message) {
    let x = message || {}
    for (let i = 0; i < 4; i++) {
        const inner = x.ephemeralMessage?.message || x.viewOnceMessage?.message || x.viewOnceMessageV2?.message || x.documentWithCaptionMessage?.message
        if (!inner) break
        x = inner
    }
    return x.conversation || x.extendedTextMessage?.text || ''
}

function isBanCmd(text) {
    const t = String(text || '').replace(/[-‏‪-‮⁦-⁩﻿ـً-ٟ]/g, '').trim()
    return BAN_RE.test(t)
}

function findParticipant(meta, jid) {
    const n = norm(jid)
    return meta.participants.find(p => [p.id, p.lid, p.jid, p.phoneNumber].some(x => x && norm(x) === n))
}
const ownerNumbers = () => (global.owner || []).map(x => norm(Array.isArray(x) ? x[0] : x))

/* ══════ الأمر ══════ */
const handler = async (m, { conn, args }) => {
    if (!(m.isGroup ?? String(m.chat || '').endsWith('@g.us')))
        return conn.sendMessage(m.chat, { text: '❌ الأمر ده للجروبات بس.' }, { quoted: m })

    if (!global._antibanL || global._antibanL.conn !== conn) attach(conn)
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
            text: `🛡️ *مضاد التبنيد*\n\nالحالة: ${db[m.chat] ? '✅ شغّال' : '❌ مقفول'}\n\n• .مضاد_تبنيد اون\n• .مضاد_تبنيد اوف\n\n> ⛩️ SUKUNA BOT ⛩️`,
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
            ? `✅ *تم تشغيل مضاد التبنيد*\nأي حد يبعت أمر تبنيد لوحده هيتطرد علطول.${warn}\n\n> ⛩️ SUKUNA BOT ⛩️`
            : `❌ *تم إيقاف مضاد التبنيد*\nمحدش هيتطرد.\n\n> ⛩️ SUKUNA BOT ⛩️`,
    }, { quoted: m })
}

/* ══════ الكشف والطرد (مباشرة من messages.upsert، مستقل عن الـ handler) ══════ */
const seen = new Set()
const once = id => { if (seen.has(id)) return false; seen.add(id); setTimeout(() => seen.delete(id), 120000); return true }

async function check(conn, chat, sender, id, message) {
    try {
        if (!store()[chat]) return
        const text = textOf(message)
        if (!isBanCmd(text)) return
        if (!sender || norm(sender) === norm(conn.user?.id) || ownerNumbers().includes(norm(sender))) return
        if (!once(id)) return
        console.log('[مضاد_تبنيد] أمر تبنيد من', sender, ':', text)

        const meta = await conn.groupMetadata(chat)
        const bot = findParticipant(meta, conn.user?.id) || findParticipant(meta, conn.user?.lid)
        if (bot && !bot.admin) { console.log('[مضاد_تبنيد] البوت مش مشرف، مش هيعرف يطرد'); return }
        const target = findParticipant(meta, sender)
        if (target?.admin === 'superadmin') { console.log('[مضاد_تبنيد] صاحب الجروب، تخطي'); return }
        if (target?.admin && process.env.ANTIBAN_SKIP_ADMINS === '1') return

        const jid = target?.id || sender
        try {
            await conn.groupParticipantsUpdate(chat, [jid], 'remove')
        } catch (e1) {
            console.log('[مضاد_تبنيد] الطرد المباشر فشل:', e1?.message, '← بجرّب demote')
            await conn.groupParticipantsUpdate(chat, [jid], 'demote')
            await conn.groupParticipantsUpdate(chat, [jid], 'remove')
        }
        await conn.sendMessage(chat, {
            text: `🚫 *مضاد التبنيد*\nتم طرد @${norm(jid)} (بعت أمر تبنيد)\n\n> ⛩️ SUKUNA BOT ⛩️`,
            mentions: [jid],
        })
    } catch (e) {
        console.error('[مضاد_تبنيد]', e?.message || e)
    }
}

function attach(conn) {
    if (!conn?.ev?.on) return
    if (global._antibanL) { try { global._antibanL.conn.ev.off('messages.upsert', global._antibanL.fn) } catch {} }
    const fn = ({ messages, type }) => {
        if (type && type !== 'notify') return
        for (const msg of messages || []) {
            const key = msg.key || {}
            if (key.fromMe || !String(key.remoteJid || '').endsWith('@g.us')) continue
            check(conn, key.remoteJid, key.participantPn || key.participantAlt || key.participant, key.id, msg.message)
        }
    }
    conn.ev.on('messages.upsert', fn)
    global._antibanL = { conn, fn }
    console.log('[مضاد_تبنيد] المستمع اتسجّل')
}
if (global.conn) attach(global.conn)

handler.before = async function (m, extra = {}) {
    const conn = extra.conn || this
    if (!global._antibanL || global._antibanL.conn !== conn) attach(conn)
    return false
}

handler.command = /^(مضاد_تبنيد|مضاد-تبنيد|antiban)$/i
handler.group = true
handler.tags = ['group']
handler.help = ['مضاد_تبنيد اون', 'مضاد_تبنيد اوف']

export default handler