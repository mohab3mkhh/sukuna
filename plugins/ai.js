import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import zlib from 'zlib';

const NoteGPTAPI = {
  baseURL: 'https://notegpt.io',
  apiURL: 'https://notegpt.io/api/v2',
  
  generateFingerprint() {
    const canvas = Math.random().toString(36).substring(2, 15);
    const webgl = Math.random().toString(36).substring(2, 15);
    return `${canvas}:${webgl}`;
  },

  generateUserAgent() {
    const versions = ['14', '13', '12', '11'];
    const chromeVersions = ['143', '142', '141', '140'];
    const buildVersions = ['UP1A.231005.007', 'UP1A.230620.001', 'TP1A.220624.014'];
    
    const androidVersion = versions[Math.floor(Math.random() * versions.length)];
    const chromeVersion = chromeVersions[Math.floor(Math.random() * chromeVersions.length)];
    const build = buildVersions[Math.floor(Math.random() * buildVersions.length)];
    
    return `Mozilla/5.0 (Linux; Android ${androidVersion}; 22120RN86G Build/${build}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion}.0.7499.192 Mobile Safari/537.36`;
  },

  generateRandomIP() {
    return `${Math.floor(Math.random() * 223) + 1}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
  },

  generateAnonymousId() {
    return Array.from({ length: 32 }, () => 
      Math.floor(Math.random() * 16).toString(16)
    ).join('');
  },

  generateConversationId() {
    return uuidv4();
  },

  generateGuid() {
    const timestamp = Date.now() + Math.floor(Math.random() * 1000000);
    const random1 = Math.floor(Math.random() * 1000);
    const random2 = Math.floor(Math.random() * 1000000000);
    return `${timestamp}|${random1}|${random2}`;
  },

  generateSessionId() {
    return `session_${uuidv4().replace(/-/g, '_')}`;
  },

  generateVisitorData() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    let result = 'Cgt5NzFUajMtbV9TYy';
    for (let i = 0; i < 100; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  },

  getHeaders() {
    const anonymousId = this.generateAnonymousId();
    const guid = this.generateGuid();
    const sessionId = this.generateSessionId();
    const userAgent = this.generateUserAgent();
    const ip = this.generateRandomIP();
    const visitorData = this.generateVisitorData();
    const fingerprint = this.generateFingerprint();
    
    return {
      'User-Agent': userAgent,
      'Accept': '*/*',
      'Content-Type': 'application/json',
      'sec-ch-ua-platform': '"Android"',
      'sec-ch-ua': '"Android WebView";v="143", "Chromium";v="143", "Not A(Brand";v="24"',
      'sec-ch-ua-mobile': '?1',
      'origin': this.baseURL,
      'sec-fetch-site': 'same-origin',
      'sec-fetch-mode': 'cors',
      'sec-fetch-dest': 'empty',
      'referer': `${this.baseURL}/ai-chat`,
      'accept-language': 'ar,en-GB;q=0.9,en-US;q=0.8,en;q=0.7',
      'priority': 'u=1, i',
      'x-requested-with': 'mark.via.gp',
      'x-forwarded-for': ip,
      'x-real-ip': ip,
      'Cookie': [
        `sbox-guid=${guid}`,
        `_uab_collina=${Date.now()}${Math.floor(Math.random() * 1000000000)}`,
        `anonymous_user_id=${anonymousId}`,
        `is_first_visit=true`,
        `VISITOR_INFO1_LIVE=${this.generateAnonymousId().substring(0, 13)}`,
        `VISITOR_PRIVACY_METADATA=${visitorData}`,
        `crisp-client%2Fsession%2F02aa9b53-fc37-4ca7-954d-7a99fb3393de=${sessionId}`,
        `g_state={"i_l":0,"i_ll":${Date.now()},"i_b":"${fingerprint}","i_e":{"enable_itp_optimization":3}}`
      ].join('; ')
    };
  },

  async chat(message) {
    try {
      const conversationId = this.generateConversationId();
      
      const payload = {
        message: message,
        language: 'ar',
        model: 'gpt-4.1-mini',
        tone: 'default',
        length: 'moderate',
        conversation_id: conversationId
      };

      const headers = this.getHeaders();

      const response = await axios.post(
        `${this.apiURL}/chat/stream`,
        payload,
        {
          headers: headers,
          responseType: 'stream',
          timeout: 60000,
          decompress: true,
          validateStatus: (status) => status < 500
        }
      );

      if (response.status === 401 || response.status === 403) {
        throw new Error('Unauthorized');
      }

      if (response.status === 429) {
        throw new Error('Rate Limit');
      }

      return new Promise((resolve, reject) => {
        let fullResponse = '';
        let hasError = false;
        
        const encoding = response.headers['content-encoding'];
        let stream = response.data;
        
        if (encoding === 'gzip') {
          stream = response.data.pipe(zlib.createGunzip());
        } else if (encoding === 'deflate') {
          stream = response.data.pipe(zlib.createInflate());
        } else if (encoding === 'br') {
          stream = response.data.pipe(zlib.createBrotliDecompress());
        }
        
        stream.on('data', (chunk) => {
          const text = chunk.toString('utf-8');
          
          try {
            const errorCheck = JSON.parse(text);
            if (errorCheck.code && errorCheck.message) {
              hasError = true;
              reject(new Error(`${errorCheck.message}`));
              return;
            }
          } catch (e) {}
          
          const lines = text.split('\n').filter(line => line.trim());
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const dataContent = line.substring(6);
              
              if (dataContent === '[DONE]') continue;
              
              try {
                const jsonData = JSON.parse(dataContent);
                
                if (jsonData.code && jsonData.message) {
                  hasError = true;
                  reject(new Error(`${jsonData.message}`));
                  return;
                }
                
                if (jsonData.content) {
                  fullResponse += jsonData.content;
                } else if (jsonData.choices && jsonData.choices[0]?.delta?.content) {
                  fullResponse += jsonData.choices[0].delta.content;
                } else if (jsonData.text) {
                  fullResponse += jsonData.text;
                } else if (jsonData.message && !jsonData.code) {
                  fullResponse += jsonData.message;
                } else if (jsonData.response) {
                  fullResponse += jsonData.response;
                }
              } catch (e) {}
            }
          }
        });

        stream.on('end', () => {
          if (hasError) return;
          resolve(fullResponse);
        });

        stream.on('error', (error) => {
          reject(error);
        });
      });

    } catch (error) {
      if (error.response) {
        throw new Error(`Server Error: ${error.response.status}`);
      }
      throw error;
    }
  }
};

const handler = async (m, { conn, args, text }) => {
  if (!text) {
    return m.reply('❌ الرجاء إدخال سؤالك\n\nمثال: .جيبيتي ما هو الذكاء الاصطناعي؟');
  }

  await m.react('🤖');

  try {
    const result = await NoteGPTAPI.chat(text);

    if (!result || result.trim() === '') {
      return m.reply('❌ لم أتمكن من الحصول على رد. حاول مرة أخرى لاحقاً.');
    }

    await m.reply(result);
    await m.react('✅');

  } catch (error) {
    await m.react('❌');
    
    let errorMsg = '❌ فشل الطلب\n\n';
    
    if (error.message.includes('daily limit') || error.message.includes('164005')) {
      errorMsg += 'تم تجاوز الحد اليومي المجاني. حاول غداً.';
    } else if (error.message.includes('Rate Limit')) {
      errorMsg += 'تم تجاوز معدل الطلبات. انتظر دقيقتين.';
    } else {
      errorMsg += 'حدث خطأ. حاول مرة أخرى.';
    }
    
    return m.reply(errorMsg);
  }
};

handler.command = /^(ai)$/i;
handler.help = ['جيبيتي'];
handler.tags = ['ai'];

export default handler;