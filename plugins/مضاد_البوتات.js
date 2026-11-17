import fs from 'fs';

const detectedBots = {};
const antibotPath = './data/antibot.json';

// 🔥 الروابط الجديدة (MP4 و MP3)
const MEDIA_URLS = {
    video: 'https://file.garden/aauvg01sjleV_ic1/VID-20260511-WA0128.mp4',
    audio: 'https://file.garden/aauvg01sjleV_ic1/VID-20260511-WA0128.mp3'
};

// التأكد من وجود مجلد data
if (!fs.existsSync('./data')) fs.mkdirSync('./data', { recursive: true });
if (!fs.existsSync(antibotPath)) fs.writeFileSync(antibotPath, JSON.stringify({}, null, 2));

let handler = async (m, { conn, args, usedPrefix, command, isOwner, isAdmin }) => {
    // التحقق من أن الأمر في جروب
    if (!m.isGroup) return global.dfail('group', m, conn);
    
    // الصلاحيات: المطور أو المشرف فقط
    if (!isOwner && !isAdmin) return global.dfail('admin', m, conn);

    let chatId = m.chat;
    let antibott = {};
    try { 
        antibott = JSON.parse(fs.readFileSync(antibotPath)); 
    } catch { 
        antibott = {}; 
    }
    let antibot = antibott[chatId] === true;

    // تفعيل مضاد البوتات
    if (args[0] === "اون" || args[0] === "on" || args[0] === "تشغيل") {
        if (antibot) return m.reply("🛡️ مضاد البوتات مفعل بالفعل!");
        antibott[chatId] = true;
        fs.writeFileSync(antibotPath, JSON.stringify(antibott, null, 2));
        return m.reply("✅ تم تفعيل مضاد البوتات بنجاح!");
    } 
    // تعطيل مضاد البوتات
    else if (args[0] === "اوف" || args[0] === "off" || args[0] === "ايقاف") {
        if (!antibot) return m.reply("❌ مضاد البوتات معطل بالفعل!");
        delete antibott[chatId];
        fs.writeFileSync(antibotPath, JSON.stringify(antibott, null, 2));
        return m.reply("❌ تم تعطيل مضاد البوتات!");
    }
    // عرض الحالة
    else {
        let status = antibot ? '🟢 مفعل' : '🔴 معطل';
        return m.reply(`🛡️ *مضاد البوتات*\nالحالة: ${status}\n\nلاستخدامه:\n${usedPrefix + command} اون\n${usedPrefix + command} اوف`);
    }
};

handler.before = async function (m, { conn }) {
    try {
        // 1. التأكد إنها رسالة في جروب
        if (!m.isGroup) return false;

        // 2. جلب إعدادات الجروب
        let chatId = m.chat;
        let antibott = {};
        try { 
            antibott = JSON.parse(fs.readFileSync(antibotPath)); 
        } catch { 
            return false; 
        }
        
        // 3. هل مضاد البوتات مفعل في هذا الجروب؟
        if (antibott[chatId] !== true) return false;

        // 4. منع طرد البوت نفسه أو رسائل النظام
        if (m.key.fromMe) return false;
        
        // 5. كشف البوتات بناءً على بصمة الرسالة
        let msgId = m.key?.id || m.id || '';
        let isBot = false;
        let botType = '';

        if (msgId && msgId.length > 0) {
            if (msgId.startsWith('3EB0') && msgId.length < 25) { isBot = true; botType = 'Baileys'; }
            else if (msgId.startsWith('BAE5') && msgId.length === 16) { isBot = true; botType = 'Baileys v2'; }
            else if (msgId.startsWith('B24E') && msgId.length === 20) { isBot = true; botType = 'Baileys v3'; }
            else if (msgId.startsWith('8SCO') && msgId.length === 20) { isBot = true; botType = 'Baileys v4'; }
            else if (msgId.startsWith('NJX-')) { isBot = true; botType = 'NJX Bot'; }
        }

        if (!isBot) return false;

        // 6. فك تشفير الـ JID
        let senderId = m.sender;
        if (typeof conn.decodeJid === 'function') {
            senderId = conn.decodeJid(senderId);
        }
        
        let senderNum = senderId.split('@')[0];

        // 7. منع التكرار لنفس البوت
        if (detectedBots[chatId]?.includes(senderId)) return false;
        if (!detectedBots[chatId]) detectedBots[chatId] = [];
        detectedBots[chatId].push(senderId);

        // 8. إرسال الفيديو والصوت من الروابط
        try {
            let fixedChatId = chatId;
            if (typeof conn.decodeJid === 'function') {
                fixedChatId = conn.decodeJid(chatId);
            }
            
            // إرسال الفيديو كـ GIF
            await conn.sendMessage(fixedChatId, {
                video: { url: MEDIA_URLS.video },
                gifPlayback: true,
                caption: `🚨 *تم اكتشاف بوت!*\n👤 *الرقم:* ${senderNum}\n🔍 *النوع:* ${botType}`,
                mentions: [senderId]
            });
            
            // إرسال الصوت (MP3 - عادي مش بصمة)
            await conn.sendMessage(fixedChatId, {
                audio: { url: MEDIA_URLS.audio },
                mimetype: 'audio/mpeg',
                ptt: false
            });
            
        } catch (mediaErr) {
            console.error('خطأ في إرسال الميديا:', mediaErr);
            await conn.sendMessage(chatId, { 
                text: `🚨 *تم اكتشاف بوت!*\n📞 الرقم: ${senderNum}\n🏷️ النوع: ${botType}`, 
                mentions: [senderId] 
            });
        }

        // 9. محاولة طرد البوت
        try {
            await conn.groupParticipantsUpdate(chatId, [senderId], "remove");
            await conn.sendMessage(chatId, { 
                text: `✅ *تم طرد البوت بنجاح!*\n📞 الرقم: ${senderNum}`,
                mentions: [senderId] 
            });
        } catch (err) {
            await conn.sendMessage(chatId, { 
                text: `⚠️ *فشل الطرد!*\n📞 الرقم: ${senderNum}\n🔧 يرجى جعل البوت أدمن أولاً`,
                mentions: [senderId] 
            });
        }

        // 10. إزالة من القائمة بعد 10 ثواني
        setTimeout(() => {
            if (detectedBots[chatId]) {
                const index = detectedBots[chatId].indexOf(senderId);
                if (index > -1) detectedBots[chatId].splice(index, 1);
            }
        }, 10000);

        return false;
        
    } catch (e) {
        console.error('❌ خطأ في مضاد البوتات:', e);
        return false;
    }
};

handler.command = /^(مضاد_البوتات|antibot|نوبوت|مضاد)$/i;
handler.tags = ['group'];
handler.group = true;
handler.botAdmin = true;

export default handler;