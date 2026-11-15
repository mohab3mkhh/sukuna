"use strict";

/*
 * 🧞 المارد الأزرق (Akinator) — لعبة تخمين بالأزرار الجديدة (ButtonV2)
 *
 *   .مارد              -> لعبة جديدة
 *   .مارد وقف          -> إنهاء اللعبة
 *   .مارد هو <الاسم>   -> بعد ما يخسر: علّمه الشخصية وهو يحفظها (وإجاباتك عنها)
 *
 * - كل سؤال بيتختار بناءً على إجاباتك اللي فاتت (بيقسم الشخصيات المتبقية لنصين)
 *   وبيسأل أسئلة مرتبطة: لو قلت "من لعبة" هيسأل عن اللعبة، لو "أنمي" هيسأل عن الأنمي..
 * - بيحفظ إجاباتك طول اللعبة، وبيتحمل غلطة منك.
 * - الشخصيات اللي بيتعلمها بتتحفظ في database/mared_learned.json
 *
 * عشان تضيف شخصية يدويًا: زوّد سطر في CHARACTERS: ["الاسم", "صفة1 صفة2 ..."]
 * (بيانات الأحياء/الأموات لحد منتصف 2026)
 */

const fs = require("fs");
const path = require("path");

// ButtonV2 (الأزرار الجديدة) من handlers/botton.js أو button.js
let ButtonV2 = null;

for (const p of ["../handlers/botton", "../handlers/button"]) {
    try {
        const mod = require(p);

        ButtonV2 = mod.ButtonV2 || (typeof mod === "function" ? mod : null);

        if (ButtonV2) break;
    } catch {}
}

if (!ButtonV2) {
    throw new Error("مش لاقي ButtonV2 (handlers/botton.js)");
}

// ==================================================
// CONFIG
// ==================================================

const IMAGE = "/home/container/photos/مارد.jpg"; // اختياري
const LEARN_FILE = path.join(process.cwd(), "database", "mared_learned.json");

const TITLE = "🧞 المارد الأزرق";
const FOOTER = "𝘡𝘐𝘕𝘒𝘚 𝘖𝘙 𝘔𝘖𝘙𝘕𝘐𝘕𝘎 𝘊𝘈𝘛?";

const MAX_QUESTIONS = 30;      // بعد كده يخمّن غصب
const MIN_QUESTIONS = 7;       // أقل عدد أسئلة قبل أول تخمين
const GUESS_CONFIDENCE = 0.8;  // نسبة الثقة اللي يخمّن عندها
const MAX_WRONG = 3;           // عدد التخمينات الغلط قبل ما يستسلم
const SESSION_TTL = 15 * 60 * 1000;

const LIKE_MATCH = 0.97;
const LIKE_MISS = 0.03;

// ==================================================
// الأسئلة: Q[key] = { text, parent }
// parent: السؤال بيتسأل بس لو الصفة دي محتملة ("!real" = لو مش حقيقي محتمل)
// ==================================================

const Q = {};

function defQ(list) {
    for (const [key, text, parent] of list) Q[key] = { text, parent: parent || null };
}

function defFranchises(parent, map) {
    for (const [key, name] of Object.entries(map)) {
        Q[key] = { text: `من ${name}؟`, parent };
    }
}

defQ([
    // ---- عام ----
    ["real", "شخصيتك حقيقية (موجودة في الواقع)؟"],
    ["male", "شخصيتك ذكر؟"],
    ["alive", "لسه عايش/ة النهارده؟", "real"],
    ["old", "اتولد/ظهر قبل سنة 1950؟"],
    ["young", "اتولد/ظهر بعد سنة 1990؟"],
    ["kid", "طفل أو مراهق؟"],
    ["arab", "عربي/ة؟", "real"],
    ["egyptian", "مصري/ة؟", "arab"],
    ["nonhuman", "مش إنسان (حيوان / روبوت / كائن غريب)؟"],
    ["animal", "حيوان؟", "nonhuman"],
    ["robot", "روبوت أو آلة؟", "nonhuman"],
    ["monster", "وحش أو كائن خيالي؟", "nonhuman"],

    // ---- مجالات الأشخاص الحقيقيين ----
    ["footballer", "لاعب كورة؟", "real"],
    ["athlete", "رياضي؟", "real"],
    ["actor", "ممثل/ة؟", "real"],
    ["comedian", "بيضحّك الناس (كوميديان)؟", "actor"],
    ["singer", "مطرب/ة؟", "real"],
    ["rapper", "بيغني راب أو مهرجانات؟", "singer"],
    ["politician", "رئيس أو حاكم أو سياسي؟", "real"],
    ["tech", "عالم أو مخترع أو رجل أعمال تقني؟", "real"],
    ["youtuber", "صانع محتوى على الإنترنت؟", "real"],
    ["writer", "كاتب أو أديب؟", "real"],
    ["artist", "رسام أو موسيقار كلاسيكي؟", "real"],
    ["hollywood", "اشتغل في هوليوود؟", "actor"],
    ["asian", "آسيوي؟", "real"],
    ["latin", "من أمريكا اللاتينية؟", "real"],

    // ---- كورة ----
    ["forward", "بيلعب في الهجوم؟", "footballer"],
    ["midfielder", "بيلعب في الوسط؟", "footballer"],
    ["defender", "بيلعب في الدفاع؟", "footballer"],
    ["goalkeeper", "حارس مرمى؟", "footballer"],
    ["retired", "اعتزل اللعب؟", "athlete"],
    ["worldcup", "كسب كأس العالم؟", "footballer"],
    ["liverpool", "لعب في ليفربول؟", "footballer"],
    ["madrid", "لعب في ريال مدريد؟", "footballer"],
    ["barca", "لعب في برشلونة؟", "footballer"],
    ["psg", "لعب في باريس سان جيرمان؟", "footballer"],
    ["ahly", "لعب للنادي الأهلي؟", "footballer"],
    ["zamalek", "لعب للزمالك؟", "footballer"],
    ["mancity", "لعب في مانشستر سيتي؟", "footballer"],
    ["manutd", "لعب في مانشستر يونايتد؟", "footballer"],
    ["chelsea", "لعب في تشيلسي؟", "footballer"],
    ["arsenal", "لعب في أرسنال؟", "footballer"],
    ["juventus", "لعب في يوفنتوس؟", "footballer"],
    ["bayern", "لعب في بايرن ميونخ؟", "footballer"],
    ["milan", "لعب في ميلان؟", "footballer"],
    ["inter", "لعب في إنتر ميلان؟", "footballer"],
    ["argentina", "أرجنتيني؟", "footballer"],
    ["portugal", "برتغالي؟", "footballer"],
    ["brazil", "برازيلي؟", "footballer"],
    ["france", "فرنسي؟", "footballer"],
    ["spain", "إسباني؟", "footballer"],
    ["england", "إنجليزي؟", "footballer"],
    ["italy", "إيطالي؟", "footballer"],
    ["belgium", "بلجيكي؟", "footballer"],

    // ---- رياضات تانية ----
    ["boxing", "ملاكم؟", "athlete"],
    ["basketball", "لاعب كرة سلة؟", "athlete"],
    ["tennis", "لاعب/ة تنس؟", "athlete"],
    ["racing", "سائق سباقات؟", "athlete"],
    ["sprinter", "عدّاء؟", "athlete"],
    ["swimmer", "سبّاح؟", "athlete"],
    ["mma", "مقاتل MMA؟", "athlete"],
    ["squash", "لاعب/ة اسكواش؟", "athlete"],
    ["wrestler", "مصارع؟", "athlete"],

    // ---- أسئلة مميزة للأشخاص الحقيقيين ----
    ["shaabi", "بيغني شعبي؟", "singer"],
    ["nubian", "من النوبة؟", "singer"],
    ["hadaba", "لقبه «الهضبة»؟", "singer"],
    ["lebanese", "لبناني/ة؟", "arab"],
    ["iraqi", "عراقي؟", "arab"],
    ["umbrella", "اشتهرت بأغنية Umbrella؟", "singer"],
    ["singleladies", "اشتهرت بأغنية Single Ladies؟", "singer"],
    ["swifties", "جمهورها اسمه Swifties؟", "singer"],
    ["lamby", "اشتهر بشخصية «اللمبي»؟", "actor"],
    ["saidi", "اشتهر بفيلم «صعيدي في الجامعة الأمريكية»؟", "actor"],
    ["asal", "اشتهر بفيلم «عسل أسود»؟", "actor"],
    ["bluefilm", "اشتهر بفيلم «الفيل الأزرق»؟", "actor"],
    ["abyad", "اشتهر بفيلم «إبراهيم الأبيض»؟", "actor"],
    ["cindarella", "لقبها «سندريلا الشاشة العربية»؟", "actor"],
    ["fightclub", "اشتهر بفيلم Fight Club؟", "actor"],
    ["titanic", "اشتهر بفيلم Titanic؟", "actor"],
    ["sparrowactor", "لعب دور جاك سبارو؟", "actor"],
    ["mission", "اشتهر بسلسلة Mission Impossible؟", "actor"],
    ["menblack", "اشتهر بفيلم Men in Black؟", "actor"],
    ["terminator", "اشتهر بفيلم Terminator؟", "actor"],
    ["martial", "ممثل أو بطل فنون قتالية؟", "actor"],
    ["tombactor", "لعبت دور لارا كروفت؟", "actor"],
    ["hermione", "لعبت دور هيرميوني؟", "actor"],
    ["blackwidow", "لعبت دور الأرملة السوداء؟", "actor"],
    ["ironactor", "لعب دور آيرون مان؟", "actor"],
    ["beanactor", "لعب دور مستر بين؟", "actor"],
    ["revolution", "قاد ثورة يوليو 1952؟", "politician"],
    ["peace", "وقّع اتفاقية سلام مع إسرائيل؟", "politician"],
    ["mubarak", "حكم مصر 30 سنة؟", "politician"],
    ["ww2uk", "قاد بريطانيا في الحرب العالمية الثانية؟", "politician"],
    ["india", "هندي؟", "politician"],
    ["southafrica", "من جنوب أفريقيا؟", "politician"],
    ["usapres", "كان رئيس أمريكا؟", "politician"],
    ["relativity", "صاحب النظرية النسبية؟", "tech"],
    ["ac", "ارتبط اسمه بالتيار المتردد (AC)؟", "tech"],
    ["gravity", "اكتشف الجاذبية؟", "tech"],
    ["lightbulb", "اخترع المصباح الكهربائي؟", "tech"],
    ["wheelchair", "كان على كرسي متحرك؟", "tech"],
    ["radium", "اكتشفت الراديوم؟", "tech"],
    ["tesla_cars", "صاحب شركة تسلا؟", "tech"],
    ["microsoft", "مؤسس مايكروسوفت؟", "tech"],
    ["facebook", "مؤسس فيسبوك؟", "tech"],
    ["apple", "مؤسس شركة أبل؟", "tech"],
    ["amazon", "مؤسس أمازون؟", "tech"],
    ["nobel", "حاصل على جائزة نوبل؟", "real"],
    ["blind", "كان كفيف؟", "writer"],
    ["monalisa", "رسم الموناليزا؟", "artist"],
    ["ear", "قطع أذنه؟", "artist"],
    ["deaf", "فقد سمعه وهو موسيقار؟", "artist"],
    ["educational", "بيقدم محتوى ثقافي وعلمي؟", "youtuber"],
    ["siuu", "بيقول «SIUUU»؟", "youtuber"],
    ["hpauthor", "كاتبة هاري بوتر؟", "writer"],
    ["shakespeare", "كاتب مسرحيات إنجليزي؟", "writer"]
]);

