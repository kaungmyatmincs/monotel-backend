const express = require("express");
const router = express.Router();
const pool = require("../db");
const auth = require("../middleware/auth");
const puppeteer = require("puppeteer");

function generateFormHTML(room, tenants, settings, dateRange, lang = 'my') {
  const isEn = lang === 'en';
  const { host_name, host_nrc, host_address, host_phone, ward_number, street_name } = settings;
  const { from_date, to_date, form_date } = dateRange;

  const rowNumbers = ["(က)", "(ခ)", "(ဂ)", "(ဃ)", "(င)", "(စ)", "(ဆ)"];
  const rowNumbersEn = ["(1)", "(2)", "(3)", "(4)", "(5)", "(6)", "(7)"];

  const tenantRows = Array.from({ length: 7 }, (_, i) => {
    const t = tenants[i];
    const num = isEn ? rowNumbersEn[i] : rowNumbers[i];
    if (t) {
      return `
        <tr>
          <td>${num}</td>
          <td style="text-align:left; padding-left:4px">${t.name || ""}</td>
          <td>${t.date_of_birth ? new Date(t.date_of_birth).toISOString().slice(0, 10) : ""}</td>
          <td>${t.father_name || ""}</td>
          <td>${t.nrc_number || ""}</td>
          <td>${t.occupation || ""}</td>
          <td>${t.relationship || ""}</td>
          <td>${t.ethnicity || ""}</td>
          <td style="text-align:left; padding-left:4px">${t.previous_address || ""}</td>
          <td>${t.visit_purpose || ""}</td>
          <td></td>
        </tr>`;
    } else {
      return `
        <tr>
          <td>${num}</td>
          <td></td><td></td><td></td><td></td>
          <td></td><td></td><td></td><td></td><td></td><td></td>
        </tr>`;
    }
  }).join("");

  const hostTitle = settings.host_gender === 'female' ? 'ဒေါ်' : 'ဦး';
  const hostStrike = settings.host_gender === 'female' ? '<s>ဦး</s>/ ဒေါ်' : 'ဦး/ <s>ဒေါ်</s>';

  return `<!DOCTYPE html>
<html lang="${isEn ? 'en' : 'my'}">
<head>
<meta charset="UTF-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:serif; font-size:9pt; padding:8mm 10mm; }
  .header { text-align:center; margin-bottom:5px; }
  .header .line1 { font-size:12pt; font-weight:700; line-height:1.6; }
  .header .line2 { font-size:11pt; font-weight:700; line-height:1.6; }
  .info-line { text-align:center; margin-bottom:3px; white-space:nowrap; font-size:8pt; letter-spacing:-0.2px; }
  .subline { text-align:center; margin-bottom:6px; }
  .blank { display:inline-block; border-bottom:1px solid #000; text-align:center; padding:0 6px; }
  table { width:100%; border-collapse:collapse; font-size:7pt; margin-bottom:6px; table-layout:fixed; }
  th, td { border:1px solid #000; padding:2px; text-align:center; vertical-align:middle; line-height:1.3; overflow:hidden; word-break:break-all; }
  th { font-weight:700; font-size:6.5pt; background:#f5f5f5; }
  td { height:22px; }
  .footer-note { font-size:9pt; line-height:1.8; margin-bottom:16px; text-align:center; }
  .sig-row { display:flex; justify-content:space-between; align-items:flex-start; font-size:8pt; margin-top:16px; }
  .sig-box { text-align:center; width:21%; }
  .sig-box .sig-label { margin-bottom:2px; }
  .sig-box .sig-line { border-bottom:1px solid #000; width:100%; margin-bottom:2px; height:16px; }
  .sig-box .name-line { font-size:7.5pt; }
  .sig-right { width:31%; font-size:8pt; line-height:2; }
  .sig-right .right-line { display:flex; align-items:baseline; gap:4px; margin-bottom:3px; }
  .sig-right .right-line .rl { border-bottom:1px solid #000; flex:1; height:14px; }
</style>
</head>
<body>

<div class="header">
  <div class="line1">${isEn
    ? 'Hlaing Thar Yar (East) Township, Ward No. (6), Ward Administration Office'
    : 'လှိုင်သာယာ (အရှေ့ပိုင်း) မြို့နယ်၊ အမှတ် (၆) ရပ်ကွက်၊ ရပ်ကွက်အုပ်ချုပ်ရေးမှူးရုံး'}</div>
  <div class="line2">${isEn
    ? 'Guest Registration Record for Residents Staying in Ward / Village'
    : 'ရပ်ကွက် / ကျေးရွာအတွင်း နေထိုင်စဥ် ဧည့်စာရင်းတိုင်ကြားမှုမှတ်တမ်း'}</div>
</div>

<div class="info-line">
  <span class="blank" style="min-width:35px; padding:0 6px">${ward_number || ""}</span> ${isEn ? 'Ward,' : 'ရပ်ကွက်၊'}
  <span class="blank" style="min-width:60px; padding:0 6px">${street_name || ""}</span> ${isEn ? 'Street,' : 'လမ်း၊'}
  ${isEn ? 'House No. / Building' : 'အိမ်အမှတ်/ အဆောင်'} <span class="blank" style="min-width:35px; padding:0 6px">${room.room_number}</span>
  ${isEn ? 'Host / Building Owner' : 'အိမ်ရှင်/ အဆောင်'} ${isEn ? '' : hostStrike} <span class="blank" style="min-width:110px">${host_name || ""}</span> ${isEn ? '' : '၏'}
</div>

<div class="subline">
  ${isEn
    ? 'The persons listed below have come to stay temporarily / permanently at the above residence and are hereby registered as guests.'
    : 'နေအိမ်/၏ အောက်အမည်ပါသူများမှ အဆောင်တွင် ခေတ္တ/ အမြဲ လာရောက်နေထိုင်ပါသဖြင့် ဧည့်စာရင်းတိုင်ကြားအပ်ပါသည်။'}
</div>

<table>
  <colgroup>
    <col style="width:26px">
    <col style="width:82px">
    <col style="width:52px">
    <col style="width:65px">
    <col style="width:76px">
    <col style="width:50px">
    <col style="width:50px">
    <col style="width:52px">
    <col style="width:95px">
    <col style="width:72px">
    <col style="width:45px">
  </colgroup>
  <thead>
    <tr>
      <th>${isEn ? 'No.' : 'စဉ်'}</th>
      <th>${isEn ? 'Guest Name' : 'ဧည့်သည်အမည်'}</th>
      <th>${isEn ? 'Date of Birth' : 'မွေးသက္ကရာဇ်'}</th>
      <th>${isEn ? "Father's Name" : 'အဘအမည်'}</th>
      <th>${isEn ? 'NRC Number' : 'မှတ်ပုံတင်အမှတ်'}</th>
      <th>${isEn ? 'Occupation' : 'အလုပ်အကိုင်'}</th>
      <th>${isEn ? 'Relationship' : 'တော်စပ်ပုံ'}</th>
      <th>${isEn ? 'Ethnicity' : 'မွေးဇာတိ (အပြည့်အစုံ)'}</th>
      <th>${isEn ? 'Previous Address (Full)' : 'ယခင်နေထိုင်ခဲ့သည့်နေရာများ (နေရပ်လိပ်စာအပြည့်အစုံ)'}</th>
      <th>${isEn ? 'Purpose of Visit' : 'လာရောက်သည့်အကြောင်းအရာ'}</th>
      <th>${isEn ? 'Remark' : 'မှတ်ချက်'}</th>
    </tr>
  </thead>
  <tbody>${tenantRows}</tbody>
</table>

<div class="footer-note">
  ${isEn
    ? 'Note: When registering guests, the guest must provide a letter of support from the last police station and ward where they resided. The dates on the support letters must not be too far from the registration date.'
    : 'မှတ်ချက်။ ဧည့်စာရင်းလာရောက်တိုင်ကြားရာတွင် လာရောက်တည်းခိုနေထိုင်သည့် ဧည့်သည်နောက်ဆုံးနေခဲ့သည့် ရဲစခန်းနှင့် ရပ်ကွက်ထောက်ခံစာများပါရှိရမည်။<br>ဧည့်စာရင်းလာရောက်တိုင်သည့်နေ့နှင့် ရဲစခန်းနှင့် ရပ်ကွက်ထောက်ခံစာများပါ ရက်စွဲများသည် ရက်အလွန်ကွာဝေးခြင်းမျိုးမဖြစ်စေရ။'}
</div>

<div class="sig-row">
  <div class="sig-box">
    <div class="sig-label">${isEn ? '(Signature)' : '(လက်မှတ်)'}</div>
    <div class="sig-line"></div>
    <div class="name-line">${isEn ? '---- 10-House Leader ----' : '---- ဆယ်အိမ်မှူး ----'}</div>
    <div class="name-line">${isEn ? 'Name -------------------------' : 'အမည် -------------------------'}</div>
  </div>
  <div class="sig-box">
    <div class="sig-label">${isEn ? '(Signature)' : '(လက်မှတ်)'}</div>
    <div class="sig-line"></div>
    <div class="name-line">${isEn ? '---- 100-House Leader ----' : '---- ရာအိမ်မှူး ----'}</div>
    <div class="name-line">${isEn ? 'Name -------------------------' : 'အမည် -------------------------'}</div>
  </div>
  <div class="sig-box">
    <div class="sig-label">${isEn ? '(Signature)' : '(လက်မှတ်)'}</div>
    <div class="sig-line"></div>
    <div class="name-line">${isEn ? 'Ward / Village Administrator' : 'ရပ်ကွက်/ ကျေးရွာအုပ်ချုပ်ရေးမှူး'}</div>
    <div class="name-line">${isEn ? 'Name -------------------------' : 'အမည် -------------------------'}</div>
  </div>
  <div class="sig-right">
    <div class="right-line"><span>${isEn ? 'Responsible Reporter' : 'တာဝန်ယူတိုင်ကြားသူ'}</span><span class="rl"></span></div>
    <div class="right-line"><span>${isEn ? 'Host / Building Owner Name' : 'အိမ်ရှင်/အဆောင်ပိုင်ရှင်အမည်'}</span><span class="rl"></span></div>
    <div class="right-line"><span>${isEn ? 'Contact Phone Number' : 'ဆက်သွယ်ရန်ဖုန်းနံပါတ်ပါ'}</span><span class="rl"></span></div>
  </div>
</div>

</body>
</html>`;
}

