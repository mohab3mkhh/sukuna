// plugins/menu.js
// ✧ 𝑪𝑯𝑶𝑺𝑶 - 𝑫𝑨𝑹𝑲 𝑺𝒀𝑺𝑻𝑬𝑴 🩸

import {
    prepareWAMessageMedia,
    generateWAMessageFromContent,
    proto
} from '@whiskeysockets/baileys'

const CHANNEL_URL = 'https://whatsapp.com/channel/0029Vb95dwAEFeXuObhCi428'

const AUDIO_URL = 'https://file.garden/apRPrQwG5p78Av-N/4_5818919106774048971.mp3'

const MEDIA_URLS = [
    'https://file.garden/apRPrQwG5p78Av-N/VID-20261009-WA0048.mp4',
    'https://file.garden/apRPrQwG5p78Av-N/ff7745a5a4566247e038ff8587d6eb40.jpg'
]

const clockString = (ms) => {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)

    return [
        days ? `${days} يوم` : '',
        `${hours % 24} ساعة`,
        `${minutes % 60} دقيقة`,
        `${seconds % 60} ثانية`
    ].filter(Boolean).join(' و ')
}

const xpRange = (level = 0, multiplier = 100) => {
    level = Math.max(0, Number(level) || 0)
    multiplier = Math.max(0, Number(multiplier) || 100)

    const min = level <= 0
        ? 0
        : Math.floor(50 * level ** 2 * multiplier / 100)

    const max = Math.floor(
        50 * (level + 1) ** 2 * multiplier / 100
    )

    return { min, max }
}

const progressBar = (percentage, length = 10) => {
    const value = Math.max(0, Math.min(100, Number(percentage) || 0))
    const filled = Math.round(value / 100 * length)

    return '▰'.repeat(filled) + '░'.repeat(length - filled)
}

const getCommandName = (plugin, fileName) => {
    if (Array.isArray(plugin.help) && plugin.help.length) {
        return String(plugin.help[0])
            .replace(/<[^>]+>/g, '')
            .replace(/\[[^\]]+\]/g, '')
            .trim()
    }

    if (typeof plugin.help === 'string' && plugin.help.trim()) {
        return plugin.help
            .replace(/<[^>]+>/g, '')
            .replace(/\[[^\]]+\]/g, '')
            .trim()
    }

    const commands = Array.isArray(plugin.command)
        ? plugin.command
        : [plugin.command]

    for (const command of commands) {
        if (typeof command === 'string') return command

        if (command instanceof RegExp) {
            const source = command.source
                .replace(/^\^/, '')
                .replace(/\$$/, '')
                .replace(/\\(.)/g, '$1')
                .replace(/^\(\?:/, '')
                .replace(/[()]/g, '')
                .split('|')[0]

            if (source) return source
        }
    }

    return String(fileName || 'أمر').replace(/\.js$/i, '').trim()
}

const getSectionsRows = () => [
    {
        title: '『 👮 الادمن 』',
        description: '🩸 إدارة المجموعة والتحكم فيها',
        id: '.ق1'
    },
    {
        title: '『 🎨 الملصقات 』',
        description: '✧ صناعة الملصقات وتحويل الوسائط',
        id: '.ق2'
    },
    {
        title: '『 🎮 الألعاب 』',
        description: '👾 الألعاب والتحديات والمسابقات',
        id: '.ق3'
    },
    {
        title: '『 📥 التحميلات 』',
        description: '🩸 البحث والتحميل من المواقع',
        id: '.ق4'
    },
    {
        title: '『 🧰 الأدوات 』',
        description: '✧ الأدوات والأوامر العامة',
        id: '.ق5'
    },
    {
        title: '『 📚 المانجا 』',
        description: '👾 المانجا والمانهوا',
        id: '.ق6'
    },
    {
        title: '『 🤖 الذكاء الاصطناعي 』',
        description: '🩸 أوامر الذكاء الاصطناعي',
        id: '.ق7'
    },
    {
        title: '『 🏆 النقابات 』',
        description: '✧ الألقاب والنقابات',
        id: '.ق8'
    },
    {
        title: '『 🖼️ الصور 』',
        description: '👾 الصور والتأثيرات',
        id: '.ق9'
    },
    {
        title: '『 🎭 الترفيه 』',
        description: '🩸 الترفيه والتسلية',
        id: '.ق10'
    },
    {
        title: '『 👑 المطور 』',
        description: '👾 صلاحيات المطور والتحكم بالنظام',
        id: '.ق11'
    },
    {
        title: '『 🏦 البنك 』',
        description: '💰 الرصيد والاستثمار والأسهم',
        id: '.ق12'
    }
]

const createMenuButtons = () => [
    {
        name: 'single_select',
        buttonParamsJson: JSON.stringify({
            title: '❄ اختر القسم',
            sections: [
                {
                    title: '🩸 أقسام بوت تشوسو',
                    rows: getSectionsRows()
                }
            ]
        })
    },
    {
        name: 'quick_reply',
        buttonParamsJson: JSON.stringify({
            display_text: '🌌 تنصيب البوت',
            id: '.تنصيب'
        })
    },
    {
        name: 'cta_url',
        buttonParamsJson: JSON.stringify({
            display_text: '🩸 قناة المطور',
            url: CHANNEL_URL
        })
    }
]

