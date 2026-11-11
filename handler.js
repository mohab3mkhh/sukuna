// ════════════════════════════════════════════════════════
// ⛩️ SUKUNA BOT v4 — handler.js (OPTIMIZED)
//    بنفس اتقان وقوة النظام الاحترافي + تحسينات الأداء
// ════════════════════════════════════════════════════════
import { smsg }         from './lib/simple.js'
import { format }       from 'util'
import { fileURLToPath } from 'url'
import path, { join }   from 'path'
import fs, { unwatchFile, watchFile, readdirSync, existsSync, watch } from 'fs'
import { pathToFileURL } from 'url'
import chalk            from 'chalk'
import ws               from 'ws'

const _baileys = await import('@whiskeysockets/baileys')
const proto    = _baileys?.proto || _baileys?.default?.proto || {}

const isNumber = x  => typeof x === 'number' && !isNaN(x)
const delay    = ms => isNumber(ms) && new Promise(resolve => setTimeout(function () {
  clearTimeout(this); resolve()
}, ms))

// ════════════════════════════════════════════════════════
// 👑 أرقام المالك المحمية (رقم عادي + LID)
// ════════════════════════════════════════════════════════
const ownerNumbers  = ['201036547166', '201016855501']
const ownerLids     = ['54160242270370', '20477758198374620', '204775819837462']

// ✅ دالة موحدة تتحقق من المالك بأي صيغة
const isOwnerJid = (jid) => {
  if (!jid) return false
  const clean = String(jid).replace('@s.whatsapp.net', '').replace('@lid', '').replace(/[^0-9]/g, '')
  return ownerNumbers.includes(clean) || ownerLids.includes(clean)
}

const numOf = jid => String(jid || '').replace('@s.whatsapp.net', '').replace('@lid', '').replace(/[^0-9]/g, '')

// ════════════════════════════════════════════════════════
// 🛡️ نظام الحماية من الطرد الجماعي
// ════════════════════════════════════════════════════════
global.antiMassKick = global.antiMassKick || {
  tracking: new Map(),
  WINDOW: 5000,
  THRESHOLD: 3,

  track(groupId, kickerJid, victimJid) {
    const key = `${groupId}:${kickerJid}`
    const now = Date.now()
    if (!this.tracking.has(key)) this.tracking.set(key, [])
    const events = this.tracking.get(key)
    events.push({ victim: victimJid, timestamp: now })
    const cutoff = now - this.WINDOW
    for (let i = events.length - 1; i >= 0; i--) {
      if (events[i].timestamp < cutoff) events.splice(i, 1)
    }
    return events
  },

  isMassKick(groupId, kickerJid) {
    return (this.tracking.get(`${groupId}:${kickerJid}`) || []).length >= this.THRESHOLD
  },

  getVictims(groupId, kickerJid) {
    const events = this.tracking.get(`${groupId}:${kickerJid}`) || []
    return [...new Set(events.map(e => e.victim))]
  },

  clear(groupId, kickerJid) {
    this.tracking.delete(`${groupId}:${kickerJid}`)
  }
}

setInterval(() => {
  const now = Date.now()
  const cutoff = now - global.antiMassKick.WINDOW
  for (const [key, events] of global.antiMassKick.tracking.entries()) {
    if (events.length === 0 || events.every(e => e.timestamp < cutoff)) {
      global.antiMassKick.tracking.delete(key)
    }
  }
}, 120_000)

// ════════════════════════════════════════════════════════
// 📦 PLUGIN LOADER
// ════════════════════════════════════════════════════════
global.plugins = global.plugins || {}

