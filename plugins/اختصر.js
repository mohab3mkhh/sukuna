// plugins/اختصر.js
// 🔗 اختصار الروابط عن طريق Prexzy API (Spoo.me)
//   .اختصر <الرابط> <الاسم>     ← رابط قصير باسم مخصص (مثال: .اختصر https://wheelofnames.com Mohab)
//   .اختصر <الرابط>              ← رابط قصير باسم عشوائي
//
// ملحوظة: أسماء بارامترات الـ API (url / alias) مكتوبة في أول الملف. لو الـ API رجّع خطأ،
// افتح تاب Code في صفحة الـ API وغيّر الأسماء هنا. الكود بيجرّب بدايل لوحده كمان.

import axios from 'axios'

const API = 'https://prexzyapis.com/tools/spooMe'
const FOOTER = '⛩️ SUKUNA BOT ⛩️'

// الاسم الأساسي للبارامترات + بدايل بيجرّبها لو الأول فشل
// أول محاولة بتبعت الاسم بكل الأسماء المحتملة مرة واحدة (الـ API بياخد اللي يعرفه ويتجاهل الباقي)
const ALIAS_KEYS = [process.env.SPOO_ALIAS_PARAM, 'alias', 'custom', 'customName', 'custom_name', 'name', 'slug', 'code', 'shortcode', 'back_half'].filter(Boolean)
const PARAM_SETS = [
  (url, alias) => ({ url, ...(alias ? Object.fromEntries(ALIAS_KEYS.map(k => [k, alias])) : {}) }),
  (url, alias) => ({ url, ...(alias ? { alias } : {}) }),
  (url, alias) => ({ link: url, ...(alias ? { alias } : {}) }),
]

const isUrl = s => { try { const u = new URL(s); return /^https?:$/.test(u.protocol) } catch { return false } }
const validAlias = s => /^[A-Za-z0-9_-]{3,30}$/.test(s)

async function shorten(url, alias) {
  let lastErr = 'مفيش رد'
  let fallback = null
  for (const build of PARAM_SETS) {
    try {
      const r = await axios.get(API, { params: build(url, alias), timeout: 20000, validateStatus: () => true })
      const d = r.data
      if (d?.status && d?.short_url) {
        // لو طلبت اسم والـ API تجاهله (اسم البارامتر غلط) نجرّب اسم تاني بدل ما نرجّع رابط بإسم عشوائي
        const got = String(d.custom_name || d.short_url.split('/').pop() || '').toLowerCase()
        if (!alias || got === alias.toLowerCase()) return d
        fallback = fallback || d
        console.log('[اختصر] الاسم اتجاهل، رد الـ API:', JSON.stringify(d).slice(0, 300))
        lastErr = 'الاسم المخصص اتجاهله الـ API'
        continue
      }
      lastErr = d?.message || d?.error || `HTTP ${r.status}`
      // 429 = طلبات كتير، مفيش فايدة من التجربة بأسماء تانية
      if (r.status === 429) break
    } catch (e) { lastErr = e.message }
  }
  if (fallback) { fallback.__aliasIgnored = true; return fallback }
  throw new Error(lastErr)
}

const handler = async (m, { conn, args, usedPrefix = '.', command }) => {
  const reply = text => conn.sendMessage(m.chat, { text }, { quoted: m })
  const [rawUrl, rawAlias] = args || []

  if (!rawUrl) {
    return reply(`🔗 *اختصار الروابط*\n\nاكتب:\n*${usedPrefix}${command} <الرابط> <الاسم>*\n\nمثال:\n*${usedPrefix}${command} https://wheelofnames.com Mohab*\n\n(الاسم اختياري، 3 إلى 30 حرف إنجليزي أو أرقام)\n\n> ${FOOTER}`)
  }

  const url = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`
  if (!isUrl(url) || !url.includes('.')) return reply('❌ الرابط غير صحيح.')
  if (rawAlias && !validAlias(rawAlias)) return reply('❌ الاسم لازم يكون 3 إلى 30 حرف إنجليزي أو أرقام أو _ أو -')

  await m.react?.('⏳')
  try {
    const d = await shorten(url, rawAlias)
    const short = String(d.short_url).replace(/^http:\/\//i, 'https://')
    const note = d.__aliasIgnored ? `\n⚠️ الـ API مقبلش الاسم "${rawAlias}" (اتعمل اسم عشوائي). غالباً اسم بارامتر الاسم في الملف محتاج يتعدّل (PARAM_SETS).\n` : ''
    await conn.sendMessage(m.chat, {
      text:
        `╭━━━〔 🔗 𝑺𝑯𝑶𝑹𝑻𝑬𝑵 〕━━━⬣\n` +
        `┃ ✦ 𝑶𝒓𝒊𝒈𝒊𝒏𝒂𝒍 ↬ ${d.original_url || url}\n` +
        `┃ ✦ 𝑺𝒉𝒐𝒓𝒕 ↬ ${short}\n` +
        (d.custom_name ? `┃ ✦ 𝑵𝒂𝒎𝒆 ↬ ${d.custom_name}\n` : '') +
        `╰━━━━━━━━━━━━━━⬣\n${note}\n> ${FOOTER}`,
    }, { quoted: m })
    await m.react?.('✅')
  } catch (e) {
    console.error('[اختصر]', e.message)
    await m.react?.('❌')
    const taken = /exist|taken|already|used|موجود/i.test(e.message)
    await reply(`❌ *فشل الاختصار*\n\n⚠️ ${taken ? 'الاسم ده مستخدم قبل كده، جرّب اسم تاني.' : String(e.message).slice(0, 200)}\n\n> ${FOOTER}`)
  }
}

handler.help = ['اختصر <رابط> <اسم>']
handler.tags = ['tools']
handler.command = /^(اختصر|spoo)$/i

export default handler