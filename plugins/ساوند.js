import fetch from "node-fetch";
import {
    generateWAMessageFromContent,
    prepareWAMessageMedia
} from "@whiskeysockets/baileys";

// ==================== DEBUG SETTINGS ====================
const CHAT_DEBUG = true;

function createChatDebugger(conn, m, operation = "SoundCloud") {
    const logs = [`📌 العملية: ${operation}`];
    const debug = (message) => {
        if (!CHAT_DEBUG) return;
        const cleanMessage = String(message).replace(/\s+/g, " ").slice(0, 500);
        logs.push(`• ${cleanMessage}`);
    };
    debug.flush = async () => {
        if (!CHAT_DEBUG || logs.length <= 1) return;
        const report = [
            "🛠️ SOUNDCloud DEBUG LOG",
            "━━━━━━━━━━━━━━━━━━",
            ...logs,
            "━━━━━━━━━━━━━━━━━━",
            `📊 عدد السجلات: ${logs.length - 1}`
        ].join("\n");
        for (let i = 0; i < report.length; i += 3000) {
            try {
                await conn.sendMessage(m.chat, { text: report.slice(i, i + 3000) });
            } catch (error) {
                console.error("[SoundCloud Debug] Failed to send log:", error.message);
            }
        }
    };
    return debug;
}

// ==================== SOUNDCLOUD SEARCH ====================
class SoundCloudHandler {
    constructor(debug = () => {}) {
        this.clientId = "KKzJxmw11tYpCs6T24P4uUYhqmjalG6M";
        this.baseURL = "https://api-mobi.soundcloud.com";
        this.debug = debug;
        this.headers = {
            "User-Agent": "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36",
            "Accept": "application/json",
            "Origin": "https://m.soundcloud.com",
            "Referer": "https://m.soundcloud.com/"
        };
    }
    async search(query, limit = 10) {
        try {
            this.debug(`بدء البحث عن: ${query}`);
            const url = `${this.baseURL}/search`;
            const params = new URLSearchParams({ q: query, client_id: this.clientId, limit: String(limit) });
            this.debug("إرسال طلب البحث");
            const response = await fetch(`${url}?${params}`, { headers: this.headers });
            this.debug(`Search HTTP Status: ${response.status}`);
            if (!response.ok) throw new Error(`Search API HTTP ${response.status} ${response.statusText}`);
            const data = await response.json();
            const results = this.formatSearchResults(data);
            this.debug(`عدد الأغاني: ${results.tracks.length}`);
            return results;
        } catch (error) {
            this.debug(`فشل البحث: ${error.message}`);
            throw new Error(`Search failed: ${error.message}`);
        }
    }
    formatSearchResults(data) {
        const results = { tracks: [] };
        if (data.collection && Array.isArray(data.collection)) {
            data.collection.forEach(item => {
                if (item.kind === "track") results.tracks.push(this.formatTrackItem(item));
            });
        }
        return results;
    }
    formatTrackItem(track) {
        return {
            id: track.id, title: track.title, duration: track.duration,
            playback_count: track.playback_count, likes_count: track.likes_count,
            artwork_url: track.artwork_url, permalink_url: track.permalink_url,
            user: { username: track.user?.username, full_name: track.user?.full_name }
        };
    }
    static formatDuration(ms) {
        if (!ms) return "0:00";
        const minutes = Math.floor(ms / 60000);
        const seconds = Math.floor((ms % 60000) / 1000);
        return `${minutes}:${seconds.toString().padStart(2, "0")}`;
    }
}

// ==================== DOWNCLOUDME INTEGRATION ====================
const DOWNCLOUDME_UA = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36';

