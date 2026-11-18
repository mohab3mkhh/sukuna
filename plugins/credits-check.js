// credits-check.js — يفحص كل أوامر plugins/ ويقولك مين ناقصه حقوقك ومين فيه حقوق قديمة
//
// التشغيل (من فولدر البوت):
//   node credits-check.js               ← تقرير بس (مابيغيّرش حاجة)
//   node credits-check.js --fix-names   ← يبدّل ADAM→SUKUNA و gojo→sukuna و "محمد اسلام"→mohab
//                                         (بياخد نسخة .bak من كل ملف يتغير)
//   node credits-check.js plugins       ← فولدر تاني

import fs from 'fs'
import path from 'path'

const args = process.argv.slice(2)
const FIX = args.includes('--fix-names')
const DIR = args.find(a => !a.startsWith('--')) || 'plugins'

// أي واحدة من دول = الملف فيه حقوقك
const MINE = [/SUKUNA/i, /mohab/i, /مهاب/]
// حقوق قديمة لازم تتبدّل
const OLD = [
    [/ADAM/g, 'SUKUNA'],
    [/gojo/gi, 'sukuna'],
    [/محمد\s*[إا]سلام/g, 'mohab'],
]

function walk(d) {
    return fs.readdirSync(d, { withFileTypes: true }).flatMap(e => {
        const p = path.join(d, e.name)
        if (e.isDirectory()) return e.name === 'node_modules' ? [] : walk(p)
        return /\.(js|mjs|cjs)$/.test(e.name) && !e.name.endsWith('.bak') ? [p] : []
    })
}

if (!fs.existsSync(DIR)) { console.error('مش لاقي الفولدر:', DIR); process.exit(1) }

const missing = [], old = [], ok = []
for (const f of walk(DIR)) {
    let s = fs.readFileSync(f, 'utf8')
    const hasOld = OLD.filter(([re]) => { re.lastIndex = 0; return re.test(s) })
    const mine = MINE.some(re => re.test(s))
    // الملف ده بيبعت رد للمستخدم؟ (لو لأ، مش محتاج حقوق: helper/lib)
    const sends = /sendMessage|\.reply\(|sendList|sendButtons|sendFile|conn\.send/.test(s)
    if (hasOld.length) {
        old.push(f)
        if (FIX) {
            fs.copyFileSync(f, f + '.bak')
            for (const [re, to] of OLD) s = s.replace(re, to)
            fs.writeFileSync(f, s)
        }
    }
    if (!sends) continue
    ;(mine || (FIX && hasOld.length) ? ok : missing).push(f)
}

console.log(`\n✅ فيها حقوقك: ${ok.length}`)
console.log(`\n❌ بتبعت ردود ومفيهاش حقوقك (${missing.length}):`)
missing.forEach(f => console.log('   ' + f))
console.log(`\n🔄 فيها حقوق قديمة (ADAM/gojo/محمد اسلام) (${old.length}):${FIX ? '  ← اتبدّلت وفيه نسخة .bak' : '  ← شغّل بـ --fix-names لتبديلها'}`)
old.forEach(f => console.log('   ' + f))
console.log('\nالملفات اللي ناقصها حقوق: ابعتهالي أو اتأكد إن ردها فيه  > ⛩️ SUKUNA BOT ⛩️\n')