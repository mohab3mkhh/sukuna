// plugins/مارد.js  — لعبة المارد (Akinator)
// بيجرّب مزوّد الـ API الأصلي، ولو وقع بيجرّب حزمة aki-api (لو متثبتة). ولو الاتنين وقعوا بيقولك السبب في الشات.
// لتثبيت الحزمة: ضيف  "aki-api": "latest"  في dependencies بتاع package.json

import axios from "axios";
import * as baileys from '@whiskeysockets/baileys'
const { generateWAMessageFromContent, proto, prepareWAMessageMedia } = baileys

const api_obito = "https://mr-obito-api.vercel.app/api";
const ANSWERS = { "نعم": 0, "لا": 1, "لا أعرف": 2, "ربما": 3, "ربما لا": 4 };

const shortErr = e => e?.response?.status
    ? `HTTP ${e.response.status}${e.response.data?.message ? ' - ' + String(e.response.data.message).slice(0, 60) : ''}`
    : String(e?.code || e?.message || e).slice(0, 100)

// ───────── المزوّد 1: API الأصلي ─────────
async function obitoStart() {
    const { data } = await axios.post(`${api_obito}/akinator_start`, {}, { timeout: 20000 })
    if (!data?.session || !data?.signature) throw new Error('رد ناقص من الـ API')
    return { provider: 'obito', session: data.session, signature: data.signature, step: 0, progression: 0, first: { question: data.question, img: data.akitude_url || null } }
}

async function obitoAnswer(s, answer, back = false) {
    const { data } = await axios.post(`${api_obito}/${back ? 'akinator_back' : 'akinator_answer'}`, {
        session: s.session, signature: s.signature, step: s.step, progression: s.progression,
        ...(back ? {} : { answer, sid: "NaN", question_filter: "string" }), cm: "false",
    }, { timeout: 20000 })
    if (data.name_proposition) return { win: { name: data.name_proposition, desc: data.description_proposition, photo: data.photo } }
    s.step = data.step; s.progression = data.progression
    return { question: data.question, img: data.akitude_url || null }
}

// ───────── المزوّد 2: حزمة aki-api ─────────
async function akiStart() {
    let mod
    try { mod = await import('aki-api') } catch { throw new Error('aki-api مش متثبتة') }
    const Aki = mod.Aki || mod.default?.Aki || mod.default
    const aki = new Aki({ region: 'ar', childMode: false })
    await aki.start()
    return { provider: 'aki', aki, first: { question: aki.question, img: null } }
}

async function akiAnswer(s, answer, back = false) {
    const aki = s.aki
    if (back) await aki.back(); else await aki.step(answer)
    if (aki.progress >= 80 || aki.currentStep >= 78) {
        await aki.win()
        const g = aki.answers?.[0]
        if (g) return { win: { name: g.name, desc: g.description, photo: g.absolute_picture_path } }
    }
    return { question: aki.question, img: null }
}

const PROVIDERS = [{ name: 'obito-api', start: obitoStart }, { name: 'aki-api', start: akiStart }]

// ───────── إرسال السؤال ─────────
async function sendQuestion(conn, jid, question, imgUrl, quoted) {
    const quick = (text, id) => ({ name: "quick_reply", buttonParamsJson: JSON.stringify({ display_text: text, id }) })
    try {
        const buttons = [
            quick("☽✰ ¦ نـعـم 🐤 ¦ ✰☾", ".مارد نعم"),
            quick("☽✰ ¦ لا 🐤 ¦ ✰☾", ".مارد لا"),
            quick("☽✰ ¦ مـش عـارف 🐤 ¦ ✰☾", ".مارد لا أعرف"),
            quick("☽✰ ¦ ربـمـا 🐤 ¦ ✰☾", ".مارد ربما"),
            quick("☽✰ ¦ لا ربـمـا 🐤 ¦ ✰☾", ".مارد ربما لا"),
            quick("☽✰ ¦ رجَـوع خـطـوه 🐤 ¦ ✰☾", ".مارد رجوع"),
            quick("☽✰ ¦ الـغـاء الـعـبة 🐤 ¦ ✰☾", ".مارد حذف"),
        ]
        const media = imgUrl ? await prepareWAMessageMedia({ image: { url: imgUrl } }, { upload: conn.waUploadToServer }) : null
        const msg = generateWAMessageFromContent(jid, {
            viewOnceMessage: { message: { interactiveMessage: proto.Message.InteractiveMessage.create({
                body: proto.Message.InteractiveMessage.Body.create({ text: `ايَـتـاتـَشْـٌي يـقـول🐤:\n${question}` }),
                footer: proto.Message.InteractiveMessage.Footer.create({ text: "جـاري الـتـخـمـين....🔥" }),
                header: proto.Message.InteractiveMessage.Header.create({
                    ...(media ? { hasMediaAttachment: true, ...media } : { hasMediaAttachment: false }),
                    title: "لـعـبه الـمـارد ايَـتـاتـَشْـٌي😂",
                }),
                nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({ buttons }),
            }) } },
        }, {})
        return await conn.relayMessage(jid, msg.message, { messageId: msg.key.id })
    } catch (e) {
        console.error('[مارد] الأزرار فشلت:', e.message)
        // احتياطي: السؤال نص + طريقة الإجابة
        return conn.sendMessage(jid, { text: `ايَـتـاتـَشْـٌي يـقـول🐤:\n${question}\n\n✍️ جاوب بـ:\n.مارد نعم | .مارد لا | .مارد لا أعرف | .مارد ربما | .مارد ربما لا\n.مارد رجوع | .مارد حذف` }, { quoted })
    }
}

