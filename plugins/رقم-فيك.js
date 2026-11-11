import fetch from "node-fetch";
import cheerio from "cheerio";
import { prepareWAMessageMedia, generateWAMessageFromContent } from '@whiskeysockets/baileys';

const BASE = 'https://receive-sms-online.info'
const pp = 'https://files.catbox.moe/9qxiwh.jpg'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'

let handler = async (m, { conn, text, command, usedPrefix }) => {
    let [feature, ...args] = (text || '').split(" ")
    let additionalArg = args.join(" ").trim()

    const sendInteractive = async (caption, rows, title, icon) => {
        const media = await prepareWAMessageMedia({ image: { url: pp } }, { upload: conn.waUploadToServer })
        const msg = generateWAMessageFromContent(m.chat, {
            viewOnceMessage: {
                message: {
                    interactiveMessage: {
                        body: { text: caption },
                        footer: { text: '⛩️SUKUNA⚡️BOT⛩️' },
                        header: { hasMediaAttachment: true, imageMessage: media.imageMessage },
                        nativeFlowMessage: {
                            buttons: [
                                {
                                    name: 'single_select',
                                    buttonParamsJson: JSON.stringify({
                                        title,
                                        sections: [{ title, highlight_label: icon, rows }]
                                    })
                                },
                                {
                                    name: 'quick_reply',
                                    buttonParamsJson: JSON.stringify({ display_text: '🏠 الرئيسية', id: `${usedPrefix}${command}` })
                                }
                            ],
                            messageParamsJson: ''
                        }
                    }
                }
            }
        }, { userJid: conn.user.jid, quoted: m })
        return conn.relayMessage(m.chat, msg.message, { messageId: msg.key.id })
    }

    // ━━━ الرئيسية ━━━
    if (!feature || !['أرقام', 'رسائل', 'كود'].includes(feature)) {
        try {
            await m.reply('⏳ جاري جلب قائمة الأرقام...')
            const res = await fetch(BASE, { headers: { 'User-Agent': UA } })
            const html = await res.text()
            const $ = cheerio.load(html)

            // استخراج الأرقام وتجميعها حسب الدولة
            const countries = {}
            $('a[href]').each((i, el) => {
                const href = $(el).attr('href')
                const txt = $(el).text().trim()
                if (href && txt.startsWith('+') && txt.match(/^\+\d+/)) {
                    // اسم الدولة من الـ href
                    const countryMatch = href.match(/\d+-(\w+)$/)
                    const country = countryMatch?.[1] || 'Unknown'
                    if (!countries[country]) countries[country] = []
                    // عدد الرسائل
                    const msgCount = $(el).closest('div, li').find('*').filter((_, el2) => $(el2).text().match(/\d+\s*(SMS|Messages)/i)).first().text().match(/(\d+)/)?.[1] || '?'
                    countries[country].push({ number: txt, href, msgCount })
                }
            })

            const rows = Object.entries(countries).slice(0, 50).map(([country, nums]) => ({
                header: `${nums.length} أرقام`,
                title: country,
                id: `${usedPrefix}${command} أرقام ${country}`,
                description: `اضغط لعرض أرقام ${country}`
            }))

            if (!rows.length) return m.reply('❌ مش قادر أجيب القائمة دلوقتي')

            return sendInteractive(
                '╮────────────────────────╭\n│ *🌐 قائمة الدول المتاحة*\n╯────────────────────────╰',
                rows, 'قائمة الدول', '🌍'
            )
        } catch (e) {
            return m.reply('❌ خطأ: ' + e.message)
        }
    }

    // ━━━ أرقام دولة ━━━
    if (feature === "أرقام") {
        if (!additionalArg) return m.reply('❌ أدخل اسم الدولة')
        try {
            await m.reply('⏳ جاري جلب الأرقام...')
            const res = await fetch(BASE, { headers: { 'User-Agent': UA } })
            const html = await res.text()
            const $ = cheerio.load(html)

            const rows = []
            $('a[href]').each((i, el) => {
                const href = $(el).attr('href')
                const txt = $(el).text().trim()
                if (!href || !txt.startsWith('+')) return
                if (!href.toLowerCase().includes(additionalArg.toLowerCase())) return
                const msgCount = $(el).closest('div').text().match(/(\d+)\s*(SMS|Messages)/i)?.[1] || '?'
                if (rows.length < 50) {
                    rows.push({
                        header: `📩 ${msgCount} رسالة`,
                        title: txt,
                        id: `${usedPrefix}${command} رسائل ${BASE}${href}`,
                        description: 'اضغط لعرض الرسائل'
                    })
                }
            })

            if (!rows.length) return m.reply(`❌ مش لاقي أرقام لـ ${additionalArg}`)

            return sendInteractive(
                `╮────────────────────────╭\n│ *📱 أرقام ${additionalArg}*\n╯────────────────────────╰`,
                rows, `أرقام ${additionalArg}`, '📱'
            )
        } catch (e) {
            return m.reply('❌ خطأ: ' + e.message)
        }
    }

    // ━━━ رسائل رقم ━━━
    if (feature === "رسائل") {
        if (!additionalArg) return m.reply('❌ أدخل رابط الرقم')
        try {
            await m.reply('⏳ جاري جلب الرسائل...')
            const res = await fetch(additionalArg, { headers: { 'User-Agent': UA } })
            const html = await res.text()
            const $ = cheerio.load(html)

            const rows = []
            // الرسائل في جدول
            $('table tr').each((i, el) => {
                if (i === 0) return // skip header
                const cells = $(el).find('td')
                if (cells.length < 2) return
                const from = $(cells[0]).text().trim()
                const msg = $(cells[1]).text().trim()
                const time = $(cells[2])?.text().trim() || ''
                if (msg && rows.length < 50) {
                    rows.push({
                        header: from || 'مجهول',
                        title: msg.slice(0, 72),
                        id: `${usedPrefix}${command} كود ${msg}`,
                        description: time
                    })
                }
            })

            if (!rows.length) return m.reply('❌ مش في رسائل للرقم ده دلوقتي')

            return sendInteractive(
                '╮────────────────────────╭\n│ *📨 قائمة الرسائل*\n╯────────────────────────╰',
                rows, 'الرسائل', '📧'
            )
        } catch (e) {
            return m.reply('❌ خطأ: ' + e.message)
        }
    }

    // ━━━ كود ━━━
    if (feature === "كود") {
        if (!additionalArg) return m.reply('❌ أدخل الكود')
        return conn.sendMessage(m.chat, {
            image: { url: pp },
            caption: `╮────────────────────────╭\n│ *🔐 الرسالة الكاملة:*\n│\n│ ${additionalArg}\n╯────────────────────────╰`
        }, { quoted: m })
    }
}

handler.help = ["رقم"]
handler.tags = ["tools"]
handler.command = /^(رقم)$/i

export default handler