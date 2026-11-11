import pkg from '@whiskeysockets/baileys';
const { generateWAMessageFromContent, prepareWAMessageMedia } = pkg;
import path from 'path';
import fs from 'fs';

const DEFAULT_IMAGE = "https://i.postimg.cc/bS01zQwK/upload-1767808833485.jpg";

const FIREBASE_BASE = "https://firestore.googleapis.com/v1/projects/animewitcher-1c66d/databases/(default)/documents";
const ALGOLIA_BASE = "https://8vrewc6s4t-dsn.algolia.net/1/indexes";
const ALGOLIA_APP_ID = "8VREWC6S4T";
const ALGOLIA_API_KEY = "7a6d050dcc5fc37edd98a7f9e2d5a223";

const UA_LIST = [
  'Mozilla/5.0 (Linux; Android 14; 22120RN86G Build/UP1A.231005.007) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.7680.177 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 13; SM-G991B Build/TP1A.220624.014) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.7147.86 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 12; Pixel 6 Build/SD1A.210817.036) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.7026.58 Mobile Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'
];

function clockString(ms) {
  let h = Math.floor(ms / 3600000);
  let m = Math.floor((ms % 3600000) / 60000);
  let s = Math.floor((ms % 60000) / 1000);
  return [h, m, s].map(v => v.toString().padStart(2, '0')).join(':');
}

function getRandomUA() {
  return UA_LIST[Math.floor(Math.random() * UA_LIST.length)];
}

async function fetchData(url, options = {}) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': getRandomUA(),
      'Accept-Encoding': 'gzip, deflate, br',
      'Accept-Language': 'ar-EG,ar;q=0.9,en-US;q=0.8,en;q=0.7',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      ...options.headers
    },
    ...options
  });
  return res;
}

function detectMime(name) {
  const ext = (path.extname(name) || '').toLowerCase();
  const map = {
    '.mp4': 'video/mp4', '.mkv': 'video/x-matroska', '.avi': 'video/x-msvideo',
    '.mov': 'video/quicktime', '.webm': 'video/webm', '.flv': 'video/x-flv',
    '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg',
    '.wav': 'audio/wav', '.flac': 'audio/flac', '.opus': 'audio/opus',
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
    '.gif': 'image/gif', '.webp': 'image/webp',
    '.pdf': 'application/pdf', '.zip': 'application/zip',
    '.rar': 'application/x-rar-compressed'
  };
  return map[ext] || 'application/octet-stream';
}

function guessMimeType(filename, apiMime) {
  if (apiMime && apiMime !== 'application/octet-stream') return apiMime;
  return detectMime(filename || '');
}

