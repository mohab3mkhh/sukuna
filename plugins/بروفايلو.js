// plugins/getpp.js
// صورة البروفايل بـ: منشن / رد / رقم / يوزرنيم واتساب / (من غير حاجة = صورتك)
// أمثلة:  .بروفايل @منشن   |   .بروفايل 01021760623   |   .بروفايل ahmed_x   |   .بروفايل ahmed_x 1234

import * as B from '@whiskeysockets/baileys'

const numOf = (jid) => String(jid || '').split('@')[0].split(':')[0]
const JID_RE = /^\d+(?::\d+)?@(?:lid|s\.whatsapp\.net)$/

// يحوّل الرقم المكتوب لصيغة دولية (يدعم 01xxxxxxxxx المصري)
function normalizeNumber(text) {
    let n = String(text || '').replace(/\D/g, '')
    if (/^01\d{9}$/.test(n)) n = '20' + n.slice(1)
    else if (/^00\d+$/.test(n)) n = n.slice(2)
    return n.length >= 8 ? n : ''
}

// يدوّر على أي JID جوه نتيجة USync (لأن شكل الرد بيختلف حسب النسخة)
function findJids(node, out = [], depth = 0) {
    if (node == null || depth > 6) return out
    if (typeof node === 'string') { if (JID_RE.test(node)) out.push(node); return out }
    if (Array.isArray(node)) { node.forEach(x => findJids(x, out, depth + 1)); return out }
    if (typeof node === 'object') Object.values(node).forEach(v => findJids(v, out, depth + 1))
    return out
}

// في Baileys 7.0.0-rc14 دالة getUserElement بتاعة بروتوكول اليوزر فاضية (بترجع null)،
// يعني اليوزر ما بيتبعتش لواتساب أصلاً. الفحص ده بيفتح الميزة لوحده لو نسخة جاية نفّذتها.
function usernameLookupSupported() {
    try {
        if (!B.USyncUsernameProtocol || !B.USyncUser) return false
        const probe = new B.USyncUser()
        probe.withUsername('probe_user')
        return !!new B.USyncUsernameProtocol().getUserElement(probe)
    } catch { return false }
}

// يحوّل يوزرنيم واتساب لـ JID عن طريق USync
async function resolveUsername(conn, username, key) {
    if (!B.USyncQuery || !B.USyncUser || typeof conn.executeUSyncQuery !== 'function') {
        throw new Error('نسخة Baileys مش بتدعم البحث باليوزر')
    }
    const user = new B.USyncUser().withUsername(username)
    if (key) user.withUsernameKey(String(key))

    const query = new B.USyncQuery()
    query.withUsernameProtocol()
    query.withUser(user)

    const res = await conn.executeUSyncQuery(query)
    const direct = res?.list?.[0]?.id
    const jid = (typeof direct === 'string' && JID_RE.test(direct)) ? direct : findJids(res)[0]
    return { jid: jid || null, raw: res }
}

// كل الصيغ الممكنة للشخص (Baileys 7 ساعات بيبعت LID بدل الرقم)
async function candidatesFor(conn, m, jid) {
    const list = [jid]
    try {
        if (jid.endsWith('@lid')) {
            const pn = await conn.signalRepository?.lidMapping?.getPNForLID?.(jid)
            if (pn) list.push(pn)

            if (m.isGroup) {
                const meta = await conn.groupMetadata(m.chat)
                const p = meta?.participants?.find(x => x.id === jid || x.lid === jid)
                const pn2 = p?.phoneNumber || p?.jid
                if (pn2) list.push(pn2)
            }
        }
    } catch {}
    return [...new Set(list.filter(Boolean))]
}

async function getPicture(conn, jids) {
    for (const j of jids) {
        for (const type of ['image', 'preview']) {
            try {
                const url = await conn.profilePictureUrl(j, type)
                if (url) return url
            } catch {}
        }
    }
    return null
}