// ---- خيالي: نوع المصدر ----
defQ([
    ["cartoon", "من الكرتون (غير الأنمي)؟", "!real"],
    ["anime", "من الأنمي؟", "!real"],
    ["game", "من لعبة فيديو؟", "!real"],
    ["mobilegame", "من لعبة موبايل؟", "game"],
    ["movie", "من فيلم؟", "!real"],
    ["series", "من مسلسل؟", "!real"],
    ["hero", "من الأبطال الطيبين؟", "!real"],
    ["villain", "شرير؟", "!real"],
    ["powers", "عنده قوى خارقة أو سحر؟", "!real"],
    ["superhero", "بطل خارق؟", "!real"],
    ["sword", "بيستخدم سيف؟", "!real"],
    ["gun", "بيستخدم سلاح ناري؟", "!real"],
    ["axe", "بيستخدم فأس؟", "!real"],
    ["mask", "بيلبس قناع؟", "!real"],
    ["hat", "بيلبس قبعة؟", "!real"],
    ["cape", "بيلبس عباءة/كاب؟", "!real"],
    ["hood", "بيلبس غطاء راس (هودي)؟", "!real"],
    ["glasses", "بيلبس نضارة؟", "!real"],
    ["fat", "بدين أو كرشه كبير؟", "!real"],
    ["princess", "أميرة؟", "!real"],
    ["prince", "أمير أو ملك؟", "!real"],
    ["detective", "محقق؟", "!real"],
    ["pirate", "قرصان؟", "!real"],
    ["ninja", "من النينجا؟", "!real"],
    ["soldier", "جندي أو مقاتل؟", "!real"],
    ["alien", "جاي من كوكب تاني؟", "!real"],
    ["mouse", "فأر؟", "animal"],
    ["cat", "قطة؟", "animal"],
    ["dog", "كلب؟", "animal"],
    ["bird", "طائر؟", "animal"],
    ["sea", "عايش تحت الماء؟", "!real"],
    ["red", "لونه الأساسي أحمر؟", "!real"],
    ["blue", "لونه الأساسي أزرق؟", "!real"],
    ["green", "لونه الأساسي أخضر؟", "!real"],
    ["yellow", "لونه الأساسي أصفر؟", "!real"],
    ["black", "لونه الأساسي أسود؟", "!real"],
    ["white", "لونه الأساسي أبيض؟", "!real"],
    ["pink", "لونه الأساسي وردي؟", "!real"],
    ["orange", "لونه الأساسي برتقالي؟", "!real"],
    ["brown", "لونه الأساسي بني؟", "!real"],
    ["blond", "شعره أصفر (أشقر)؟", "!real"],
    ["whitehair", "شعره أبيض أو فضي؟", "!real"],
    ["redhair", "شعره أحمر؟", "!real"],
    ["bluehair", "شعره أزرق؟", "!real"],
    ["greenhair", "شعره أخضر؟", "!real"],
    ["pinkhair", "شعره وردي؟", "!real"],
    ["dc", "من عالم DC؟", "superhero"],
    ["marvel", "من عالم مارفل؟", "superhero"],
    ["disney", "من ديزني أو بيكسار؟", "cartoon"],
    ["dreamworks", "من دريم ووركس؟", "cartoon"],
    ["arabtoon", "كرتون عربي؟", "cartoon"]
]);