const sendMainMenu = async (m, conn, menuText) => {
    const payload = {
        body: {
            text: menuText
        },
        footer: {
            text: '⛧ 𝑷𝑶𝑾𝑬𝑹𝑬𝑫 𝑩𝒀 𝑨𝑹𝑬𝑺 🩸'
        },
        header: {
            hasMediaAttachment: false,
            title: '🩸 𝑪𝑯𝑶𝑺𝑶 𝑩𝑶𝑻',
            subtitle: '❄ 𝑬𝑵𝑻𝑬𝑹 𝑻𝑯𝑬 𝑫𝑨𝑹𝑲 𝑺𝑰𝑫𝑬'
        },
        nativeFlowMessage: {
            buttons: createMenuButtons()
        }
    }

    const selectedMedia = MEDIA_URLS[
        Math.floor(Math.random() * MEDIA_URLS.length)
    ]

    try {
        const isVideo = selectedMedia.endsWith('.mp4')

        const mediaPayload = isVideo
            ? { video: { url: selectedMedia } }
            : { image: { url: selectedMedia } }

        const preparedMedia = await prepareWAMessageMedia(
            mediaPayload,
            { upload: conn.waUploadToServer }
        )

        payload.header.hasMediaAttachment = true

        if (isVideo) {
            payload.header.videoMessage = {
                ...preparedMedia.videoMessage,
                gifPlayback: true
            }
        } else {
            payload.header.imageMessage = preparedMedia.imageMessage
        }

    } catch (err) {
        console.error(
            '[CHOSO MEDIA HEADER ERROR]',
            err?.message || err
        )
    }

    const interactiveMessage =
        proto.Message.InteractiveMessage.fromObject(payload)

    const jid = conn.user?.id || conn.user?.jid

    if (!jid) {
        throw new Error('تعذر تحديد رقم البوت')
    }

    const message = generateWAMessageFromContent(
        m.chat,
        {
            viewOnceMessage: {
                message: {
                    messageContextInfo: {
                        deviceListMetadata: {},
                        deviceListMetadataVersion: 2
                    },
                    interactiveMessage
                }
            }
        },
        {
            userJid: jid,
            quoted: m
        }
    )

    await conn.relayMessage(m.chat, message.message, {
        messageId: message.key.id
    })

    const fakeAudio = {
        key: {
            participant: '0@s.whatsapp.net',
            ...(m.chat ? {
                remoteJid: '6289643739077-1613049930@g.us'
            } : {})
        },
        message: {
            videoMessage: {
                title: '𝑨𝑹𝑬𝑺',
                h: 'Hmm',
                seconds: '99999',
                gifPlayback: true,
                caption: '𝑨𝑹𝑬𝑺'
            }
        }
    }

    await conn.sendMessage(
        m.chat,
        {
            audio: {
                url: AUDIO_URL
            },
            mimetype: 'audio/mpeg',
            ptt: false
        },
        {
            quoted: fakeAudio
        }
    )
}

