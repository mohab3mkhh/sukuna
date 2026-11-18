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
const BOT_TYPES = ['interactiveMessage', 'buttonsMessage', 'listMessage', 'templateMessage', 'buttonsResponseMessage', 'templateButtonReplyMessage', 'highlyStructuredMessage']

function innerTypes(m) {
    const out = []
    const walk = o => {
        if (!o || typeof o !== 'object') return
        for (const k of Object.keys(o)) {
            out.push(k)
            if (/^(viewOnceMessage|viewOnceMessageV2|viewOnceMessageV2Extension|ephemeralMessage|documentWithCaptionMessage|message)$/.test(k)) walk(o[k])
        }
    }
    walk(m.message)
    if (m.mtype) out.push(m.mtype)
    return out
}

function botReason(m) {
    if (m.isBaileys) return 'isBaileys'
    const id = String(m.id || m.key?.id || '')
    const extra = (process.env.ANTIBOT_PREFIXES || '').split(',').map(x => x.trim()).filter(Boolean)
    if (extra.some(p => id.startsWith(p))) return 'ANTIBOT_PREFIXES'
    if (id.startsWith('BAE5')) return 'BAE5'                       // Baileys (أي طول)
    if (id.startsWith('NJX-')) return 'NJX-'
    if (id.startsWith('B24E') && id.length === 20) return 'B24E'
    if (id.startsWith('3EB0') && id.length >= 30) return '3EB0 طويل (Baileys الجديدة، 40 حرف)'
    if (id.startsWith('SUKUNA') || id.startsWith('MOHAB')) return 'SUKUNA/MOHAB'
    // رسايل الأزرار/القوايم/الإعلانات التفاعلية: البشر مايقدروش يبعتوها
    const t = innerTypes(m).find(x => BOT_TYPES.includes(x))
    if (t) return 'نوع رسالة بوت: ' + t
    return null
}
const isBotMessage = m => !!botReason(m)

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
    if (!(m.isGroup ?? String(m.chat || '').endsWith('@g.us'))) return conn.sendMessage(m.chat, { text: '❌ الأمر ده للجروبات بس.' }, { quoted: m })

    const meta = await conn.groupMetadata(m.chat)
    const me = findParticipant(meta, m.sender)
    const allowed = me?.admin || m.fromMe || ownerNumbers().includes(norm(m.sender))
    if (!allowed) return conn.sendMessage(m.chat, { text: '⛔ الأمر ده للمشرفين بس.' }, { quoted: m })

    const arg = String(args?.[0] || '').toLowerCase()

    // .مضاد_البوتات فحص (بالرد على رسالة) ← يعرض بصمة الرسالة عشان نعرف نكشف البوت ده
    if (['فحص', 'check', 'id'].includes(arg)) {
        const q = m.quoted
        if (!q) return conn.sendMessage(m.chat, { text: 'رد على رسالة البوت واكتب: .مضاد_البوتات فحص' }, { quoted: m })
        const qid = q.id || q.key?.id || m.msg?.contextInfo?.stanzaId || '؟'
        const fake = { id: qid, key: { id: qid }, message: q.message || q.msg ? { [q.mtype || 'x']: 1 } : null, mtype: q.mtype, isBaileys: q.isBaileys }
        return conn.sendMessage(m.chat, {
            text: `🔎 *فحص الرسالة*\n\n• id: ${qid}\n• الطول: ${String(qid).length}\n• النوع: ${q.mtype || '؟'}\n• يتعرف كبوت؟ ${botReason(fake) ? '✅ ' + botReason(fake) : '❌ لا'}\n\nلو ❌ ابعت الـ id ده وأضيف بصمته، أو حطه في متغير ANTIBOT_PREFIXES (أول 4-6 حروف)`,
        }, { quoted: m })
    }

    const on = ['اون', 'on', 'تشغيل', 'فعل'].includes(arg)
    const off = ['اوف', 'off', 'ايقاف', 'إيقاف', 'وقف'].includes(arg)

    const db = store()
    if (!on && !off) {
        return conn.sendMessage(m.chat, {
            text: `🛡️ *مضاد البوتات*\n\nالحالة: ${db[m.chat] ? '✅ شغّال' : '❌ مقفول'}\n\n• .مضاد_البوتات اون\n• .مضاد_البوتات اوف\n• .مضاد_البوتات فحص (بالرد على رسالة)\n\n> ⛩️ SUKUNA BOT ⛩️`,
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
        const isGroup = m.isGroup ?? String(m.chat || '').endsWith('@g.us')
        if (!isGroup || m.fromMe || !store()[m.chat]) return false
        const why = botReason(m)
        if (!why) return false

        const sender = m.sender
        const botNum = norm(conn.user?.id)
        if (!sender || norm(sender) === botNum || ownerNumbers().includes(norm(sender))) return false
        console.log('[مضاد_البوتات] اكتشفت بوت:', sender, '| السبب:', why, '| id:', m.id || m.key?.id)

        const meta = await conn.groupMetadata(m.chat)
        const bot = findParticipant(meta, conn.user?.id) || findParticipant(meta, conn.user?.lid)
        if (bot && !bot.admin) { console.log('[مضاد_البوتات] البوت مش مشرف، مش هيعرف يطرد'); return false }
        const target = findParticipant(meta, sender)
        if (target?.admin === 'superadmin') { console.log('[مضاد_البوتات] صاحب الجروب، تخطي'); return false }

        const jid = target?.id || sender
        try {
            await conn.groupParticipantsUpdate(m.chat, [jid], 'remove')
        } catch (e1) {
            console.log('[مضاد_البوتات] الطرد المباشر فشل:', e1?.message, '← بجرّب demote')
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