// ---- ألعاب ----
defFranchises("game", {
    gow: "God of War", mario: "سوبر ماريو", zelda: "زيلدا", sonic: "سونيك", pokemon: "بوكيمون",
    gta: "GTA", cod: "Call of Duty", freefire: "فري فاير", fortnite: "فورتنايت",
    minecraft: "ماين كرافت", amongus: "Among Us", subway: "Subway Surfers", angrybirds: "Angry Birds",
    templerun: "Temple Run", pvz: "Plants vs Zombies", assassins: "Assassin's Creed", tombraider: "Tomb Raider",
    resident: "Resident Evil", halo: "Halo", uncharted: "Uncharted", lastofus: "The Last of Us",
    streetfighter: "Street Fighter", mortalkombat: "Mortal Kombat", pacman: "Pac-Man", crash: "Crash Bandicoot",
    kirby: "Kirby", donkeykong: "Donkey Kong", witcher: "The Witcher", pou: "Pou", talkingtom: "My Talking Tom",
    fnaf: "Five Nights at Freddy's", metalgear: "Metal Gear", doom: "Doom", clash: "Clash of Clans",
    brawl: "Brawl Stars", roblox: "Roblox", genshin: "Genshin Impact", overwatch: "Overwatch",
    fallout: "Fallout"
});

// ---- أنمي ----
defFranchises("anime", {
    naruto: "ناروتو", onepiece: "ون بيس", dragonball: "دراغون بول", bleach: "بليتش", aot: "Attack on Titan",
    deathnote: "Death Note", mha: "My Hero Academia", demonslayer: "Demon Slayer", hxh: "Hunter x Hunter",
    opm: "One Punch Man", fma: "Fullmetal Alchemist", conan: "المحقق كونان", doraemon: "دورايمون",
    shinchan: "شين شان", tsubasa: "الكابتن ماجد", ghibli: "ستوديو جيبلي", sailormoon: "سيلور مون",
    jujutsu: "Jujutsu Kaisen", pokeanime: "أنمي بوكيمون"
});

// ---- كرتون ----
defFranchises("cartoon", {
    tomjerry: "توم وجيري", spongebob: "سبونج بوب", mickey: "عالم ميكي ماوس", simpsons: "عائلة سيمبسون",
    familyguy: "Family Guy", looney: "لوني تيونز", scooby: "سكوبي دو", rickmorty: "ريك ومورتي",
    minions: "المينيونز", frozen: "فروزن", lionking: "الأسد الملك", toystory: "توي ستوري", shrek: "شريك",
    kungfupanda: "كونغ فو باندا", madagascar: "مدغشقر", peppapig: "بيبا بيج", ben10: "بن 10",
    smurfs: "السنافر", winnie: "ويني الدبدوب", popeye: "باباي", pinkpanther: "النمر الوردي",
    avatar: "أفاتار: آخر سيد للهواء", aladdin: "علاء الدين", princessdisney: "أميرات ديزني",
    monsters: "شركة المرعبين", cars: "سيارات (Cars)", httyd: "How to Train Your Dragon"
});

// ---- أفلام ومسلسلات ----
defFranchises("movie", {
    starwars: "حرب النجوم (Star Wars)", hogwarts: "عالم هاري بوتر", lotr: "سيد الخواتم", bond: "جيمس بوند",
    potc: "قراصنة الكاريبي", matrix: "The Matrix", transformers: "Transformers",
    johnwick: "John Wick", sherlock: "شرلوك هولمز", batmanfilm: "أفلام باتمان", avengers: "الأفلام الانتقامية (Avengers)"
});

defFranchises("series", {
    got: "Game of Thrones", stranger: "Stranger Things", squid: "Squid Game", moneyheist: "La Casa de Papel",
    breakingbad: "Breaking Bad", egyseries: "مسلسل مصري", peakyblinders: "Peaky Blinders", thewalking: "The Walking Dead",
    mrbean: "مستر بين"
});

// أسئلة إضافية مميزة
defQ([
    ["barcacoach", "اشتغل مدرب لبرشلونة؟", "footballer"],
    ["ahlypres", "رئيس النادي الأهلي؟", "footballer"]
]);

// ==================================================
// الشخصيات (الاسم، الصفات)
// ==================================================

const CHARACTERS = [];

// ---------- لاعبين كورة ----------
CHARACTERS.push(
    ["محمد صلاح", "real male alive young arab egyptian footballer athlete forward liverpool chelsea"],
    ["ليونيل ميسي", "real male alive footballer athlete forward barca psg argentina worldcup"],
    ["كريستيانو رونالدو", "real male alive footballer athlete forward madrid manutd juventus portugal"],
    ["نيمار", "real male alive young footballer athlete forward barca psg brazil"],
    ["كيليان مبابي", "real male alive young footballer athlete forward psg madrid france worldcup"],
    ["زين الدين زيدان", "real male alive footballer athlete midfielder retired madrid juventus france worldcup"],
    ["محمد أبو تريكة", "real male alive arab egyptian footballer athlete midfielder retired ahly"],
    ["محمود الخطيب", "real male alive arab egyptian footballer athlete forward retired ahly ahlypres"],
    ["دييجو مارادونا", "real male footballer athlete forward retired barca argentina worldcup"],
    ["بيليه", "real male old footballer athlete forward retired brazil worldcup"],
    ["إيرلينج هالاند", "real male alive young footballer athlete forward mancity"],
    ["كريم بنزيما", "real male alive footballer athlete forward madrid france"],
    ["لوكا مودريتش", "real male alive footballer athlete midfielder madrid"],
    ["رونالدينيو", "real male alive footballer athlete forward retired barca psg milan brazil worldcup"],
    ["ديفيد بيكهام", "real male alive footballer athlete midfielder retired manutd madrid psg milan england"],
    ["سيرجيو راموس", "real male alive footballer athlete defender madrid psg spain worldcup"],
    ["أندريس إنييستا", "real male alive footballer athlete midfielder retired barca spain worldcup"],
    ["تشافي هيرنانديز", "real male alive footballer athlete midfielder retired barca spain worldcup barcacoach"],
    ["كيفين دي بروين", "real male alive footballer athlete midfielder mancity chelsea belgium"],
    ["روبرت ليفاندوفسكي", "real male alive footballer athlete forward bayern barca"],
    ["هاري كين", "real male alive footballer athlete forward bayern england"],
    ["فينيسيوس جونيور", "real male alive young footballer athlete forward madrid brazil"],
    ["جود بيلينجهام", "real male alive young footballer athlete midfielder madrid england"],
    ["لامين يامال", "real male alive young footballer athlete forward barca spain"],
    ["زلاتان إبراهيموفيتش", "real male alive footballer athlete forward retired barca psg milan inter juventus manutd"],
    ["جيانلويجي بوفون", "real male alive footballer athlete goalkeeper retired juventus psg italy worldcup"],
    ["باولو مالديني", "real male alive footballer athlete defender retired milan italy"],
    ["إيدين هازارد", "real male alive footballer athlete forward retired chelsea madrid belgium"],
    ["لويس سواريز", "real male alive footballer athlete forward barca liverpool"],
    ["محمد النني", "real male alive young arab egyptian footballer athlete midfielder arsenal"],
    ["مصطفى محمد", "real male alive young arab egyptian footballer athlete forward zamalek"],
    ["محمود تريزيجيه", "real male alive young arab egyptian footballer athlete forward ahly"]
);