export async function loadPlugins(pluginDir) {
  if (!existsSync(pluginDir)) return
  const files = readdirSync(pluginDir).filter(f => f.endsWith('.js'))
  let ok = 0, fail = 0
  global.plugins = {}

  for (const file of files) {
    try {
      const url = pathToFileURL(join(pluginDir, file)).href + `?t=${Date.now()}`
      const mod = await import(url)

      if (mod.default && typeof mod.default === 'object' && typeof mod.default.execute === 'function') {
        const plug = mod.default
        const fn = async function(m, extra) {
          return plug.execute.call(this, extra?.conn || this, m, extra)
        }
        fn.command  = plug.name ? [plug.name, ...(Array.isArray(plug.aliases) ? plug.aliases : [])] : (Array.isArray(plug.aliases) ? plug.aliases : [])
        fn.tags     = plug.tags || []
        fn.help     = plug.help || fn.command
        fn.owner    = plug.ownerOnly  ?? plug.owner  ?? false
        fn.rowner   = plug.ownerOnly  ?? plug.rowner ?? false
        fn.group    = plug.groupOnly  ?? plug.group  ?? false
        fn.private  = plug.privateOnly ?? plug.private ?? false
        fn.admin    = plug.adminOnly  ?? plug.admin  ?? false
        fn.botAdmin = plug.botAdminRequired ?? plug.botAdmin ?? false
        fn.premium  = plug.premium ?? false
        fn.limit    = plug.limit   ?? false
        fn.exp      = plug.exp     ?? 10
        fn.fail     = plug.fail    ?? null
        global.plugins[file] = fn
        ok++
        continue
      }

      if (mod.default && typeof mod.default === 'function') {
        const plug = mod.default
        if (!plug.before && typeof mod.before === 'function') plug.before = mod.before
        if (!plug.all    && typeof mod.all    === 'function') plug.all    = mod.all
        if (!plug.after  && typeof mod.after  === 'function') plug.after  = mod.after
        global.plugins[file] = plug
        ok++
        continue
      }

      if (!mod.default && (typeof mod.before === 'function' || typeof mod.all === 'function')) {
        const stub   = async function() {}
        stub.command = []
        stub.before  = mod.before || null
        stub.all     = mod.all    || null
        stub.after   = mod.after  || null
        stub.disabled = false
        global.plugins[file] = stub
        ok++
        continue
      }

    } catch (e) {
      fail++
      console.error(chalk.red(`[Plugin] ❌ ${file}: ${e.message}`))
    }
  }

  console.log(chalk.hex('#9400FF')(
    `[Plugin] ✅ ${ok} loaded${fail ? `, ❌ ${fail} failed` : ''} | total: ${Object.keys(global.plugins).length}`
  ))
}

export function watchPlugins(pluginDir) {
  if (!existsSync(pluginDir)) return
  watch(pluginDir, async (ev, file) => {
    if (!file?.endsWith('.js')) return
    console.log(chalk.yellow(`[Plugin] 🔄 Reloading: ${file}`))
    await loadPlugins(pluginDir).catch(console.error)
  })
}

// ════════════════════════════════════════════════════════
// 🔔 رسائل فشل الصلاحيات
// ════════════════════════════════════════════════════════
global.dfail = (type, m, conn) => {
  const msgs = {
    rowner:   `*╮═≼『⛩️┃تنبيه┃⛩️』≽═╭*\n*┇⌗╎ꕥ هذا الأمر لمالكي البوت فقط ⌗*\n*╯✯≼══━━﹂⛩️﹁━━══≽✯*`,
    owner:    `*╮═≼『⛩️┃تنبيه┃⛩️』≽═╭*\n*┇⌗╎ꕥ هذا الأمر للمطورين فقط ⌗*\n*╯✯≼══━━﹂⛩️﹁━━══≽✯*`,
    premium:  `*╮═≼『⛩️┃تنبيه┃⛩️』≽═╭*\n*┇⌗╎ꕥ هذا الأمر للمستخدمين المميزين فقط ⌗*\n*╯✯≼══━━﹂⛩️﹁━━══≽✯*`,
    group:    `*╮═≼『⛩️┃تنبيه┃⛩️』≽═╭*\n*┇⌗╎ꕥ هذا الأمر للمجموعات فقط ⌗*\n*╯✯≼══━━﹂⛩️﹁━━══≽✯*`,
    private:  `*╮═≼『⛩️┃تنبيه┃⛩️』≽═╭*\n*┇⌗╎ꕥ هذا الأمر للمحادثات الخاصة فقط ⌗*\n*╯✯≼══━━﹂⛩️﹁━━══≽✯*`,
    admin:    `*╮═≼『⛩️┃تنبيه┃⛩️』≽═╭*\n*┇⌗╎ꕥ هذا الأمر للأدمن فقط ⌗*\n*╯✯≼══━━﹂⛩️﹁━━══≽✯*`,
    botAdmin: `*╮═≼『⛩️┃تنبيه┃⛩️』≽═╭*\n*┇⌗╎ꕥ لتنفيذ هذا الأمر يجب أن أكون أدمن ⌗*\n*╯✯≼══━━﹂⛩️﹁━━══≽✯*`,
    restrict: `*╮═≼『⛩️┃تنبيه┃⛩️』≽═╭*\n*┇⌗╎ꕥ هذه الخاصية معطلة حالياً ⌗*\n*╯✯≼══━━﹂⛩️﹁━━══≽✯*`,
    limit:    `*╮═≼『⛩️┃تنبيه┃⛩️』≽═╭*\n*┇⌗╎ꕥ انتهى حد استخدامك اليومي ⌗*\n*╯✯≼══━━﹂⛩️﹁━━══≽✯*`
  }
  const msg = msgs[type]
  if (msg) return conn?.reply?.(m.chat, msg, m).then(() => m.react?.('✖️')).catch(() => {})
}

