// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ⛩️ SUKUNA BOT v4 — config.js
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
import { createRequire } from 'module'
createRequire(import.meta.url)('dotenv').config()

const e = (k, d) => process.env[k] || d

// ━━━ هوية البوت ━━━
global.botName  = e('BOT_NAME',  '⛩️ SUKUNA BOT')
global.botBrand = '⛩️ *SUKUNA ⚡️ BOT* ⛩️'
global.botDecor = '- ꧁{⛩️ *SUKUNA ⚡️ BOT* ⛩️}꧂'
global.botVer   = '4.0.0'

// ━━━ Sticker EXIF ━━━
global.stickpack = e('STICKER_PACK',   global.botBrand)
global.stickauth = e('STICKER_AUTHOR', 'SUKUNA BOT')

// ━━━ الربط ━━━
global.pairing   = e('PAIRING_NUMBER', '').replace(/\D/g, '')
global.sessionId = e('SESSION_ID', '')

// ━━━ المطورون ━━━
global.owners = e('OWNER_NUMBERS', e('OWNER_NUMBER', '201036547166,201515640916'))
  .split(',')
  .map(n => n.trim().replace(/\D/g, ''))
  .filter(Boolean)

// ━━━ إعدادات ━━━
global.prefix       = e('PREFIX', '.')
global.publicMode   = e('PUBLIC_MODE', 'true') === 'true'
global.antiCall     = e('ANTI_CALL',   'true') === 'true'
global.autoRead     = e('AUTO_READ',   'true') === 'true'
global.autoReact    = e('AUTO_REACT',  'false') === 'true'
global.ephemeral    = 0           // رسائل مؤقتة (0 = معطّلة)

// ━━━ adReply افتراضي — يظهر في كل رد ━━━
global.adReply = {
  contextInfo: {
    forwardingScore: 999,
    isForwarded: true,
    externalAdReply: {
      title:                global.botBrand,
      body:                 'SUKUNA BOT ',
      thumbnailUrl:         'https://i.postimg.cc/htsZ3DQK/gojo-config.jpg',
      sourceUrl:            'https://whatsapp.com',
      mediaType:            1,
      renderLargerThumbnail: true
    }
  }
}

// ━━━ SubBots ━━━
global.subbotDir    = 'Sessions/SubBot'
global.installsFile = 'installs.json'
global.maxSubBots   = parseInt(e('MAX_SUBBOTS', '20'))
global.conns        = Array.isArray(global.conns) ? global.conns : []

// ━━━ Database stub (يُستبدل بـ lowdb لو أردت) ━━━
global.db = {
  data: {
    users:  {},
    groups: {},
    stats:  {}
  }
}
// في آخر config.js
if (global.db?.data?.settings?.devs) {
  global.owners = [...new Set([...(global.owners || []), ...global.db.data.settings.devs])]
}