// ---------- مطربين ----------
CHARACTERS.push(
    ["عمرو دياب", "real male alive arab egyptian singer hadaba"],
    ["تامر حسني", "real male alive arab egyptian singer actor"],
    ["محمد منير", "real male alive arab egyptian singer nubian"],
    ["حكيم", "real male alive arab egyptian singer shaabi"],
    ["عبد الحليم حافظ", "real male old arab egyptian singer actor"],
    ["أم كلثوم", "real old arab egyptian singer"],
    ["فيروز", "real old alive arab lebanese singer"],
    ["نانسي عجرم", "real alive arab lebanese singer"],
    ["كاظم الساهر", "real male alive arab iraqi singer"],
    ["شيرين عبد الوهاب", "real alive arab egyptian singer"],
    ["ويجز", "real male alive young arab egyptian singer rapper"],
    ["مايكل جاكسون", "real male singer"],
    ["تايلور سويفت", "real alive singer swifties"],
    ["ريهانا", "real alive singer umbrella"],
    ["بيونسيه", "real alive singer singleladies"],
    ["شاكيرا", "real alive singer latin"],
    ["بيلي أيليش", "real alive young singer"],
    ["إيمينيم", "real male alive singer rapper"],
    ["إلفيس بريسلي", "real male old singer"],
    ["إد شيران", "real male alive singer"]
);

// ---------- ممثلين ----------
CHARACTERS.push(
    ["محمد رمضان", "real male alive arab egyptian actor singer rapper"],
    ["أحمد مكي", "real male alive arab egyptian actor singer comedian rapper"],
    ["عادل إمام", "real male old alive arab egyptian actor comedian"],
    ["محمد هنيدي", "real male alive arab egyptian actor comedian saidi"],
    ["أحمد حلمي", "real male alive arab egyptian actor comedian asal"],
    ["محمد سعد", "real male alive arab egyptian actor comedian lamby"],
    ["ياسمين عبد العزيز", "real alive arab egyptian actor comedian"],
    ["أحمد زكي", "real male old arab egyptian actor"],
    ["كريم عبد العزيز", "real male alive arab egyptian actor bluefilm"],
    ["أحمد السقا", "real male alive arab egyptian actor abyad"],
    ["عمر الشريف", "real male old arab egyptian actor hollywood"],
    ["سعاد حسني", "real old arab egyptian actor singer cindarella"],
    ["فاتن حمامة", "real old arab egyptian actor"],
    ["براد بيت", "real male alive actor hollywood fightclub"],
    ["ليوناردو دي كابريو", "real male alive actor hollywood titanic"],
    ["جوني ديب", "real male alive actor hollywood sparrowactor"],
    ["توم كروز", "real male alive actor hollywood mission"],
    ["ويل سميث", "real male alive actor hollywood singer rapper menblack"],
    ["أرنولد شوارزنيجر", "real male alive actor hollywood politician terminator"],
    ["بروس لي", "real male old asian actor martial"],
    ["جاكي شان", "real male alive asian actor martial"],
    ["أنجلينا جولي", "real alive actor hollywood tombactor"],
    ["إيما واتسون", "real alive actor hollywood hermione"],
    ["سكارليت جوهانسون", "real alive actor hollywood blackwidow"],
    ["روبرت داوني جونيور", "real male alive actor hollywood ironactor"],
    ["روان أتكينسون", "real male alive actor comedian beanactor"],
    ["دوين جونسون", "real male alive actor athlete wrestler hollywood"]
);

defQ([
    ["claymaster", "ملك الملاعب الترابية؟", "tennis"]
]);

// ---------- سياسة وتاريخ ----------
CHARACTERS.push(
    ["جمال عبد الناصر", "real male old arab egyptian politician revolution"],
    ["أنور السادات", "real male old arab egyptian politician peace"],
    ["حسني مبارك", "real male old arab egyptian politician mubarak"],
    ["نابليون بونابرت", "real male old politician"],
    ["دونالد ترامب", "real male old alive politician usapres"],
    ["باراك أوباما", "real male alive politician usapres"],
    ["ونستون تشرشل", "real male old politician ww2uk"],
    ["المهاتما غاندي", "real male old asian politician india"],
    ["نيلسون مانديلا", "real male old politician southafrica nobel"]
);

// ---------- رياضيين ----------
CHARACTERS.push(
    ["محمد علي كلاي", "real male old athlete boxing retired"],
    ["مايك تايسون", "real male alive athlete boxing retired"],
    ["يوسين بولت", "real male alive athlete sprinter retired"],
    ["مايكل جوردان", "real male alive athlete basketball retired"],
    ["ليبرون جيمس", "real male alive athlete basketball"],
    ["روجر فيدرر", "real male alive athlete tennis retired"],
    ["رافائيل نادال", "real male alive athlete tennis retired claymaster"],
    ["سيرينا ويليامز", "real alive athlete tennis retired"],
    ["لويس هاميلتون", "real male alive athlete racing"],
    ["مايكل فيلبس", "real male alive athlete swimmer retired"],
    ["خبيب نورماغوميدوف", "real male alive athlete mma retired"],
    ["كونور ماكغريغور", "real male alive athlete mma"],
    ["نور الشربيني", "real alive young arab egyptian athlete squash"]
);

// ---------- علماء وتقنية ----------
CHARACTERS.push(
    ["ألبرت أينشتاين", "real male old tech relativity nobel"],
    ["نيكولا تيسلا", "real male old tech ac"],
    ["إسحاق نيوتن", "real male old tech gravity"],
    ["توماس إديسون", "real male old tech lightbulb"],
    ["ستيفن هوكينج", "real male old tech wheelchair"],
    ["ماري كوري", "real old tech radium nobel"],
    ["أحمد زويل", "real male old arab egyptian tech nobel"],
    ["مجدي يعقوب", "real male old alive arab egyptian tech"],
    ["إيلون ماسك", "real male alive tech tesla_cars"],
    ["بيل جيتس", "real male alive tech microsoft"],
    ["مارك زوكربيرج", "real male alive tech facebook"],
    ["ستيف جوبز", "real male tech apple"],
    ["جيف بيزوس", "real male alive tech amazon"]
);

// ---------- أدباء وفنانين ----------
CHARACTERS.push(
    ["نجيب محفوظ", "real male old arab egyptian writer nobel"],
    ["طه حسين", "real male old arab egyptian writer blind"],
    ["وليام شكسبير", "real male old writer shakespeare"],
    ["جي كي رولينج", "real alive writer hpauthor"],
    ["ليوناردو دا فينشي", "real male old artist monalisa"],
    ["فان جوخ", "real male old artist ear"],
    ["بيتهوفن", "real male old artist deaf"]
);

// ---------- صناع محتوى ----------
CHARACTERS.push(
    ["مستر بيست", "real male alive young youtuber"],
    ["بيو ديباي", "real male alive youtuber"],
    ["الدحيح", "real male alive arab egyptian youtuber educational"],
    ["آي شو سبيد", "real male alive young youtuber siuu"]
);