// ════════════════════════════════════════════════════════
// ✅ دالة التحقق من صلاحية الأدمن
// ════════════════════════════════════════════════════════
const checkAdmin = val => {
  if (!val) return false
  if (val === true || val === 'true') return true
  if (typeof val === 'string') return /admin|super|creator|owner/i.test(val)
  if (typeof val === 'number') return val === 1
  return false
}

// ════════════════════════════════════════════════════════
// 🚀 MAIN HANDLER
// ════════════════════════════════════════════════════════
export async function handler(conn, rawMsg) {
  const opts = global.opts || {}

  if (!rawMsg) return
  if (!rawMsg.key) return
  if (!conn?.user?.jid) return

  const stubType = rawMsg?.messageStubType

  // ══ خروج أو طرد معاقب (31=طرد، 32=خروج) ══
  if ((stubType === 31 || stubType === 32) && rawMsg?.key?.remoteJid?.endsWith('@g.us')) {
    const groupId = rawMsg.key.remoteJid
    const victims = rawMsg.messageStubParameters || []
    for (const jid of victims) {
      if (global.activePunishments?.[jid]?.chatId === groupId) {
        const p = global.activePunishments[jid]
        const endTime = p.endTime || 0
        const remaining = endTime - Date.now()
        const fmtTime = (ms) => {
          if (ms <= 0) return 'انتهى'
          const totalMins = Math.floor(ms / 60000)
          const hours = Math.floor(totalMins / 60)
          const mins = totalMins % 60
          if (hours > 0 && mins > 0) return `${hours} ساعة و ${mins} دقيقة`
          if (hours > 0) return `${hours} ساعة`
          return `${mins} دقيقة`
        }
        clearTimeout(p.leaveTimeout)
        p.reminders?.forEach(t => clearTimeout(t))
        await conn.sendMessage(groupId, {
          text: `*❍━━━══━━❪⛩️❫━━══━━━❍*\n*｢✅｣⇇ تم بدء العداد*\n\nخرج @${jid.split('@')[0]} من الجروب\n⏳ الوقت المتبقي للعقوبة: *${fmtTime(remaining)}*\n\nسيتم إخطاره بالعودة بعد انتهاء المدة 🔔\n*❍━━━══━━❪⛩️❫━━══━━━❍*`,
          mentions: [jid]
        }).catch(() => {})
      }
    }
    // شغّل handler.before في الأوامر للأحداث دي
    for (const plugin of Object.values(global.plugins)) {
      if (typeof plugin?.before === 'function') {
        await plugin.before.call(conn, rawMsg, { conn }).catch(() => {})
      }
    }
    return
  }

  // ══ دخول (27=add، 28=invite) ══
  if ((stubType === 27 || stubType === 28) && rawMsg?.key?.remoteJid?.endsWith('@g.us')) {
    const groupId   = rawMsg.key.remoteJid
    const kickerJid = rawMsg.participant || rawMsg.key?.participant
    const victims   = rawMsg.messageStubParameters || []

    // دخول معاقب — شغّل handler.before
    for (const jid of victims) {
      if (global.activePunishments?.[jid]?.chatId === groupId) {
        await (async () => {
          try {
            const meta = await conn.groupMetadata(groupId).catch(() => null)
            if (!meta) return
            const admins = meta.participants.filter(p => p.admin).map(p => p.id)
            const p = global.activePunishments[jid]
            const endTime = p.endTime || 0
            const remaining = endTime - Date.now()
            const fmtTime = (ms) => {
              if (ms <= 0) return 'انتهى'
              const totalMins = Math.floor(ms / 60000)
              const hours = Math.floor(totalMins / 60)
              const mins = totalMins % 60
              if (hours > 0 && mins > 0) return `${hours} ساعة و ${mins} دقيقة`
              if (hours > 0) return `${hours} ساعة`
              return `${mins} دقيقة`
            }
            await conn.sendMessage(groupId, {
              text: `*❍━━━══━━❪⛩️❫━━══━━━❍*\n*｢⚠️｣⇇ تنبيه للأدمنز*\n\nالشخص @${jid.split('@')[0]} دخل الجروب وعنده عقوبة!\nالوقت المتبقي: *${fmtTime(remaining)}*\n\nهل تريدون:\n✅ اكتب *اتركه* للسماح له\n🔨 اكتب *اطرده* لطرده فوراً\n\n⏰ لو مفيش رد خلال 15 دقيقة هيتطرد تلقائياً\n*❍━━━══━━❪⛩️❫━━══━━━❍*`,
              mentions: [...admins, jid]
            }).catch(() => {})
          } catch {}
        })()
      }
    }

    if (groupId && kickerJid && victims.length > 0) {
      victims.forEach(v => global.antiMassKick.track(groupId, kickerJid, v))

      if (global.antiMassKick.isMassKick(groupId, kickerJid)) {
        setTimeout(async () => {
          try {
            const metadata = await conn.groupMetadata(groupId).catch(() => null)
            if (!metadata) return

            const participants = metadata.participants || []
            const botJid       = conn.user?.jid
            const botPart      = participants.find(p => (p?.id || p?.jid) === botJid)
            const kickerPart   = participants.find(p => (p?.id || p?.jid) === kickerJid)

            if (!checkAdmin(botPart?.admin)) return
            if (!checkAdmin(kickerPart?.admin)) {
              global.antiMassKick.clear(groupId, kickerJid)
              return
            }

            const kickerNum = kickerJid.split('@')[0]
            const isOwner   = (global.owners || []).some(o => String(o).replace(/\D/g, '') === kickerNum)
            if (isOwner) {
              global.antiMassKick.clear(groupId, kickerJid)
              return
            }

            await conn.groupParticipantsUpdate(groupId, [kickerJid], 'demote').catch(() => {})
            await delay(700)
            await conn.groupParticipantsUpdate(groupId, [kickerJid], 'remove').catch(() => {})
            await delay(1000)

            const allVictims  = global.antiMassKick.getVictims(groupId, kickerJid)
            const currentJids = participants.map(p => p.id || p.jid)
            const toReAdd     = allVictims.filter(v => !currentJids.includes(v) && v !== kickerJid)

            let restored = 0
            for (const victim of toReAdd) {
              await conn.groupParticipantsUpdate(groupId, [victim], 'add')
                .then(() => restored++)
                .catch(() => {})
              await delay(1200)
            }

            await conn.sendMessage(groupId, {
              text: `*╮═≼『⛩️┃حماية الجروب┃⛩️』≽═╭*\n\n*┇⌗╎⚠️ تم إيقاف طرد جماعي*\n*┇⌗╎👤 المعتدي:* @${kickerNum}\n*┇⌗╎📊 الضحايا:* ${allVictims.length}\n*┇⌗╎✅ تمت إعادة:* ${restored}\n*┇⌗╎✓ تم إزالة إشرافه وطرده*\n\n*╯✯≼══━━﹂⛩️﹁━━══≽✯*`,
              mentions: [kickerJid, ...toReAdd]
            }).catch(() => {})

            global.antiMassKick.clear(groupId, kickerJid)
          } catch (err) {
            console.error('[Anti-MassKick]', err.message)
          }
        }, 1000)
      }
    }
  }

  if (!rawMsg?.message) return

  const msgId = rawMsg.key?.id || ''
  const isFromMe = rawMsg.key?.fromMe === true
  if (msgId.startsWith('NJX-') ||
     (msgId.startsWith('3EB0') && !isFromMe) ||
     (msgId.startsWith('BAE5') && msgId.length === 16) ||
     (msgId.startsWith('B24E') && msgId.length === 20) ||
      msgId.startsWith('3E83')) return

  if (rawMsg.key?.remoteJid === 'status@broadcast') {
    if (global.autoRead) await conn.readMessages([rawMsg.key]).catch(() => {})
    return
  }

  await conn.pushMessage([rawMsg]).catch(() => {})

  let m
  try { m = smsg(conn, rawMsg) } catch { return }

  if (!m || !m.sender || !m.chat) return

  // ✅ منع استغلال اليوزرنيم المزيف
  // لو fromMe=true بس المرسل مش البوت نفسه → تجاهل
  {
    const botNum    = numOf(conn.user?.jid || '')
    const senderNum = numOf(m.sender)
    const isRealFromMe = isFromMe && (
      senderNum === botNum ||
      m.sender === conn.user?.jid ||
      rawMsg.key?.participant // رسايل الجروب اللي البوت بعتها
    )
    if (isFromMe && !isRealFromMe) return
  }

  m.exp = 0

  if (global.db?.data == null && typeof global.loadDatabase === 'function') {
    await global.loadDatabase().catch(() => {})
  }

  const db = global.db?.data || { users: {}, chats: {}, settings: {} }
  if (!db.users)    db.users    = {}
  if (!db.chats)    db.chats    = {}
  if (!db.settings) db.settings = {}

  const uKey = m.sender
  if (!db.users[uKey]) db.users[uKey] = {}
  const user = db.users[uKey]

 const userDefaults = {
  name: m.name || '', exp: 0, coin: 0, bank: 0, level: 0, limit: 10,
  health: 100, premium: false, premiumTime: 0, banned: false,
  bannedReason: '', commands: 0, afk: -1, afkReason: '', warn: 0,
title: '', lastclaim: 0, lastweekly: 0
}
  for (const [key, val] of Object.entries(userDefaults)) {
    if (!(key in user) || (isNumber(val) && !isNumber(user[key]))) user[key] = val
  }

  const cKey = m.chat
  if (!db.chats[cKey]) db.chats[cKey] = {}
  const chat = db.chats[cKey]

  const chatDefaults = {
    isBanned: false, isMute: false, welcome: false, sWelcome: '',
    sBye: '', detect: true, primaryBot: null, modoadmin: false,
    antiLink: true, nsfw: false, economy: true
  }
  for (const [key, val] of Object.entries(chatDefaults)) {
    if (!(key in chat)) chat[key] = val
  }

  const sKey = conn.user?.jid || 'default'
  if (!db.settings[sKey]) db.settings[sKey] = {}
  const settings = db.settings[sKey]
  if (!('self' in settings))      settings.self      = false
  if (!('jadibotmd' in settings)) settings.jadibotmd = true

  if (typeof m.text !== 'string') m.text = ''

  if (m.pushName && m.pushName !== user.name) user.name = m.pushName

  const owners    = Array.isArray(global.owners) ? global.owners : (global.owner || [])
  const prems     = Array.isArray(global.prems)  ? global.prems  : []
  const ownersJid = owners.map(n => String(n).replace(/\D/g, '') + '@s.whatsapp.net')
  const premsJid  = prems.map(n  => String(n).replace(/\D/g, '') + '@s.whatsapp.net')

  const botJid   = conn.user?.jid?.split(':')[0] + '@s.whatsapp.net'

  // ✅ حل مشكلة اليوزرنيم — resolve الـ LID للـ sender
  const _globalLidMap = conn?.isLid || {}
  const _resolvedSender = _globalLidMap[m.sender] ||
                          _globalLidMap[String(m.sender).replace(/:[0-9]+@/, '@')] ||
                          m.sender
  const _senderNum = numOf(_resolvedSender)

  const isROwner = ownersJid.includes(_resolvedSender) ||
                   isOwnerJid(_resolvedSender) ||
                   ownerNumbers.includes(_senderNum) ||
                   (isFromMe && (m.sender === botJid || m.sender === conn.user?.jid))
  const isOwner  = isROwner
  const isPrems  = isROwner || premsJid.includes(m.sender) || user.premium === true

  if (global.autoRead) await conn.readMessages([rawMsg.key]).catch(() => {})

  try {
    const printer = await import('./lib/print.js').catch(() => null)
    if (printer?.default) await printer.default(m, conn).catch(() => {})
  } catch {}

  if (global.autoReact && isROwner && !m.fromMe && m.text) m.react('⛩️').catch(() => {})
  m.exp += Math.ceil(Math.random() * 10)

  let groupMetadata = {}
  let isAdmin       = false
  let isRAdmin      = false
  let isBotAdmin    = false

  const isRealOwner = isOwnerJid(_resolvedSender) || isOwnerJid(m.sender)

  if (m.isGroup) {
    try {
      const meta = await conn.groupMetadata(m.chat).catch(() => null) || conn.chats?.[m.chat]?.metadata
      if (meta) {
        if (!conn.chats) conn.chats = {}
        if (!conn.chats[m.chat]) conn.chats[m.chat] = { id: m.chat }
        conn.chats[m.chat].metadata = meta
        groupMetadata = meta
      }
    } catch {}

    const rawParts = groupMetadata.participants || []
    const lidMap   = conn?.isLid || {}

    const partMap = new Map()
    for (const p of rawParts) {
      const rawId      = (typeof p === 'string') ? p : (p?.id || p?.jid || '')
      const directJid  = (p?.jid && !String(p.jid).includes('@lid'))
        ? String(p.jid).replace(/:[0-9]+@/, '@')
        : null
      const resolvedId = directJid || lidMap[rawId] || lidMap[String(rawId).replace(/:[0-9]+@/, '@')] || rawId

      const nums = [
        numOf(resolvedId),
        numOf(p?.jid || ''),
        numOf(p?.lid || ''),
        numOf(p?.phoneNumber || ''),
        numOf(rawId)
      ].filter(Boolean)

      const part = { id: resolvedId, jid: resolvedId, admin: p?.admin ?? p?.isAdmin ?? null }
      for (const n of nums) {
        if (n && !partMap.has(n)) partMap.set(n, part)
      }
    }

    // ✅ استخدم الـ resolved sender في isAdmin
    const _lidMapLocal = conn?.isLid || {}
    const _senderResolved = _lidMapLocal[m.sender] ||
                            _lidMapLocal[String(m.sender).replace(/:[0-9]+@/, '@')] ||
                            m.sender
    const userNum  = numOf(_senderResolved)
    const botNum   = numOf(conn.user?.jid || '')
    const userPart = partMap.get(userNum) || {}
    const botPart  = partMap.get(botNum)  || {}

    isRAdmin   = userPart.admin === 'superadmin'
    isAdmin    = isRAdmin || userPart.admin === 'admin'
    isBotAdmin = checkAdmin(botPart.admin)

    if (isRealOwner) {
      isAdmin  = true
      isRAdmin = true
    }
  }

  const participants = []
  const pluginDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'plugins')

  for (const name in global.plugins) {
    const plugin = global.plugins[name]
    if (!plugin || plugin.disabled) continue

    const __filename = join(pluginDir, name)

    if (typeof plugin.all === 'function') {
      try {
        await plugin.all.call(conn, m, {
          conn, chatUpdate: { messages: [rawMsg] },
          __dirname: pluginDir, __filename,
          user, chat, settings, usedPrefix: global.prefix
        })
      } catch {}
    }

    if (!opts.restrict && plugin.tags?.includes('admin')) continue

    const strRgx  = s => s.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&')
    const plugPfx = plugin.customPrefix ?? conn.prefix ?? global.prefix ?? '.'
    const pfxMatch = (
      plugPfx instanceof RegExp ? [[plugPfx.exec(m.text), plugPfx]] :
      Array.isArray(plugPfx) ? plugPfx.map(p => {
        const r = p instanceof RegExp ? p : new RegExp(strRgx(p))
        return [r.exec(m.text), r]
      }) :
      typeof plugPfx === 'string' && plugPfx.length
        ? [[new RegExp(strRgx(plugPfx)).exec(m.text), new RegExp(strRgx(plugPfx))]]
        : [[[], new RegExp]]
    ).find(p => p[1])

    if (typeof plugin.before === 'function') {
      try {
        const skip = await plugin.before.call(conn, m, {
          pfxMatch, conn, participants, groupMetadata,
          isROwner, isOwner, isRAdmin, isAdmin, isBotAdmin, isPrems,
          chatUpdate: { messages: [rawMsg] },
          __dirname: pluginDir, __filename, user, chat, settings
        })
        if (skip) continue
      } catch {}
    }

    if (typeof plugin !== 'function') continue

    const usedPrefix = (pfxMatch && (pfxMatch[0] || '')[0]) || ''
    if (!usedPrefix) continue

    const noPrefix = m.text.replace(usedPrefix, '')
    let [command, ...args] = noPrefix.trim().split(' ').filter(Boolean)
    args = args || []
    const _args = noPrefix.trim().split(' ').slice(1)
    const text  = _args.join(' ')
    command     = (command || '').toLowerCase()

    const fail     = plugin.fail || global.dfail
    const isAccept = plugin.command instanceof RegExp
      ? plugin.command.test(command)
      : Array.isArray(plugin.command)
        ? plugin.command.some(c => c instanceof RegExp ? c.test(command) : c === command)
        : typeof plugin.command === 'string'
          ? plugin.command === command
          : false

    if (!isROwner && settings.self) return
    if (chat.primaryBot && chat.primaryBot !== conn.user?.jid) {
      try {
        const primary = global.conns?.find(c => c.user?.jid === chat.primaryBot && c.ws?.socket?.readyState !== ws.CLOSED)
        const inGroup = m.isGroup
          ? (await conn.groupMetadata(m.chat).catch(() => ({ participants: [] }))).participants.some(p => p.jid === chat.primaryBot)
          : false
        if (!primary || !inGroup) chat.primaryBot = null
        else continue
      } catch {}
    }

    if (!isAccept) continue

    m.plugin = name
    if (user.commands !== undefined) user.commands++

    if (chat.isBanned && !isROwner) {
      await m.reply?.(`*╮═≼『⛩️┃تنبيه┃⛩️』≽═╭*\n*┇⌗╎ꕥ البوت معطل في هذه المجموعة ⌗*`).catch(() => {})
      return
    }

    if (m.text && user.banned && !isROwner) {
      await m.reply?.(`*╮═≼『⛩️┃تنبيه┃⛩️』≽═╭*\n*┇⌗╎ꕥ تم حظرك من استخدام البوت ⌗*`).catch(() => {})
      return
    }

    if (!isRealOwner) {
      if (plugin.rowner   && !isROwner)   { fail('rowner',   m, conn); continue }
      if (plugin.owner    && !isOwner)    { fail('owner',    m, conn); continue }
      if (plugin.premium  && !isPrems)    { fail('premium',  m, conn); continue }
      if (plugin.group    && !m.isGroup)  { fail('group',    m, conn); continue }
      if (plugin.private  &&  m.isGroup)  { fail('private',  m, conn); continue }
      if (plugin.admin    && !isAdmin)    { fail('admin',    m, conn); continue }
      if (plugin.botAdmin && !isBotAdmin) { fail('botAdmin', m, conn); continue }
      if (plugin.limit    && user.limit <= 0) { fail('limit', m, conn); continue }
    }

    try {
      await plugin.call(conn, m, {
        conn, args, _args, text, usedPrefix, command,
        participants, groupMetadata,
        isROwner, isOwner, isRAdmin, isAdmin, isBotAdmin, isPrems,
        chatUpdate: { messages: [rawMsg] },
        __dirname: pluginDir, __filename, user, chat, settings
      })
      m.exp += plugin.exp || 0
    } catch (e) {
      console.error(chalk.red(`[Handler] ❌ ${name}: ${e.message}`))
      if (typeof fail === 'function') fail('error', m, conn)
    }
  }

  if (m.exp > 0 && db.users[uKey]) {
    db.users[uKey].exp = (db.users[uKey].exp || 0) + m.exp
  }

  if (global.db?.data && typeof global.db.write === 'function') {
    global.db.write().catch(() => {})
  }
}