async function tryDownCloudMe(soundcloudUrl, debug = () => {}) {
    debug("downcloudme: starting");
    try {
        // Step 1: احصل على توكن التحقق
        let verifyToken = null;
        try {
            const home = await fetch('https://downcloudme.com/', {
                headers: { 'User-Agent': DOWNCLOUDME_UA, 'Accept': 'text/html' }
            });
            const homeHtml = await home.text();
            const m = homeHtml.match(/name=["']downloader_verify["'][^>]*value=["']([^"']+)["']/i)
                   || homeHtml.match(/value=["']([^"']+)["'][^>]*name=["']downloader_verify["']/i);
            if (m && m[1]) verifyToken = m[1];
        } catch (e) { debug(`downcloudme home: ${e.message}`); }

        if (!verifyToken) {
            verifyToken = '373be0474a';
            debug("downcloudme: using fallback token");
        }
        debug(`downcloudme: token=${verifyToken.substring(0, 8)}...`);

        // Step 2: POST لطلب التحميل
        const body = new URLSearchParams();
        body.append('downloader_verify', verifyToken);
        body.append('_wp_http_referer', '/en7B/');
        body.append('dcm_flow_js', '1');
        body.append('url', soundcloudUrl);

        const post = await fetch('https://downcloudme.com/download-track', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': DOWNCLOUDME_UA,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Origin': 'https://downcloudme.com',
                'Referer': 'https://downcloudme.com/',
                'Cookie': 'fpestid=Xn20HZZdKQJIyFb8jAc3wfgZxXkZarHvmmswNHesUQvE98V0Q9tavt56FPv5fwqUpD281g'
            },
            body: body.toString()
        });

        debug(`downcloudme: POST HTTP ${post.status}`);
        if (!post.ok) return null;

        const html = await post.text();
        debug(`downcloudme: HTML len=${html.length}`);

        // Step 3: استخرج رابط الصوت
        let audioUrl = null;
        let isHls = false;

        const m3u8Patterns = [
            /(https:\/\/playback\.media-streaming\.soundcloud\.cloud\/[^"'\s\\<>]+\.m3u8[^"'\s\\<>]*)/,
            /(https:\\\/\\\/playback\.media-streaming\.soundcloud\.cloud[^"'\s<>]+\.m3u8[^"'\s<>]*)/,
        ];

        for (const p of m3u8Patterns) {
            const m = html.match(p);
            if (m && m[1]) {
                audioUrl = m[1].replace(/\\u0026/g, '&').replace(/\\\//g, '/').replace(/\\/g, '');
                isHls = true;
                break;
            }
        }

        if (!audioUrl) {
            const mp3Patterns = [
                /(https:\/\/[^"'\s\\<>]+\.mp3[^"'\s\\<>]*)/i,
                /"(?:download|mp3)_url"\s*:\s*"([^"]+)"/i,
            ];
            for (const p of mp3Patterns) {
                const m = html.match(p);
                if (m && m[1]) {
                    audioUrl = m[1].replace(/\\u0026/g, '&').replace(/\\\//g, '/').replace(/\\/g, '');
                    isHls = false;
                    break;
                }
            }
        }

        if (!audioUrl) {
            debug("downcloudme: no audio URL found");
            return null;
        }

        // استخرج الميتاداتا
        let title = null, artwork = null;
        for (const p of [/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i, /"title"\s*:\s*"([^"]+)"/]) {
            const m = html.match(p);
            if (m && m[1]) { title = m[1].trim(); break; }
        }
        for (const p of [/(https:\/\/i\d*\.sndcdn\.com\/artworks-[^"'\s\\<>]+)/, /"artwork_url"\s*:\s*"([^"]+)"/]) {
            const m = html.match(p);
            if (m && m[1]) { artwork = m[1].replace(/\\\//g, '/'); break; }
        }

        debug(`downcloudme: success isHls=${isHls}`);
        return { audioUrl, isHls, title, artwork };
    } catch (e) {
        debug(`downcloudme fatal: ${e.message}`);
        return null;
    }
}

async function downloadHlsAsM4a(m3u8Url, debug = () => {}) {
    try {
        const res = await fetch(m3u8Url, { headers: { 'User-Agent': DOWNCLOUDME_UA } });
        if (!res.ok) throw new Error(`m3u8 HTTP ${res.status}`);

        const text = await res.text();
        const baseUrl = m3u8Url.substring(0, m3u8Url.lastIndexOf('/') + 1);

        let initUrl = null;
        const segments = [];

        for (const line of text.split('\n')) {
            const t = line.trim();
            const mapM = t.match(/#EXT-X-MAP:URI="([^"]+)"/);
            if (mapM) {
                initUrl = mapM[1].startsWith('http') ? mapM[1] : baseUrl + mapM[1];
                continue;
            }
            if (!t || t.startsWith('#')) continue;
            if (/\.(mp4|m4s|ts|aac|m4a)(\?|$)/i.test(t)) {
                segments.push(t.startsWith('http') ? t : baseUrl + t);
            }
        }

        debug(`HLS: init=${!!initUrl}, segments=${segments.length}`);
        if (!segments.length) throw new Error("No segments");

        const buffers = [];

        if (initUrl) {
            const r = await fetch(initUrl, { headers: { 'User-Agent': DOWNCLOUDME_UA } });
            if (!r.ok) throw new Error(`Init HTTP ${r.status}`);
            buffers.push(Buffer.from(await r.arrayBuffer()));
            debug(`HLS: init downloaded`);
        }

        const CONCURRENCY = 5;
        const segBuffers = new Array(segments.length);

        for (let i = 0; i < segments.length; i += CONCURRENCY) {
            const batch = segments.slice(i, i + CONCURRENCY);
            const results = await Promise.all(
                batch.map(async (seg) => {
                    const r = await fetch(seg, { headers: { 'User-Agent': DOWNCLOUDME_UA } });
                    if (!r.ok) throw new Error(`Segment HTTP ${r.status}`);
                    return Buffer.from(await r.arrayBuffer());
                })
            );
            results.forEach((buf, idx) => segBuffers[i + idx] = buf);
            debug(`HLS: ${Math.min(i + CONCURRENCY, segments.length)}/${segments.length}`);
        }

        const combined = Buffer.concat([...buffers, ...segBuffers]);
        debug(`HLS: total ${combined.length} bytes`);
        return combined;
    } catch (e) {
        debug(`HLS error: ${e.message}`);
        return null;
    }
}

// ==================== ORIGINAL SOURCES (Fallback) ====================
const downloadSoundCloud = async (url, debug = () => {}) => {
    // Source 1: SaveFrom
    debug("المصدر 1: SaveFrom");
    try {
        const api1 = await fetch("https://api.savefrom.net/ajax", {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            },
            body: `url=${encodeURIComponent(url)}`
        });
        debug(`SaveFrom HTTP: ${api1.status}`);
        if (api1.ok) {
            const html = await api1.text();
            const match = html.match(/"url":"([^"]+\.mp3[^"]*)"/);
            if (match && match[1]) {
                debug("SaveFrom: got MP3");
                return { audioUrl: match[1].replace(/\\u0026/g, "&").replace(/\\/g, ""), title: "SoundCloud Track" };
            }
        }
    } catch (e) { debug(`SaveFrom ERROR: ${e.message}`); }

    // Source 2: FabDL
    debug("المصدر 2: FabDL");
    try {
        const api2 = await fetch(`https://api.fabdl.com/soundcloud/get?url=${encodeURIComponent(url)}`, {
            headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" }
        });
        debug(`FabDL HTTP: ${api2.status}`);
        if (api2.ok) {
            const data = await api2.json();
            if (data?.result?.url) {
                debug("FabDL: got audio URL");
                return { audioUrl: data.result.url, title: data.result.title || "SoundCloud Track" };
            }
        }
    } catch (e) { debug(`FabDL ERROR: ${e.message}`); }

    // Source 3: Direct Stream
    debug("المصدر 3: Direct Stream");
    try {
        const pageResponse = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
        if (!pageResponse.ok) throw new Error(`Track page HTTP ${pageResponse.status}`);
        const pageHtml = await pageResponse.text();
        const clientIdMatch = pageHtml.match(/client_id=([a-zA-Z0-9]+)/);
        const clientId = clientIdMatch ? clientIdMatch[1] : "KKzJxmw11tYpCs6T24P4uUYhqmjalG6M";
        const trackIdMatch = pageHtml.match(/soundcloud:\/\/sounds:(\d+)/);
        if (!trackIdMatch?.[1]) throw new Error("No track ID");
        const trackInfo = await fetch(`https://api-v2.soundcloud.com/tracks/${trackIdMatch[1]}?client_id=${clientId}`, {
            headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" }
        });
        if (!trackInfo.ok) throw new Error(`Track Info HTTP ${trackInfo.status}`);
        const track = await trackInfo.json();
        const transcodings = track.media?.transcodings;
        if (Array.isArray(transcodings)) {
            const mp3Stream = transcodings.find(t =>
                t.format?.protocol === "progressive" && t.format?.mime_type === "audio/mpeg"
            );
            if (!mp3Stream) throw new Error("No progressive MP3");
            const streamUrl = await fetch(`${mp3Stream.url}?client_id=${clientId}`, {
                headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" }
            });
            if (!streamUrl.ok) throw new Error(`Stream URL HTTP ${streamUrl.status}`);
            const streamData = await streamUrl.json();
            if (!streamData?.url) throw new Error("No URL in stream response");
            debug("Direct Stream: got audio URL");
            return { audioUrl: streamData.url, title: track.title || "SoundCloud Track" };
        }
    } catch (e) { debug(`Direct Stream ERROR: ${e.message}`); }

    debug("كل المصادر القديمة فشلت");
    throw new Error("فشل التحميل من جميع المصادر");
};

// ==================== MAIN HANDLER ====================
const handler = async (m, { conn, text, command, usedPrefix }) => {
    let botProfilePic = "https://i.postimg.cc/Y0m1vZvK/Gojo-sound.jpg";
    try { botProfilePic = await conn.profilePictureUrl(conn.user.jid, "image"); } catch {}

    // ==================== SEARCH ====================
    if (command === "soundcloud" || command === "ساوند" || command === "اغنية" || command === "sound") {
        if (!text) return await m.reply(`🎵 أدخل اسم الأغنية للبحث\n\nمثال:\n${usedPrefix + command} into your arms`);

        const debug = createChatDebugger(conn, m, `البحث عن: ${text}`);
        try {
            await m.reply("🔍 جاري البحث...");
            const soundcloud = new SoundCloudHandler(debug);
            const searchResults = await soundcloud.search(text, 10);
            if (searchResults.tracks.length === 0) return await m.reply("❌ لم يتم العثور على نتائج");

            global.soundcloudResults = searchResults.tracks;
            const rows = searchResults.tracks.map((track, index) => ({
                header: `🎵 ${index + 1}`,
                title: `${track.title}`,
                description: `👤 ${track.user.full_name || track.user.username || "Unknown"} | ⏱️ ${SoundCloudHandler.formatDuration(track.duration)}`,
                id: `${usedPrefix}اختيار-صوت ${index + 1}`
            }));

            const mediaMessage = await prepareWAMessageMedia({ image: { url: botProfilePic } }, { upload: conn.waUploadToServer });
            const msg = generateWAMessageFromContent(m.chat, {
                viewOnceMessage: {
                    message: {
                        interactiveMessage: {
                            body: { text: `🔍 *نتائج البحث:*\n${text}\n\nاختر أغنية من القائمة` },
                            footer: { text: "SoundCloud Bot" },
                            header: { hasMediaAttachment: true, imageMessage: mediaMessage.imageMessage },
                            nativeFlowMessage: {
                                buttons: [{
                                    name: "single_select",
                                    buttonParamsJson: JSON.stringify({
                                        title: "「 قائمة الأغاني 」",
                                        sections: [{ title: "النتائج", rows }]
                                    })
                                }]
                            }
                        }
                    }
                }
            }, { userJid: conn.user.jid, quoted: m });

            await conn.relayMessage(m.chat, msg.message, { messageId: msg.key.id });
        } catch (error) {
            debug(`SEARCH ERROR: ${error.message}`);
            await m.reply(`❌ حدث خطأ في البحث\n⚠️ السبب: ${error.message}`);
        } finally {
            await debug.flush();
        }
    }

    // ==================== SELECT TRACK ====================
    if (command === "اختيار-صوت") {
        if (!text) return await m.reply("⚠️ أدخل رقم الأغنية");
        const choice = parseInt(text, 10);
        if (isNaN(choice)) return await m.reply("❌ رقم غير صحيح");
        if (!global.soundcloudResults || choice < 1 || choice > global.soundcloudResults.length)
            return await m.reply("❌ قم بالبحث أولاً");

        const track = global.soundcloudResults[choice - 1];
        const debug = createChatDebugger(conn, m, `تحميل: ${track.title}`);

        try {
            debug(`Track: ${track.title} | ID: ${track.id}`);

            await m.reply(`🎵 جاري التحميل...\n${track.title}\n\n⏳ قد يستغرق بعض الوقت...`);

            let audioBuffer = null;
            let audioUrl = null;
            let finalTitle = track.title;
            let finalArtwork = track.artwork_url ? track.artwork_url.replace("large", "t500x500") : botProfilePic;

            // ⭐ المصدر الأساسي: downcloudme.com
            debug("=== المصدر الأساسي: downcloudme.com ===");
            const dcm = await tryDownCloudMe(track.permalink_url, debug);

            if (dcm) {
                if (dcm.title) finalTitle = dcm.title;
                if (dcm.artwork) finalArtwork = dcm.artwork;

                if (dcm.isHls) {
                    debug("downcloudme: HLS detected, downloading segments...");
                    audioBuffer = await downloadHlsAsM4a(dcm.audioUrl, debug);
                } else {
                    audioUrl = dcm.audioUrl;
                    debug("downcloudme: direct MP3 URL");
                }
            }

            // Fallback: المصادر القديمة
            if (!audioBuffer && !audioUrl) {
                debug("=== Fallback: المصادر القديمة ===");
                const result = await downloadSoundCloud(track.permalink_url, debug);
                audioUrl = result.audioUrl;
                finalTitle = result.title || finalTitle;
            }

            if (!audioBuffer && !audioUrl) throw new Error("فشلت جميع المصادر");

            // تحميل الصورة كـ Buffer
            let thumbBuffer = null;
            try {
                const tr = await fetch(finalArtwork);
                if (tr.ok) thumbBuffer = Buffer.from(await tr.arrayBuffer());
                debug(`Thumbnail: ${thumbBuffer?.length || 0} bytes`);
            } catch (e) { debug(`Thumbnail ERROR: ${e.message}`); }

            // إرسال الصوت
            const audioContent = audioBuffer ? audioBuffer : { url: audioUrl };
            debug(`Sending audio: ${audioBuffer ? `buffer ${audioBuffer.length}B` : 'URL'}`);

            await conn.sendMessage(m.chat, {
                audio: audioContent,
                mimetype: "audio/mp4",
                ptt: true,
                waveform: new Uint8Array([10, 30, 50, 70, 90, 100, 90, 70, 50, 30, 10, 40, 60, 80, 50, 20]),
                contextInfo: {
                    externalAdReply: {
                        title: finalTitle,
                        body: `👤 ${track.user.full_name || track.user.username || "Unknown"} | ⏱️ ${SoundCloudHandler.formatDuration(track.duration)}`,
                        mediaType: 1,
                        thumbnail: thumbBuffer,
                        renderLargerThumbnail: true,
                        sourceUrl: track.permalink_url
                    }
                }
            }, { quoted: m });

            debug("✅ تم الإرسال بنجاح");
        } catch (error) {
            debug(`DOWNLOAD ERROR: ${error.message}`);
            await m.reply(`❌ فشل التحميل\n⚠️ السبب: ${error.message}`);
        } finally {
            await debug.flush();
        }
    }

    // ==================== DOWNLOAD FROM LINK ====================
    if (command === "ساوند-تحميل") {
        if (!text || !text.includes("soundcloud.com")) return await m.reply("⚠️ أرسل رابط SoundCloud صحيح");

        const debug = createChatDebugger(conn, m, "تحميل من رابط");
        try {
            await m.reply("🔗 جاري التحميل من الرابط...");

            let audioBuffer = null;
            let audioUrl = null;
            let finalTitle = "SoundCloud Track";

            const dcm = await tryDownCloudMe(text, debug);
            if (dcm) {
                finalTitle = dcm.title || finalTitle;
                if (dcm.isHls) {
                    audioBuffer = await downloadHlsAsM4a(dcm.audioUrl, debug);
                } else {
                    audioUrl = dcm.audioUrl;
                }
            }

            if (!audioBuffer && !audioUrl) {
                const result = await downloadSoundCloud(text, debug);
                audioUrl = result.audioUrl;
                finalTitle = result.title || finalTitle;
            }

            if (!audioBuffer && !audioUrl) throw new Error("فشلت جميع المصادر");

            const audioContent = audioBuffer ? audioBuffer : { url: audioUrl };
            await conn.sendMessage(m.chat, {
                audio: audioContent,
                mimetype: "audio/mp4",
                ptt: true,
                waveform: new Uint8Array([20, 40, 60, 80, 100, 80, 60, 40, 20, 50, 90, 40, 10]),
                contextInfo: {
                    externalAdReply: {
                        title: finalTitle,
                        body: "SoundCloud Downloader",
                        mediaType: 1,
                        thumbnailUrl: botProfilePic,
                        renderLargerThumbnail: true,
                        sourceUrl: text
                    }
                }
            }, { quoted: m });

            debug("✅ تم الإرسال");
        } catch (error) {
            debug(`DIRECT DOWNLOAD ERROR: ${error.message}`);
            await m.reply(`❌ فشل التحميل\n⚠️ السبب: ${error.message}`);
        } finally {
            await debug.flush();
        }
    }
};

handler.command = ["soundcloud", "ساوند-تحميل", "اغنية", "sound", "اختيار-صوت", "ساوند"];
handler.help = ["soundcloud", "ساوند-تحميل"];
handler.tags = ["search", "download"];

export default handler;