// ---------- شخصيات ألعاب فيديو وموبايل ----------
CHARACTERS.push(
    ["كريتوس", "male game gow hero powers axe"],
    ["أتريوس", "male kid game gow hero powers"],
    ["ماريو", "male game mario hero red hat"],
    ["لويجي", "male game mario hero green hat"],
    ["بوزر", "male nonhuman monster game mario villain green"],
    ["الأميرة بيتش", "game mario princess pink"],
    ["يوشي", "male nonhuman monster game mario hero green"],
    ["لينك", "male game zelda hero sword green hat"],
    ["الأميرة زيلدا", "game zelda princess powers"],
    ["جانون", "male nonhuman monster game zelda villain powers"],
    ["سونيك", "male nonhuman animal game sonic hero powers blue"],
    ["تايلز", "male kid nonhuman animal game sonic hero orange"],
    ["نكلز", "male nonhuman animal game sonic hero red"],
    ["دكتور إيجمان", "male game sonic villain fat"],
    ["بيكاتشو", "male nonhuman animal game anime pokemon pokeanime hero powers yellow"],
    ["تشاريزارد", "male nonhuman monster game anime pokemon pokeanime powers orange"],
    ["آش كتشم", "male kid anime pokeanime hero hat"],
    ["سي جي (GTA)", "male game gta hero"],
    ["تريفور فيليبس", "male game gta villain"],
    ["كابتن برايس", "male game cod soldier gun hat hero"],
    ["جوست (Call of Duty)", "male game cod soldier gun mask hero"],
    ["ستيف (ماين كرافت)", "male game minecraft hero sword blue"],
    ["أليكس (ماين كرافت)", "game minecraft hero green"],
    ["كريبر", "nonhuman monster game minecraft villain green"],
    ["إندرمان", "nonhuman monster game minecraft villain black"],
    ["جونزي (فورتنايت)", "male game fortnite hero gun"],
    ["الموزة بيلي (فورتنايت)", "nonhuman monster game fortnite yellow"],
    ["ألوك (فري فاير)", "male game freefire mobilegame hero"],
    ["كيلي (فري فاير)", "game freefire mobilegame hero"],
    ["شخصية Among Us", "nonhuman game amongus mobilegame red"],
    ["جيك (Subway Surfers)", "male kid game subway mobilegame hero hat"],
    ["الطائر الأحمر (Angry Birds)", "nonhuman animal bird game angrybirds mobilegame red"],
    ["تشاك (Angry Birds)", "nonhuman animal bird game angrybirds mobilegame yellow"],
    ["بيشوتر (Plants vs Zombies)", "nonhuman game pvz mobilegame hero green"],
    ["الزومبي (Plants vs Zombies)", "nonhuman monster game pvz mobilegame villain"],
    ["إيتزيو أوديتوري", "male game assassins hero hood sword"],
    ["لارا كروفت", "game tombraider hero gun"],
    ["ليون كينيدي", "male game resident hero gun"],
    ["ماستر تشيف", "male game halo soldier hero gun green"],
    ["ناثان دريك", "male game uncharted hero gun"],
    ["جويل (The Last of Us)", "male game lastofus hero gun"],
    ["إيلي (The Last of Us)", "kid game lastofus hero"],
    ["ريو (Street Fighter)", "male game streetfighter hero white"],
    ["تشون لي", "game streetfighter hero blue"],
    ["سكوربيون", "male game mortalkombat ninja mask yellow"],
    ["ساب زيرو", "male game mortalkombat ninja mask hero blue"],
    ["باك مان", "nonhuman game pacman yellow"],
    ["كراش باندكوت", "male nonhuman animal game crash hero orange"],
    ["كيربي", "nonhuman game kirby hero pink"],
    ["دونكي كونج", "male nonhuman animal game donkeykong brown"],
    ["جيرالت (The Witcher)", "male game witcher hero sword powers"],
    ["بو (Pou)", "nonhuman game pou mobilegame brown"],
    ["توكنج توم", "male nonhuman animal cat game talkingtom mobilegame"],
    ["فريدي (Five Nights at Freddy's)", "male nonhuman animal robot game fnaf villain brown"],
    ["سوليد سنيك", "male game metalgear soldier hero gun"],
    ["دووم سلاير", "male game doom soldier hero gun green"]
);

defQ([
    ["poisonapple", "أكلت تفاحة مسمومة؟", "princessdisney"],
    ["longhair", "شعرها طويل جدًا؟", "princessdisney"],
    ["beastlove", "حبيبها وحش؟", "princessdisney"],
    ["glassshoe", "فقدت حذاءها؟", "princessdisney"],
    ["spy", "جاسوس؟", "series"],
    ["omda", "عمدة؟", "series"]
]);

// ---------- أنمي ----------
CHARACTERS.push(
    ["ناروتو", "male kid anime naruto hero powers ninja blond orange"],
    ["ساسكي", "male kid anime naruto ninja powers black"],
    ["كاكاشي", "male anime naruto hero ninja powers mask whitehair"],
    ["إيتاتشي", "male anime naruto villain ninja powers cape"],
    ["غوكو", "male anime dragonball hero powers alien orange"],
    ["فيجيتا", "male anime dragonball powers prince alien blue"],
    ["لوفي", "male kid anime onepiece hero powers pirate hat"],
    ["زورو", "male anime onepiece hero sword pirate greenhair"],
    ["سانجي", "male anime onepiece hero pirate blond"],
    ["إيتشيغو كوروساكي", "male kid anime bleach hero sword powers"],
    ["إرين ييغر", "male kid anime aot hero powers"],
    ["ميكاسا", "kid anime aot hero sword"],
    ["ليفاي أكرمان", "male anime aot hero sword soldier"],
    ["لايت ياغامي", "male kid anime deathnote villain powers"],
    ["إل (Death Note)", "male anime deathnote detective hero"],
    ["ديكو", "male kid anime mha hero powers green greenhair"],
    ["أول مايت", "male anime mha hero powers blond"],
    ["تانجيرو", "male kid anime demonslayer hero sword"],
    ["نيزوكو", "kid anime demonslayer powers pink"],
    ["غون فريكس", "male kid anime hxh hero"],
    ["كيلوا", "male kid anime hxh powers whitehair"],
    ["سايتاما", "male anime opm hero powers"],
    ["إدوارد إلريك", "male kid anime fma hero powers blond"],
    ["كونان", "male kid anime conan detective hero glasses"],
    ["دورايمون", "male nonhuman robot cat anime doraemon hero blue"],
    ["نوبيتا", "male kid anime doraemon glasses"],
    ["شين شان", "male kid anime shinchan"],
    ["كابتن ماجد", "male kid anime tsubasa hero"],
    ["توتورو", "nonhuman monster anime ghibli"],
    ["سيلور مون", "kid anime sailormoon hero powers blond"],
    ["غوجو ساتورو", "male anime jujutsu hero powers mask whitehair"],
    ["إيتادوري يوجي", "male kid anime jujutsu hero powers pinkhair"]
);

