/**
 * plugins/ستيكر_صوت.js
 * الرد على ستيكر + اسم الأغنية لإرسال ستيكر مدمج معه صوت عبر Baileys (ESM)
 */

import axios from 'axios'
import { spawn } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { prepareWAMessageMedia, proto } from '@whiskeysockets/baileys'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

function getQuotedSticker(m) {
  const q = m?.quoted
  if (!q) return null
  const mime = String(q.mimetype || q.msg?.mimetype || '').toLowerCase()
  const isSticker =
    q.mtype === 'stickerMessage' ||
    Boolean(q.msg?.stickerMessage) ||
    Boolean(q.message?.stickerMessage) ||
    mime.includes('webp')
  return isSticker ? q : null
}

function toOpusOggBuffer(inputBuffer) {
  return new Promise((resolve, reject) => {
    const tmpDir = os.tmpdir()
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const inPath = path.join(tmpDir, `${id}_in`)
    const outPath = path.join(tmpDir, `${id}_out.ogg`)

    fs.writeFileSync(inPath, inputBuffer)

    const ff = spawn('ffmpeg', [
      '-y',
      '-i', inPath,
      '-vn',
      '-c:a', 'libopus',
      '-b:a', '64k',
      '-ar', '48000',
      '-ac', '1',
      outPath
    ])

    ff.on('error', (err) => {
      try { fs.unlinkSync(inPath) } catch {}
      try { fs.unlinkSync(outPath) } catch {}
      reject(err)
    })

    ff.on('close', (code) => {
      try { fs.unlinkSync(inPath) } catch {}
      if (code !== 0 || !fs.existsSync(outPath)) {
        try { fs.unlinkSync(outPath) } catch {}
        return reject(new Error('فشل تحويل الصوت إلى OGG/Opus عبر ffmpeg'))
      }
      const outBuf = fs.readFileSync(outPath)
      try { fs.unlinkSync(outPath) } catch {}
      resolve(outBuf)
    })
  })
}

async function fetchSongAudioBuffer(query) {
  // محاولة جلب رابط/صوت من endpoints متاحة أو بحث يوتيوب إن وجد
  try {
    const ytsMod = await import('yt-search')
    const yts = ytsMod.default || ytsMod
    const searchRes = await yts(query)
    const video = searchRes?.videos?.[0]
    if (video?.url) {
      // جرّب API صوتي على prexzyapis إن وجد أو مسار متاح
      const endpoints = [
        `https://prexzyapis.com/download/ytmp3?url=${encodeURIComponent(video.url)}`,
        `https://prexzyapis.com/ai/song?q=${encodeURIComponent(query)}`
      ]
      for (const ep of endpoints) {
        try {
          const r = await axios.get(ep, {
            timeout: 45000,
            headers: { 'User-Agent': UA },
            validateStatus: () => true
          })
          const dlUrl =
            r?.data?.url ||
            r?.data?.download ||
            r?.data?.result?.url ||
            r?.data?.data?.url
          if (dlUrl && /^https?:\/\//i.test(dlUrl)) {
            const aud = await axios.get(dlUrl, {
              responseType: 'arraybuffer',
              timeout: 60000,
              headers: { 'User-Agent': UA }
            })
            if (aud.data && Buffer.byteLength(aud.data) > 2000) {
              return Buffer.from(aud.data)
            }
          }
        } catch {}
      }
    }
  } catch {}

  throw new Error('لم أتمكن من تحميل ملف صوت للأغنية؛ تأكد من توفر مصدر تحميل صوتي أو yt-search.')
}

const handler = async (m, { conn, text, usedPrefix, command }) => {
  const quotedSticker = getQuotedSticker(m)
  const songName = (text || '').trim()

  if (!quotedSticker || !songName) {
    return m.reply(
      `🎵 *ستيكر بصوت*\n\nرد على ستيكر واكتب اسم الأغنية:\n*مثال:* ${usedPrefix + command} Funk Da Montanha`
    )
  }

  try {
    const stickerBuf = await quotedSticker.download()
    if (!stickerBuf || !Buffer.isBuffer(stickerBuf) || stickerBuf.length < 500) {
      return m.reply('❌ تعذر تحميل الستيكر المردود عليه.')
    }

    const rawAudioBuf = await fetchSongAudioBuffer(songName)
    const opusBuf = await toOpusOggBuffer(rawAudioBuf)

    const stickerMedia = await prepareWAMessageMedia(
      { sticker: stickerBuf },
      { upload: conn.waUploadToServer }
    )

    const audioMedia = await prepareWAMessageMedia(
      { audio: opusBuf, mimetype: 'audio/ogg; codecs=opus', ptt: false },
      { upload: conn.waUploadToServer }
    )

    // بناء حقل 134 الخاص بالستيكر المدمج معه صوت حسب الفحص
    const payload = proto.Message.fromObject({
      134: {
        1: {
          26: stickerMedia.stickerMessage,
          26: audioMedia.audioMessage
        }
      }
    })

    await conn.relayMessage(m.chat, payload, { quoted: m })
  } catch (err) {
    console.error('[sticker-audio]', err)
    await m.reply(`❌ *خطأ:* ${err?.message || err}`)
  }
}

handler.help = ['ستيكر_صوت <اسم الأغنية>']
handler.tags = ['sticker']
handler.command = /^(ستيكر_صوت|ستيكر_اغنية|songsticker)$/i

export default handler