const handler = async (m, { conn, text, usedPrefix, command, isROwner }) => {
    const decode = (j) => (conn.decodeJid ? conn.decodeJid(j) : j)
    const usage = `❌ رُد على شخص، أو منشنه، أو اكتب رقمه أو يوزره\n` +
        `مثال:\n${usedPrefix}${command} 01021760623\n${usedPrefix}${command} ahmed_x\n${usedPrefix}${command} ahmed_x 1234 _(لو عليه مفتاح)_`

    let who = null
    let viaNumber = false
    let usernameShown = null

    // 1) منشن
    const mentioned = m.mentionedJid?.[0] || m.msg?.contextInfo?.mentionedJid?.[0]
    if (mentioned) who = decode(mentioned)

    // 2) رد على رسالة
    if (!who && m.quoted) {
        const q = m.quoted
        who = decode(q.sender || q.participant || q.key?.participant || q.key?.remoteJid)
    }

    // 3) يوزرنيم أو رقم مكتوب
    const t = String(text || '').trim()
    if (!who && t) {
        if (/[a-z]/i.test(t)) {
            // يوزرنيم (+ مفتاح اختياري من 4 أرقام)
            const parts = t.split(/\s+/)
            const uname = parts[0].replace(/^@/, '').toLowerCase()
            const key = parts.slice(1).find(p => /^\d{4}$/.test(p))

            if (!/^[a-z0-9_.]{3,35}$/.test(uname)) {
                return m.reply('❌ اليوزر غير صالح\nحروف إنجليزية صغيرة وأرقام و _ و . فقط، من 3 لـ 35 حرف')
            }

            if (!usernameLookupSupported()) {
                return m.reply(`⚠️ البحث بيوزر واتساب مش مدعوم في نسخة Baileys الحالية (rc14)\nاستخدم منشن أو رد على الشخص أو رقمه`)
            }

            try {
                const { jid, raw } = await resolveUsername(conn, uname, key)
                if (!jid) {
                    let msg = `❌ ما لقيتش حساب بيوزر *${uname}*\n` +
                        `• ممكن اليوزر غلط\n• أو عليه مفتاح (جرّب: ${usedPrefix}${command} ${uname} 1234)\n• أو الميزة لسه مش مفعّلة على حسابك`
                    if (isROwner) msg += `\n\n🛠 *رد USync:*\n${JSON.stringify(raw)?.slice(0, 600)}`
                    return m.reply(msg)
                }
                who = jid
                usernameShown = uname
            } catch (e) {
                console.error('[getpp] username lookup:', e?.message || e)
                return m.reply(`❌ تعذّر البحث باليوزر${isROwner ? `: ${String(e?.message || e).slice(0, 150)}` : ''}`)
            }
        } else {
            const n = normalizeNumber(t)
            if (n) { who = n + '@s.whatsapp.net'; viaNumber = true }
        }

        if (!who) return m.reply(usage)
    }

    // 4) مفيش حاجة: صورتك انت
    if (!who) who = decode(m.sender)
    if (!who) return m.reply(usage)

    // التأكد إن الرقم على واتساب (للأرقام المكتوبة بس)
    if (viaNumber) {
        try {
            const res = await conn.onWhatsApp(who)
            const found = Array.isArray(res) ? res[0] : null
            if (!found?.exists) return m.reply('❌ الرقم ده مش على واتساب!')
            who = found.jid || who
        } catch {}
    }

    const jids = await candidatesFor(conn, m, who)
    const url = await getPicture(conn, jids)

    // لو جاي من يوزر نعرض اليوزر (من غير منشن)، غير كده نعرض منشن
    const label = usernameShown ? `*${usernameShown}*` : `*@${numOf(who)}*`
    const mentions = usernameShown ? [] : [who]

    if (!url) {
        return conn.sendMessage(m.chat, {
            text: `⚠️ ${label} مش عنده صورة بروفايل أو مخفياها`,
            mentions
        }, { quoted: m })
    }

    await conn.sendMessage(m.chat, {
        image: { url },
        caption: `📸 صورة بروفايل ${label}`,
        mentions
    }, { quoted: m })
}

handler.help = ['بروفايل']
handler.tags = ['tools']
handler.command = /^(بروفايل|pp|صورة)$/i

export default handler