// ---------- كرتون ----------
CHARACTERS.push(
    ["توم", "male old nonhuman animal cartoon tomjerry cat"],
    ["جيري", "male old nonhuman animal cartoon tomjerry mouse"],
    ["سبونج بوب", "male nonhuman cartoon spongebob sea yellow"],
    ["باتريك ستار", "male nonhuman animal cartoon spongebob sea pink fat"],
    ["ميكي ماوس", "male old nonhuman animal cartoon disney mickey mouse hero"],
    ["ميني ماوس", "old nonhuman animal cartoon disney mickey mouse hero pink"],
    ["البطة دونالد", "male old nonhuman animal cartoon disney mickey bird"],
    ["جوفي", "male old nonhuman animal cartoon disney mickey dog hat"],
    ["بلوتو", "male old nonhuman animal cartoon disney mickey dog"],
    ["باغز باني", "male old nonhuman animal cartoon looney hero"],
    ["البطة داف", "male old nonhuman animal cartoon looney bird black"],
    ["تويتي", "old nonhuman animal cartoon looney bird yellow"],
    ["هومر سيمبسون", "male cartoon simpsons fat yellow"],
    ["بارت سيمبسون", "male kid cartoon simpsons yellow"],
    ["بيتر جريفين", "male cartoon familyguy fat glasses"],
    ["ريك سانشيز", "male cartoon rickmorty bluehair"],
    ["مورتي", "male kid cartoon rickmorty"],
    ["سكوبي دو", "male nonhuman animal cartoon scooby dog brown"],
    ["شاجي", "male cartoon scooby green"],
    ["كيفن (المينيونز)", "male nonhuman cartoon minions yellow glasses"],
    ["جرو", "male cartoon minions villain"],
    ["إلسا", "young cartoon disney frozen princess princessdisney powers white"],
    ["آنا", "young cartoon disney frozen princess princessdisney hero"],
    ["أولاف", "male nonhuman cartoon disney frozen white hero"],
    ["سيمبا", "male nonhuman animal cartoon disney lionking hero prince"],
    ["سكار", "male nonhuman animal cartoon disney lionking villain black"],
    ["تيمون", "male nonhuman animal cartoon disney lionking hero"],
    ["بومبا", "male nonhuman animal cartoon disney lionking hero fat"],
    ["وودي", "male nonhuman cartoon disney toystory hero hat brown"],
    ["باز لايتيير", "male nonhuman robot cartoon disney toystory hero green"],
    ["نيمو", "male kid nonhuman animal cartoon disney sea orange hero"],
    ["دوري", "nonhuman animal cartoon disney sea blue hero"],
    ["شريك", "male nonhuman monster cartoon dreamworks shrek hero green fat"],
    ["الحمار (شريك)", "male nonhuman animal cartoon dreamworks shrek"],
    ["فيونا", "cartoon dreamworks shrek princess green"],
    ["القط ذو الحذاء", "male nonhuman animal cat cartoon dreamworks shrek hero hat sword orange"],
    ["بو (كونغ فو باندا)", "male nonhuman animal cartoon dreamworks kungfupanda hero fat"],
    ["لايتنج ماكوين", "male nonhuman robot cartoon disney cars hero red"],
    ["ماتر", "male nonhuman robot cartoon disney cars brown"],
    ["سولي", "male nonhuman monster cartoon disney monsters blue"],
    ["مايك وازوفسكي", "male nonhuman monster cartoon disney monsters green"],
    ["ستيتش", "male nonhuman alien cartoon disney blue"],
    ["بايماكس", "nonhuman robot cartoon disney white hero"],
    ["علاء الدين", "male cartoon disney aladdin hero"],
    ["ياسمين", "cartoon disney aladdin princess princessdisney"],
    ["الجني", "male nonhuman monster cartoon disney aladdin powers blue"],
    ["أريل", "cartoon disney princess princessdisney sea redhair"],
    ["بياض الثلج", "cartoon disney princess princessdisney poisonapple"],
    ["رابونزل", "cartoon disney princess princessdisney longhair"],
    ["بيل (الجميلة والوحش)", "cartoon disney princess princessdisney beastlove"],
    ["سندريلا", "old cartoon disney princess princessdisney glassshoe"],
    ["مولان", "cartoon disney princessdisney soldier sword hero"],
    ["ويني الدبدوب", "male nonhuman animal cartoon disney winnie red fat"],
    ["بيبا بيج", "kid nonhuman animal cartoon peppapig pink"],
    ["بن تن", "male kid cartoon ben10 hero powers"],
    ["بابا سنفور", "male nonhuman cartoon smurfs blue hero hat"],
    ["باباي", "male old cartoon popeye hero hat green"],
    ["النمر الوردي", "male nonhuman animal cartoon pinkpanther pink"],
    ["آنج (آخر سيد للهواء)", "male kid cartoon avatar hero powers"],
    ["هيكاب", "male kid cartoon httyd hero dreamworks"],
    ["الدرغون (بدون أسنان)", "male nonhuman monster cartoon httyd hero black dreamworks"],
    ["بكار", "male kid cartoon arabtoon arab hero"]
);

// ---------- أبطال خارقين وأفلام ----------
CHARACTERS.push(
    ["باتمان", "male old superhero dc movie batmanfilm hero cape mask black"],
    ["سوبرمان", "male old superhero dc movie hero powers cape alien blue"],
    ["وندر وومان", "old superhero dc movie hero powers"],
    ["الجوكر", "male dc movie batmanfilm villain"],
    ["أكوامان", "male superhero dc movie hero powers sea"],
    ["سبايدرمان", "male superhero marvel movie avengers hero powers mask red"],
    ["آيرون مان", "male superhero marvel movie avengers hero red"],
    ["كابتن أمريكا", "male old superhero marvel movie avengers hero soldier blue"],
    ["ثور", "male superhero marvel movie avengers hero powers cape alien blond"],
    ["هالك", "male superhero marvel movie avengers hero powers green"],
    ["بلاك بانثر", "male superhero marvel movie avengers hero powers mask black"],
    ["ثانوس", "male nonhuman alien marvel movie avengers villain powers"],
    ["لوكي", "male marvel movie avengers villain powers alien black"],
    ["ديدبول", "male superhero marvel movie hero powers mask gun sword red"],
    ["هاري بوتر", "male kid movie hogwarts hero powers glasses"],
    ["هيرميوني جرانجر", "kid movie hogwarts hero powers"],
    ["فولدمورت", "male movie hogwarts villain powers"],
    ["دمبلدور", "male old movie hogwarts hero powers hat"],
    ["دارث فيدر", "male movie starwars villain powers black cape mask"],
    ["يودا", "male old nonhuman monster movie starwars hero powers green"],
    ["لوك سكاي ووكر", "male movie starwars hero powers sword"],
    ["جاك سبارو", "male movie potc hero pirate hat sword"],
    ["شيرلوك هولمز", "male old movie sherlock detective hero hat"],
    ["جيمس بوند", "male movie bond hero gun"],
    ["نيو (The Matrix)", "male movie matrix hero powers gun black"],
    ["جاندالف", "male old movie lotr hero powers hat sword white"],
    ["فرودو", "male movie lotr hero"],
    ["أوبتيموس برايم", "male nonhuman robot movie transformers hero red"],
    ["بامبلبي", "male nonhuman robot movie transformers hero yellow"],
    ["جون ويك", "male movie johnwick hero gun black"]
);

// ---------- مسلسلات ----------
CHARACTERS.push(
    ["جون سنو", "male series got hero sword black"],
    ["دينيريس تارجارين", "series got powers prince"],
    ["تيريون لانيستر", "male series got fat"],
    ["إليفين (Stranger Things)", "kid series stranger powers hero"],
    ["الدمية (Squid Game)", "nonhuman robot series squid villain"],
    ["البروفيسور (La Casa de Papel)", "male series moneyheist mask red glasses"],
    ["والتر وايت", "male series breakingbad hat glasses"],
    ["توماس شيلبي", "male series peakyblinders hat gun"],
    ["ريك جرايمز", "male series thewalking hero gun hat"],
    ["مستر بين", "male series mrbean"],
    ["رأفت الهجان", "male series egyseries arab egyptian hero spy"],
    ["جعفر العمدة", "male series egyseries arab egyptian omda"]
);


// ---------- المزيد: ألعاب موبايل وفيديو وكرتون ----------
CHARACTERS.push(
    ["جاي دانجروس (Temple Run)", "male game templerun mobilegame hero hat"],
    ["البربري (Clash of Clans)", "male game clash mobilegame soldier sword yellow blond"],
    ["شيلي (Brawl Stars)", "kid game brawl mobilegame gun"],
    ["سبايك (Brawl Stars)", "male nonhuman game brawl mobilegame green"],
    ["نوب (روبلوكس)", "male game roblox mobilegame yellow"],
    ["بايمون (Genshin Impact)", "nonhuman game genshin mobilegame white"],
    ["تريسر (Overwatch)", "game overwatch hero gun powers"],
    ["فولت بوي (Fallout)", "male game fallout hero"],
    ["أليكس الأسد (مدغشقر)", "male nonhuman animal cartoon dreamworks madagascar hero"],
    ["رون ويزلي", "male kid movie hogwarts hero powers redhair"]
);

