// plugins/اختبر-يوزر.js
// للمطور فقط: يبعت استعلام USync لليوزر ويطبع رد واتساب الخام (الطلب والرد)
// الاستخدام: .اختبر-يوزر ahmed_x      أو      .اختبر-يوزر ahmed_x 1234

import * as B from '@whiskeysockets/baileys'

const dump = (node) => {
    try {
        if (typeof B.binaryNodeToString === 'function') return B.binaryNodeToString(node)
    } catch {}
    try { return JSON.stringify(node, (k, v) => (v?.type === 'Buffer' ? '[buffer]' : v), 1) } catch { return String(node) }
}

const handler = async (m, { conn, text, isROwner }) => {
    if (!isROwner) return

    const parts = String(text || '').trim().split(/\s+/).filter(Boolean)
    const username = (parts[0] || '').replace(/^@/, '').toLowerCase()
    const key = parts.slice(1).find(p => /^\d{4}$/.test(p))

    if (!username) return m.reply('اكتب اليوزر: .اختبر-يوزر ahmed_x [المفتاح]')
    if (!B.USyncQuery || !B.USyncUser) return m.reply('❌ النسخة مفيهاش USyncQuery/USyncUser')
    if (typeof conn.query !== 'function') return m.reply('❌ conn.query مش متاحة')

    try {
        const user = new B.USyncUser()
        user.withUsername(username)
        if (key) user.withUsernameKey(key)

        const q = new B.USyncQuery()
        q.withUsernameProtocol()
        q.withUser(user)

        // معلومات تشخيص: الكود الفعلي للدوال اللي بتبني عنصر اليوزر
        const src = (fn) => { try { return String(fn).replace(/\s+/g, ' ').slice(0, 600) } catch { return '—' } }
        let userEls = '—'
        try { userEls = JSON.stringify(q.protocols.map(p => p.getUserElement(user))) } catch (e) { userEls = 'خطأ: ' + e.message }
        await m.reply(
            `🔬 *تشخيص*\n\n` +
            `👤 USyncUser: ${JSON.stringify(user)}\n\n` +
            `🧱 getUserElement() رجّع: ${userEls}\n\n` +
            `*getUserElement (الكود):*\n${src(B.USyncUsernameProtocol?.prototype?.getUserElement)}\n\n` +
            `*withUsername (الكود):*\n${src(B.USyncUser.prototype.withUsername)}\n\n` +
            `*withUsernameKey (الكود):*\n${src(B.USyncUser.prototype.withUsernameKey)}`
        )

        // نفس الطلب اللي بتبنيه executeUSyncQuery
        const iq = {
            tag: 'iq',
            attrs: { to: 's.whatsapp.net', type: 'get', xmlns: 'usync' },
            content: [{
                tag: 'usync',
                attrs: {
                    context: q.context || 'interactive',
                    mode: q.mode || 'query',
                    sid: typeof conn.generateMessageTag === 'function' ? conn.generateMessageTag() : String(Date.now()),
                    last: 'true',
                    index: '0'
                },
                content: [
                    { tag: 'query', attrs: {}, content: q.protocols.map(p => p.getQueryElement()) },
                    {
                        tag: 'list',
                        attrs: {},
                        content: q.users.map(u => ({
                            tag: 'user',
                            attrs: { jid: !u.phone ? u.id : undefined },
                            content: q.protocols.map(p => p.getUserElement(u))
                        }))
                    }
                ]
            }]
        }

        const res = await conn.query(iq)

        await m.reply(
            `🧪 *اختبار يوزر:* ${username}${key ? ' (بمفتاح)' : ''}\n\n` +
            `📤 *الطلب:*\n${dump(iq).slice(0, 700)}\n\n` +
            `📥 *رد واتساب:*\n${dump(res).slice(0, 1500)}`
        )
    } catch (e) {
        console.error('[اختبر-يوزر]', e)
        await m.reply(`❌ خطأ: ${String(e?.message || e).slice(0, 300)}`)
    }
}

handler.help = ['اختبر-يوزر']
handler.tags = ['owner']
handler.command = /^(اختبر-يوزر|اختبر_يوزر|testusername)$/i
handler.rowner = true

export default handler