// ════════════════════════════════════════════════════════
// 👥 participantsUpdate — ✅ حماية المالك بالـ LID
// ════════════════════════════════════════════════════════
export async function participantsUpdate(conn, update) {
  // Baileys ممكن يبعت array أو object
  if (Array.isArray(update)) {
    for (const upd of update) await participantsUpdate(conn, upd).catch(() => {})
    return
  }
  try {
    const { id, participants, action, author } = update


    if (author && id?.endsWith('@g.us')) {
      const isActorOwner = isOwnerJid(author)

      // 🚨 لو حد بيطرد المالك
      if (action === 'remove' && !isActorOwner) {
        const ownerRemoved = participants.some(p => isOwnerJid(p))
        if (ownerRemoved) {
          const actorNum = numOf(author)
          setTimeout(async () => {
            try {
              await conn.groupParticipantsUpdate(id, [author], 'remove').catch(() => {})
              await conn.sendMessage(id, {
                text: `*╮═≼『⛩️┃حماية المالك┃⛩️』≽═╭*\n\n*┇⌗╎🚨 تم طرد @${actorNum} لمحاولته طرد المالك!*\n\n*╯✯≼══━━﹂⛩️﹁━━══≽✯*`,
                mentions: [author]
              }).catch(() => {})
            } catch {}
          }, 500)
        }
      }

      // 🚨 لو حد بيشيل إشراف المالك
      if (action === 'demote' && !isActorOwner) {
        const ownerDemoted = participants.some(p => isOwnerJid(p))
        if (ownerDemoted) {
          const actorNum = numOf(author)
          setTimeout(async () => {
            try {
              for (const p of participants) {
                if (isOwnerJid(p)) {
                  await conn.groupParticipantsUpdate(id, [p], 'promote').catch(() => {})
                }
              }
              await conn.groupParticipantsUpdate(id, [author], 'remove').catch(() => {})
              await conn.sendMessage(id, {
                text: `*╮═≼『⛩️┃حماية المالك┃⛩️』≽═╭*\n\n*┇⌗╎🚨 تم طرد @${actorNum} لمحاولته إزالة إشراف المالك!*\n*┇⌗╎✅ تم إعادة الإشراف تلقائياً*\n\n*╯✯≼══━━﹂⛩️﹁━━══≽✯*`,
                mentions: [author]
              }).catch(() => {})
            } catch {}
          }, 500)
        }
      }
    }

    // ══ نظام التأديب ══
    const punishFmt = (ms) => {
      if (ms <= 0) return 'انتهى'
      const totalMins = Math.floor(ms / 60000)
      const h = Math.floor(totalMins / 60)
      const m = totalMins % 60
      if (h > 0 && m > 0) return `${h} ساعة و ${m} دقيقة`
      if (h > 0) return `${h} ساعة`
      return `${m} دقيقة`
    }

    // دخول معاقب
    if (action === 'add' || action === 'promote') {
      for (const jid of participants) {
        if (global.activePunishments?.[jid]?.chatId === id) {
          try {
            const p = global.activePunishments[jid]
            const remaining = punishFmt(p.endTime - Date.now())
            const meta = await conn.groupMetadata(id).catch(() => null)
            const admins = meta?.participants?.filter(x => x.admin).map(x => x.id) || []

            await conn.sendMessage(id, {
              text: `*❍━━━══━━❪⛩️❫━━══━━━❍*\n*｢⚠️｣⇇ تنبيه للأدمنز*\n\nالشخص @${jid.split('@')[0]} دخل الجروب وعنده عقوبة!\nالوقت المتبقي: *${remaining}*\n\nهل تريدون:\n✅ اكتب *اتركه* للسماح له\n🔨 اكتب *اطرده* لطرده فوراً\n\n⏰ لو مفيش رد خلال 15 دقيقة هيتطرد تلقائياً\n*❍━━━══━━❪⛩️❫━━══━━━❍*`,
              mentions: [...admins, jid]
            }).catch(() => {})

            if (!global.pendingRejoin) global.pendingRejoin = {}
            const autoKick = setTimeout(async () => {
              if (!global.pendingRejoin?.[jid]) return
              delete global.pendingRejoin[jid]
              await conn.groupParticipantsUpdate(id, [jid], 'remove').catch(() => {})
              await conn.sendMessage(id, {
                text: `*❍━━━══━━❪⛩️❫━━══━━━❍*\n*｢🔨｣⇇ تم طرد @${jid.split('@')[0]} تلقائياً*\nلم يستجب أي أدمن خلال 15 دقيقة\n*❍━━━══━━❪⛩️❫━━══━━━❍*`,
                mentions: [jid]
              }).catch(() => {})
            }, 15 * 60 * 1000)

            global.pendingRejoin[jid] = { chatId: id, admins, autoKick }
            console.log('[التأديب] دخل معاقب:', jid)
          } catch (e) {
            console.error('[التأديب-دخول]', e.message)
          }
        }
      }
    }

    // خروج معاقب — Baileys بيبعت remove للخروج والطرد معاً
    if (action === 'remove') {
      for (const jid of participants) {
        // تجاهل لو البوت طرده هو (موجود في pendingRejoin)
        if (global.pendingRejoin?.[jid]) continue
        if (global.activePunishments?.[jid]?.chatId === id) {
          try {
            const p = global.activePunishments[jid]
            const remaining = punishFmt(p.endTime - Date.now())
            clearTimeout(p.leaveTimeout)
            p.reminders?.forEach(t => clearTimeout(t))

            await conn.sendMessage(id, {
              text: `*❍━━━══━━❪⛩️❫━━══━━━❍*\n*｢✅｣⇇ تم بدء العداد*\n\nخرج @${jid.split('@')[0]} من الجروب\n⏳ الوقت المتبقي للعقوبة: *${remaining}*\n\nسيتم إخطاره بالعودة بعد انتهاء المدة 🔔\n*❍━━━══━━❪⛩️❫━━══━━━❍*`,
              mentions: [jid]
            }).catch(() => {})
            console.log('[التأديب] خرج معاقب:', jid)
          } catch (e) {
            console.error('[التأديب-خروج]', e.message)
          }
        }
      }
    }

    for (const plugin of Object.values(global.plugins)) {
      if (typeof plugin?.participantsUpdate === 'function') {
        await plugin.participantsUpdate({ conn, id, participants, action }).catch(() => {})
      }
    }
  } catch (e) {
    console.error('[participantsUpdate]', e.message)
  }
}

// ════════════════════════════════════════════════════════
// 📋 groupsUpdate
// ════════════════════════════════════════════════════════
export async function groupsUpdate(conn, updates) {
  try {
    for (const update of updates) {
      for (const plugin of Object.values(global.plugins)) {
        if (typeof plugin?.groupsUpdate === 'function') {
          await plugin.groupsUpdate({ conn, update }).catch(() => {})
        }
      }
    }
  } catch (e) {
    console.error('[groupsUpdate]', e.message)
  }
}

// ════════════════════════════════════════════════════════
// 📞 callUpdate
// ════════════════════════════════════════════════════════
export async function callUpdate(conn, call) {
  try {
    if (global.antiCall && call.status === 'offer') {
      await conn.rejectCall(call.id, call.from).catch(() => {})
    }
    for (const plugin of Object.values(global.plugins)) {
      if (typeof plugin?.callUpdate === 'function') {
        await plugin.callUpdate({ conn, call }).catch(() => {})
      }
    }
  } catch (e) {
    console.error('[callUpdate]', e.message)
  }
}