// ==================================================
// قاعدة الشخصيات (الأساسية + اللي اتعلّمها)
// ==================================================

function toChar(name, attrsList, learned = false) {
    const set = new Set(attrsList.filter(Boolean));

    for (const key of set) {
        if (!Q[key]) {
            console.error(`[ZINKS MARED] صفة مش معرّفة "${key}" عند ${name}`);
            set.delete(key);
        }
    }

    return { name, attrs: set, learned };
}

const CHARS = CHARACTERS.map(([name, attrs]) => toChar(name, attrs.split(/\s+/)));

function loadLearned() {
    try {
        if (!fs.existsSync(LEARN_FILE)) return;

        const list = JSON.parse(fs.readFileSync(LEARN_FILE, "utf8"));

        for (const item of Array.isArray(list) ? list : []) {
            if (!item?.name || !Array.isArray(item.attrs)) continue;

            const existing = CHARS.find(c => c.name === item.name);

            if (existing) {
                for (const key of item.attrs) if (Q[key]) existing.attrs.add(key);
                existing.learned = true;
            } else {
                CHARS.push(toChar(item.name, item.attrs, true));
            }
        }
    } catch (error) {
        console.error("[ZINKS MARED LEARN LOAD]", error?.message || error);
    }
}

function saveLearned() {
    try {
        fs.mkdirSync(path.dirname(LEARN_FILE), { recursive: true });

        const list = CHARS
            .filter(c => c.learned)
            .map(c => ({ name: c.name, attrs: [...c.attrs] }));

        fs.writeFileSync(LEARN_FILE, JSON.stringify(list, null, 2), "utf8");

        return true;
    } catch (error) {
        console.error("[ZINKS MARED LEARN SAVE]", error?.message || error);

        return false;
    }
}

loadLearned();

// ==================================================
// جلسات اللعب (المارد بيحفظ كل اللي قلته)
// ==================================================

const sessions = new Map();
const lost = new Map(); // آخر لعبة خسرها المارد (عشان يتعلم منها)

function cleanup() {
    const now = Date.now();

    for (const map of [sessions, lost]) {
        for (const [key, value] of map) {
            if (now - value.updated > SESSION_TTL) map.delete(key);
        }
    }
}

const timer = setInterval(cleanup, 5 * 60 * 1000);

if (typeof timer.unref === "function") timer.unref();

function newSession() {
    return {
        weights: CHARS.map(() => 1),
        asked: new Set(),
        answers: {},   // key -> yes | no | unknown
        order: [],     // ترتيب الإجابات [{key, answer}]
        lastYes: null,
        qCount: 0,
        step: 0,
        phase: "ask",  // ask | guess
        current: null,
        guessIndex: -1,
        wrong: 0,
        noGuessUntil: 0,
        updated: Date.now()
    };
}

// ==================================================
// المحرك
// ==================================================

function total(session) {
    return session.weights.reduce((a, b) => a + b, 0);
}

function probOf(session, key, sum) {
    let yes = 0;

    for (let i = 0; i < CHARS.length; i++) {
        if (CHARS[i].attrs.has(key)) yes += session.weights[i];
    }

    return sum > 0 ? yes / sum : 0;
}

function topCandidate(session) {
    let best = -1;

    for (let i = 0; i < CHARS.length; i++) {
        if (session.weights[i] > 0 && (best === -1 || session.weights[i] > session.weights[best])) {
            best = i;
        }
    }

    if (best === -1) return null;

    const sum = total(session);

    return { index: best, p: sum > 0 ? session.weights[best] / sum : 0 };
}

// السؤال ده مناسب دلوقتي؟ (مرتبط بإجاباتك اللي فاتت)
function isRelevant(session, key, sum) {
    const parent = Q[key].parent;

    if (!parent) return true;

    const negate = parent.startsWith("!");
    const base = negate ? parent.slice(1) : parent;
    const said = session.answers[base];

    if (said === "yes") return !negate;
    if (said === "no") return negate;

    const p = probOf(session, base, sum);

    return negate ? p <= 0.65 : p >= 0.35;
}

function pickQuestion(session) {
    const sum = total(session);

    if (sum <= 0) return null;

    const gather = (useGate) => {
        const options = [];

        for (const key of Object.keys(Q)) {
            if (session.asked.has(key)) continue;
            if (useGate && !isRelevant(session, key, sum)) continue;

            const p = probOf(session, key, sum);

            // سؤال ملوش لازمة (الكل نفس الإجابة)
            if (p < 0.001 || p > 0.999) continue;

            let score = Math.abs(p - 0.5);

            // أفضّل الأسئلة المرتبطة بآخر "نعم"
            if (session.lastYes && Q[key].parent === session.lastYes) score -= 0.12;

            options.push({ key, score });
        }

        return options;
    };

    let options = gather(true);

    if (!options.length) options = gather(false);
    if (!options.length) return null;

    options.sort((a, b) => a.score - b.score);

    // عشان اللعبة متبقاش نفس الأسئلة كل مرة: واحد عشوائي من أقوى الأسئلة المتقاربة
    const best = options[0].score;
    const pool = options.filter(o => o.score <= best + 0.04).slice(0, 3);

    return pool[Math.floor(Math.random() * pool.length)].key;
}

function applyAnswer(session, answer) {
    const key = session.current;

    session.asked.add(key);
    session.qCount++;
    session.answers[key] = answer;
    session.order.push({ key, answer });

    if (answer === "yes") session.lastYes = key;

    if (answer === "unknown") return;

    for (let i = 0; i < CHARS.length; i++) {
        if (session.weights[i] <= 0) continue;

        const has = CHARS[i].attrs.has(key);
        const match = answer === "yes" ? has : !has;

        session.weights[i] *= match ? LIKE_MATCH : LIKE_MISS;
    }
}

// بيقرر: يسأل سؤال تاني ولا يخمّن ولا يستسلم
function nextAction(session) {
    const top = topCandidate(session);

    if (!top) return { type: "lose" };

    const question = pickQuestion(session);

    const confident =
        session.qCount >= MIN_QUESTIONS &&
        session.qCount >= session.noGuessUntil &&
        top.p >= GUESS_CONFIDENCE;

    const forced = !question || session.qCount >= MAX_QUESTIONS;

    if (confident || forced) {
        return { type: "guess", index: top.index };
    }

    return { type: "ask", key: question };
}

// ==================================================
// HELPERS
// ==================================================

function getJid(msg) {
    return msg?.key?.remoteJid || msg?.chat || msg?.remoteJid || "";
}

function getSender(msg) {
    return String(
        msg?.key?.participant ||
        msg?.sender ||
        msg?.key?.remoteJid ||
        ""
    ).split(":")[0].split("@")[0];
}

function getImage() {
    try {
        if (fs.existsSync(IMAGE)) return fs.readFileSync(IMAGE);
    } catch {}

    return null;
}

const btn = (id, text) => ({
    buttonId: id,
    buttonText: { displayText: text },
    type: 1
});

async function sendV2(sock, jid, body, buttons) {
    const b = new ButtonV2(sock)
        .setTitle(TITLE)
        .setBody(body)
        .setFooter(FOOTER);

    const image = getImage();

    if (image) b.setThumbnail(image);

    for (const button of buttons) b.addRawButton(button);

    return b.send(jid);
}

function bar(n) {
    const filled = Math.min(Math.round((n / MAX_QUESTIONS) * 10), 10);

    return "▰".repeat(filled) + "▱".repeat(10 - filled);
}

