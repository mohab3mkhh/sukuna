// plugins/_allfake.js
import { generateWAMessageFromContent, prepareWAMessageMedia, proto } from '@whiskeysockets/baileys'
import fs from 'fs'
import fetch from 'node-fetch'
import axios from 'axios'
import moment from 'moment-timezone'

function pickRandom(list) {
  return list[Math.floor(Math.random() * list.length)]
}

const icono = 'https://files.catbox.moe/v41exb.jpg'

var handler = m => m

handler.all = async function (m) {
  try {

    // ── القنوات ──────────────────────────────────────────
    global.canalIdM = global.gojoChannels?.ids || [
      "120363405669087372@newsletter",
      "120363405669087372@newsletter"
    ]
    global.canalNombreM = global.gojoChannels?.names || [
      "☬ 𝐑𝐘𝐎𝐌𝐄𝐍 𝐒𝐔𝐊𝐔𝐍𝐀 ☬ ║ ♛ 𝐓𝐇𝐄 𝐊𝐈𝐍𝐆 𝐎𝐅 𝐂𝐔𝐑𝐒𝐄𝐒 ♛",
      "☬ 𝐑𝐘𝐎𝐌𝐄𝐍 𝐒𝐔𝐊𝐔𝐍𝐀 ☬ ║ ♛ 𝐓𝐇𝐄 𝐊𝐈𝐍𝐆 𝐎𝐅 𝐂𝐔𝐑𝐒𝐄𝐒 ♛"
    ]
    global.canalUrlM = global.gojoChannels?.urls || [
      "https://whatsapp.com/channel/0029VbBilcVAO7RNV5OlOI0j",
      "https://whatsapp.com/channel/0029VbBilcVAO7RNV5OlOI0j"
    ]

    // ── قناة عشوائية ────────────────────────────────────
    async function getRandomChannel() {
      const idx = Math.floor(Math.random() * global.canalIdM.length)
      return {
        id:   global.canalIdM[idx],
        name: global.canalNombreM[idx],
        url:  global.canalUrlM[idx]
      }
    }

    const channelRD = await getRandomChannel()
    global.channelRD = channelRD

    // ── اسم الزر عشوائي ─────────────────────────────────
    const randomTitle = pickRandom([
      global.botBrand || '⛩️SUKUNA⚡️BOT⛩️',
      '⟡ 𓂀 THE KING𓂀 ⟡',
      '⟡ 𓂀 RYOMEN SUKUNA 𓂀 ⟡',
      '⟡ 𓂀 SUKUNA 𓂀 ⟡'
    ])

    // ── توقيت ────────────────────────────────────────────
    const d = new Date(Date.now() + 3600000)
    global.d = d
    global.locale = 'ar'
    global.dia = d.toLocaleDateString(global.locale, { weekday: 'long' })
    global.fecha = d.toLocaleDateString('es', { day: 'numeric', month: 'numeric', year: 'numeric' })

    global.mes_ar = d.toLocaleDateString('ar', { month: 'long' })
    global.año_ar = d.toLocaleDateString('ar', { year: 'numeric' })
    global.tiempo_ar = d.toLocaleString('ar', { hour: 'numeric', minute: 'numeric', second: 'numeric', hour12: true })

    global.mes_en = d.toLocaleDateString('en', { month: 'long' })
    global.año_en = d.toLocaleDateString('en', { year: 'numeric' })
    global.tiempo_en = d.toLocaleString('en', { hour: 'numeric', minute: 'numeric', second: 'numeric', hour12: true })

    const canal   = channelRD.url
    const botname = global.botName || 'GOJO-BOT'
    const dev     = global.dev || 'Developer'

    global.nombre = m.pushName || 'GOJO SATORU'
    global.redes  = canal

    global.packsticker = `°.⎯⃘̶⎯̸⎯ܴ⎯̶᳞͇ࠝ⎯⃘̶⎯̸⎯ܴ⎯̶᳞͇ࠝ⎯⃘̶⎯̸.°\nᰔᩚ المستخدم: ${global.nombre}\n❀ البوت: ${botname}\n✦ التاريخ: ${global.fecha}\nⴵ الوقت: ${moment.tz('America/Caracas').format('HH:mm:ss')}`
    global.packsticker2 = `\n°.⎯⃘̶⎯̸⎯ܴ⎯̶᳞͇ࠝ⎯⃘̶⎯̸⎯ܴ⎯̶᳞͇ࠝ⎯⃘̶⎯̸.°\n\n${dev}`

    global.fkontak = {
      key: {
        participants: "0@s.whatsapp.net",
        remoteJid: "status@broadcast",
        fromMe: false,
        id: "Halo"
      },
      message: {
        contactMessage: {
          vcard: `BEGIN:VCARD\nVERSION:3.0\nN:Sy;Bot;;;\nFN:y\nitem1.TEL;waid=${m.sender.split('@')[0]}:${m.sender.split('@')[0]}\nitem1.X-ABLabel:Ponsel\nEND:VCARD`
        }
      },
      participant: "0@s.whatsapp.net"
    }

    // ── thumbnail ─────────────────────────────────────────
    const thumbnailBuffer = await (await fetch(icono).catch(() => null))
      ?.arrayBuffer()
      .then(ab => ab ? Buffer.from(ab) : null)
      .catch(() => null)

    // ── rcanal ────────────────────────────────────────────
    global.rcanal = {
      contextInfo: {
        isForwarded: true,
        forwardedNewsletterMessageInfo: {
          newsletterJid: channelRD.id,
          serverMessageId: '',
          newsletterName: channelRD.name
        },
        externalAdReply: {
          title: randomTitle,
          body: channelRD.name,
          mediaUrl: canal,
          description: null,
          previewType: "PHOTO",
          thumbnail: thumbnailBuffer || undefined,
          sourceUrl: canal,
          mediaType: 2,
          renderLargerThumbnail: false
        },
        mentionedJid: null
      }
    }

    // ── adReply المحدَّث في كل رسالة ──────────────────────
    global.adReply = {
      contextInfo: {
        forwardingScore: 999,
        isForwarded: true,
        forwardedNewsletterMessageInfo: {
          newsletterJid: channelRD.id,
          serverMessageId: '',
          newsletterName: channelRD.name
        },
        externalAdReply: {
          title: randomTitle,
          body: channelRD.name,
          thumbnailUrl: icono,
          thumbnail: thumbnailBuffer || undefined,
          sourceUrl: canal,
          mediaUrl: canal,
          mediaType: 1,
          renderLargerThumbnail: false
        }
      }
    }

  } catch (err) {
    console.error('[handler.all error]', err)
  }
}

export default handler
