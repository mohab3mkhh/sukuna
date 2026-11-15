// plugins/مارد.js
// 🧞 المارد الأزرق (Akinator) — لعبة تخمين بالأزرار
//
//   .مارد              -> لعبة جديدة
//   .مارد وقف          -> إنهاء اللعبة
//   .مارد هو <الاسم>   -> بعد ما يخسر: علّمه الشخصية وهو يحفظها
//
// - كل سؤال بيتختار من إجاباتك اللي فاتت (بيقسم الشخصيات المتبقية لنصين تقريبًا)،
//   وبيسأل أسئلة مرتبطة (لو قلت "أنمي" هيسأل عن الأنمي..).
// - بيتحمل غلطة منك، وفي زرار/كلمة "رجوع" للسؤال اللي قبله.
// - الشخصيات اللي بيتعلمها بتتحفظ في database/mared_learned.json
//
// لإضافة شخصية يدويًا: زوّد سطر في CHARACTERS: ["الاسم", "صفة1 صفة2 ..."]
// (الصفات هي مفاتيح الأسئلة في Q)

import fs from 'fs'
import path from 'path'
import * as _baileys from '@whiskeysockets/baileys'

const B = _baileys.generateWAMessageFromContent ? _baileys : (_baileys.default || _baileys)
const { generateWAMessageFromContent, prepareWAMessageMedia, proto } = B

// ==================================================
// CONFIG
// ==================================================

const IMAGE = '/home/container/photos/مارد.jpg' // اختياري
const LEARN_FILE = path.join(process.cwd(), 'database', 'mared_learned.json')

const TITLE = '🧞 المارد الأزرق'
const FOOTER = '⛩️ SUKUNA BOT ⛩️'

const MAX_QUESTIONS = 30      // بعد كده يخمّن غصب
const MIN_QUESTIONS = 7       // أقل عدد أسئلة قبل أول تخمين
const GUESS_CONFIDENCE = 0.8  // نسبة الثقة اللي يخمّن عندها
const MAX_WRONG = 3           // عدد التخمينات الغلط قبل ما يستسلم
const SESSION_TTL = 15 * 60 * 1000

const LIKE_MATCH = 0.97
const LIKE_MISS = 0.03
const PREFIX = 'mared:'

// ==================================================
// الأسئلة: Q[key] = { text, parent }
// parent: السؤال بيتسأل بس لو الصفة دي محتملة ("!real" = لو "غير حقيقي" محتمل)
// ==================================================

const Q = {}

function defQ(list) {
  for (const [key, text, parent] of list) Q[key] = { text, parent: parent || null }
}

function defFranchises(parent, map) {
  for (const [key, name] of Object.entries(map)) {
    Q[key] = { text: `من ${name}؟`, parent }
  }
}

