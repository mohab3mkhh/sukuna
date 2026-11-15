import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

// فولدرات/ملفات مؤقتة مالهاش لازمة في النسخة
const EXCLUDES = [
    'node_modules/*', '*/node_modules/*',
    '.git/*', '*/.git/*',
    '.npm/*', '.cache/*', '*/.cache/*',
    'tmp/*', 'temp/*', 'logs/*',
    '*.log', '*.zip', '*.tmp',
    // 'session/*', 'sessions/*',   // فك التعليق لو مش عايز ملفات الجلسة
];

const handler = async (m, { conn }) => {
    const botFolderPath = process.cwd(); // روت البوت
    const zipFilePath = path.join(os.tmpdir(), `bot_files_${Date.now()}.zip`); // خارج فولدر البوت
    let statusMsg = null;

    const edit = (text) =>
        conn.sendMessage(m.chat, { text, edit: statusMsg.key });

    try {
        statusMsg = await conn.sendMessage(m.chat, { text: '🔄 جاري ضغط ملفات البوت...' }, { quoted: m });

        const args = ['-r', '-q', '-1', zipFilePath, '.', '-x', ...EXCLUDES];
        await execFileAsync('zip', args, { cwd: botFolderPath, maxBuffer: 1024 * 1024 * 10 });

        if (!fs.existsSync(zipFilePath)) {
            return await edit('❌ لم يتم إنشاء ملف ZIP.');
        }

        const sizeMB = fs.statSync(zipFilePath).size / (1024 * 1024);
        await edit(`✅ تم الضغط (${sizeMB.toFixed(2)} MB). جاري الإرسال...`);

        await conn.sendMessage(m.chat, {
            document: { url: zipFilePath }, // stream بدل تحميل الملف في الرام
            mimetype: 'application/zip',
            fileName: 'bot_files.zip'
        }, { quoted: m });

        await edit('🗑️ تم إرسال الملف وحذفه بنجاح.');

    } catch (err) {
        console.error('[سكربتي] خطأ:', err);
        const errText = `❌ حدث خطأ: ${err.message}`;
        if (statusMsg) await edit(errText);
        else await conn.sendMessage(m.chat, { text: errText }, { quoted: m });

    } finally {
        // يتحذف في كل الحالات
        fs.rm(zipFilePath, { force: true }, () => {});
    }
};

handler.help = ['سكربتي'];
handler.tags = ['owner'];
handler.command = /^(سكربتي)$/i;
handler.owner = true;

export default handler;