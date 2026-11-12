/**
 * plugins/apk.js
 * تحميل APK من APKPure API
 */

import fetch from 'node-fetch';
import * as pkg from '@whiskeysockets/baileys';
const { proto, generateWAMessageFromContent } = pkg;

async function sendList(conn, jid, data, quoted) {
  const msg = generateWAMessageFromContent(jid, {
    viewOnceMessage: {
      message: {
        interactiveMessage: proto.Message.InteractiveMessage.create({
          body:   proto.Message.InteractiveMessage.Body.create({ text: data.body }),
          footer: proto.Message.InteractiveMessage.Footer.create({ text: data.footer }),
          header: proto.Message.InteractiveMessage.Header.create({ title: data.title }),
          nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
            buttons: [{
              name: 'single_select',
              buttonParamsJson: JSON.stringify({
                title: '📲 اختر تطبيق للتحميل',
                sections: data.sections
              })
            }]
          })
        })
      }
    }
  }, { quoted });

  await conn.relayMessage(jid, msg.message, { messageId: msg.key.id });
}

// البحث عبر APKCombo API
async function searchApps(query) {
  const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
  
  // جرب APKPure search
  const res = await fetch(
    `https://apkpure.com/search?q=${encodeURIComponent(query)}`,
    { headers }
  )
  const html = await res.text()
  
  const apps = []
  const matches = html.matchAll(/href="\/([^"\/]+)\/([^"\/]+)"[^>]*class="[^"]*first-info[^"]*"[\s\S]{0,500}?<p class="search-title">([^<]+)<\/p>/g)
  
  for (const m of matches) {
    if (apps.length >= 10) break
    apps.push({
      name: m[3]?.trim() || m[1],
      package: m[2]?.trim(),
      slug: m[1]?.trim()
    })
  }

  // لو APKPure فشلت، جرب Aptoide
  if (!apps.length) {
    const res2 = await fetch(
      `https://ws75.aptoide.com/api/7/apps/search?query=${encodeURIComponent(query)}&limit=15`,
      { headers }
    )
    const json = await res2.json()
    const list = json.datalist?.list || []
    for (const app of list) {
      apps.push({
        name: app.name,
        package: app.package,
        rating: app.stats?.rating?.avg || 0,
        downloads: app.stats?.downloads || 0,
        size: app.file?.filesize || 0,
        icon: app.icon,
        version: app.file?.vername || ''
      })
    }
  }

  return apps
}

// معلومات التحميل من Aptoide
async function getDownloadInfo(packageName) {
  const res = await fetch(
    `https://ws75.aptoide.com/api/7/apps/search?query=${encodeURIComponent(packageName)}&limit=1`
  )
  const json = await res.json()
  const app = json.datalist?.list?.[0]
  if (!app) throw new Error('لم يتم العثور على التطبيق')

  // جرب تجيب نسخ متعددة
  const versions = []
  try {
    const verRes = await fetch(
      `https://ws75.aptoide.com/api/7/app/getMeta?package_name=${packageName}&limit=5`
    )
    const verJson = await verRes.json()
    if (verJson.nodes?.meta?.data) {
      const d = verJson.nodes.meta.data
      versions.push({
        version: d.file?.vername || 'latest',
        size: d.file?.filesize || 0,
        url: d.file?.path
      })
    }
  } catch {}

  let obb_link = null
  try { obb_link = app.obb?.main?.path } catch {}

  return {
    name: app.name,
    icon: app.icon,
    package: app.package,
    version: app.file?.vername || '',
    size: app.file?.filesize || 0,
    downloadUrl: app.file?.path,
    obb_link,
    rating: app.stats?.rating?.avg || 0,
    downloads: app.stats?.downloads || 0,
    description: app.media?.description || ''
  }
}

const formatSize = (bytes) => {
  if (!bytes) return 'غير معروف'
  if (bytes > 1e9) return `${(bytes/1e9).toFixed(1)} GB`
  if (bytes > 1e6) return `${(bytes/1e6).toFixed(1)} MB`
  return `${(bytes/1e3).toFixed(0)} KB`
}