defQ([
  // ---- عام ----
  ['real', 'شخصيتك حقيقية (موجودة في الواقع)؟'],
  ['male', 'شخصيتك ذكر؟'],
  ['alive', 'لسه عايش/ة النهارده؟', 'real'],
  ['old', 'اتولد/ظهر قبل سنة 1950؟'],
  ['young', 'اتولد/ظهر بعد سنة 1990؟'],
  ['kid', 'طفل أو مراهق؟'],
  ['arab', 'عربي/ة؟', 'real'],
  ['egyptian', 'مصري/ة؟', 'arab'],
  ['nonhuman', 'مش إنسان (حيوان / روبوت / كائن غريب)؟'],
  ['animal', 'حيوان؟', 'nonhuman'],
  ['robot', 'روبوت أو آلة؟', 'nonhuman'],
  ['monster', 'وحش أو كائن خيالي؟', 'nonhuman'],

  // ---- مجالات الأشخاص الحقيقيين ----
  ['footballer', 'لاعب كورة؟', 'real'],
  ['athlete', 'رياضي؟', 'real'],
  ['actor', 'ممثل/ة؟', 'real'],
  ['comedian', 'بيضحّك الناس (كوميديان)؟', 'actor'],
  ['singer', 'مطرب/ة؟', 'real'],
  ['rapper', 'بيغني راب أو مهرجانات؟', 'singer'],
  ['politician', 'رئيس أو حاكم أو سياسي؟', 'real'],
  ['tech', 'عالم أو مخترع أو رجل أعمال تقني؟', 'real'],
  ['youtuber', 'صانع محتوى على الإنترنت؟', 'real'],
  ['writer', 'كاتب أو أديب؟', 'real'],
  ['artist', 'رسام أو موسيقار كلاسيكي؟', 'real'],
  ['hollywood', 'اشتغل في هوليوود؟', 'actor'],
  ['asian', 'آسيوي؟', 'real'],
  ['latin', 'من أمريكا اللاتينية؟', 'real'],

  // ---- كورة ----
  ['forward', 'بيلعب في الهجوم؟', 'footballer'],
  ['midfielder', 'بيلعب في الوسط؟', 'footballer'],
  ['defender', 'بيلعب في الدفاع؟', 'footballer'],
  ['goalkeeper', 'حارس مرمى؟', 'footballer'],
  ['retired', 'اعتزل اللعب؟', 'athlete'],
  ['worldcup', 'كسب كأس العالم؟', 'footballer'],
  ['liverpool', 'لعب في ليفربول؟', 'footballer'],
  ['madrid', 'لعب في ريال مدريد؟', 'footballer'],
  ['barca', 'لعب في برشلونة؟', 'footballer'],
  ['psg', 'لعب في باريس سان جيرمان؟', 'footballer'],
  ['ahly', 'لعب للنادي الأهلي؟', 'footballer'],
  ['zamalek', 'لعب للزمالك؟', 'footballer'],
  ['mancity', 'لعب في مانشستر سيتي؟', 'footballer'],
  ['manutd', 'لعب في مانشستر يونايتد؟', 'footballer'],
  ['chelsea', 'لعب في تشيلسي؟', 'footballer'],
  ['arsenal', 'لعب في أرسنال؟', 'footballer'],
  ['juventus', 'لعب في يوفنتوس؟', 'footballer'],
  ['bayern', 'لعب في بايرن ميونخ؟', 'footballer'],
  ['milan', 'لعب في ميلان؟', 'footballer'],
  ['inter', 'لعب في إنتر ميلان؟', 'footballer'],
  ['argentina', 'أرجنتيني؟', 'footballer'],
  ['portugal', 'برتغالي؟', 'footballer'],
  ['brazil', 'برازيلي؟', 'footballer'],
  ['france', 'فرنسي؟', 'footballer'],
  ['spain', 'إسباني؟', 'footballer'],
  ['england', 'إنجليزي؟', 'footballer'],
  ['italy', 'إيطالي؟', 'footballer'],
  ['belgium', 'بلجيكي؟', 'footballer'],

  // ---- رياضات تانية ----
  ['boxing', 'ملاكم؟', 'athlete'],
  ['basketball', 'لاعب كرة سلة؟', 'athlete'],
  ['tennis', 'لاعب/ة تنس؟', 'athlete'],
  ['racing', 'سائق سباقات؟', 'athlete'],
  ['sprinter', 'عدّاء؟', 'athlete'],
  ['swimmer', 'سبّاح؟', 'athlete'],
  ['mma', 'مقاتل MMA؟', 'athlete'],
  ['squash', 'لاعب/ة اسكواش؟', 'athlete'],
  ['wrestler', 'مصارع؟', 'athlete'],
  ['claymaster', 'ملك الملاعب الترابية؟', 'tennis'],

  // ---- أسئلة مميزة للأشخاص الحقيقيين ----
  ['shaabi', 'بيغني شعبي؟', 'singer'],
  ['nubian', 'من النوبة؟', 'singer'],
  ['hadaba', 'لقبه «الهضبة»؟', 'singer'],
  ['lebanese', 'لبناني/ة؟', 'arab'],
  ['iraqi', 'عراقي؟', 'arab'],
  ['umbrella', 'اشتهرت بأغنية Umbrella؟', 'singer'],
  ['singleladies', 'اشتهرت بأغنية Single Ladies؟', 'singer'],
  ['swifties', 'جمهورها اسمه Swifties؟', 'singer'],
  ['lamby', 'اشتهر بشخصية «اللمبي»؟', 'actor'],
  ['saidi', 'اشتهر بفيلم «صعيدي في الجامعة الأمريكية»؟', 'actor'],
  ['asal', 'اشتهر بفيلم «عسل أسود»؟', 'actor'],
  ['bluefilm', 'اشتهر بفيلم «الفيل الأزرق»؟', 'actor'],
  ['abyad', 'اشتهر بفيلم «إبراهيم الأبيض»؟', 'actor'],
  ['cindarella', 'لقبها «سندريلا الشاشة العربية»؟', 'actor'],
  ['fightclub', 'اشتهر بفيلم Fight Club؟', 'actor'],
  ['titanic', 'اشتهر بفيلم Titanic؟', 'actor'],
  ['sparrowactor', 'لعب دور جاك سبارو؟', 'actor'],
  ['mission', 'اشتهر بسلسلة Mission Impossible؟', 'actor'],
  ['menblack', 'اشتهر بفيلم Men in Black؟', 'actor'],
  ['terminator', 'اشتهر بفيلم Terminator؟', 'actor'],
  ['martial', 'ممثل أو بطل فنون قتالية؟', 'actor'],
  ['tombactor', 'لعبت دور لارا كروفت؟', 'actor'],
  ['hermione', 'لعبت دور هيرميوني؟', 'actor'],
  ['blackwidow', 'لعبت دور الأرملة السوداء؟', 'actor'],
  ['ironactor', 'لعب دور آيرون مان؟', 'actor'],
  ['beanactor', 'لعب دور مستر بين؟', 'actor'],
  ['revolution', 'قاد ثورة يوليو 1952؟', 'politician'],
  ['peace', 'وقّع اتفاقية سلام مع إسرائيل؟', 'politician'],
  ['mubarak', 'حكم مصر 30 سنة؟', 'politician'],
  ['ww2uk', 'قاد بريطانيا في الحرب العالمية الثانية؟', 'politician'],
  ['india', 'هندي؟', 'politician'],
  ['southafrica', 'من جنوب أفريقيا؟', 'politician'],
  ['usapres', 'كان رئيس أمريكا؟', 'politician'],
  ['relativity', 'صاحب النظرية النسبية؟', 'tech'],
  ['ac', 'ارتبط اسمه بالتيار المتردد (AC)؟', 'tech'],
  ['gravity', 'اكتشف الجاذبية؟', 'tech'],
  ['lightbulb', 'اخترع المصباح الكهربائي؟', 'tech'],
  ['wheelchair', 'كان على كرسي متحرك؟', 'tech'],
  ['radium', 'اكتشفت الراديوم؟', 'tech'],
  ['tesla_cars', 'صاحب شركة تسلا؟', 'tech'],
  ['microsoft', 'مؤسس مايكروسوفت؟', 'tech'],
  ['facebook', 'مؤسس فيسبوك؟', 'tech'],
  ['apple', 'مؤسس شركة أبل؟', 'tech'],
  ['amazon', 'مؤسس أمازون؟', 'tech'],
  ['nobel', 'حاصل على جائزة نوبل؟', 'real'],
  ['blind', 'كان كفيف؟', 'writer'],
  ['monalisa', 'رسم الموناليزا؟', 'artist'],
  ['ear', 'قطع أذنه؟', 'artist'],
  ['deaf', 'فقد سمعه وهو موسيقار؟', 'artist'],
  ['educational', 'بيقدم محتوى ثقافي وعلمي؟', 'youtuber'],
  ['siuu', 'بيقول «SIUUU»؟', 'youtuber'],
  ['hpauthor', 'كاتبة هاري بوتر؟', 'writer'],
  ['shakespeare', 'كاتب مسرحيات إنجليزي؟', 'writer'],
  ['barcacoach', 'اشتغل مدرب لبرشلونة؟', 'footballer'],
  ['ahlypres', 'رئيس النادي الأهلي؟', 'footballer']
])