// GET /print/overnight-form?rooms=uuid1,uuid2&lang=en
router.get("/overnight-form", auth, async (req, res) => {
  try {
    const { rooms, from_date, to_date, form_date, lang } = req.query;

    if (!rooms) return res.status(400).json({ error: "No rooms specified" });

    const roomIds = rooms.split(",").map(r => r.trim());

    const settingsRes = await pool.query(`SELECT key, value FROM settings WHERE key IN ('host_name','host_nrc','host_address','host_phone','ward_number','street_name','host_gender')`);
    const settings = {};
    settingsRes.rows.forEach(r => settings[r.key] = r.value);

    const today = new Date().toISOString().slice(0, 10);
    const dateRange = {
      form_date: form_date || today,
      from_date: from_date || today,
      to_date: to_date || today,
    };

    let allPagesHTML = "";
    for (const roomId of roomIds) {
      const roomRes = await pool.query(`SELECT * FROM rooms WHERE id = $1`, [roomId]);
      const room = roomRes.rows[0];
      if (!room) continue;

      const tenantsRes = await pool.query(
        `SELECT * FROM tenants WHERE room_id = $1 AND is_active = true ORDER BY name ASC`,
        [roomId]
      );
      const tenants = tenantsRes.rows;

      if (allPagesHTML !== "") allPagesHTML += '<div style="page-break-after: always;"></div>';
      allPagesHTML += generateFormHTML(room, tenants, settings, dateRange, lang || 'my');
    }

    const browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });
    const page = await browser.newPage();
    await page.setContent(allPagesHTML, { waitUntil: "domcontentloaded" });
    await new Promise(r => setTimeout(r, 2000));
    const pdf = await page.pdf({
      format: "A4",
      landscape: true,
      printBackground: true,
      margin: { top: "10mm", bottom: "10mm", left: "12mm", right: "12mm" }
    });
    await browser.close();

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=overnight_form.pdf");
    res.end(pdf, "binary");

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error", detail: err.message });
  }
});

module.exports = router;