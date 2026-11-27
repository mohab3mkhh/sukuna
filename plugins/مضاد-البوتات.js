// plugins/مضاد_البوتات.js
// .مضاد_البوتات اون  → يطرد أي بوت من أول رسالة يبعتها في الجروب
// .مضاد_البوتات اوف  → يوقف الطرد
// .مضاد_البوتات سماح <رقم | منشن | رد>  → يستثني بوت بتاعك (حتى لو رقمه مخفي LID)
// .مضاد_البوتات منع  <رقم | منشن | رد>  → يشيله من الاستثناء
// .مضاد_البوتات قائمة                   → يعرض المستثنين
// (الأمر للمشرفين/المالك بس، والبوت لازم يكون مشرف عشان يطرد)

import fs from 'fs'
import path from 'path'

const FILE = path.join(process.cwd(), 'antibot.json')
const norm = j => String(j || '').split('@')[0].split(':')[0]
const digits = j => norm(j).replace(/\D/g, '')

/* ── التخزين: جوه database.json (على الـ Volume فبيفضل بعد الـ Deploy) + نسخة في antibot.json ── */
function loadFile() { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')) } catch { return {} } }
function store() {
    const d = global.db?.data
    if (!d) return (global._antibot = global._antibot || loadFile())
    if (!d.antibot) d.antibot = global._antibot && Object.keys(global._antibot).length ? global._antibot : loadFile()
    global._antibot = d.antibot
    return d.antibot
}
function save(db) {
    try { global.db?.write?.()?.catch?.(() => {}) } catch {}
    try { fs.writeFileSync(FILE, JSON.stringify(db)) } catch (e) { console.error('[مضاد_البوتات] حفظ:', e.message) }
}

/* ── كشف البوت من شكل id الرسالة ──
   رسايل مكتبات البوتات (Baileys وأخواتها) ليها بصمة مختلفة عن واتساب الرسمي (أندرويد/آيفون = 32 حرف) */
// رسايل الأزرار/القوايم "المرسَلة" بس. ردود الضغط على الأزرار بيبعتها البشر لما يدوسوا زرار، فمش بنعتبرها بوت أبداً.
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

function findParticipant(meta, jid) {
    const n = norm(jid)
    if (!n || !meta?.participants) return undefined
    return meta.participants.find(p => [p.id, p.lid, p.jid, p.phoneNumber].some(x => x && norm(x) === n))
}

// كل الهويات (رقم عادي + LID) المرتبطة بعضو واحد
const idsOfParticipant = p => [p?.id, p?.lid, p?.jid, p?.phoneNumber].filter(Boolean).map(digits).filter(Boolean)

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
    const db = store()

    // .مضاد_البوتات سماح|منع <رقم | منشن | رد>
    if (['سماح', 'allow', 'منع', 'unallow'].includes(arg)) {
        const adding = ['سماح', 'allow'].includes(arg)

        // نجمع كل اللي ممكن يحدد الشخص: منشن + رد + رقم مكتوب (حتى لو فيه مسافات)
        const rawJids = []
        for (const j of (m.mentionedJid || [])) rawJids.push(j)
        const quoted = m.quoted?.sender || m.msg?.contextInfo?.participant || m.quoted?.participant
        if (quoted) rawJids.push(quoted)
        const typed = (args || []).slice(1).join('').replace(/\D/g, '')
        if (typed.length >= 7) rawJids.push(typed + '@s.whatsapp.net')

        if (!rawJids.length) return conn.sendMessage(m.chat, { text: 'منشن البوت أو رد على رسالته أو اكتب رقمه:\n.مضاد_البوتات سماح 2010xxxxxxx\n\n(لو رقمه مخفي: رد على رسالته أو منشنه)' }, { quoted: m })

        // نجيب كل هويات الشخص (الرقم العادي والـ LID) من بيانات الجروب، عشان الاستثناء يشتغل مهما اتعرّف بأي شكل
        const ids = new Set()
        for (const j of rawJids) {
            const d = digits(j)
            if (d) ids.add(d)
            const p = findParticipant(meta, j)
            if (p) idsOfParticipant(p).forEach(x => ids.add(x))
        }
        if (!ids.size) return conn.sendMessage(m.chat, { text: '❌ مقدرتش أحدد الشخص.' }, { quoted: m })

        db._allow = (db._allow || []).filter(x => !ids.has(x))
        if (db._learned) for (const x of ids) delete db._learned[x]
        if (adding) db._allow.push(...ids)
        save(db)

        return conn.sendMessage(m.chat, {
            text: (adding ? `✅ تم استثناء البوت من الطرد.` : `❌ تم شيل البوت من الاستثناء.`) + `\nالهويات: ${[...ids].join(' ، ')}\n\n> ⛩️ SUKUNA BOT ⛩️`,
        }, { quoted: m })
    }

    // .مضاد_البوتات قائمة
    if (['قائمة', 'قايمة', 'list'].includes(arg)) {
        const a = db._allow || [], l = Object.keys(db._learned || {})
        return conn.sendMessage(m.chat, {
            text: `📋 *المستثنون من مضاد البوتات*\n\nيدوي (${a.length}):\n${a.map(x => '• ' + x).join('\n') || '—'}\n\nمتعلَّم تلقائي (${l.length}):\n${l.map(x => '• ' + x).join('\n') || '—'}\n\n> ⛩️ SUKUNA BOT ⛩️`,
        }, { quoted: m })
    }

    // .مضاد_البوتات فحص (بالرد على رسالة) ← يعرض بصمة الرسالة
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

    if (!on && !off) {
        return conn.sendMessage(m.chat, {
            text: `🛡️ *مضاد البوتات*\n\nالحالة: ${db[m.chat] ? '✅ شغّال' : '❌ مقفول'}\n\n• .مضاد_البوتات اون\n• .مضاد_البوتات اوف\n• .مضاد_البوتات سماح <رقم | منشن | رد>\n• .مضاد_البوتات منع <رقم | منشن | رد>\n• .مضاد_البوتات قائمة\n• .مضاد_البوتات فحص (بالرد على رسالة)\n\n> ⛩️ SUKUNA BOT ⛩️`,
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
   الـ handler بتاع البوت غالباً بيتجاهل رسايل البوتات قبل ما يوصّلها للأوامر،
   عشان كده بنسمع على messages.upsert مباشرة (مستقل عن الـ handler). */

const seen = new Set()
const once = id => { if (seen.has(id)) return false; seen.add(id); setTimeout(() => seen.delete(id), 120000); return true }

/* ══════ استثناء بوتك ══════
   بيعدّي لو أي هوية (رقم عادي أو LID) للمرسل موجودة في:
   1) القايمة المسموحة (.مضاد_البوتات سماح ... أو متغير ANTIBOT_ALLOW)
   2) البوتات الفرعية المتصلة بنفس السيرفر (global.conns)
   3) أو رسالته فيها توقيع بوتك (sukuna bot / sukunabot / mohab، يتغير بمتغير ANTIBOT_SIGN) */
const allowSet = () => new Set([
    ...(store()._allow || []),
    ...Object.keys(store()._learned || {}),
    ...(process.env.ANTIBOT_ALLOW || '').split(',').map(x => x.trim()).filter(Boolean),
    ...((Array.isArray(global.conns) ? global.conns : []).map(c => norm(c?.user?.id)).filter(Boolean)),
].map(digits).filter(Boolean))

// كل هويات المرسل: اللي جت مع الرسالة + اللي في بيانات الجروب (رقم عادي + LID)
function senderIds(m, meta) {
    const ids = new Set()
    for (const j of [m.sender, ...(m.senders || [])]) {
        if (!j) continue
        const d = digits(j); if (d) ids.add(d)
        const p = findParticipant(meta, j)
        if (p) idsOfParticipant(p).forEach(x => ids.add(x))
    }
    return ids
}
const inAllowList = ids => { const a = allowSet(); for (const x of ids) if (a.has(x)) return true; return false }

function strings(o, out = [], d = 0) {
    if (d > 10 || o == null) return out
    if (typeof o === 'string') { if (o.length < 300000) out.push(o); return out }
    if (typeof o !== 'object' || Buffer.isBuffer(o) || o instanceof Uint8Array) return out
    for (const k of Object.keys(o)) strings(o[k], out, d + 1)
    return out
}
function hasSignature(message) {
    const sigs = (process.env.ANTIBOT_SIGN || 'sukuna bot,sukunabot,mohab').split(',').map(x => x.trim().toLowerCase()).filter(Boolean)
    const squash = t => t.toLowerCase().replace(/[\s_\-\u200b-\u200f]+/g, '')
    const sq = sigs.map(squash)
    return strings(message).some(t => { const q = squash(t); return sq.some(x => q.includes(x)) })
}

const MEDIA_TYPES = ['audioMessage', 'stickerMessage', 'imageMessage', 'videoMessage', 'documentMessage', 'ptvMessage', 'contactMessage', 'locationMessage', 'reactionMessage']
const GRACE = (Number(process.env.ANTIBOT_GRACE_SEC ?? 12)) * 1000    // 0 = يطرد فوراً حتى لو الرسالة ميديا
const graceSet = new Set()

// لو التوقيع ظهر في رسالته نحفظ كل هوياته كبوت بتاعك
function learn(ids) {
    const db = store()
    db._learned = db._learned || {}
    let added = false
    for (const x of ids) if (!db._learned[x]) { db._learned[x] = Date.now(); added = true }
    if (added) { save(db); console.log('[مضاد_البوتات] اتعلّم إنه بوتك:', [...ids].join(',')) }
}

async function doKick(conn, chat, sender, why, id) {
    try {
        if (!store()[chat]) return
        console.log('[مضاد_البوتات] اكتشفت بوت:', sender, '| السبب:', why, '| id:', id)
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

async function kickIfBot(conn, m) {
    try {
        const chat = m.chat
        if (!String(chat || '').endsWith('@g.us') || m.fromMe || !store()[chat]) return
        const why = botReason(m)
        if (!why) return
        // رسالة فويس/صوت: مابتتطردش أبداً (أي بوت)
        if (innerTypes(m).some(x => x === 'audioMessage')) return

        const sender = m.sender
        const botNum = norm(conn.user?.id)
        if (!sender || norm(sender) === botNum || ownerNumbers().includes(norm(sender))) return
        if (!once(m.id || m.key?.id)) return

        // ✅ الاستثناء: نقارن كل هويات المرسل (رقم عادي + LID) بالقايمة، مش بس الشكل اللي وصل مع الرسالة
        const meta = await conn.groupMetadata(chat).catch(() => null)
        const ids = senderIds(m, meta)
        if (inAllowList(ids)) { console.log('[مضاد_البوتات] بوت مستثنى (قايمة السماح)، تخطي:', [...ids].join(',')); return }
        if (m.message && hasSignature(m.message)) {
            learn(ids)
            console.log('[مضاد_البوتات] بوت بتاعك (توقيع)، تخطي:', sender)
            return
        }

        // رسالة ملهاش نص (فويس/ملصق/صورة/ملف): نستنى شوية لو بعت رسالة بتوقيعه
        const textless = innerTypes(m).some(x => MEDIA_TYPES.includes(x)) && !innerTypes(m).some(x => BOT_TYPES.includes(x))
        if (textless && GRACE > 0) {
            const key = chat + '|' + norm(sender)
            if (graceSet.has(key)) return
            graceSet.add(key)
            console.log('[مضاد_البوتات] رسالة ميديا من مشتبه فيه، هستنى', GRACE / 1000, 'ث قبل الطرد:', sender)
            setTimeout(async () => {
                graceSet.delete(key)
                const meta2 = await conn.groupMetadata(chat).catch(() => null)
                if (inAllowList(senderIds(m, meta2))) { console.log('[مضاد_البوتات] اتأكد إنه مستثنى، تخطي:', sender); return }
                await doKick(conn, chat, sender, why, m.id || m.key?.id)
            }, GRACE)
            return
        }
        await doKick(conn, chat, sender, why, m.id || m.key?.id)
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
            const senders = [key.participantPn, key.participantAlt, key.participant].filter(Boolean)
            kickIfBot(conn, { chat: key.remoteJid, sender: senders[0], senders, id: key.id, key, message: msg.message, fromMe: false })
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