// ---- خيالي: نوع المصدر ----
defQ([
  ['cartoon', 'من الكرتون (غير الأنمي)؟', '!real'],
  ['anime', 'من الأنمي؟', '!real'],
  ['game', 'من لعبة فيديو؟', '!real'],
  ['mobilegame', 'من لعبة موبايل؟', 'game'],
  ['movie', 'من فيلم؟', '!real'],
  ['series', 'من مسلسل؟', '!real'],
  ['hero', 'من الأبطال الطيبين؟', '!real'],
  ['villain', 'شرير؟', '!real'],
  ['powers', 'عنده قوى خارقة أو سحر؟', '!real'],
  ['superhero', 'بطل خارق؟', '!real'],
  ['sword', 'بيستخدم سيف؟', '!real'],
  ['gun', 'بيستخدم سلاح ناري؟', '!real'],
  ['axe', 'بيستخدم فأس؟', '!real'],
  ['mask', 'بيلبس قناع؟', '!real'],
  ['hat', 'بيلبس قبعة؟', '!real'],
  ['cape', 'بيلبس عباءة/كاب؟', '!real'],
  ['hood', 'بيلبس غطاء راس (هودي)؟', '!real'],
  ['glasses', 'بيلبس نضارة؟', '!real'],
  ['fat', 'بدين أو كرشه كبير؟', '!real'],
  ['princess', 'أميرة؟', '!real'],
  ['prince', 'أمير أو ملك؟', '!real'],
  ['detective', 'محقق؟', '!real'],
  ['pirate', 'قرصان؟', '!real'],
  ['ninja', 'من النينجا؟', '!real'],
  ['soldier', 'جندي أو مقاتل؟', '!real'],
  ['alien', 'جاي من كوكب تاني؟', '!real'],
  ['mouse', 'فأر؟', 'animal'],
  ['cat', 'قطة؟', 'animal'],
  ['dog', 'كلب؟', 'animal'],
  ['bird', 'طائر؟', 'animal'],
  ['sea', 'عايش تحت الماء؟', '!real'],
  ['red', 'لونه الأساسي أحمر؟', '!real'],
  ['blue', 'لونه الأساسي أزرق؟', '!real'],
  ['green', 'لونه الأساسي أخضر؟', '!real'],
  ['yellow', 'لونه الأساسي أصفر؟', '!real'],
  ['black', 'لونه الأساسي أسود؟', '!real'],
  ['white', 'لونه الأساسي أبيض؟', '!real'],
  ['pink', 'لونه الأساسي وردي؟', '!real'],
  ['orange', 'لونه الأساسي برتقالي؟', '!real'],
  ['brown', 'لونه الأساسي بني؟', '!real'],
  ['blond', 'شعره أصفر (أشقر)؟', '!real'],
  ['whitehair', 'شعره أبيض أو فضي؟', '!real'],
  ['redhair', 'شعره أحمر؟', '!real'],
  ['bluehair', 'شعره أزرق؟', '!real'],
  ['greenhair', 'شعره أخضر؟', '!real'],
  ['pinkhair', 'شعره وردي؟', '!real'],
  ['dc', 'من عالم DC؟', 'superhero'],
  ['marvel', 'من عالم مارفل؟', 'superhero'],
  ['disney', 'من ديزني أو بيكسار؟', 'cartoon'],
  ['dreamworks', 'من دريم ووركس؟', 'cartoon'],
  ['arabtoon', 'كرتون عربي؟', 'cartoon']
])

// ---- ألعاب ----
defFranchises('game', {
  gow: 'God of War', mario: 'سوبر ماريو', zelda: 'زيلدا', sonic: 'سونيك', pokemon: 'بوكيمون',
  gta: 'GTA', cod: 'Call of Duty', freefire: 'فري فاير', fortnite: 'فورتنايت',
  minecraft: 'ماين كرافت', amongus: 'Among Us', subway: 'Subway Surfers', angrybirds: 'Angry Birds',
  templerun: 'Temple Run', pvz: 'Plants vs Zombies', assassins: "Assassin's Creed", tombraider: 'Tomb Raider',
  resident: 'Resident Evil', halo: 'Halo', uncharted: 'Uncharted', lastofus: 'The Last of Us',
  streetfighter: 'Street Fighter', mortalkombat: 'Mortal Kombat', pacman: 'Pac-Man', crash: 'Crash Bandicoot',
  kirby: 'Kirby', donkeykong: 'Donkey Kong', witcher: 'The Witcher', pou: 'Pou', talkingtom: 'My Talking Tom',
  fnaf: "Five Nights at Freddy's", metalgear: 'Metal Gear', doom: 'Doom', clash: 'Clash of Clans',
  brawl: 'Brawl Stars', roblox: 'Roblox', genshin: 'Genshin Impact', overwatch: 'Overwatch',
  fallout: 'Fallout'
})

// ---- أنمي ----
defFranchises('anime', {
  naruto: 'ناروتو', onepiece: 'ون بيس', dragonball: 'دراغون بول', bleach: 'بليتش', aot: 'Attack on Titan',
  deathnote: 'Death Note', mha: 'My Hero Academia', demonslayer: 'Demon Slayer', hxh: 'Hunter x Hunter',
  opm: 'One Punch Man', fma: 'Fullmetal Alchemist', conan: 'المحقق كونان', doraemon: 'دورايمون',
  shinchan: 'شين شان', tsubasa: 'الكابتن ماجد', ghibli: 'ستوديو جيبلي', sailormoon: 'سيلور مون',
  jujutsu: 'Jujutsu Kaisen', pokeanime: 'أنمي بوكيمون'
})

// ---- كرتون ----
defFranchises('cartoon', {
  tomjerry: 'توم وجيري', spongebob: 'سبونج بوب', mickey: 'عالم ميكي ماوس', simpsons: 'عائلة سيمبسون',
  familyguy: 'Family Guy', looney: 'لوني تيونز', scooby: 'سكوبي دو', rickmorty: 'ريك ومورتي',
  minions: 'المينيونز', frozen: 'فروزن', lionking: 'الأسد الملك', toystory: 'توي ستوري', shrek: 'شريك',
  kungfupanda: 'كونغ فو باندا', madagascar: 'مدغشقر', peppapig: 'بيبا بيج', ben10: 'بن 10',
  smurfs: 'السنافر', winnie: 'ويني الدبدوب', popeye: 'باباي', pinkpanther: 'النمر الوردي',
  avatar: 'أفاتار: آخر سيد للهواء', aladdin: 'علاء الدين', princessdisney: 'أميرات ديزني',
  monsters: 'شركة المرعبين', cars: 'سيارات (Cars)', httyd: 'How to Train Your Dragon'
})

// ---- أفلام ومسلسلات ----
defFranchises('movie', {
  starwars: 'حرب النجوم (Star Wars)', hogwarts: 'عالم هاري بوتر', lotr: 'سيد الخواتم', bond: 'جيمس بوند',
  potc: 'قراصنة الكاريبي', matrix: 'The Matrix', transformers: 'Transformers',
  johnwick: 'John Wick', sherlock: 'شرلوك هولمز', batmanfilm: 'أفلام باتمان', avengers: 'الأفلام الانتقامية (Avengers)'
})

defFranchises('series', {
  got: 'Game of Thrones', stranger: 'Stranger Things', squid: 'Squid Game', moneyheist: 'La Casa de Papel',
  breakingbad: 'Breaking Bad', egyseries: 'مسلسل مصري', peakyblinders: 'Peaky Blinders', thewalking: 'The Walking Dead',
  mrbean: 'مستر بين'
})

// ==================================================
// الشخصيات (الاسم، الصفات)
// ==================================================

const CHARACTERS = []