const handler = async (m, { conn, usedPrefix }) => {
    try {
        const user = global.db?.data?.users?.[m.sender] || {}

        const ownerNumbers = (global.owner || []).map(owner => {
            const number = Array.isArray(owner) ? owner[0] : owner
            return String(number).replace(/\D/g, '')
        })

        const senderNumber = String(m.sender)
            .split('@')[0]
            .replace(/\D/g, '')

        const isCreator = ownerNumbers.includes(senderNumber)

        const {
            exp = 0,
            level = 0,
            role = 'عابر سبيل',
            limit = 0
        } = user

        const { min, max } = xpRange(
            level,
            global.multiplier || 100
        )

        const safeExp = Math.max(0, Number(exp) || 0)

        const progress = isCreator
            ? 100
            : max > min
                ? Math.min(
                    100,
                    Math.max(
                        0,
                        Math.floor(
                            ((safeExp - min) / (max - min)) * 100
                        )
                    )
                )
                : 0

        const expBar = progressBar(progress)

        const MAX_CREDITS = 1000

        const creditProgress = isCreator
            ? 100
            : Math.min(
                100,
                Math.max(
                    0,
                    (Number(limit) || 0) / MAX_CREDITS * 100
                )
            )

        const creditsBar = progressBar(creditProgress)

        const now = new Date()

        const date = now.toLocaleDateString('en-US', {
            day: '2-digit',
            month: 'long',
            year: 'numeric',
            timeZone: 'Africa/Cairo'
        })

        const dayName = now.toLocaleDateString('en-US', {
            weekday: 'long',
            timeZone: 'Africa/Cairo'
        })

        const time = now.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true,
            timeZone: 'Africa/Cairo'
        })

        const botName =
            global.botName ||
            global.namebot ||
            '𝑪𝑯𝑶𝑺𝑶'

        const devName =
            global.devName ||
            global.author ||
            '𝑨𝑹𝑬𝑺'

        const tagUser = `@${senderNumber}`

        const commandNames = new Set()

        for (const [fileName, plugin] of Object.entries(global.plugins || {})) {
            if (!plugin?.command) continue

            const name = getCommandName(plugin, fileName)

            if (name) commandNames.add(name)
        }

        const totalCommands = commandNames.size

        await conn.sendMessage(m.chat, {
            react: {
                text: '🩸',
                key: m.key
            }
        }).catch(() => {})

        const menuText = `

╔═══『 🩸 𝑪𝑯𝑶𝑺𝑶 𝑺𝒀𝑺𝑻𝑬𝑴 🩸 』═══╗
┃ ❄ 𝑺𝒀𝑺𝑻𝑬𝑴 𝑺𝑻𝑨𝑻𝑼𝑺 : 𝑶𝑵𝑳𝑰𝑵𝑬
┃ 🩸 𝑾𝑬𝑳𝑪𝑶𝑴𝑬, 𝑷𝑳𝑨𝒀𝑬𝑹
╚══════════════════════╝

╭━━━〔 🩸 𝑷𝑳𝑨𝒀𝑬𝑹 𝑷𝑹𝑶𝑭𝑰𝑳𝑬 〕━━━╮
┃ ◈ 👤 𝑼𝑺𝑬𝑹 : ${tagUser}
┃ ◈ 🎖️ 𝑳𝑬𝑽𝑬𝑳 : ${isCreator ? '♾️ 𝑴𝑨𝑿' : level}
┃ ◈ ⚡ 𝑬𝑿𝑷 : ${progress}%
┃ ◈ ${expBar}
┃ ◈ 👑 𝑹𝑨𝑵𝑲 : ${isCreator ? '👾 حاكم النظام' : role}
┃ ◈ 💎 𝑪𝑹𝑬𝑫𝑰𝑻𝑺 : ${isCreator ? '∞' : limit}
┃ ◈ ${creditsBar}
╰━━━━━━━━━━━━━━━━━━━━━━╯

╭━━━〔 👾 𝑺𝒀𝑺𝑻𝑬𝑴 𝑰𝑵𝑭𝑶 〕━━━╮
┃ ✧ 🤖 𝑩𝑶𝑻 𝑵𝑨𝑴𝑬 : ${botName}
┃ ✧ 👑 𝑫𝑬𝑽𝑬𝑳𝑶𝑷𝑬𝑹 : ${devName}
┃ ✧ 📜 𝑪𝑶𝑴𝑴𝑨𝑵𝑫𝑺 : ${totalCommands}
┃ ✧ ⌨️ 𝑷𝑹𝑬𝑭𝑰𝑿 : ${usedPrefix}
┃ ✧ ⏳ 𝑼𝑷𝑻𝑰𝑴𝑬 : ${clockString(process.uptime() * 1000)}
╰━━━━━━━━━━━━━━━━━━━━━━╯

╭━━━〔 🕰️ 𝑺𝒀𝑺𝑻𝑬𝑴 𝑪𝑳𝑶𝑪𝑲 〕━━━╮
┃ 🗓️ 𝑫𝑨𝒀 : ${dayName}
┃ 📆 𝑫𝑨𝑻𝑬 : ${date}
┃ ⏰ 𝑻𝑰𝑴𝑬 : ${time}
╰━━━━━━━━━━━━━━━━━━━━━━╯

╭━━〔 🩸 𝑺𝑬𝑳𝑬𝑪𝑻 𝒀𝑶𝑼𝑹 𝑫𝑬𝑺𝑻𝑰𝑵𝑨𝑻𝑰𝑶𝑵 〕━━╮
┃ ❄ اختار القسم المطلوب من القائمة التفاعلية.
┃ ⚔️ 𝑻𝑯𝑬 𝑩𝑶𝑻 𝑰𝑺 𝑾𝑨𝑰𝑻𝑰𝑵𝑮...
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯
`.trim()

        await sendMainMenu(m, conn, menuText)

    } catch (error) {
        console.error(
            '[CHOSO MENU ERROR]',
            error?.stack || error
        )

        await conn.sendMessage(
            m.chat,
            {
                text:
                    '╭━━━〔 🩸 𝑪𝑯𝑶𝑺𝑶 〕━━━╮\n\n' +
                    '⚠️ حصل خطأ أثناء إرسال القائمة أو الصوت.\n' +
                    'راجع الخطأ في Terminal.\n\n' +
                    '╰━━━━━━━━━━━━━━━━━━╯'
            },
            { quoted: m }
        ).catch(() => {})
    }
}

handler.help = ['اوامر', 'أوامر']
handler.tags = ['main']

handler.command =
    /^(اوامر|أوامر|الاوامر|س|اوامرو|الوامر|المساعده|help)$/i

export default handler