function sanitizeFilename(name = 'file') {
  return name.replace(/[\/\\?%*:|"<>]/g, '_').slice(0, 200);
}

function buildAnime4upName(originalName = '', animeTitle = '', episodeId = null) {
  const ext = path.extname(originalName) || '.mp4';
  const safeAnime = sanitizeFilename(animeTitle || 'anime');
  const BUILD_PREFIX = '【ANIME WITCHER】';
  if (episodeId) return `${BUILD_PREFIX} ${safeAnime} - الحلقة ${episodeId}${ext}`;
  const baseName = sanitizeFilename(originalName) || `${Date.now()}`;
  return `${BUILD_PREFIX} ${safeAnime} - ${baseName}${ext}`;
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

function extractPixeldrainId(url) {
  const patterns = [
    /pixeldrain\.com\/u\/([a-zA-Z0-9]+)/,
    /pixeldrain\.com\/api\/file\/([a-zA-Z0-9]+)/,
    /^([a-zA-Z0-9]{8})$/
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

const searchAnime = async (query) => {
  try {
    const url = `${ALGOLIA_BASE}/series/query`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'User-Agent': 'Algolia for Android (3.27.0); Android (14)',
        'X-Algolia-Application-Id': ALGOLIA_APP_ID,
        'X-Algolia-API-Key': ALGOLIA_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        params: `attributesToRetrieve=["objectID","name","poster_uri","order","path","type","poster","tags","details","rating","dubbed"]&hitsPerPage=500&page=0&query=${encodeURIComponent(query)}`
      })
    });
    const data = await res.json();
    if (!data || !data.hits) return [];
    return data.hits.slice(0, 10);
  } catch (e) {
    console.error("searchAnime error:", e?.message || e);
    return [];
  }
};

const getAnimeEpisodes = async (animeName) => {
  try {
    const url = `${FIREBASE_BASE}/anime_list/${encodeURIComponent(animeName)}/episodes_summery/summery`;
    const res = await fetchData(url);
    const data = await res.json();
    if (!data || !data.fields) return { episodes: [], updatedAt: null };
    const fields = data.fields;
    const episodes = fields.episodes?.arrayValue?.values || [];
    const updatedAt = fields.updatedAt?.timestampValue || null;
    const episodeList = episodes.map(ep => {
      const f = ep.mapValue?.fields || {};
      return {
        doc_id: f.doc_id?.stringValue || '',
        name: f.name?.stringValue || '',
        thumb_uri: f.thumb_uri?.stringValue || DEFAULT_IMAGE,
        filler: f.filler?.booleanValue || false,
        title_translated: f.title_translated?.stringValue || null
      };
    });
    return { episodes: episodeList, updatedAt };
  } catch (e) {
    console.error("getAnimeEpisodes error:", e?.message || e);
    return { episodes: [], updatedAt: null };
  }
};

const getEpisodeServers = async (animeName, episodeId) => {
  try {
    const url = `${FIREBASE_BASE}/anime_list/${encodeURIComponent(animeName)}/episodes/${episodeId}/servers2/all_servers`;
    const res = await fetchData(url);
    const data = await res.json();
    if (!data || !data.fields) return [];
    const fields = data.fields;
    const serversArray = fields.servers?.arrayValue?.values || [];
    if (serversArray.length === 0) return [];
    const servers = [];
    serversArray.forEach((serverValue) => {
      if (serverValue.mapValue && serverValue.mapValue.fields) {
        const serverFields = serverValue.mapValue.fields;
        const server = {
          name: serverFields.name?.stringValue || 'Unknown',
          quality: serverFields.quality?.stringValue || 'SD',
          link: serverFields.link?.stringValue || '',
          direct_link: serverFields.direct_link?.booleanValue || false,
          open_browser: serverFields.open_browser?.booleanValue || false,
          visible: serverFields.visible?.booleanValue !== false
        };
        if (server.visible && server.link) servers.push(server);
      }
    });
    return servers;
  } catch (e) {
    console.error("getEpisodeServers error:", e?.message || e);
    return [];
  }
};

async function downloadMediaFire(url) {
  try {
    const api = `https://arlecchino-bot.vercel.app/api/v1/download/mediafire/info`;
    const res = await fetchData(`${api}?url=${encodeURIComponent(url)}`);
    const data = await res.json();
    if (!data || !data.status || !data.data) throw new Error('فشل تحليل MediaFire');
    const info = data.data;
    if (!info.download) throw new Error('لم يتم العثور على رابط التحميل');
    const bufRes = await fetchData(info.download);
    const buffer = Buffer.from(await bufRes.arrayBuffer());
    return {
      buffer,
      fileName: info.filename,
      mimetype: guessMimeType(info.filename, info.mimetype)
    };
  } catch (error) {
    throw new Error(`فشل تحميل MediaFire: ${error.message}`);
  }
}

async function getPixeldrainInfo(fileId) {
  try {
    const res = await fetchData(`https://pixeldrain.com/api/file/${fileId}/info`, {
      headers: {
        'Accept': 'application/json',
        'Referer': `https://pixeldrain.com/u/${fileId}`
      }
    });
    const info = await res.json();
    return { success: true, info };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function downloadPixeldrainDirect(fileId) {
  try {
    const res = await fetchData(`https://pixeldrain.com/api/file/${fileId}?download`, {
      headers: {
        'Accept': '*/*',
        'Accept-Encoding': 'identity',
        'Referer': `https://pixeldrain.com/u/${fileId}`,
        'Sec-Fetch-Site': 'same-origin',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Dest': 'empty'
      }
    });
    const buffer = Buffer.from(await res.arrayBuffer());
    const contentDisposition = res.headers.get('content-disposition');
    const filename = contentDisposition?.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/)?.[1]?.replace(/['"]/g, '');
    return {
      success: true,
      buffer,
      size: buffer.length,
      contentType: res.headers.get('content-type'),
      filename
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function downloadPixeldrainChunked(fileId, totalSize, chunkSize = 4 * 1024 * 1024) {
  try {
    const chunks = [];
    let downloadedBytes = 0;
    while (downloadedBytes < totalSize) {
      const start = downloadedBytes;
      const end = Math.min(downloadedBytes + chunkSize - 1, totalSize - 1);
      const res = await fetchData(`https://pixeldrain.com/api/file/${fileId}?download`, {
        headers: {
          'Accept-Encoding': 'identity',
          'Referer': `https://pixeldrain.com/u/${fileId}`,
          'Range': `bytes=${start}-${end}`
        }
      });
      chunks.push(Buffer.from(await res.arrayBuffer()));
      downloadedBytes = end + 1;
    }
    return { success: true, buffer: Buffer.concat(chunks), size: totalSize };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function downloadPixeldrain(url) {
  const fileId = extractPixeldrainId(url);
  if (!fileId) throw new Error('رابط Pixeldrain غير صالح');
  const infoResult = await getPixeldrainInfo(fileId);
  if (!infoResult.success) throw new Error(`فشل الحصول على معلومات الملف: ${infoResult.error}`);
  const info = infoResult.info;
  const fileSizeInMB = info.size / (1024 * 1024);
  if (fileSizeInMB > 400) throw new Error(`الملف كبير جداً (${formatBytes(info.size)}). الحد الأقصى 400 ميجا`);
  let downloadResult;
  if (info.size > 50 * 1024 * 1024) {
    downloadResult = await downloadPixeldrainChunked(fileId, info.size);
  } else {
    downloadResult = await downloadPixeldrainDirect(fileId);
  }
  if (!downloadResult.success) throw new Error(`فشل التحميل: ${downloadResult.error}`);
  const filename = info.name || downloadResult.filename || `file_${fileId}`;
  return {
    buffer: downloadResult.buffer,
    fileName: filename,
    mimetype: guessMimeType(filename, downloadResult.contentType)
  };
}

async function sendNativeList(conn, m, caption, title, rows, thumbUrl = DEFAULT_IMAGE) {
  try {
    const mediaMessage = await prepareWAMessageMedia(
      { image: { url: thumbUrl } },
      { upload: conn.waUploadToServer }
    );
    const msg = generateWAMessageFromContent(m.chat, {
      viewOnceMessage: {
        message: {
          interactiveMessage: {
            body: { text: caption },
            footer: { text: "⏤͟͞ू⃪ 𝐀𝐧𝐢𝐦𝐞 𝐖𝐢𝐭𝐜𝐡𝐞𝐫🎭⃝𖤐" },
            header: {
              hasMediaAttachment: true,
              imageMessage: mediaMessage.imageMessage
            },
            nativeFlowMessage: {
              buttons: [{
                name: "single_select",
                buttonParamsJson: JSON.stringify({
                  title,
                  sections: [{ title, highlight_label: "ANIME WITCHER", rows }]
                })
              }]
            }
          }
        }
      }
    }, { userJid: conn.user.jid, quoted: m });
    await conn.relayMessage(m.chat, msg.message, { messageId: msg.key.id });
  } catch (e) {
    let txt = caption + '\n\n';
    rows.forEach(r => txt += `${r.header}\n${r.title}\n${r.id}\n\n`);
    await conn.sendMessage(m.chat, { text: txt }, { quoted: m });
  }
}

const handler = async (m, { conn, text, command, usedPrefix }) => {
  try {
    if (command === "ويتشر") {
      if (!text) return await m.reply("⚠️ الرجاء إدخال اسم الأنمي للبحث عنه.\nمثال: .ويتشر One Piece");
      await conn.sendMessage(m.chat, { react: { text: "🔎", key: m.key } });
      await m.reply(`🔎 جارِ البحث عن: ${text}`);
      const results = await searchAnime(text);
      if (!results || !results.length) {
        await conn.sendMessage(m.chat, { react: { text: "❌", key: m.key } });
        return await m.reply("❌ لم يتم العثور على نتائج.");
      }
      const rows = results.map((anime, index) => {
        const rating = anime.rating ? `⭐ ${anime.rating}` : '';
        const type = anime.type || 'أنمي';
        const tags = anime.tags ? anime.tags.slice(0, 3).join(', ') : '';
        return {
          header: `النتيجة رقم: [${index + 1}]`,
          title: `${anime.name || anime.objectID}`,
          description: `${type} ${rating}\n${tags}`,
          id: `${usedPrefix}اختيار-انمي-ويتشر ${index + 1}`
        };
      });
      const caption = `🎬 *نتائج البحث عن:* ${text}\n\n🔹 عدد النتائج: ${results.length}\n\nاختر أنمي من القائمة أدناه:`;
      const defaultThumb = results.find(r => r.poster_uri || r.thumb_uri)?.poster_uri ||
        results.find(r => r.poster_uri || r.thumb_uri)?.thumb_uri || DEFAULT_IMAGE;
      await sendNativeList(conn, m, caption, "「 قــائــمــة الأنميات 」", rows, defaultThumb);
      await conn.sendMessage(m.chat, { react: { text: "✅", key: m.key } });
      global.animeResults = results;
      return;
    }

    if (command === "اختيار-انمي-ويتشر") {
      if (!text) return await m.reply("⚠️ الرجاء إدخال رقم الأنمي من قائمة البحث.");
      const choice = parseInt(text.trim());
      if (isNaN(choice)) return await m.reply("❌ الرجاء إدخال رقم صحيح.");
      if (!global.animeResults || choice < 1 || choice > global.animeResults.length) {
        return await m.reply("❌ لم يتم العثور على الأنمي المحدد. قم بإجراء بحث جديد أولاً.");
      }
      const selected = global.animeResults[choice - 1];
      const animeName = selected.name || selected.objectID;
      await conn.sendMessage(m.chat, { react: { text: "⏳", key: m.key } });
      await m.reply(`✅ تم اختيار الأنمي: ${animeName}\n🔄 جاري تحضير الخيارات...`);
      let uptime = clockString(process.uptime() * 1000);
      let user = global.db.data.users[m.sender] || {};
      let { role, level } = user;
      let mentionId = m.key.participant || m.key.remoteJid;
      const rating = selected.rating ? `⭐ التقييم: ${selected.rating}` : '';
      const type = selected.type || 'أنمي';
      const tags = selected.tags ? `🏷️ التصنيفات: ${selected.tags.join(', ')}` : '';
      const caption = `*╮═『🎭┃𝐀𝐧𝐢𝐦𝐞 𝐖𝐢𝐭𝐜𝐡𝐞𝐫┃🎭』═╭*
*┇🎬👋 أهلاً بـ〘@${mentionId.split('@')[0]}〙*
*┇◞🎭 ${animeName} ◜🎭*
*┇📺 النوع: ${type}*
*┇${rating}*
*┇${tags}*
*┇🎖️ المستوى:〘${level || 0}〙 | الرتبة:〘${role || 'مبتدئ'}〙*
*┇🕒 وقت التشغيل: ${uptime}*
*╯✯≼══━━﹂🎭﹁━━══≽✯*`;
      const animeThumb = selected.poster_uri || selected.thumb_uri || DEFAULT_IMAGE;
      const rows = [{
        header: "📚 الحلقات",
        title: "عرض جميع الحلقات",
        description: "اضغط لعرض قائمة الحلقات",
        id: `${usedPrefix}حلقات-ويتشر ${animeName}`
      }];
      await sendNativeList(conn, m, caption, "「 الخيارات المتاحة 」", rows, animeThumb);
      await conn.sendMessage(m.chat, { react: { text: "✅", key: m.key } });
      global.selectedAnime = { name: animeName, data: selected };
      return;
    }

    if (command === "حلقات-ويتشر") {
      const animeName = text.trim();
      if (!animeName) return await m.reply("⚠️ الرجاء إدخال اسم الأنمي.\nمثال: .حلقات-ويتشر One Piece");
      await conn.sendMessage(m.chat, { react: { text: "⏳", key: m.key } });
      await m.reply(`🔄 جاري جلب حلقات: ${animeName}...`);
      const { episodes, updatedAt } = await getAnimeEpisodes(animeName);
      if (!episodes || !episodes.length) {
        await conn.sendMessage(m.chat, { react: { text: "❌", key: m.key } });
        return await m.reply("❌ لم أجد حلقات لهذا الأنمي.");
      }
      const episodesPerSection = 50;
      const sections = [];
      for (let i = 0; i < episodes.length; i += episodesPerSection) {
        const chunk = episodes.slice(i, i + episodesPerSection);
        const rows = chunk.map((ep) => {
          const fillerTag = ep.filler ? '⚠️ فيلر' : '';
          return {
            header: `${ep.name}`,
            title: `${ep.doc_id}`,
            description: `${fillerTag}`,
            id: `${usedPrefix}اختيار-حلقة-ويتشر ${animeName}|${ep.doc_id}`
          };
        });
        const startEp = i + 1;
        const endEp = Math.min(i + episodesPerSection, episodes.length);
        sections.push({
          title: `「 الحلقات ${startEp} - ${endEp} 」`,
          highlight_label: "EPISODES",
          rows
        });
      }
      const updateDate = updatedAt ? new Date(updatedAt).toLocaleDateString('ar-EG') : 'غير محدد';
      const caption = `📺 *حلقات أنمي:* ${animeName}\n\n🔹 عدد الحلقات: ${episodes.length}\n📅 آخر تحديث: ${updateDate}\n\nاختر حلقة من القائمة:`;
      const defaultThumb = episodes.find(e => e.thumb_uri)?.thumb_uri || DEFAULT_IMAGE;
      const mediaMessage = await prepareWAMessageMedia(
        { image: { url: defaultThumb } },
        { upload: conn.waUploadToServer }
      );
      const msg = generateWAMessageFromContent(m.chat, {
        viewOnceMessage: {
          message: {
            interactiveMessage: {
              body: { text: caption },
              footer: { text: "⏤͟͞ू⃪ 𝐀𝐧𝐢𝐦𝐞 𝐖𝐢𝐭𝐜𝐡𝐞𝐫🎭⃝𖤐" },
              header: {
                hasMediaAttachment: true,
                imageMessage: mediaMessage.imageMessage
              },
              nativeFlowMessage: {
                buttons: [{
                  name: "single_select",
                  buttonParamsJson: JSON.stringify({
                    title: "「 قــائــمــة الحلقات 」",
                    sections
                  })
                }]
              }
            }
          }
        }
      }, { userJid: conn.user.jid, quoted: m });
      await conn.relayMessage(m.chat, msg.message, { messageId: msg.key.id });
      await conn.sendMessage(m.chat, { react: { text: "✅", key: m.key } });
      return;
    }

    if (command === "اختيار-حلقة-ويتشر") {
      if (!text || !text.includes('|')) return await m.reply("⚠️ صيغة خاطئة. الرجاء استخدام القائمة.");
      const [animeName, episodeId] = text.split('|').map(s => s.trim());
      await conn.sendMessage(m.chat, { react: { text: "⏳", key: m.key } });
      await m.reply(`🔄 جاري جلب سيرفرات الحلقة ${episodeId}...`);
      const servers = await getEpisodeServers(animeName, episodeId);
      if (!servers || !servers.length) {
        await conn.sendMessage(m.chat, { react: { text: "❌", key: m.key } });
        return await m.reply("❌ لم أجد سيرفرات لهذه الحلقة.");
      }
      const groupedServers = {};
      servers.forEach(server => {
        const key = `${server.name}_${server.quality}`;
        if (!groupedServers[key]) groupedServers[key] = server;
      });
      const rows = Object.values(groupedServers).map((server, index) => ({
        header: `${server.name}`,
        title: `جودة: ${server.quality}`,
        description: `اضغط للحصول على الرابط`,
        id: `${usedPrefix}تحميل-حلقة ${animeName}|${episodeId}|${index}`
      }));
      const caption = `🎥 *سيرفرات الحلقة ${episodeId}*\n*من أنمي:* ${animeName}\n\n🔹 عدد السيرفرات: ${rows.length}\n\nاختر سيرفر وجودة:`;
      await sendNativeList(conn, m, caption, "「 السيرفرات والجودات 」", rows, DEFAULT_IMAGE);
      await conn.sendMessage(m.chat, { react: { text: "✅", key: m.key } });
      global.currentServers = Object.values(groupedServers);
      global.currentAnime = animeName;
      global.currentEpisode = episodeId;
      return;
    }

    if (command === "تحميل-حلقة") {
      if (!text || !text.includes('|')) return await m.reply("⚠️ صيغة خاطئة.");
      const parts = text.split('|').map(s => s.trim());
      if (parts.length !== 3) return await m.reply("⚠️ صيغة خاطئة.");
      const [animeName, episodeId, serverIndex] = parts;
      const idx = parseInt(serverIndex);
      if (!global.currentServers || idx < 0 || idx >= global.currentServers.length) {
        return await m.reply("❌ السيرفر غير موجود. اختر حلقة جديدة.");
      }
      const server = global.currentServers[idx];
      const link = server.link;
      await conn.sendMessage(m.chat, { react: { text: "⏳", key: m.key } });
      await m.reply(`📥 جاري التحميل من ${server.name} بجودة ${server.quality}...`);
      try {
        let result;
        const lowerLink = link.toLowerCase();
        if (lowerLink.includes('mediafire')) {
          result = await downloadMediaFire(link);
        } else if (lowerLink.includes('pixeldrain.com')) {
          result = await downloadPixeldrain(link);
        } else {
          await conn.sendMessage(m.chat, { react: { text: "❌", key: m.key } });
          return await m.reply(`🔗 *رابط التحميل المباشر:*\n\n${link}\n\n✨ استمتع بالمشاهدة!`);
        }
        const outName = buildAnime4upName(result.fileName, animeName, episodeId);
        const finalMime = guessMimeType(result.fileName, result.mimetype);
        if (finalMime.startsWith('video/')) {
          await conn.sendMessage(m.chat, {
            video: result.buffer,
            mimetype: finalMime,
            fileName: outName,
            caption: `✅ *تم التحميل*\n\n📁 الملف: ${outName}\n🎬 الأنمي: ${animeName}\n📺 الحلقة: ${episodeId}\n💾 السيرفر: ${server.name}\n🎯 الجودة: ${server.quality}`
          }, { quoted: m });
        } else if (finalMime.startsWith('audio/')) {
          await conn.sendMessage(m.chat, {
            audio: result.buffer,
            mimetype: finalMime,
            fileName: outName
          }, { quoted: m });
        } else {
          await conn.sendMessage(m.chat, {
            document: result.buffer,
            fileName: outName,
            mimetype: finalMime,
            caption: `✅ *تم التحميل*\n\n📁 الملف: ${outName}\n🎬 الأنمي: ${animeName}\n📺 الحلقة: ${episodeId}\n💾 السيرفر: ${server.name}\n🎯 الجودة: ${server.quality}`
          }, { quoted: m });
        }
        await conn.sendMessage(m.chat, { react: { text: "✅", key: m.key } });
      } catch (err) {
        await conn.sendMessage(m.chat, { react: { text: "❌", key: m.key } });
        await m.reply(`❌ حدث خطأ أثناء التحميل\n\n📋 الخطأ: ${err.message}\n💾 السيرفر: ${server.name}\n🎯 الجودة: ${server.quality}\n\n🔗 الرابط المباشر:\n${link}`);
      }
      return;
    }

  } catch (err) {
    console.error("handler error:", err);
    await conn.sendMessage(m.chat, { react: { text: "❌", key: m.key } });
    await m.reply(`❌ حدث خطأ غير متوقع\n\n📋 الخطأ: ${err.message || 'غير معروف'}\n⌨️ الأمر: ${command}`);
  }
};

handler.command = ['ويتشر', 'اختيار-انمي-ويتشر', 'حلقات-ويتشر', 'اختيار-حلقة-ويتشر', 'تحميل-حلقة'];
export default handler;