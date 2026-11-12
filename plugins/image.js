import fetch from 'node-fetch'
import axios from 'axios'
import CryptoJS from 'crypto-js'
import crypto from 'crypto'
import FormData from 'form-data'
import { fileTypeFromBuffer } from 'file-type'

const AES_KEY = "ai-enhancer-web__aes-key"
const AES_IV = "aienhancer-aesiv"

function encryptSettings(settings) {
  const key = CryptoJS.enc.Utf8.parse(AES_KEY)
  const iv = CryptoJS.enc.Utf8.parse(AES_IV)
  return CryptoJS.AES.encrypt(
    JSON.stringify(settings),
    key,
    { iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 }
  ).toString()
}

async function aienhancerEdit(base64Image, prompt) {
  const settings = {
    aspect_ratio: "match_input_image",
    output_format: "jpg",
    prompt
  }
  const payload = {
    model: 2,
    image: [base64Image],
    function: 'ai-تعديل',
    settings: encryptSettings(settings)
  }
  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Linux; Android 16; ASUS_AI2401_A Build/BP2A.250605.015) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.6998.135 Mobile Safari/537.36',
    'Origin': 'https://aienhancer.ai',
    'Referer': 'https://aienhancer.ai/ai-تعديل',
    'Accept': '*/*',
    'Accept-Language': 'id-ID,id;q=0.9',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-origin',
    'x-requested-with': 'mark.via.gp'
  }
  const res = await axios.post('https://aienhancer.ai/api/v1/r/image-enhance/create', payload, { headers, timeout: 30000 })
  if (res.data.code !== 100000) throw new Error(res.data.message)
  const taskId = res.data.data.id

  const start = Date.now()
  while (Date.now() - start < 90000) {
    const poll = await axios.post('https://aienhancer.ai/api/v1/r/image-enhance/result', { task_id: taskId }, { headers })
    if (poll.data.code !== 100000) throw new Error(poll.data.message)
    const task = poll.data.data
    if (task.status === 'succeeded') return task.output
    if (task.status === 'failed') throw new Error(task.error || 'Task failed')
    await new Promise(r => setTimeout(r, 3000))
  }
  throw new Error('Timed out')
}

async function imgeditorEdit(buffer, prompt) {
  const upRes = await fetch('https://imgeditor.co/api/get-upload-url', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fileName: 'photo.jpg', contentType: 'image/jpeg', fileSize: buffer.length })
  })
  const up = await upRes.json()
  await fetch(up.uploadUrl, {
    method: 'PUT',
    headers: { 'content-type': 'image/jpeg' },
    body: buffer
  })
  const genRes = await fetch('https://imgeditor.co/api/generate-image', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      prompt,
      styleId: 'realistic',
      mode: 'image',
      imageUrl: up.publicUrl,
      imageUrls: [up.publicUrl],
      numImages: 1,
      outputFormat: 'png',
      model: 'nano-banana'
    })
  })
  const task = await genRes.json()
  while (true) {
    await new Promise(r => setTimeout(r, 2500))
    const statusRes = await fetch(`https://imgeditor.co/api/generate-image/status?taskId=${task.taskId}`)
    const json = await statusRes.json()
    if (json.status === 'completed') return json.imageUrl
    if (json.status === 'failed') throw new Error('فشلت المهمة')
  }
}