// ---------- لاعبين كورة ----------
CHARACTERS.push(
  ['محمد صلاح', 'real male alive young arab egyptian footballer athlete forward liverpool chelsea'],
  ['ليونيل ميسي', 'real male alive footballer athlete forward barca psg argentina worldcup'],
  ['كريستيانو رونالدو', 'real male alive footballer athlete forward madrid manutd juventus portugal'],
  ['نيمار', 'real male alive young footballer athlete forward barca psg brazil'],
  ['كيليان مبابي', 'real male alive young footballer athlete forward psg madrid france worldcup'],
  ['زين الدين زيدان', 'real male alive footballer athlete midfielder retired madrid juventus france worldcup'],
  ['محمد أبو تريكة', 'real male alive arab egyptian footballer athlete midfielder retired ahly'],
  ['محمود الخطيب', 'real male alive arab egyptian footballer athlete forward retired ahly ahlypres'],
  ['دييجو مارادونا', 'real male footballer athlete forward retired barca argentina worldcup'],
  ['بيليه', 'real male old footballer athlete forward retired brazil worldcup'],
  ['إيرلينج هالاند', 'real male alive young footballer athlete forward mancity'],
  ['كريم بنزيما', 'real male alive footballer athlete forward madrid france'],
  ['لوكا مودريتش', 'real male alive footballer athlete midfielder madrid'],
  ['رونالدينيو', 'real male alive footballer athlete forward retired barca psg milan brazil worldcup'],
  ['ديفيد بيكهام', 'real male alive footballer athlete midfielder retired manutd madrid psg milan england'],
  ['سيرجيو راموس', 'real male alive footballer athlete defender madrid psg spain worldcup'],
  ['أندريس إنييستا', 'real male alive footballer athlete midfielder retired barca spain worldcup'],
  ['تشافي هيرنانديز', 'real male alive footballer athlete midfielder retired barca spain worldcup barcacoach'],
  ['كيفين دي بروين', 'real male alive footballer athlete midfielder mancity chelsea belgium'],
  ['روبرت ليفاندوفسكي', 'real male alive footballer athlete forward bayern barca'],
  ['هاري كين', 'real male alive footballer athlete forward bayern england'],
  ['فينيسيوس جونيور', 'real male alive young footballer athlete forward madrid brazil'],
  ['جود بيلينجهام', 'real male alive young footballer athlete midfielder madrid england'],
  ['لامين يامال', 'real male alive young footballer athlete forward barca spain'],
  ['زلاتان إبراهيموفيتش', 'real male alive footballer athlete forward retired barca psg milan inter juventus manutd'],
  ['جيانلويجي بوفون', 'real male alive footballer athlete goalkeeper retired juventus psg italy worldcup'],
  ['باولو مالديني', 'real male alive footballer athlete defender retired milan italy'],
  ['إيدين هازارد', 'real male alive footballer athlete forward retired chelsea madrid belgium'],
  ['لويس سواريز', 'real male alive footballer athlete forward barca liverpool'],
  ['محمد النني', 'real male alive young arab egyptian footballer athlete midfielder arsenal'],
  ['مصطفى محمد', 'real male alive young arab egyptian footballer athlete forward zamalek'],
  ['محمود تريزيجيه', 'real male alive young arab egyptian footballer athlete forward ahly']
)

// ---------- مطربين ----------
CHARACTERS.push(
  ['عمرو دياب', 'real male alive arab egyptian singer hadaba'],
  ['تامر حسني', 'real male alive arab egyptian singer actor'],
  ['محمد منير', 'real male alive arab egyptian singer nubian'],
  ['حكيم', 'real male alive arab egyptian singer shaabi'],
  ['عبد الحليم حافظ', 'real male old arab egyptian singer actor'],
  ['أم كلثوم', 'real old arab egyptian singer'],
  ['فيروز', 'real old alive arab lebanese singer'],
  ['نانسي عجرم', 'real alive arab lebanese singer'],
  ['كاظم الساهر', 'real male alive arab iraqi singer'],
  ['شيرين عبد الوهاب', 'real alive arab egyptian singer'],
  ['ويجز', 'real male alive young arab egyptian singer rapper'],
  ['مايكل جاكسون', 'real male singer'],
  ['تايلور سويفت', 'real alive singer swifties'],
  ['ريهانا', 'real alive singer umbrella'],
  ['بيونسيه', 'real alive singer singleladies'],
  ['شاكيرا', 'real alive singer latin'],
  ['بيلي أيليش', 'real alive young singer'],
  ['إيمينيم', 'real male alive singer rapper'],
  ['إلفيس بريسلي', 'real male old singer'],
  ['إد شيران', 'real male alive singer']
)

// ---------- ممثلين ----------
CHARACTERS.push(
  ['محمد رمضان', 'real male alive arab egyptian actor singer rapper'],
  ['أحمد مكي', 'real male alive arab egyptian actor singer comedian rapper'],
  ['عادل إمام', 'real male old alive arab egyptian actor comedian'],
  ['محمد هنيدي', 'real male alive arab egyptian actor comedian saidi'],
  ['أحمد حلمي', 'real male alive arab egyptian actor comedian asal'],
  ['محمد سعد', 'real male alive arab egyptian actor comedian lamby'],
  ['ياسمين عبد العزيز', 'real alive arab egyptian actor comedian'],
  ['أحمد زكي', 'real male old arab egyptian actor'],
  ['كريم عبد العزيز', 'real male alive arab egyptian actor bluefilm'],
  ['أحمد السقا', 'real male alive arab egyptian actor abyad'],
  ['عمر الشريف', 'real male old arab egyptian actor hollywood'],
  ['سعاد حسني', 'real old arab egyptian actor singer cindarella'],
  ['فاتن حمامة', 'real old arab egyptian actor'],
  ['براد بيت', 'real male alive actor hollywood fightclub'],
  ['ليوناردو دي كابريو', 'real male alive actor hollywood titanic'],
  ['جوني ديب', 'real male alive actor hollywood sparrowactor'],
  ['توم كروز', 'real male alive actor hollywood mission'],
  ['ويل سميث', 'real male alive actor hollywood singer rapper menblack'],
  ['أرنولد شوارزنيجر', 'real male alive actor hollywood politician terminator'],
  ['بروس لي', 'real male old asian actor martial'],
  ['جاكي شان', 'real male alive asian actor martial'],
  ['أنجلينا جولي', 'real alive actor hollywood tombactor'],
  ['إيما واتسون', 'real alive actor hollywood hermione'],
  ['سكارليت جوهانسون', 'real alive actor hollywood blackwidow'],
  ['روبرت داوني جونيور', 'real male alive actor hollywood ironactor'],
  ['روان أتكينسون', 'real male alive actor comedian beanactor'],
  ['دوين جونسون', 'real male alive actor athlete wrestler hollywood']
)

