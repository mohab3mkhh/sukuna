// plugins/اكس.js — لعبة إكس أو التفاعلية (واجهة HTML)
import fs from "fs";
import path from "path";
import { createRequire } from "module";

// المكتبة المحمّلة ملف CommonJS (.cjs) فبنحمّلها بـ require عن طريق createRequire
const require = createRequire(import.meta.url);

// ═══════════════════════════════════════════════
//             ✦ SUKUNA BOT — X-O ✦
// ═══════════════════════════════════════════════

const BOT_NAME = "⛩️ SUKUNA BOT ⛩️";
const DEVELOPER = "MOHAB";

const MB_PATH = path.join(process.cwd(), "System", "mbulider.cjs");
const MB_URL = "https://cdn.nekohime.site/file/5aygcry5.javascript";

// ═══════════════════════════════════════════════
//                  AIRICH LOADER
// ═══════════════════════════════════════════════

async function getAIRich() {
    if (global.AIRich || global.MB) {
        return global.AIRich || global.MB;
    }

    if (!fs.existsSync(MB_PATH)) {
        fs.mkdirSync(path.dirname(MB_PATH), {
            recursive: true
        });

        const response = await fetch(MB_URL, {
            signal: AbortSignal.timeout(30000)
        });

        if (!response.ok) {
            throw new Error("تعذر تحميل مكتبة ButtonSheets.");
        }

        const data = await response.text();

        if (!data || data.length < 100) {
            throw new Error("ملف المكتبة غير صالح.");
        }

        fs.writeFileSync(MB_PATH, data, "utf8");
    }

    try { delete require.cache[require.resolve(MB_PATH)]; } catch {}

    const mod = require(MB_PATH);
    const AIRich = mod.AIRich || mod.default || mod;

    if (typeof AIRich !== "function") {
        throw new Error("تعذر تحميل AIRich.");
    }

    global.MB = AIRich;
    global.AIRich = AIRich;

    return AIRich;
}

// ═══════════════════════════════════════════════
//                    GAME HTML
// ═══════════════════════════════════════════════

const HTML_TEMPLATE = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">

<title>SUKUNA BOT X-O</title>

<style>
*{
box-sizing:border-box;
-webkit-tap-highlight-color:transparent;
margin:0;
padding:0
}