const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCwlO+boC6cwRo3UfXVBadaYwcX
0zKS2fuVNY2qZ0dgwb1NJ+/Q9FeAosL4ONiosD71on3PVYqRUlL5045mvH2K9i8b
AFVMEip7E6RMK6tKAAif7xzZrXnP1GZ5Rijtqdgwh+YmzTo39cuBCsZqK9oEoeQ3
r/myG9S+9cR5huTuFQIDAQAB
-----END PUBLIC KEY-----`

const APP_ID = "aifaceswap"
const U_ID = "1H5tRtzsBkqXcaJ"

const generateRandomString = (len) => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

const aesenc = (data, key) => {
  const k = CryptoJS.enc.Utf8.parse(key)
  return CryptoJS.AES.encrypt(data, k, { iv: k, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 }).toString()
}

const rsaenc = (data) => crypto.publicEncrypt(
  { key: PUBLIC_KEY, padding: crypto.constants.RSA_PKCS1_PADDING },
  Buffer.from(data, 'utf8')
).toString('base64')

const gencryptoheaders = (type, fp = null) => {
  const n = Math.floor(Date.now() / 1000)
  const r = crypto.randomUUID()
  const i = generateRandomString(16)
  const fingerPrint = fp || crypto.randomBytes(16).toString('hex')
  const s = rsaenc(i)
  const signStr = type === 'upload' ? `${APP_ID}:${r}:${s}` : `${APP_ID}:${U_ID}:${n}:${r}:${s}`
  return {
    fp: fingerPrint,
    fp1: aesenc(`${APP_ID}:${fingerPrint}`, i),
    'x-guide': s,
    'x-sign': aesenc(signStr, i),
    'x-code': Date.now().toString()
  }
}

const LIVE3D_HEADERS = {
  'User-Agent': 'Mozilla/5.0',
  'Accept': 'application/json, text/plain, */*',
  'origin': 'https://live3d.io',
  'referer': 'https://live3d.io/',
  'theme-version': '83EmcUoQTUv50LhNx0VrdcK8rcGexcP35FcZDcpgWsAXEyO4xqL5shCY6sFIWB2Q'
}

async function live3dGen(prompt) {
  const cryptoHeaders = gencryptoheaders('create')
  const res = await fetch('https://app.live3d.io/aitools/of/create', {
    method: 'POST',
    headers: { ...LIVE3D_HEADERS, 'Content-Type': 'application/json', ...cryptoHeaders },
    body: JSON.stringify({
      fn_name: 'demo-تعديل',
      call_type: 3,
      input: {
        model: 'nano_banana_pro',
        source_images: [],
        prompt,
        aspect_radio: '1:1',
        request_from: 9
      },
      data: '',
      request_from: 9,
      origin_from: '8f3f0c7387123ae0'
    })
  })
  const data = await res.json()
  const taskId = data.data.task_id
  const fp = cryptoHeaders.fp

  let result
  do {
    await new Promise(r => setTimeout(r, 4000))
    const checkHeaders = gencryptoheaders('check', fp)
    const checkRes = await fetch('https://app.live3d.io/aitools/of/check-status', {
      method: 'POST',
      headers: { ...LIVE3D_HEADERS, 'Content-Type': 'application/json', ...checkHeaders },
      body: JSON.stringify({
        task_id: taskId,
        fn_name: 'demo-تعديل',
        call_type: 3,
        request_from: 9,
        origin_from: '8f3f0c7387123ae0'
      })
    })
    const checkData = await checkRes.json()
    result = checkData.data
  } while (result.status !== 2)

  return 'https://temp.live3d.io/' + result.result_image
}

function generateProductSerial() {
  const chars = '0123456789abcdef'
  let serial = ''
  for (let i = 0; i < 32; i++) serial += chars[Math.floor(Math.random() * chars.length)]
  return serial
}

function getCommonHeaders(serial) {
  return {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 14; 22120RN86G Build/UP1A.231005.007) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.7680.177 Mobile Safari/537.36',
    'sec-ch-ua': '"Chromium";v="146", "Not-A.Brand";v="24", "Android WebView";v="146"',
    'sec-ch-ua-mobile': '?1',
    'sec-ch-ua-platform': '"Android"',
    'x-requested-with': 'mark.via.gp',
    'accept-language': 'ar-EG,ar;q=0.9,en-US;q=0.8,en;q=0.7',
    'origin': 'https://photoeditorai.io',
    'referer': 'https://photoeditorai.io/',
    'product-serial': serial,
    'sec-fetch-site': 'same-site',
    'sec-fetch-mode': 'cors',
    'sec-fetch-dest': 'empty',
  }
}

async function photoEditorCreate(buffer, prompt) {
  const serial = generateProductSerial()
  const { mime = 'image/jpeg' } = (await fileTypeFromBuffer(buffer)) || {}

  const form = new FormData()
  form.append('model_name', 'photoeditor_4.0')
  form.append('target_images', buffer, { filename: 'image.jpg', contentType: mime })
  form.append('prompt', prompt)
  form.append('ratio', 'match_input_image')
  form.append('image_resolution', '1K')

  const res = await fetch('https://api.photoeditorai.io/pe/photo-editor/create-job', {
    method: 'POST',
    headers: { ...getCommonHeaders(serial), 'Accept': 'application/json, text/plain, */*', ...form.getHeaders() },
    body: form,
  })

  const rawBody = await res.text()
  if (!res.ok) throw new Error(`فشل إنشاء المهمة: ${res.status}`)

  let data
  try { data = JSON.parse(rawBody) } catch { throw new Error('خطأ JSON من photoeditorai') }
  if (data.code !== 100000) throw new Error(data.message || 'خطأ من الخادم')

  return { jobId: data.result.job_id, serial }
}

async function photoEditorWait(jobId, serial, maxWait = 120000) {
  const start = Date.now()
  while (Date.now() - start < maxWait) {
    const res = await fetch(`https://api.photoeditorai.io/pe/photo-editor/get-job/${jobId}`, {
      method: 'GET',
      headers: { ...getCommonHeaders(serial), 'Accept': 'application/json, text/plain, */*' },
    })
    const rawBody = await res.text()
    if (!res.ok) throw new Error(`فشل الاستعلام: ${res.status}`)

    let data
    try { data = JSON.parse(rawBody) } catch { throw new Error('خطأ JSON') }
    if (data.code !== 100000) throw new Error(data.message || 'خطأ')

    const result = data.result
    if (result?.status === 2 && Array.isArray(result.output) && result.output.length > 0) return result.output[0]
    if (result?.status === 3) throw new Error(result.error || 'فشلت المهمة')

    await new Promise(r => setTimeout(r, 3000))
  }
  throw new Error('انتهت مهلة الانتظار')
}

