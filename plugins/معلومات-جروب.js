let handler = async (m, { text, conn }) => {
  if (!text) return m.reply('📡 الرجاء إدخال رابط الجروب.\nمثال: .جروب https://chat.whatsapp.com/xxxx');
  
  // استخراج كود الدعوة من الرابط
  let inviteCode = text.includes('chat.whatsapp.com/') 
    ? text.split('chat.whatsapp.com/')[1]?.split(/[/?]/)[0] 
    : null;
  if (!inviteCode && text.includes('whatsapp.com/accept?code=')) {
    inviteCode = text.split('code=')[1]?.split(/[&?]/)[0];
  }
  if (!inviteCode) return m.reply('❌ تعذر استخراج كود الدعوة من الرابط.');

  await m.react('💲');

  let res;
  try {
    res = await conn.groupGetInviteInfo(inviteCode);
  } catch (error) {
    console.error('Error fetching group invite info:', error);
    await m.react('💢');
    return m.reply('⚠️ حدث خطأ أثناء جلب بيانات الجروب. تأكد من صحة الرابط.');
  }

  if (!res) {
    await m.react('💢');
    return m.reply('❌ لم يتم العثور على بيانات الجروب.');
  }

  const groupId = res.id;
  const name = res.subject || 'غير معروف';
  const description = res.desc || 'لا يوجد';
  const memberCount = res.size || 'غير متاح';
  const creationTime = res.subjectTime 
    ? new Date(parseInt(res.subjectTime) * 1000).toLocaleDateString('ar-EG') 
    : 'غير معروف';
  const ownerId = res.subjectOwner || 'غير معروف';

  const formattedTime = new Date().toLocaleString('ar-EG', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });

  let teks = `
╭━〔 *معلومات الجروب* 〕━⬣
┃ 🆔 *ID:* ${groupId}
┃ 🧣 *الاسم:* ${name}
┃ 👥 *عدد الأعضاء:* ${memberCount}
┃ 👤 *المنشئ:* ${ownerId}
┃ 📅 *تاريخ الإنشاء:* ${creationTime}
┃ 🕓 *وقت جلب المعلومات:* ${formattedTime}
┃ 📝 *الوصف:*
┃ ${description.replace(/\n/g, '\n┃ ')}
╰━━━━━━〔〕━━━⬣
`.trim();

  // محاولة جلب صورة الجروب
  let profilePicUrl;
  try {
    profilePicUrl = await conn.profilePictureUrl(groupId, 'image');
  } catch (e) {
    // الصورة غير متوفرة
  }

  try {
    if (profilePicUrl) {
      await conn.sendMessage(m.chat, {
        image: { url: profilePicUrl },
        caption: teks
      }, { quoted: m });
    } else {
      await m.reply(teks);
    }
    await m.react('💯');
  } catch (e) {
    console.error('Send Error:', e.message);
    await m.reply(teks);
    await m.react('💯');
  }
};

handler.help = ['جروب <رابط الجروب>'];
handler.command = ['معلومات-جروب', 'group'];
handler.tags = ['tools'];

export default handler;