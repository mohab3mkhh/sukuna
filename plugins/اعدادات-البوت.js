// plugins/botsettings.js
/**
 * ⚙️ Bot Settings — إعدادات البوت
 * متوافق مع WhatsApp Business API
 *
 * الاستخدام:
 * .اسمك <الاسم الجديد>   ← تغيير اسم البوت
 * .صورتك                  ← ريبلاي على صورة لتغييرها
 * .معرف                   ← جلب معرف الجروب الحالي
 * .خصوصية <رقم>           ← من يقدر يشوف صورة البروفايل
 * .اضافة <رقم>            ← من يقدر يضيف البوت للمجموعات
 */

if (!global.addSettings) global.addSettings = {
  mode: '1', // 1=الكل, 2=جهات الاتصال, 3=المالك فقط
  ownerNumber: '201016855501@s.whatsapp.net'
}

const handler = async (m, { conn, text, usedPrefix, command, isROwner, groupMetadata }) => {
  try {

    // ══════════════════════════════════════════
    // 🔷 تغيير اسم البوت
    // ══════════════════════════════════════════
    if (/^(اسمك|botname|setname)$/i.test(command)) {

      if (!isROwner) return m.reply(
        `*╮═≼『🔱┃تنبيه┃🔱』≽═╭*\n` +
        `*┇⌗╎ꕥ هذا الأمر للمالك فقط ⌗*\n` +
        `*╯✯≼══━━﹂🔱﹁━━══≽✯*`
      )

      if (!text?.trim()) return m.reply(
        `❌ *استخدام خاطئ!*\n\n` +
        `📝 *الاستخدام الصحيح:*\n` +
        `${usedPrefix + command} <الاسم الجديد>\n\n` +
        `💡 *مثال:*\n` +
        `${usedPrefix + command} GOJO BOT`
      )

      const newName = text.trim()
      await m.reply(`⏳ *جاري تغيير الاسم إلى:* ${newName}...`)

      try {
        if (conn.updateProfileName) {
          await conn.updateProfileName(newName)
        }
        else if (conn.authState?.creds?.me?.name) {
          conn.authState.creds.me.name = newName
          if (conn.ev) conn.ev.emit('creds.update', conn.authState.creds)
        }
        else {
          await conn.query({
            tag: 'iq',
            attrs: { to: 's.whatsapp.net', type: 'set', xmlns: 'w:profile' },
            content: [{ tag: 'name', attrs: {}, content: newName }]
          })
        }

        return m.reply(
          `✅ *تم تغيير اسم البوت بنجاح!*\n\n` +
          `🤖 *الاسم الجديد:* ${newName}\n\n` +
          `⚠️ *ملاحظة:* قد يستغرق التحديث بضع دقائق ليظهر للجميع`
        )
      } catch (err) {
        console.error('[اسمك Error]', err)
        return m.reply(
          `❌ *فشل تغيير الاسم!*\n\n` +
          `📝 قد لا تكون هذه الخاصية مدعومة في واتساب بيزنيس.\n\n` +
          `💡 *بديل:* قم بتغيير الاسم يدوياً من إعدادات حساب واتساب`
        )
      }
    }

    // ══════════════════════════════════════════
    // 🖼️ تغيير صورة البوت
    // ══════════════════════════════════════════
    if (/^(صورتك|botpp|setpp|setphoto)$/i.test(command)) {

      if (!isROwner) return m.reply(
        `*╮═≼『🔱┃تنبيه┃🔱』≽═╭*\n` +
        `*┇⌗╎ꕥ هذا الأمر للمالك فقط ⌗*\n` +
        `*╯✯≼══━━﹂🔱﹁━━══≽✯*`
      )

      const quoted = m.quoted || m
      const mime   = (quoted.msg || quoted)?.mimetype || ''

      if (!mime.startsWith('image/')) return m.reply(
        `❌ *استخدام خاطئ!*\n\n` +
        `📝 *الاستخدام الصحيح:*\n` +
        `ريبلاي على صورة ثم اكتب ${usedPrefix + command}\n\n` +
        `💡 الصورة يجب أن تكون JPG أو PNG`
      )

      await m.reply(`⏳ *جاري تغيير صورة البوت...*`)

      let imageBuffer
      try {
        imageBuffer = await quoted.download()
      } catch {
        try {
          const { downloadContentFromMessage } = await import('@whiskeysockets/baileys')
          const stream = await downloadContentFromMessage(quoted.msg || quoted, 'image')
          const chunks = []
          for await (const chunk of stream) chunks.push(chunk)
          imageBuffer = Buffer.concat(chunks)
        } catch (e) {
          imageBuffer = await quoted.download()
        }
      }

      try {
        if (conn.updateProfilePicture) {
          await conn.updateProfilePicture(conn.user.jid, imageBuffer)
        }
        else {
          await conn.query({
            tag: 'iq',
            attrs: { to: 's.whatsapp.net', type: 'set', xmlns: 'w:profile:picture' },
            content: [{ tag: 'picture', attrs: { type: 'image' }, content: imageBuffer.toString('base64') }]
          })
        }

        return m.reply(
          `✅ *تم تغيير صورة البوت بنجاح!*\n\n` +
          `🖼️ الصورة الجديدة تم تفعيلها\n\n` +
          `⚠️ *ملاحظة:* قد يستغرق التحديث بضع دقائق ليظهر للجميع`
        )
      } catch (err) {
        console.error('[صورتك Error]', err)
        return m.reply(
          `❌ *فشل تغيير الصورة!*\n\n` +
          `📝 قد لا تكون هذه الخاصية مدعومة في واتساب بيزنيس.\n\n` +
          `💡 *بديل:* قم بتغيير الصورة يدوياً من إعدادات حساب واتساب`
        )
      }
    }

    // ══════════════════════════════════════════
    // 🆔 جلب معرف الجروب
    // ══════════════════════════════════════════
    if (/^(معرف|groupid|gid)$/i.test(command)) {

      if (!m.isGroup) return m.reply(
        `*╮═≼『🔱┃تنبيه┃🔱』≽═╭*\n` +
        `*┇⌗╎ꕥ هذا الأمر للمجموعات فقط ⌗*\n` +
        `*╯✯≼══━━﹂🔱﹁━━══≽✯*`
      )

      const meta     = groupMetadata || await conn.groupMetadata(m.chat).catch(() => null)
      const groupId  = m.chat
      const name     = meta?.subject  || 'غير معروف'
      const owner    = meta?.owner    || meta?.subjectOwner || ''
      const members  = meta?.size     || meta?.participants?.length || 0
      const creation = meta?.creation || null
      const desc     = meta?.desc     || ''

      let result =
        `*╮═≼『🔱┃معرف الجروب┃🔱』≽═╭*\n\n` +
        `👥 *الاسم:* ${name}\n` +
        `🆔 *المعرف:*\n\`\`\`${groupId}\`\`\`\n` +
        `📊 *الأعضاء:* ${members}`

      if (owner) {
        result += `\n👤 *المنشئ:* @${String(owner).split('@')[0]}`
      }

      if (creation) {
        const d = new Date(creation * 1000)
        result += `\n📅 *تاريخ الإنشاء:* ${d.toLocaleDateString('ar-EG')}`
      }

      if (desc) {
        result += `\n📝 *الوصف:* ${desc.slice(0, 100)}${desc.length > 100 ? '...' : ''}`
      }

      result += `\n\n*╯✯≼══━━﹂🔱﹁━━══≽✯*`

      return conn.sendMessage(m.chat, {
        text: result,
        mentions: owner ? [owner] : []
      })
    }

    // ══════════════════════════════════════════
    // 🔒 إعدادات الخصوصية — من يقدر يشوف صورة البروفايل
    // ══════════════════════════════════════════
    if (/^(خصوصية|privacy|settings)$/i.test(command)) {

      if (!isROwner) return m.reply(
        `*╮═≼『🔱┃تنبيه┃🔱』≽═╭*\n` +
        `*┇⌗╎ꕥ هذا الأمر للمالك فقط ⌗*\n` +
        `*╯✯≼══━━﹂🔱﹁━━══≽✯*`
      )

      const choice = text?.trim()

      if (!choice) {
        return m.reply(
          `🔒 *إعدادات الخصوصية - من يمكنه رؤية صورة البوت*\n\n` +
          `1️⃣ *الكل* - الجميع يقدر يشوف صور البوت\n` +
          `2️⃣ *جهات الاتصال فقط* - اللي في جهات الاتصال بس\n` +
          `3️⃣ *لا أحد* - مفيش حد يقدر يشوف\n\n` +
          `📝 *الاستخدام:*\n` +
          `${usedPrefix + command} <الرقم>\n\n` +
          `💡 *مثال:*\n` +
          `${usedPrefix + command} 1\n\n` +
          `⚠️ *ملاحظة:* هذه الخاصية قد لا تعمل على واتساب بيزنيس`
        )
      }

      let settingValue, settingText

      switch (choice) {
        case '1': settingValue = 'all';      settingText = 'الجميع'; break
        case '2': settingValue = 'contacts'; settingText = 'جهات الاتصال فقط'; break
        case '3': settingValue = 'none';     settingText = 'لا أحد'; break
        default:  return m.reply('❌ رقم غير صحيح! استخدم 1، 2، أو 3')
      }

      await m.reply(`⏳ *جاري تغيير إعدادات الخصوصية إلى:* ${settingText}...`)

      try {
        if (typeof conn.updateProfilePicturePrivacy === 'function') {
          await conn.updateProfilePicturePrivacy(settingValue)
          return m.reply(
            `✅ *تم تغيير إعدادات الخصوصية بنجاح!*\n\n` +
            `🔒 *الإعداد الجديد:* ${settingText}`
          )
        }
        else if (typeof conn.updatePrivacySettings === 'function') {
          await conn.updatePrivacySettings('profilePicture', settingValue)
          return m.reply(
            `✅ *تم تغيير إعدادات الخصوصية بنجاح!*\n\n` +
            `🔒 *الإعداد الجديد:* ${settingText}`
          )
        }
        else {
          throw new Error('الخاصية غير مدعومة')
        }

      } catch (err) {
        console.error('[Privacy Error]', err)
        return m.reply(
          `⚠️ *خاصية الخصوصية غير مدعومة في واتساب بيزنيس*\n\n` +
          `📝 الخاصية متوفرة فقط في واتساب العادي.\n\n` +
          `💡 *بديل:* استخدم الأمر .صورتك لتغيير الصورة يدوياً`
        )
      }
    }

    // ══════════════════════════════════════════
    // ➕ إعدادات الإضافة (من يقدر يضيف البوت للمجموعات)
    // ══════════════════════════════════════════
    if (/^(اضافة|addgroup|invite)$/i.test(command)) {

      if (!isROwner) return m.reply(
        `*╮═≼『🔱┃تنبيه┃🔱』≽═╭*\n` +
        `*┇⌗╎ꕥ هذا الأمر للمالك فقط ⌗*\n` +
        `*╯✯≼══━━﹂🔱﹁━━══≽✯*`
      )

      const choice = text?.trim()

      if (!choice) {
        let currentText = ''
        switch (global.addSettings.mode) {
          case '1': currentText = 'الكل (أي حد يقدر يضيف البوت)'; break
          case '2': currentText = 'جهات الاتصال فقط'; break
          case '3': currentText = 'المالك فقط (+201016855501)'; break
        }

        return m.reply(
          `➕ *إعدادات إضافة البوت للمجموعات*\n\n` +
          `🔘 *الإعداد الحالي:* ${currentText}\n\n` +
          `1️⃣ *الكل* - أي حد يقدر يضيف البوت لأي جروب\n` +
          `2️⃣ *جهات الاتصال فقط* - اللي في جهات الاتصال بس\n` +
          `3️⃣ *المالك فقط* - +201016855501 فقط (حماية عن طريق البوت)\n\n` +
          `📝 *الاستخدام:*\n` +
          `${usedPrefix + command} <الرقم>\n\n` +
          `💡 *أمثلة:*\n` +
          `${usedPrefix + command} 1  ← الكل\n` +
          `${usedPrefix + command} 2  ← جهات الاتصال\n` +
          `${usedPrefix + command} 3  ← المالك فقط`
        )
      }

      let settingValue, settingText, privacyValue

      switch (choice) {
        case '1':
          settingValue = '1'; settingText = 'الكل (أي حد يقدر يضيف البوت)'
          privacyValue = 'all'
          break
        case '2':
          settingValue = '2'; settingText = 'جهات الاتصال فقط'
          privacyValue = 'contacts'
          break
        case '3':
          settingValue = '3'; settingText = 'المالك فقط (+201016855501)'
          privacyValue = 'contacts' // أقرب إعداد رسمي، والباقي بيتم تطبيقه عن طريق البوت
          break
        default:
          return m.reply('❌ رقم غير صحيح! استخدم 1، 2، أو 3')
      }

      global.addSettings.mode = settingValue

      // تطبيق الإعداد الفعلي على حساب واتساب
      let privacyChanged = false
      try {
        if (typeof conn.updateGroupsAddPrivacy === 'function') {
          await conn.updateGroupsAddPrivacy(privacyValue)
          privacyChanged = true
        }
      } catch (err) {
        console.log('[Privacy] فشل تغيير إعداد الإضافة:', err.message)
      }

      let extraNote = ''
      if (settingValue === '3') {
        extraNote = `\n\n⚠️ *ملاحظة:* واتساب رسمياً ما يدعمش "المالك فقط"، لكن البوت دلوقتي بيطبّق الحماية دي بنفسه عند الإضافة لجروب جديد.`
      }

      return m.reply(
        `✅ *تم تغيير إعدادات الإضافة بنجاح!*\n\n` +
        `➕ *الإعداد الجديد:* ${settingText}\n` +
        (privacyChanged
          ? `🔒 تم تطبيق الإعداد فعلياً على حساب واتساب.`
          : `⚠️ لم يتم تطبيق الإعداد على حساب واتساب مباشرة.`) +
        extraNote
      )
    }

  } catch (error) {
    console.error('[BotSettings] Error:', error)
    await m.reply(
      `❌ *حدث خطأ!*\n\n` +
      `📝 ${error.message}`
    )
  }
}

// ✅ دالة للتحقق إذا كان الشخص عنده صلاحية إضافة البوت
export function canAddBot(senderNumber) {
  const mode = global.addSettings?.mode || '1'
  const ownerNumber = '201016855501@s.whatsapp.net'

  if (mode === '1') return true
  if (mode === '2') return true
  if (mode === '3') {
    return senderNumber === ownerNumber || senderNumber.includes('201016855501')
  }
  return false
}

export function getAddSetting() {
  return global.addSettings || { mode: '1', ownerNumber: '201016855501@s.whatsapp.net' }
}

handler.help    = ['اسمك', 'صورتك', 'معرف', 'خصوصية', 'اضافة']
handler.tags    = ['owner', 'tools']
handler.command = /^(اسمك|botname|setname|صورتك|botpp|setpp|setphoto|معرف|groupid|gid|خصوصية|privacy|settings|اضافة|addgroup|invite)$/i

export default handler