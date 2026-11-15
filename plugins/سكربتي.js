import fs from 'fs';
import os from 'os';
import path from 'path';
import zlib from 'zlib';
import { promisify } from 'util';

const deflateRaw = promisify(zlib.deflateRaw);

// فولدرات مالهاش لازمة في النسخة
const IGNORE_DIRS = new Set(['node_modules', '.git', '.npm', '.cache', 'tmp', 'temp', 'logs']);
// const IGNORE_DIRS = new Set([..., 'session', 'sessions']); // لو مش عايز ملفات الجلسة
const IGNORE_EXT = ['.log', '.zip', '.tmp'];

// ── CRC32 ──
const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        t[n] = c >>> 0;
    }
    return t;
})();
const crc32 = (buf) => {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
};

const dosDateTime = (d) => ({
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
});

// ── تجميع الملفات ──
async function collect(dir, base = dir, out = []) {
    for (const e of await fs.promises.readdir(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
            if (!IGNORE_DIRS.has(e.name)) await collect(full, base, out);
        } else if (e.isFile()) {
            if (!IGNORE_EXT.some((x) => e.name.endsWith(x))) {
                out.push({ full, name: path.relative(base, full).split(path.sep).join('/') });
            }
        }
    }
    return out;
}

// ── كتابة ZIP ──
async function makeZip(srcDir, outPath) {
    const files = await collect(srcDir);
    const fh = await fs.promises.open(outPath, 'w');
    const central = [];
    let offset = 0;

    try {
        for (const f of files) {
            const data = await fs.promises.readFile(f.full);
            const stat = await fs.promises.stat(f.full);
            const comp = data.length ? await deflateRaw(data, { level: 1 }) : Buffer.alloc(0);
            const method = data.length ? 8 : 0;
            const crc = crc32(data);
            const nameBuf = Buffer.from(f.name, 'utf8');
            const { time, date } = dosDateTime(stat.mtime);

            const lh = Buffer.alloc(30);
            lh.writeUInt32LE(0x04034b50, 0);
            lh.writeUInt16LE(20, 4);
            lh.writeUInt16LE(0x0800, 6); // UTF-8 names
            lh.writeUInt16LE(method, 8);
            lh.writeUInt16LE(time, 10);
            lh.writeUInt16LE(date, 12);
            lh.writeUInt32LE(crc, 14);
            lh.writeUInt32LE(comp.length, 18);
            lh.writeUInt32LE(data.length, 22);
            lh.writeUInt16LE(nameBuf.length, 26);
            lh.writeUInt16LE(0, 28);

            await fh.write(Buffer.concat([lh, nameBuf, comp]));
            central.push({ nameBuf, crc, method, time, date, csize: comp.length, usize: data.length, offset });
            offset += 30 + nameBuf.length + comp.length;
        }

        const cdStart = offset;
        const parts = [];
        for (const c of central) {
            const h = Buffer.alloc(46);
            h.writeUInt32LE(0x02014b50, 0);
            h.writeUInt16LE(20, 4);
            h.writeUInt16LE(20, 6);
            h.writeUInt16LE(0x0800, 8);
            h.writeUInt16LE(c.method, 10);
            h.writeUInt16LE(c.time, 12);
            h.writeUInt16LE(c.date, 14);
            h.writeUInt32LE(c.crc, 16);
            h.writeUInt32LE(c.csize, 20);
            h.writeUInt32LE(c.usize, 24);
            h.writeUInt16LE(c.nameBuf.length, 28);
            h.writeUInt32LE(c.offset, 42);
            parts.push(h, c.nameBuf);
            offset += 46 + c.nameBuf.length;
        }

        const end = Buffer.alloc(22);
        end.writeUInt32LE(0x06054b50, 0);
        end.writeUInt16LE(central.length, 8);
        end.writeUInt16LE(central.length, 10);
        end.writeUInt32LE(offset - cdStart, 12);
        end.writeUInt32LE(cdStart, 16);

        await fh.write(Buffer.concat([...parts, end]));
    } finally {
        await fh.close();
    }
    return files.length;
}

const handler = async (m, { conn }) => {
    const botFolderPath = process.cwd();
    const zipFilePath = path.join(os.tmpdir(), `bot_files_${Date.now()}.zip`);
    let statusMsg = null;

    const edit = (text) => conn.sendMessage(m.chat, { text, edit: statusMsg.key });

    try {
        statusMsg = await conn.sendMessage(m.chat, { text: '🔄 جاري ضغط ملفات البوت...' }, { quoted: m });

        const count = await makeZip(botFolderPath, zipFilePath);
        if (!count) return await edit('⚠️ لا توجد ملفات لضغطها.');

        const sizeMB = fs.statSync(zipFilePath).size / (1024 * 1024);
        await edit(`✅ تم ضغط ${count} ملف (${sizeMB.toFixed(2)} MB). جاري الإرسال...`);

        await conn.sendMessage(m.chat, {
            document: { url: zipFilePath },
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
        fs.rm(zipFilePath, { force: true }, () => {});
    }
};

handler.help = ['سكربتي'];
handler.tags = ['owner'];
handler.command = /^(سكربتي)$/i;
handler.owner = true;

export default handler;