import fs from 'fs';
import path from 'path';

let displayFileContent = async (filename) => {
    let filePath = path.join('plugins', filename);

    try {
        // التحقق من وجود الملف أولاً
        await fs.promises.access(filePath, fs.constants.F_OK);
    } catch (err) {
        throw new Error(`الملف ${filename} غير موجود.`);
    }

    try {
        // قراءة المحتوى الحالي للملف
        let fileContent = await fs.promises.readFile(filePath, 'utf8');
        return fileContent;
    } catch (err) {
        throw new Error(`فشل في قراءة الملف ${filename}: ${err.message}`);
    }
};

let handler = async (m, { isROwner, usedPrefix, command, text }) => {
    await conn.sendMessage(m.chat, { text:global.wait);
    if (!isROwner) return;

    if (!text) {
        throw `يرجى تحديد اسم الملف المراد عرضه، مثال:\n${usedPrefix + command} example.js`;
    }

    let filename = text.trim() + '.js';

    try {
        let fileContent = await displayFileContent(filename);
        conn.sendMessage(m.chat, { text:`نص الملف ${filename}:\n\n${fileContent}`);
    } catch (e) {
        console.error(`حدث خطأ أثناء عرض الملف ${filename}: ${e.message}`);
        conn.sendMessage(m.chat, { text:`حدث خطأ أثناء عرض الملف ${filename}: ${e.message}`);
    }
};

handler.help = ['viewplugin'];
handler.tags = ['owner'];
handler.command = /^(gp|باتش-عرض)$/i;
handler.rowner = true;

export default handler;