const sendWin = (conn, m, w) => conn.sendMessage(m.chat, {
    ...(w.photo ? { image: { url: w.photo } } : {}),
    [w.photo ? 'caption' : 'text']: `🧞 على ما أظن أنك تفكر بـ:\n${w.name}\n${w.desc || "بدون وصف"}`,
}, { quoted: m })

// ───────── الأمر ─────────
let handler = async function (m, { text, conn }) {
    if (!conn.aki) conn.aki = {}
    const key = `${m.chat}-${m.sender}`
    const session = conn.aki[key]
    text = (text || '').trim()

    if (!text) {
        const quick = (t, id) => ({ name: "quick_reply", buttonParamsJson: JSON.stringify({ display_text: t, id }) })
        try {
            const msg = generateWAMessageFromContent(m.chat, { viewOnceMessage: { message: { interactiveMessage: proto.Message.InteractiveMessage.create({
                body: proto.Message.InteractiveMessage.Body.create({ text: "🧞‍هل تريد بدء لعبة مارد؟" }),
                footer: proto.Message.InteractiveMessage.Footer.create({ text: "اختر احد الخيارات التالية :" }),
                header: proto.Message.InteractiveMessage.Header.create({ hasMediaAttachment: false, title: "لعبة المارد الازرق..🧞" }),
                nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({ buttons: [quick("📘 المساعدة", ".مارد المساعدة"), quick("🎮 بدء اللـعبة", ".مارد ابدا")] }),
            }) } } }, {})
            return await conn.relayMessage(m.chat, msg.message, { messageId: msg.key.id })
        } catch (e) {
            return m.reply("🧞 لعبة المارد\n\n.مارد ابدا → بدء اللعبة\n.مارد المساعدة → الشرح")
        }
    }

    if (text === "المساعدة") {
        return m.reply(`📘 شرح أوامر لعبة مارد :\n\n-.مارد ابدا → بدء اللعبة\n-.مارد نعم / لا / لا أعرف / ربما / ربما لا → إرسال إجابة\n-.مارد رجوع → الرجوع للسؤال السابق\n-.مارد حذف → حذف الجلسة الحالية`)
    }

    if (text === "ابدا") {
        const errors = []
        for (const p of PROVIDERS) {
            try {
                const s = await p.start()
                conn.aki[key] = s
                console.log(`[مارد] ✅ ${p.name}`)
                return sendQuestion(conn, m.chat, s.first.question, s.first.img, m)
            } catch (e) {
                errors.push(`${p.name}: ${shortErr(e)}`)
                console.error(`[مارد] ❌ ${p.name}:`, e?.message || e)
            }
        }
        return m.reply(`❌ مقدرتش أبدأ اللعبة.\n\n🔧 السبب:\n${errors.map(e => `• ${e}`).join('\n')}`)
    }

    if (text === "حذف") {
        if (!session) return m.reply("لا توجد جلسة نشطة")
        delete conn.aki[key]
        return m.reply("تم حذف الجلسة بنجاح")
    }

    const isBack = text === "رجوع"
    if (isBack || Object.prototype.hasOwnProperty.call(ANSWERS, text)) {
        if (!session) return m.reply(isBack ? "لا توجد جلسة نشطة" : "لا توجد جلسه نشطه حاليا،ابدأ جلسه عبر .مارد ابدا")
        try {
            const fn = session.provider === 'aki' ? akiAnswer : obitoAnswer
            const r = await fn(session, ANSWERS[text], isBack)
            if (r.win) { delete conn.aki[key]; return sendWin(conn, m, r.win) }
            return sendQuestion(conn, m.chat, r.question, r.img, m)
        } catch (e) {
            console.error('[مارد]', e?.message || e)
            return m.reply(`⚠️ ${isBack ? 'لا يمكن الرجوع حالياً' : 'حدث خطأ أثناء الإجابة'}\n🔧 ${shortErr(e)}`)
        }
    }
}

handler.command = /^مارد$/i
export default handler