// ---------- رياضيين تانيين ----------
CHARACTERS.push(
  ['محمد علي كلاي', 'real male athlete boxing retired'],
  ['مايك تايسون', 'real male alive athlete boxing retired'],
  ['مايكل جوردان', 'real male alive athlete basketball retired'],
  ['ليبرون جيمس', 'real male alive athlete basketball'],
  ['يوسين بولت', 'real male alive athlete sprinter retired'],
  ['مايكل فيلبس', 'real male alive athlete swimmer retired'],
  ['رافائيل نادال', 'real male alive athlete tennis retired claymaster'],
  ['روجر فيدرر', 'real male alive athlete tennis retired'],
  ['سيرينا ويليامز', 'real alive athlete tennis retired'],
  ['خبيب نورماغوميدوف', 'real male alive athlete mma retired'],
  ['لويس هاميلتون', 'real male alive athlete racing'],
  ['مايكل شوماخر', 'real male alive athlete racing retired'],
  ['جون سينا', 'real male alive actor athlete wrestler hollywood'],
  ['نور الشربيني', 'real alive arab egyptian athlete squash'],
  ['علي فرج', 'real male alive arab egyptian athlete squash']
)

// ---------- سياسة وتاريخ ----------
CHARACTERS.push(
  ['جمال عبد الناصر', 'real male old arab egyptian politician revolution'],
  ['أنور السادات', 'real male old arab egyptian politician peace'],
  ['حسني مبارك', 'real male old arab egyptian politician mubarak'],
  ['نابليون بونابرت', 'real male old politician'],
  ['دونالد ترامب', 'real male alive politician usapres'],
  ['باراك أوباما', 'real male alive politician usapres nobel'],
  ['أبراهام لينكولن', 'real male old politician usapres'],
  ['ونستون تشرشل', 'real male old politician ww2uk nobel writer'],
  ['المهاتما غاندي', 'real male old asian politician india'],
  ['نيلسون مانديلا', 'real male old politician southafrica nobel'],
  ['صلاح الدين الأيوبي', 'real male old arab politician'],
  ['الإسكندر الأكبر', 'real male old politician']
)

// ---------- علماء وتقنية ----------
CHARACTERS.push(
  ['ألبرت أينشتاين', 'real male old tech relativity nobel'],
  ['نيكولا تسلا', 'real male old tech ac'],
  ['إسحاق نيوتن', 'real male old tech gravity'],
  ['توماس إديسون', 'real male old tech lightbulb'],
  ['ستيفن هوكينج', 'real male tech wheelchair'],
  ['ماري كوري', 'real old tech radium nobel'],
  ['إيلون ماسك', 'real male alive tech tesla_cars'],
  ['بيل جيتس', 'real male alive tech microsoft'],
  ['مارك زوكربيرج', 'real male alive tech facebook'],
  ['ستيف جوبز', 'real male tech apple'],
  ['جيف بيزوس', 'real male alive tech amazon']
)

// ---------- كتّاب وفنانين وصناع محتوى ----------
CHARACTERS.push(
  ['طه حسين', 'real male old arab egyptian writer blind'],
  ['نجيب محفوظ', 'real male old arab egyptian writer nobel'],
  ['وليم شكسبير', 'real male old writer shakespeare'],
  ['جي كي رولينج', 'real alive writer hpauthor'],
  ['ليوناردو دا فينشي', 'real male old artist monalisa'],
  ['فينسنت فان جوخ', 'real male old artist ear'],
  ['لودفيج فان بيتهوفن', 'real male old artist deaf'],
  ['مستر بيست', 'real male alive young youtuber'],
  ['سبيد (IShowSpeed)', 'real male alive young youtuber siuu'],
  ['الدحيح (أحمد الغندور)', 'real male alive young arab egyptian youtuber educational']
)

// ---------- أنمي ----------
CHARACTERS.push(
  ['ناروتو أوزوماكي', 'male anime naruto hero powers ninja blond orange kid young'],
  ['ساسكي أوتشيها', 'male anime naruto powers ninja black kid young sword'],
  ['كاكاشي هاتاكي', 'male anime naruto hero powers ninja mask whitehair young'],
  ['مونكي دي لوفي', 'male anime onepiece hero pirate hat powers red young'],
  ['رورونوا زورو', 'male anime onepiece hero pirate sword greenhair young'],
  ['غوكو', 'male anime dragonball hero powers alien orange black'],
  ['فيجيتا', 'male anime dragonball powers alien blue black'],
  ['إيرين ييغر', 'male anime aot powers soldier kid young'],
  ['ليفاي أكرمان', 'male anime aot hero soldier black cape'],
  ['لايت ياغامي', 'male anime deathnote villain young'],
  ['إل (L)', 'male anime deathnote detective young white black'],
  ['إيزوكو ميدوريا', 'male anime mha hero superhero powers kid green greenhair young'],
  ['تانجيرو كامادو', 'male anime demonslayer hero sword kid young powers green black'],
  ['غون فريكس', 'male anime hxh hero kid young green'],
  ['سايتاما', 'male anime opm hero superhero powers cape white'],
  ['إدوارد إلريك', 'male anime fma hero kid blond powers red'],
  ['كونان إيدوغاوا', 'male anime conan detective hero kid glasses blue'],
  ['دورايمون', 'male anime doraemon hero robot nonhuman blue white'],
  ['شين شان', 'male anime shinchan kid red yellow'],
  ['ساتورو غوجو', 'male anime jujutsu hero powers whitehair mask blue'],
  ['سوكونا', 'male anime jujutsu villain powers monster nonhuman pink pinkhair'],
  ['إيتادوري يوجي', 'male anime jujutsu hero kid pinkhair young powers']
)

// ---------- ألعاب ----------
CHARACTERS.push(
  ['كريتوس', 'male game gow hero powers axe soldier red'],
  ['ماريو', 'male game mario hero red hat'],
  ['لويجي', 'male game mario hero green hat'],
  ['لينك', 'male game zelda hero sword hat green blond'],
  ['سونيك', 'male game sonic hero animal blue nonhuman'],
  ['بيكاتشو', 'game pokemon hero animal nonhuman yellow mouse'],
  ['لارا كروفت', 'game tombraider hero gun'],
  ['ماستر شيف', 'male game halo hero soldier green gun mask'],
  ['كراش باندیكوت', 'male game crash animal nonhuman orange'],
  ['جيرالت أوف ريفيا', 'male game witcher hero sword whitehair powers'],
  ['سكوربيون (مورتال كومبات)', 'male game mortalkombat powers mask yellow ninja'],
  ['صب زيرو', 'male game mortalkombat powers mask blue ninja'],
  ['ريو (ستريت فايتر)', 'male game streetfighter hero white'],
  ['فريدي فازبير', 'male game fnaf villain animal nonhuman brown hat'],
  ['دونكي كونغ', 'male game donkeykong animal nonhuman brown'],
  ['كيربي', 'game kirby hero pink'],
  ['الأميرة زيلدا', 'game zelda princess hero blond'],
  ['إيزيو أوديتوري', 'male game assassins hero hood sword'],
  ['سوليد سنيك', 'male game metalgear hero soldier gun'],
  ['دوم غاي', 'male game doom hero soldier gun green']
)

