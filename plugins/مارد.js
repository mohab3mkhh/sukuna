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
  ['حسني مبارك', 'real male old arab egyptian politicia