body{
background:linear-gradient(145deg,#101010,#252525);
font-family:Arial,sans-serif;
color:#e8e8e8;
overflow:hidden
}

.bg{
width:100%;
height:560px;
display:flex;
flex-direction:column;
align-items:center;
padding:12px;
overflow:hidden
}

.title{
font-size:22px;
font-weight:900;
text-align:center
}

.subtitle{
font-size:12px;
color:rgba(232,232,232,.7);
margin:4px 0 10px;
text-align:center
}

.mode-btns{
display:flex;
gap:8px;
margin-bottom:10px;
justify-content:center
}

.mode-btn{
background:rgba(255,255,255,.08);
border:2px solid rgba(232,232,232,.25);
color:#e8e8e8;
padding:8px 14px;
border-radius:25px;
font-size:13px;
font-weight:bold;
cursor:pointer
}

.mode-btn.active{
background:linear-gradient(135deg,#d4d4d4,#a8a8a8);
color:#111
}

.board{
display:grid;
grid-template-columns:repeat(3,1fr);
gap:7px;
background:rgba(0,0,0,.45);
padding:8px;
border-radius:16px;
border:1px solid #4a4a4a
}

.cell{
width:86px;
height:86px;
background:linear-gradient(145deg,#333,#262626);
border:2px solid rgba(232,232,232,.14);
border-radius:12px;
display:flex;
align-items:center;
justify-content:center;
font-size:40px;
font-weight:bold;
cursor:pointer;
user-select:none
}

.cell:active:not(.filled){
transform:scale(.94)
}

.cell.x{
color:#e8e8e8;
text-shadow:0 0 15px rgba(232,232,232,.75)
}

.cell.o{
color:#35e0ff;
text-shadow:0 0 15px rgba(53,224,255,.75)
}

.cell.win{
background:linear-gradient(145deg,#2d4a2d,#1a331a);
border-color:#4aff4a;
animation:glow .8s ease-in-out infinite alternate
}

@keyframes glow{
from{box-shadow:0 0 6px #4aff4a}
to{box-shadow:0 0 20px #4aff4a}
}

.status{
margin-top:10px;
font-size:16px;
font-weight:bold;
min-height:24px;
text-align:center
}

.score{
display:flex;
gap:16px;
margin-top:8px;
background:rgba(0,0,0,.4);
padding:8px 18px;
border-radius:12px;
font-size:14px;
font-weight:bold;
border:1px solid #4a4a4a
}

.score .x-s{color:#e8e8e8}
.score .o-s{color:#35e0ff}
.score .d-s{color:#999}

.btn{
background:linear-gradient(135deg,#d4d4d4,#a8a8a8);
border:none;
color:#111;
padding:10px 22px;
border-radius:10px;
font-size:14px;
font-weight:bold;
cursor:pointer;
margin-top:10px
}

.footer{
font-size:11px;
color:rgba(232,232,232,.55);
margin-top:10px;
text-align:center
}

.dev{
font-size:10px;
color:#aaa;
margin-top:4px;
text-align:center
}
</style>
</head>

<body>

<div class="bg">

<div class="title">✦ SUKUNA BOT X-O ⭕</div>

<div class="subtitle">
لعبة إكس أو • ضد الكمبيوتر أو مع صديق
</div>

<div class="mode-btns">

<button class="mode-btn active" id="mode-ai" onclick="setMode('ai')">
🤖 ضد الكمبيوتر
</button>

<button class="mode-btn" id="mode-2p" onclick="setMode('2p')">
👥 لاعبان
</button>

</div>

<div class="board" id="board"></div>

<div class="status" id="status">
دورك 🅇
</div>

<div class="score">

<span class="x-s">
🅇 <span id="sx">0</span>
</span>

<span class="d-s">
🤝 <span id="sd">0</span>
</span>

<span class="o-s">
⭕ <span id="so">0</span>
</span>

</div>

<button class="btn" onclick="resetRound()">
🔄 جولة جديدة
</button>

<div class="footer">
⚡ POWERED BY SUKUNA BOT
</div>

<div class="dev">
👑 DEVELOPER: MOHAB
</div>

</div>

<script>

const WINS=[
[0,1,2],
[3,4,5],
[6,7,8],
[0,3,6],
[1,4,7],
[2,5,8],
[0,4,8],
[2,4,6]
];

let board;
let turn;
let gameOver;
let mode='ai';

let score={
x:0,
o:0,
d:0
};

function setMode(m){

mode=m;

document
.getElementById('mode-ai')
.classList.toggle('active',m==='ai');

document
.getElementById('mode-2p')
.classList.toggle('active',m==='2p');

resetRound();

}

function resetRound(){

board=Array(9).fill('');
turn='X';
gameOver=false;

render();

setStatus('دورك 🅇');

}

function setStatus(t){

document.getElementById('status').textContent=t;

}

function winner(b){

for(const a of WINS){

const i=a[0];
const j=a[1];
const k=a[2];

if(
b[i] &&
b[i]===b[j] &&
b[i]===b[k]
){

return{
p:b[i],
line:[i,j,k]
};

}

}

return b.every(v=>v)
?{p:'D',line:[]}
:null;

}

function render(){

const el=document.getElementById('board');

el.innerHTML='';

const w=winner(board);

for(let i=0;i<9;i++){

const c=document.createElement('div');

c.className='cell';

if(board[i]){

c.classList.add(
'filled',
board[i]==='X'?'x':'o'
);

c.textContent=
board[i]==='X'?'🅇':'⭕';

}

if(w&&w.line.includes(i)){

c.classList.add('win');

}

c.onclick=()=>play(i);

el.appendChild(c);

}

document.getElementById('sx').textContent=score.x;
document.getElementById('so').textContent=score.o;
document.getElementById('sd').textContent=score.d;

}

function finish(w){

gameOver=true;

if(w.p==='D'){

score.d++;

setStatus('تعادل 🤝');

}else if(w.p==='X'){

score.x++;

setStatus(
mode==='ai'
?'فزت! 🅇 🎉'
:'فاز اللاعب 🅇'
);

}else{

score.o++;

setStatus(
mode==='ai'
?'الكمبيوتر فاز ⭕ 🤖'
:'فاز اللاعب ⭕'
);

}

render();

}

function play(i){

if(gameOver||board[i])return;

if(mode==='ai'&&turn==='O')return;

board[i]=turn;

const w=winner(board);

if(w)return finish(w);

turn=turn==='X'?'O':'X';

render();

if(mode==='ai'&&turn==='O'&&!gameOver){

setStatus('يفكر الكمبيوتر 🤖...');

setTimeout(aiMove,450);

}else{

setStatus(
turn==='X'
?'دورك 🅇'
:'دور اللاعب ⭕'
);

}

}

function aiMove(){

if(gameOver)return;

const mv=bestMove();

if(mv<0)return;

board[mv]='O';

const w=winner(board);

if(w)return finish(w);

turn='X';

render();

setStatus('دورك 🅇');

}

function bestMove(){

// الكمبيوتر يحاول الفوز

for(let i=0;i<9;i++){

if(!board[i]){

board[i]='O';

const w=winner(board);

board[i]='';

if(w&&w.p==='O')return i;

}

}

// الكمبيوتر يمنع اللاعب من الفوز

for(let i=0;i<9;i++){

if(!board[i]){

board[i]='X';

const w=winner(board);

board[i]='';

if(w&&w.p==='X')return i;

}

}

// المركز

if(!board[4])return 4;

// الزوايا

const corners=[0,2,6,8].filter(i=>!board[i]);

if(corners.length){

return corners[
Math.floor(Math.random()*corners.length)
];

}

// أي خانة فارغة

const empty=board
.map((v,i)=>v?-1:i)
.filter(i=>i>=0);

return empty.length
?empty[Math.floor(Math.random()*empty.length)]
:-1;

}

resetRound();

</script>

</body>
</html>`;

// ═══════════════════════════════════════════════
//                    HELPERS
// ═══════════════════════════════════════════════

function getChat(m) {
    return m?.key?.remoteJid || m?.chat || "";
}

async function reply(sock, m, text) {
    const jid = getChat(m);

    if (!jid) return;

    if (typeof m?.reply === "function") {
        return m.reply(text);
    }

    return sock.sendMessage(
        jid,
        { text },
        {
            quoted: m?.message ? m : m?.msg || m
        }
    );
}

// ═══════════════════════════════════════════════
//                  INSTRUCTIONS
// ═══════════════════════════════════════════════

const HELP_HTML = `
<body style="
margin:0;
background:#141414;
color:#e8e8e8;
font-family:Arial;
padding:20px;
text-align:center
">

<h2>✦ SUKUNA BOT X-O ⭕</h2>

<p style="margin:12px 0;line-height:1.9">

🤖 دوس <b>ضد الكمبيوتر</b> عشان تلعب لوحدك

<br>

👥 دوس <b>لاعبان</b> عشان تلعب مع صاحبك

<br>

🅇 أنت بتلعب بـ X

<br>

⭕ الكمبيوتر أو اللاعب التاني بـ O

<br><br>

🏆 اللي يعمل 3 ورا بعض يكسب

<br>

🤝 لو البورد اتملى من غير فايز = تعادل

</p>

<p style="color:#aaa;font-size:12px;margin-top:20px">
⚡ POWERED BY SUKUNA BOT
</p>

<p style="color:#aaa;font-size:12px">
👑 DEVELOPER: MOHAB
</p>

</body>
`;

// ═══════════════════════════════════════════════
//                     COMMAND
// ═══════════════════════════════════════════════

async function execute(sock, m) {

        const jid = getChat(m);

        if (!jid) {
            return reply(
                sock,
                m,
                "❌ تعذر تحديد المحادثة."
            );
        }

        try {

            const AIRichClass = await getAIRich();

            const ai = new AIRichClass(sock);

            const TRUSTED = [
                "whatsapp.com",
                "chat.whatsapp.com",
                "wa.me",
                "youtube.com"
            ];

            const payload = {

                response_id: "sukuna-bot-xo-2026",

                sections: [

                    {
                        view_model: {

                            primitive: {

                                text:
                                    "✦ SUKUNA BOT X-O ⭕\n\n" +
                                    "🎮 لعبة إكس أو تفاعلية\n" +
                                    "🤖 ضد الكمبيوتر أو 👥 لاعبين\n\n" +
                                    "⚡ POWERED BY SUKUNA BOT\n" +
                                    "👑 DEVELOPER: MOHAB",

                                __typename:
                                    "GenAIMarkdownTextUXPrimitive"

                            },

                            __typename:
                                "GenAISingleLayoutViewModel"

                        }
                    }

                ],

                embedded_screens: [

                    {

                        title: "SUKUNA X-O",

                        content: [

                            {

                                __typename:
                                    "FOAIDNixelButtonSheets",

                                tabs: [

                                    {

                                        id: "tab_0",

                                        tab_header: "🎮 العب",

                                        sections: [

                                            {

                                                __typename:
                                                    "GenAIUnifiedResponseSection",

                                                view_model: {

                                                    __typename:
                                                        "GenAISingleLayoutViewModel",

                                                    primitive: {

                                                        __typename:
                                                            "GenAIaeacdsnwHtmlPrimitive",

                                                        payload: HTML_TEMPLATE,

                                                        url:
                                                            "https://whatsapp.com",

                                                        trusted_sources:
                                                            TRUSTED

                                                    }

                                                }

                                            }

                                        ]

                                    },

                                    {

                                        id: "tab_1",

                                        tab_header: "ℹ️ طريقة اللعب",

                                        sections: [

                                            {

                                                __typename:
                                                    "GenAIUnifiedResponseSection",

                                                view_model: {

                                                    __typename:
                                                        "GenAISingleLayoutViewModel",

                                                    primitive: {

                                                        __typename:
                                                            "GenAIaeacdsnwHtmlPrimitive",

                                                        payload: HELP_HTML,

                                                        url:
                                                            "https://whatsapp.com",

                                                        trusted_sources:
                                                            TRUSTED

                                                    }

                                                }

                                            }

                                        ]

                                    }

                                ],

                                step_entries: []

                            }

                        ]

                    }

                ]

            };

            if (ai._unifiedResponseData) {

                ai._unifiedResponseData = payload;

            } else if (
                typeof ai.setUnifiedResponse === "function"
            ) {

                ai.setUnifiedResponse(payload);

            } else {

                ai.unifiedResponseData = payload;

            }

            if (typeof ai.sendHtml === "function") {

                await ai.sendHtml(jid, HTML_TEMPLATE);

                return;

            }

            if (typeof ai.sendCustom === "function") {

                await ai.sendCustom(jid, payload);

                return;

            }

            if (typeof ai.send === "function") {

                const sent = await ai.send(jid);

                if (
                    sent?.key?.id &&
                    typeof ai.sendEdit === "function"
                ) {

                    await ai.sendEdit(
                        jid,
                        sent.key.id
                    );

                }

                return;

            }

            throw new Error(
                "طرق إرسال ButtonSheets غير متاحة."
            );

        } catch (err) {

            console.error(
                "[SUKUNA XO ERROR]",
                err
            );

            await reply(
                sock,
                m,

                [
                    "╭━━━〔 ✦ SUKUNA BOT X-O ✦ 〕━━━⬣",
                    "┃",
                    "┃ ❌ تعذر تشغيل اللعبة.",
                    `┃ ⚠️ السبب: ${String(err?.message || err).slice(0, 180)}`,
                    "┃",
                    "┃ ⚡ POWERED BY SUKUNA BOT",
                    "╰━━━━━━━━━━━━━━━━⬣"
                ].join("\n")
            );

        }

}

const handler = async (m, { conn }) => execute(conn, m);

handler.command = /^(xo|اكس|اكس_او|اكس-او|tictactoe|ttt)$/i;
handler.help = ["xo"];
handler.tags = ["game"];

export default handler;