// ---------- كرتون ----------
CHARACTERS.push(
  ['توم (القط)', 'male cartoon tomjerry animal nonhuman cat'],
  ['جيري (الفأر)', 'male cartoon tomjerry animal nonhuman mouse brown'],
  ['سبونج بوب', 'male cartoon spongebob hero sea yellow'],
  ['باتريك ستار', 'male cartoon spongebob sea pink fat'],
  ['ميكي ماوس', 'male cartoon mickey disney animal nonhuman mouse black old'],
  ['البطة دونالد', 'male cartoon mickey disney animal nonhuman bird white blue old hat'],
  ['بارت سيمبسون', 'male cartoon simpsons kid yellow'],
  ['هومر سيمبسون', 'male cartoon simpsons fat yellow'],
  ['باغز باني', 'male cartoon looney animal nonhuman old white'],
  ['سكوبي دو', 'male cartoon scooby animal nonhuman dog brown detective'],
  ['ريك سانشيز', 'male cartoon rickmorty powers bluehair'],
  ['المينيون', 'male cartoon minions yellow glasses'],
  ['إلسا', 'cartoon frozen disney princess powers blond white'],
  ['سيمبا', 'male cartoon lionking disney animal nonhuman prince brown'],
  ['وودي (توي ستوري)', 'male cartoon toystory disney hero hat brown'],
  ['باز لايتيير', 'male cartoon toystory disney hero robot nonhuman green white'],
  ['شريك', 'male cartoon shrek dreamworks monster nonhuman green fat'],
  ['بو (كونغ فو باندا)', 'male cartoon kungfupanda dreamworks animal nonhuman fat black white hero'],
  ['بيبا بيج', 'cartoon peppapig animal nonhuman pink kid'],
  ['بن تينيسون', 'male cartoon ben10 hero kid powers'],
  ['بابا سنفور', 'male cartoon smurfs hero blue red hat'],
  ['ويني الدبدوب', 'male cartoon winnie animal nonhuman yellow fat red'],
  ['باباي', 'male cartoon popeye hero old hat'],
  ['النمر الوردي', 'male cartoon pinkpanther animal nonhuman pink'],
  ['آنج (أفاتار)', 'male cartoon avatar hero kid powers orange'],
  ['علاء الدين', 'male cartoon aladdin disney hero']
)

// ---------- أفلام ومسلسلات ----------
CHARACTERS.push(
  ['دارث فيدر', 'male movie starwars villain powers mask black cape'],
  ['يودا', 'male movie starwars hero powers alien nonhuman green'],
  ['هاري بوتر', 'male movie hogwarts hero powers kid glasses young'],
  ['لورد فولدمورت', 'male movie hogwarts villain powers'],
  ['هيرميوني غرينجر', 'movie hogwarts hero powers kid young'],
  ['غاندالف', 'male movie lotr hero powers hat whitehair'],
  ['جيمس بوند', 'male movie bond hero gun'],
  ['جاك سبارو', 'male movie potc pirate hat sword'],
  ['نيو (ماتريكس)', 'male movie matrix hero powers black glasses young'],
  ['جون ويك', 'male movie johnwick hero gun black soldier'],
  ['شرلوك هولمز', 'male movie sherlock detective hero hat old'],
  ['باتمان', 'male movie dc superhero hero mask cape black batmanfilm detective'],
  ['سوبرمان', 'male movie dc superhero hero powers cape blue red alien'],
  ['الجوكر', 'male movie dc villain green greenhair'],
  ['سبايدرمان', 'male movie marvel superhero hero powers mask red blue'],
  ['آيرون مان', 'male movie marvel superhero hero red avengers'],
  ['ثانوس', 'male movie marvel villain powers alien avengers'],
  ['كابتن أمريكا', 'male movie marvel superhero hero soldier blue avengers'],
  ['ثور', 'male movie marvel superhero hero powers blond cape avengers'],
  ['هالك', 'male movie marvel superhero hero powers green avengers'],
  ['جون سنو', 'male series got hero sword black cape'],
  ['دينيريس تارجارين', 'series got prince powers whitehair'],
  ['إليفن (Stranger Things)', 'series stranger hero powers kid young'],
  ['برلين (لا كاسا دي بابيل)', 'male series moneyheist villain mask'],
  ['والتر وايت', 'male series breakingbad villain hat glasses']
)

// ==================================================
// الشخصيات المتعلمة
// ==================================================

