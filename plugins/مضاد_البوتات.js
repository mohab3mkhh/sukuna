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
// رسايل الأزرار/القوايم "المرسَلة" بس. ردود الضغط على الأزرار (buttonsResponseMessage / listResponseMessage /
// templateButtonReplyMessage / interactiveResponseMessage) بيبعتها البشر لما يدوسوا زرار، فمش بنعتبرها بوت أبداً.
const BOT_TYPES = ['interactiveMessage', 'buttonsMessage', 'listMessage', 'templateMessage', 'highlyStructuredMessage']
const HUMAN_TYPES = ['buttonsResponseMessage', 'listResponseMessage', 'templateButtonReplyMessage', 'interactiveResponseMessage']

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
    // ضغطة زرار من إنسان ← مش بوت (حتى لو الـ id شبه بصمة بوت)
    if (innerTypes(m).some(x => HUMAN_TYPES.includes(x))) return null
    if (m.isBaileys) return 'isBaileys'
    const id = String(m.id || m.key?.id || '')
    const extra = (process.env.ANTIBOT_PREFIXES || '').split(',').map(x => x.trim()).filter(Boolean)
    if (extra.some(p => id.startsWith(p))) return 'ANTIBOT_PREFIXES'
    if (id.startsWith('BAE5')) return 'BAE5'                       // Baileys (أي طول)
    if (id.startsWith('NJX-')) return 'NJX-'
    if (id.startsWith('B24E') && id.length === 20) return 'B24E'
    if (id.startsWith('3EB0') && id.length === 22 && process.env.ANTIBOT_3EB0_22 !== '0') return '3EB0 بطول 22 (نفس قاعدة isBaileys في البوت)'
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

    if (!global._antibotL || global._antibotL.conn !== conn) attach(conn)
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

/* ══════ الكشف والطرد ══════
   المهم: الـ handler بتاع البوت غالباً بيتجاهل رسايل البوتات (m.isBaileys) قبل ما يوصّلها للأوامر،
   عشان كده بنسمع على messages.upsert مباشرة (مستقل عن الـ handler) فنشوف كل رسالة. */

const seen = new Set()
const once = id => { if (seen.has(id)) return false; seen.add(id); setTimeout(() => seen.delete(id), 120000); return true }

async function kickIfBot(conn, m) {
    try {
        const chat = m.chat
        if (!String(chat || '').endsWith('@g.us') || m.fromMe || !store()[chat]) return
        const why = botReason(m)
        if (!why) return

        const sender = m.sender
        const botNum = norm(conn.user?.id)
        if (!sender || norm(sender) === botNum || ownerNumbers().includes(norm(sender))) return
        if (!once(m.id || m.key?.id)) return
        console.log('[مضاد_البوتات] اكتشفت بوت:', sender, '| السبب:', why, '| id:', m.id || m.key?.id)

        const meta = await conn.groupMetadata(chat)
        const bot = findParticipant(meta, conn.user?.id) || findParticipant(meta, conn.user?.lid)
        if (bot && !bot.admin) { console.log('[مضاد_البوتات] البوت مش مشرف، مش هيعرف يطرد'); return }
        const target = findParticipant(meta, sender)
        if (target?.admin === 'superadmin') { console.log('[مضاد_البوتات] صاحب الجروب، تخطي'); return }

        const jid = target?.id || sender
        try {
            await conn.groupParticipantsUpdate(chat, [jid], 'remove')
        } catch (e1) {
            console.log('[مضاد_البوتات] الطرد المباشر فشل:', e1?.message, '← بجرّب demote')
            await conn.groupParticipantsUpdate(chat, [jid], 'demote')
            await conn.groupParticipantsUpdate(chat, [jid], 'remove')
        }
        await conn.sendMessage(chat, {
            text: `🤖🚫 *مضاد البوتات*\nتم طرد البوت @${norm(jid)}\n\n> ⛩️ SUKUNA BOT ⛩️`,
            mentions: [jid],
        })
        console.log('[مضاد_البوتات] اتطرد:', jid, 'في', chat)
    } catch (e) {
        console.error('[مضاد_البوتات]', e?.message || e)
    }
}

/* تسجيل المستمع مرة واحدة (ويتبدّل لو الملف اتعمله reload) */
function attach(conn) {
    if (!conn?.ev?.on) return
    if (global._antibotL) { try { global._antibotL.conn.ev.off('messages.upsert', global._antibotL.fn) } catch {} }
    const fn = ({ messages, type }) => {
        if (type && type !== 'notify') return
        for (const msg of messages || []) {
            const key = msg.key || {}
            if (key.fromMe || !String(key.remoteJid || '').endsWith('@g.us')) continue
            const sender = key.participantPn || key.participantAlt || key.participant
            kickIfBot(conn, { chat: key.remoteJid, sender, id: key.id, key, message: msg.message, fromMe: false })
        }
    }
    conn.ev.on('messages.upsert', fn)
    global._antibotL = { conn, fn }
    console.log('[مضاد_البوتات] المستمع اتسجّل')
}
if (global.conn) attach(global.conn)

handler.before = async function (m, extra = {}) {
    const conn = extra.conn || this
    if (!global._antibotL || global._antibotL.conn !== conn) attach(conn)   // يتسجّل مع أول رسالة عادية
    return false
}

handler.command = /^(مضاد_البوتات|مضاد-البوتات|antibot)$/i
handler.group = true
handler.tags = ['group']
handler.help = ['مضاد_البوتات اون', 'مضاد_البوتات اوف']

export default handler