const handler = async (m, { conn, text }) => {
  if (!text) {
    return conn.sendMessage(m.chat, { text:
      `╭─「 📦 تحميل APK 」
│
│  📌 اكتب اسم أي تطبيق أو لعبة
│
│  مثال:
│  .apk WhatsApp
│  .apk PUBG Mobile
│  .apk Minecraft
│  .apk Instagram
│
╰──────────────`
    )
  }

  // لو اختار package من القائمة
  if (/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){1,}$/i.test(text.trim())) {
    await m.reply('⏬ جاري جلب معلومات التطبيق...')
    try {
      const info = await getDownloadInfo(text.trim())

      if (!info.downloadUrl) throw new Error('مش قادر أجيب رابط التحميل')
      if (info.size > 2_000_000_000) throw new Error('حجم الملف أكبر من 2GB')

      const caption = `╭─「 📱 ${info.name} 」
│
│ 📦 *الباقة:* ${info.package}
│ 🔢 *الإصدار:* ${info.version || 'غير معروف'}
│ 💾 *الحجم:* ${formatSize(info.size)}
│ ⭐ *التقييم:* ${info.rating ? info.rating.toFixed(1) + '/5' : 'غير معروف'}
│ 📥 *التحميلات:* ${info.downloads ? info.downloads.toLocaleString() : 'غير معروف'}
│
╰──────────────`

      if (info.icon) {
        await conn.sendMessage(m.chat, {
          image: { url: info.icon },
          caption
        }, { quoted: m })
      } else {
        await conn.sendMessage(m.chat, { text:caption)
      }

      await m.reply('📥 جاري إرسال ملف APK...')

      await conn.sendMessage(m.chat, {
        document: { url: info.downloadUrl },
        mimetype: 'application/vnd.android.package-archive',
        fileName: `${info.name.replace(/\s+/g, '_')}_${info.version}.apk`,
      }, { quoted: m })

      if (info.obb_link) {
        await m.reply('📦 جاري إرسال ملف OBB...')
        const obbName = decodeURIComponent(info.obb_link.split('/').pop().split('?')[0])
        await conn.sendMessage(m.chat, {
          document: { url: info.obb_link },
          mimetype: 'application/octet-stream',
          fileName: obbName,
        }, { quoted: m })
      }

      await m.react('✅')

    } catch (e) {
      console.error('[APK DL]', e.message)
      await m.react('❌')
      await conn.sendMessage(m.chat, { text:`❌ فشل التحميل\n\n⚠️ ${e.message}`)
    }
    return
  }

  // وضع البحث
  await m.reply('🔍 جاري البحث...')
  try {
    const apps = await searchApps(text)
    if (!apps.length) return m.reply('❌ لم يتم العثور على نتائج\n\nجرب كتابة اسم التطبيق بالإنجليزي')

    const rows = apps.map(app => ({
      title: app.name,
      description: `${app.package}${app.version ? ' | v' + app.version : ''}${app.size ? ' | ' + formatSize(app.size) : ''}`,
      id: `.apk ${app.package}`
    }))

    await sendList(conn, m.chat, {
      title: '📲 نتائج البحث',
      body: `🔍 نتائج البحث عن: ${text}\n\nاختر التطبيق اللي عايزه 👇`,
      footer: '⛩️ SUKUNA BOT ⛩️',
      sections: [{ title: '📱 التطبيقات المتاحة', rows }]
    }, m)

    await m.react('✅')

  } catch (e) {
    console.error('[APK Search]', e.message)
    await m.react('❌')
    await conn.sendMessage(m.chat, { text:`❌ حدث خطأ\n\n⚠️ ${e.message}`)
  }
}

handler.help    = ['apk <اسم التطبيق أو اللعبة>']
handler.tags    = ['downloader']
handler.command = /^(apk|ابك|تطبيق|لعبة)$/i

export default handler