function loadLearned() {
  try {
    if (!fs.existsSync(LEARN_FILE)) return []
    const data = JSON.parse(fs.readFileSync(LEARN_FILE, 'utf8'))
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

function saveLearned(list) {
  fs.mkdirSync(path.dirname(LEARN_FILE), { recursive: true })
  fs.writeFileSync(LEARN_FILE, JSON.stringify(list, null, 2))
}

function buildCharacters() {
  const map = new Map()
  for (const [name, traits] of CHARACTERS) {
    map.set(name, new Set(traits.split(/\s+/).filter(Boolean)))
  }
  for (const item of loadLearned()) {
    if (!item?.name || !Array.isArray(item.traits)) continue
    const set = map.get(item.name) || new Set()
    for (const t of item.traits) set.add(t)
    map.set(item.name, set)
  }
  return [...map.entries()].map(([name, traits]) => ({ name, traits }))
}

// ==================================================
// الجلسات والمحرك
// ==================================================

const ANSWERS = { yes: 1, probably: 0.75, idk: null, probnot: 0.25, no: 0 }

const BUTTONS = [
  ['✅ نعم', 'yes'],
  ['🤔 غالباً نعم', 'probably'],
  ['❓ مش عارف', 'idk'],
  ['🤨 غالباً لا', 'probnot'],
  ['❌ لا', 'no'],
  ['↩️ رجوع', 'back']
]

const TYPED = [
  [/^(نعم|اه|آه|ايوه|أيوه|ايوا|أيوا|yes|y)$/i, 'yes'],
  [/^(لا|لأ|no|n)$/i, 'no'],
  [/^(مش عارف|معرفش|مش عارفه|لا اعرف|لا أعرف|idk)$/i, 'idk'],
  [/^(غالبا نعم|غالباً نعم|ممكن|يمكن|احتمال)$/i, 'probably'],
  [/^(غالبا لا|غالباً لا|مش اوي|مش أوي)$/i, 'probnot'],
  [/^(رجوع|ارجع|back)$/i, 'back'],
  [/^(صح|صحيح|right)$/i, 'right'],
  [/^(غلط|خطأ|خطا|wrong)$/i, 'wrong']
]

const NUMBER_ASK = { 1: 'yes', 2: 'probably', 3: 'idk', 4: 'probnot', 5: 'no', 6: 'back' }
const NUMBER_GUESS = { 1: 'right', 2: 'wrong' }

const sessions = new Map()

function endSession(chat) {
  const s = sessions.get(chat)
  if (s) clearTimeout(s.timer)
  sessions.delete(chat)
}

function touch(session) {
  clearTimeout(session.timer)
  session.timer = setTimeout(() => sessions.delete(session.chat), SESSION_TTL)
}

function newSession(chat, owner) {
  const session = {
    chat,
    owner,
    answers: new Map(), // key -> 1 | 0.75 | 0.25 | 0
    asked: new Set(),
    history: [],        // [{ key, value }] (value ممكن تكون null لـ "مش عارف")
    excluded: new Set(),
    wrong: 0,
    qCount: 0,
    current: null,
    state: 'ask',       // ask | guess | learn
    guess: null,
    chars: buildCharacters(),
    timer: null
  }
  touch(session)
  return session
}

// احتمالية كل شخصية بناءً على الإجابات
function computeProbs(session) {
  const logs = session.chars.map(c => {
    if (session.excluded.has(c.name)) return -Infinity
    let lp = 0
    for (const [key, a] of session.answers) {
      const has = c.traits.has(key)
      const L = has ? a * LIKE_MATCH + (1 - a) * LIKE_MISS : (1 - a) * LIKE_MATCH + a * LIKE_MISS
      lp += Math.log(L)
    }
    return lp
  })
  const finite = logs.filter(Number.isFinite)
  if (!finite.length) return logs.map(() => 0)
  const max = Math.max(...finite)
  const ex = logs.map(v => (Number.isFinite(v) ? Math.exp(v - max) : 0))
  const sum = ex.reduce((x, y) => x + y, 0)
  return ex.map(v => v / sum)
}

function pickNextQuestion(session, probs) {
  // كتلة الاحتمال لكل صفة
  const mass = {}
  session.chars.forEach((c, i) => {
    const p = probs[i]
    if (p < 1e-9) return
    for (const t of c.traits) mass[t] = (mass[t] || 0) + p
  })

  const allowed = key => {
    const parent = Q[key].parent
    if (!parent) return true
    if (parent.startsWith('!')) return 1 - (mass[parent.slice(1)] || 0) >= 0.2
    return (mass[parent] || 0) >= 0.2
  }

  const candidates = []
  for (const key of Object.keys(Q)) {
    if (session.asked.has(key)) continue
    const m = mass[key] || 0
    if (m <= 0.03 || m >= 0.97) continue
    if (!allowed(key)) continue
    candidates.push({ key, score: Math.abs(m - 0.5) })
  }
  if (!candidates.length) return null
  candidates.sort((a, b) => a.score - b.score)
  const top = candidates.slice(0, 3)
  return top[Math.floor(Math.random() * top.length)].key
}

// ==================================================
// الإرسال
// ==================================================

let imageBuffer
function getImage() {
  if (imageBuffer !== undefined) return imageBuffer
  try {
    imageBuffer = fs.existsSync(IMAGE) ? fs.readFileSync(IMAGE) : null
  } catch {
    imageBuffer = null
  }
  return imageBuffer
}

async function sendButtons(conn, chat, body, options) {
  const text = String(body)
  try {
    let header = { hasMediaAttachment: false, title: TITLE }
    const img = getImage()
    if (img) {
      const media = await prepareWAMessageMedia({ image: img }, { upload: conn.waUploadToServer })
      header = { hasMediaAttachment: true, title: TITLE, imageMessage: media.imageMessage }
    }

    const interactiveMessage = proto.Message.InteractiveMessage.fromObject({
      body: { text },
      footer: { text: FOOTER },
      header,
      nativeFlowMessage: {
        buttons: options.map(([label, id]) => ({
          name: 'quick_reply',
          buttonParamsJson: JSON.stringify({ display_text: label, id: PREFIX + id })
        }))
      }
    })

    const msg = generateWAMessageFromContent(chat, {
      viewOnceMessage: {
        message: {
          messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
          interactiveMessage
        }
      }
    }, { userJid: conn.user?.id || conn.user?.jid })

    const relayOpts = { messageId: msg.key.id }
    if (!String(chat).endsWith('@g.us')) {
      relayOpts.additionalNodes = [
        { tag: 'biz', attrs: {}, content: [{ tag: 'interactive', attrs: { type: 'native_flow', v: '1' }, content: [{ tag: 'native_flow', attrs: { v: '9', name: 'mixed' } }] }] },
        { tag: 'bot', attrs: { biz_bot: '1' } }
      ]
    }
    await conn.relayMessage(chat, msg.message, relayOpts)
    return
  } catch (e) {
    console.error('[مارد] الأزرار فشلت، نص عادي:', e?.message)
  }

  // نص عادي: الإجابة برقم أو كلمة
  const lines = options.map(([label], i) => `${i + 1}. ${label}`)
  await conn.sendMessage(chat, { text: `${text}\n\n${lines.join('\n')}\n\n✍️ اكتب رقم الإجابة أو الكلمة\n\n${FOOTER}` })
}

const say = (conn, chat, text) => conn.sendMessage(chat, { text })

// ==================================================
// سير اللعبة
// ==================================================

async function askQuestion(conn, session, key) {
  session.current = key
  session.asked.add(key)
  session.qCount++
  session.state = 'ask'
  touch(session)
  await sendButtons(
    conn,
    session.chat,
    `${TITLE}\n\n❓ السؤال ${session.qCount}/${MAX_QUESTIONS}\n\n${Q[key].text}`,
    BUTTONS
  )
}

async function makeGuess(conn, session, probs) {
  let best = -1
  probs.forEach((p, i) => {
    if (p > 0 && (best === -1 || p > probs[best])) best = i
  })
  if (best === -1 || probs[best] < 0.005) return giveUp(conn, session)

  session.state = 'guess'
  session.guess = session.chars[best].name
  touch(session)
  await sendButtons(
    conn,
    session.chat,
    `${TITLE}\n\n🔮 أنا شايف إن شخصيتك هي:\n\n✨ *${session.guess}*\n\nصح؟`,
    [['✅ صح', 'right'], ['❌ غلط', 'wrong']]
  )
}

async function giveUp(conn, session) {
  session.state = 'learn'
  touch(session)
  await say(conn, session.chat,
    `${TITLE}\n\n😔 غلبتني المرة دي!\n\nعلّمني شخصيتك عشان أعرفها بعد كده:\n*.مارد هو <اسم الشخصية>*\n\n${FOOTER}`
  )
}

async function decide(conn, session) {
  const probs = computeProbs(session)
  const top = Math.max(0, ...probs)

  if (session.qCount >= MAX_QUESTIONS) return makeGuess(conn, session, probs)
  if (session.qCount >= MIN_QUESTIONS && top >= GUESS_CONFIDENCE) return makeGuess(conn, session, probs)

  const key = pickNextQuestion(session, probs)
  if (!key) return makeGuess(conn, session, probs)
  return askQuestion(conn, session, key)
}

async function onAnswer(conn, session, ans) {
  touch(session)

  /* ---- مرحلة التخمين ---- */
  if (session.state === 'guess') {
    if (ans === 'right') {
      const n = session.qCount
      const name = session.guess
      endSession(session.chat)
      return say(conn, session.chat,
        `${TITLE}\n\n🎉 عرفتها! كانت *${name}*\nبعد ${n} سؤال 🧞\n\nاكتب *.مارد* للعب تاني.\n\n${FOOTER}`
      )
    }
    if (ans === 'wrong') {
      session.excluded.add(session.guess)
      session.wrong++
      const left = session.chars.filter(c => !session.excluded.has(c.name)).length
      if (session.wrong >= MAX_WRONG || left === 0) return giveUp(conn, session)
      await say(conn, session.chat, '🤔 غلطت.. هكمل أسأل شوية.')
      return decide(conn, session)
    }
    return
  }

  if (session.state !== 'ask') return

  /* ---- رجوع ---- */
  if (ans === 'back') {
    const last = session.history.pop()
    if (!last) return say(conn, session.chat, '↩️ مفيش سؤال قبل ده.')
    session.answers.delete(last.key)
    session.asked.delete(last.key)
    session.qCount = Math.max(0, session.qCount - 1)
    // السؤال الحالي (اللي لسه ما اتجاوبش) يرجع كمان
    if (session.current) session.asked.delete(session.current)
    session.qCount = Math.max(0, session.qCount - 1)
    return askQuestion(conn, session, last.key)
  }

  if (!(ans in ANSWERS)) return

  const value = ANSWERS[ans]
  const key = session.current
  if (!key) return
  if (value !== null) session.answers.set(key, value)
  session.history.push({ key, value })
  session.current = null
  return decide(conn, session)
}

// ==================================================
// استخراج الضغطة من أي نوع رد
// ==================================================

function unwrap(message) {
  let msg = message || {}
  msg = msg.ephemeralMessage?.message || msg
  msg = msg.viewOnceMessage?.message || msg
  msg = msg.viewOnceMessageV2?.message || msg
  msg = msg.documentWithCaptionMessage?.message || msg
  return msg
}

function extractChoice(message) {
  const msg = unwrap(message)
  const flow = msg.interactiveResponseMessage?.nativeFlowResponseMessage
  if (flow?.paramsJson) {
    try {
      const p = JSON.parse(flow.paramsJson)
      const id = p?.id ?? p?.selectedId ?? p?.selected_id
      if (id != null) return String(id)
    } catch {}
  }
  if (msg.buttonsResponseMessage) return msg.buttonsResponseMessage.selectedButtonId
  if (msg.listResponseMessage) return msg.listResponseMessage.singleSelectReply?.selectedRowId
  if (msg.templateButtonReplyMessage) return msg.templateButtonReplyMessage.selectedId
  return null
}

// ==================================================
// الأمر
// ==================================================

let handler = async (m, { conn, args = [] }) => {
  const chat = m.chat
  const sub = String(args[0] || '').trim()

  /* ---- وقف ---- */
  if (/^(وقف|stop|انهاء|إنهاء)$/i.test(sub)) {
    if (!sessions.has(chat)) return say(conn, chat, 'مفيش لعبة شغالة 🧞')
    endSession(chat)
    return say(conn, chat, '🧞 تمام، وقفت اللعبة.')
  }

  /* ---- تعليم ---- */
  if (/^(هو|هي)$/i.test(sub)) {
    const session = sessions.get(chat)
    const name = args.slice(1).join(' ').trim()
    if (!session || session.state !== 'learn') {
      return say(conn, chat, 'التعليم بيشتغل بس بعد ما أخسر. العب الأول بـ *.مارد*')
    }
    if (!name) return say(conn, chat, 'اكتب الاسم: *.مارد هو <اسم الشخصية>*')

    const traits = [...session.answers].filter(([, a]) => a >= 0.75).map(([k]) => k)
    const learned = loadLearned()
    const existing = learned.find(x => x.name === name)
    if (existing) existing.traits = [...new Set([...existing.traits, ...traits])]
    else learned.push({ name, traits })
    saveLearned(learned)
    endSession(chat)
    return say(conn, chat, `${TITLE}\n\n✅ اتعلمت *${name}*! المرة الجاية هعرفها 🧞\n\n${FOOTER}`)
  }

  /* ---- لعبة جديدة ---- */
  if (sessions.has(chat)) {
    return say(conn, chat, 'فيه لعبة شغالة في الشات ده 🧞\nلإنهائها اكتب: *.مارد وقف*')
  }

  const session = newSession(chat, m.sender)
  sessions.set(chat, session)
  await say(conn, chat,
    `${TITLE}\n\n🧞 فكّر في شخصية (حقيقية أو خيالية) وأنا هخمّنها!\nجاوب على أسئلتي بالأزرار.\n\n${FOOTER}`
  )
  return decide(conn, session)
}

// استقبال الإجابات (أزرار أو كتابة) من صاحب اللعبة
handler.before = async function (m, { conn }) {
  try {
    if (m.fromMe) return false
    const session = sessions.get(m.chat)
    if (!session || m.sender !== session.owner) return false

    let ans = null
    const id = extractChoice(m.message) || (typeof m.text === 'string' && m.text.startsWith(PREFIX) ? m.text : null)
    if (id && String(id).startsWith(PREFIX)) {
      ans = String(id).slice(PREFIX.length)
    } else {
      const text = String(m.text || '').trim()
      if (!text || /^[./!#$]/.test(text)) return false
      const numMap = session.state === 'guess' ? NUMBER_GUESS : NUMBER_ASK
      if (numMap[text]) ans = numMap[text]
      else {
        for (const [re, a] of TYPED) {
          if (re.test(text)) { ans = a; break }
        }
      }
    }
    if (!ans) return false

    await onAnswer(conn, session, ans)
    return true
  } catch (e) {
    console.error('[مارد] خطأ:', e)
    return false
  }
}

handler.help = ['مارد']
handler.tags = ['game']
handler.command = /^(مارد|المارد|akinator)$/i

export default handler