const short = key => Q[key].text.replace(/[؟?]/g, "").trim();

function recap(session, count) {
    const items = session.order.filter(o => o.answer !== "unknown").slice(-count);

    return items.map(o => `${o.answer === "yes" ? "✅" : "❌"} ${short(o.key)}`);
}

// ==================================================
// الرسائل
// ==================================================

async function sendQuestion(sock, jid, session, intro = false) {
    session.phase = "ask";
    session.step++;

    const n = session.qCount + 1;
    const s = session.step;

    const last = recap(session, 1)[0];

    const body =
`╭━━━〔 🧞 المارد الأزرق 〕━━━⬣
┃
${intro ? `┃ فكّر في شخصية (حقيقية أو خيالية)\n┃ لاعب، فنان، لعبة، أنمي، كرتون، فيلم..\n┃ وأنا هعرفها ✨\n┃\n` : ""}┃ ❓ السؤال ${n}
┃ ${bar(n)}
${last ? `┃ 🧠 آخر إجابة: ${last}\n` : ""}┃
┃ ${Q[session.current].text}
┃
╰━━━━━━━━━━━━━━━━⬣

> .مارد وقف  لإنهاء اللعبة`;

    return sendV2(sock, jid, body, [
        btn(`.مارد نعم ${s}`, "✅ نعم"),
        btn(`.مارد لا ${s}`, "❌ لا"),
        btn(`.مارد مش_عارف ${s}`, "🤷 مش عارف")
    ]);
}

async function sendGuess(sock, jid, session, index) {
    session.phase = "guess";
    session.guessIndex = index;
    session.step++;

    const s = session.step;
    const memory = recap(session, 4).map(l => `┃ ${l}`).join("\n");

    const body =
`╭━━━〔 🧞 المارد الأزرق 〕━━━⬣
┃
┃ 🔮 بعد ${session.qCount} سؤال..
┃ أنا شايف إنك بتفكر في:
┃
┃ ✨ ${CHARS[index].name} ✨
┃
${memory ? `┃ 🧠 اللي فاكره عنك:\n${memory}\n┃\n` : ""}┃ صح كده؟
┃
╰━━━━━━━━━━━━━━━━⬣`;

    return sendV2(sock, jid, body, [
        btn(`.مارد صح ${s}`, "✅ أيوه ده هو"),
        btn(`.مارد غلط ${s}`, "❌ لا مش هو")
    ]);
}

async function sendWin(sock, jid, session) {
    const body =
`╭━━━〔 🧞 المارد الأزرق 〕━━━⬣
┃
┃ 🎉 قلتلك هعرفها!
┃ ✨ ${CHARS[session.guessIndex].name}
┃
┃ خمّنتها في ${session.qCount} سؤال
┃ ${session.wrong ? `وبعد ${session.wrong} تخمين غلط 😅` : "من أول تخمين 😎"}
┃
╰━━━━━━━━━━━━━━━━⬣`;

    return sendV2(sock, jid, body, [btn(".مارد", "🔄 العب تاني")]);
}

async function sendLose(sock, jid, session) {
    const body =
`╭━━━〔 🧞 المارد الأزرق 〕━━━⬣
┃
┃ 🤯 غلبتني!
┃ الشخصية دي مش في دماغي
┃
┃ سألتك ${session.qCount} سؤال وخمنت ${session.wrong} مرات
┃
┃ 📝 علّمني عشان أعرفها المرة الجاية:
┃ .مارد هو اسم الشخصية
┃ (هحفظ إجاباتك عنها)
┃
╰━━━━━━━━━━━━━━━━⬣`;

    return sendV2(sock, jid, body, [btn(".مارد", "🔄 العب تاني")]);
}

// ==================================================
// تشغيل خطوة اللعبة
// ==================================================

async function proceed(sock, jid, session, intro = false) {
    const action = nextAction(session);

    if (action.type === "lose") {
        await sendLose(sock, jid, session);
        return "end";
    }

    if (action.type === "guess") {
        await sendGuess(sock, jid, session, action.index);
        return "guess";
    }

    session.current = action.key;
    await sendQuestion(sock, jid, session, intro);
    return "ask";
}

function endGame(key, session, isLoss) {
    sessions.delete(key);

    if (isLoss) lost.set(key, { answers: { ...session.answers }, updated: Date.now() });
}

// ==================================================
// الأوامر
// ==================================================

const YES = new Set(["نعم", "اه", "آه", "ايوه", "أيوه", "yes", "y"]);
const NO = new Set(["لا", "no", "n"]);
const UNKNOWN = new Set(["مش عارف", "مش_عارف", "مش", "idk", "؟"]);
const CORRECT = new Set(["صح", "صحيح", "ايوه ده هو"]);
const WRONG = new Set(["غلط", "مش هو"]);
const STOP = new Set(["وقف", "stop", "خروج", "انهاء", "إنهاء"]);
const START = new Set(["", "ابدأ", "ابدا", "start", "جديد", "العب"]);

async function startGame(sock, jid, key) {
    const session = newSession();

    sessions.set(key, session);
    lost.delete(key);

    const result = await proceed(sock, jid, session, true);

    if (result === "end") endGame(key, session, true);
}

async function learn(sock, msg, jid, key, name) {
    const memory = lost.get(key);

    if (!memory) {
        return sock.sendMessage(
            jid,
            { text: "🧞 مفيش لعبة خسرتها قدامك عشان أتعلم منها. العب .مارد الأول." },
            { quoted: msg }
        );
    }

    name = name.replace(/\s+/g, " ").trim().slice(0, 40);

    if (name.length < 2) {
        return sock.sendMessage(
            jid,
            { text: "🧞 اكتب اسم الشخصية: .مارد هو اسم الشخصية" },
            { quoted: msg }
        );
    }

    const yesKeys = Object.keys(memory.answers).filter(k => memory.answers[k] === "yes" && Q[k]);

    let character = CHARS.find(c => c.name === name);

    if (character) {
        for (const k of yesKeys) character.attrs.add(k);
        character.learned = true;
    } else {
        character = toChar(name, yesKeys, true);
        CHARS.push(character);
    }

    const saved = saveLearned();

    lost.delete(key);

    return sock.sendMessage(
        jid,
        {
            text:
`🧞 تمام! اتعلمت «${name}» ✅
حفظت ${yesKeys.length} صفة من إجاباتك عنها${saved ? "" : "\n⚠️ مقدرتش أحفظها في الملف، هتفضل لحد ما البوت يتقفل"}.
ابعت .مارد وجربني تاني 😉`
        },
        { quoted: msg }
    );
}

module.exports = {
    status: "on",
    name: "المارد الأزرق",
    command: ["مارد"],
    aliases: ["المارد", "akinator", "اكيناتور"],
    category: "games",
    description: "لعبة المارد الأزرق: فكّر في شخصية وهو يخمّنها",
    hidden: false,

    async execute(sock, msg) {
        const jid = getJid(msg);

        if (!jid) return;

        const args = Array.isArray(msg?.args) ? msg.args.map(String) : [];

        // آخر كلمة رقمية = رقم الخطوة اللي الزرار اتبعت معاها
        let token = null;

        const learning = ["هو", "اسمها", "اسمه"].includes(args[0]);

        if (!learning && args.length > 1 && /^\d+$/.test(args[args.length - 1])) {
            token = Number(args.pop());
        }

        const raw = args.join(" ").trim();
        const word = raw.toLowerCase();
        const key = `${jid}:${getSender(msg)}`;

        try {
            // ---------- تعليم ----------
            if (word.startsWith("هو ") || word.startsWith("اسمها ") || word.startsW