async function gptimage(prompt, buffer) {
  const { data } = await axios.post(
    'https://ghibli-proxy.netlify.app/.netlify/functions/ghibli-proxy',
    {
      image: 'data:image/png;base64,' + buffer.toString('base64'),
      prompt,
      model: 'gpt-image-1',
      n: 1,
      size: 'auto',
      quality: 'low'
    },
    {
      headers: {
        origin: 'https://overchat.ai',
        referer: 'https://overchat.ai/',
        'user-agent': 'Mozilla/5.0 (Linux; Android 15; SM-F958 Build/AP3A.240905.015) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.86 Mobile Safari/537.36'
      }
    }
  )
  const result = data?.data?.[0]?.b64_json
  if (!result) throw new Error('لا يوجد نتيجة')
  return Buffer.from(result, 'base64')
}

let handler = async (m, { conn, text }) => {
  const quoted = m.quoted ? m.quoted : m
  const quotedMsg = quoted?.msg || quoted
  const mime = quotedMsg?.mimetype || m.message?.imageMessage?.mimetype || ''
  const hasImage = /image\/(jpeg|png|webp)/.test(mime)

  if (!hasImage && !text) {
    return m.reply(
      `🎨 *نانو بنانا - تعديل الصور بالذكاء الاصطناعي*\n\n` +
      `*مع صورة:*\n` +
      `ارسل صورة مع الأمر كـ caption أو رد على صورة:\n` +
      `\`.تعديل <الوصف>\`\n\n` +
      `*بدون صورة:*\n` +
      `توليد صورة من نص فقط:\n` +
      `\`.نانو <الوصف>\`\n\n` +
      `*أمثلة:*\n` +
      `▸ \`.تعديل حولها لأنمي\`\n` +
      `▸ \`.تعديل أضف ثلج\`\n` +
      `▸ \`.نانو قطة نائمة على القمر\``
    )
  }

  if (!text) return m.reply('⚠️ أين الوصف؟\nمثال: .تعديل حولها لأنمي')

  const prompt = text.trim()
  const wait = await conn.sendMessage(m.chat, { text: '⏳ جاري تعديل صورتك بواسطة nanobanana' }, { quoted: m })

  if (hasImage) {
    let buffer
    try {
      buffer = await (m.message?.imageMessage ? m.download() : quoted.download())
      if (!buffer) throw new Error('فارغ')
    } catch {
      return conn.sendMessage(m.chat, { edit: wait.key, text: '❌ فشل تحميل الصورة!' })
    }

    const base64Image = `data:image/jpeg;base64,${buffer.toString('base64')}`

    try {
      const { jobId, serial } = await photoEditorCreate(buffer, prompt)
      const resultUrl = await photoEditorWait(jobId, serial)
      await conn.sendMessage(m.chat, {
        image: { url: resultUrl },
        caption: `✅ تم!\n📝 الوصف: ${prompt}`
      }, { quoted: m })
      return conn.sendMessage(m.chat, { delete: wait.key })
    } catch (e1) {
      try {
        const resultUrl = await aienhancerEdit(base64Image, prompt)
        await conn.sendMessage(m.chat, {
          image: { url: resultUrl },
          caption: `✅ تم!\n📝 الوصف: ${prompt}`
        }, { quoted: m })
        return conn.sendMessage(m.chat, { delete: wait.key })
      } catch (e2) {
        try {
          const resultUrl = await imgeditorEdit(buffer, prompt)
          await conn.sendMessage(m.chat, {
            image: { url: resultUrl },
            caption: `✅ تم!\n📝 الوصف: ${prompt}`
          }, { quoted: m })
          return conn.sendMessage(m.chat, { delete: wait.key })
        } catch (e3) {
          try {
            const resultBuffer = await gptimage(prompt, buffer)
            await conn.sendMessage(m.chat, { delete: wait.key })
            return conn.sendFile(
              m.chat,
              resultBuffer,
              'result.jpg',
              `✅ تم!\n📝 الوصف: ${prompt}`,
              m
            )
          } catch (e4) {
            return conn.sendMessage(m.chat, {
              edit: wait.key,
              text: `❌ فشلت جميع المصادر!\n\n${e1.message}\n${e2.message}\n${e3.message}\n${e4.message}`
            })
          }
        }
      }
    }

  } else {
    try {
      const resultUrl = await live3dGen(prompt)
      await conn.sendMessage(m.chat, {
        image: { url: resultUrl },
        caption: `✅ تم!\n📝 الوصف: ${prompt}`
      }, { quoted: m })
      conn.sendMessage(m.chat, { delete: wait.key })
    } catch (err) {
      conn.sendMessage(m.chat, {
        edit: wait.key,
        text: `❌ فشل التوليد!\n\nخطأ: ${err.message}`
      })
    }
  }
}

handler.help = ['تعديل <الوصف>', 'نانو <الوصف>']
handler.tags = ['ai']
handler.command = /^(نانو|نانوبنانا|نانو-بنانا|تعديل|فوتوشوب|nb|nano|nanobanana)$/i

export default handler