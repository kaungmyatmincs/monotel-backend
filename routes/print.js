const express = require("express");
const router = express.Router();
const pool = require("../db");
const auth = require("../middleware/auth");
const puppeteer = require("puppeteer");

function generateFormHTML(room, tenants, settings, dateRange) {
  const { host_name, host_nrc, host_address, host_phone } = settings;
  const { from_date, to_date, form_date } = dateRange;

  const burmseNumbers = ["၁", "၂", "၃", "၄", "၅", "၆", "၇"];

  const tenantRows = Array.from({ length: 7 }, (_, i) => {
    const t = tenants[i];
    if (t) {
      return `
        <tr>
          <td>${burmseNumbers[i]}</td>
          <td style="text-align:left; padding-left:6px">${t.name || ""}</td>
          <td>${t.date_of_birth ? t.date_of_birth.toISOString().slice(0, 10) : ""}</td>
          <td>${t.father_name || ""}</td>
          <td>${t.mother_name || ""}</td>
          <td>${t.nrc_number || ""}</td>
          <td style="text-align:left; padding-left:4px; font-size:8pt">${t.previous_address || ""}</td>
          <td>${t.ethnicity || ""}</td>
          <td style="font-size:8pt">${t.occupation || ""}</td>
          <td></td>
        </tr>`;
    } else {
      return `
        <tr>
          <td>${burmseNumbers[i]}</td>
          <td></td><td></td><td></td><td></td>
          <td></td><td></td><td></td><td></td><td></td>
        </tr>`;
    }
  }).join("");

  return `<!DOCTYPE html>
<html lang="my">
<head>
<meta charset="UTF-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:serif; padding:15mm 18mm; font-size:10pt; }
  .form-title { text-align:center; font-size:14pt; font-weight:700; margin-bottom:12px; line-height:1.5; }
  .date-row { text-align:right; font-size:9.5pt; margin-bottom:8px; }
  .address-row { font-size:9.5pt; margin-bottom:12px; line-height:1.8; }
  .underline { display:inline-block; border-bottom:1px solid #000; min-width:50px; text-align:center; padding:0 4px; }
  table { width:100%; border-collapse:collapse; font-size:8.5pt; margin-bottom:12px; }
  th, td { border:1px solid #000; padding:4px 3px; text-align:center; vertical-align:middle; line-height:1.5; }
  th { background:#f5f5f5; font-weight:700; font-size:8pt; }
  td { height:26px; }
  .footer-note { font-size:9pt; margin-bottom:14px; line-height:1.8; }
  .sig-section { display:flex; justify-content:space-between; align-items:flex-start; margin-top:8px; }
  .sig-left { font-size:9pt; line-height:2.2; width:55%; }
  .sig-line { display:flex; align-items:baseline; gap:6px; }
  .sig-line .line { flex:1; border-bottom:1px solid #000; min-width:100px; }
  .sig-right { font-size:9pt; text-align:center; line-height:1.8; width:40%; }
  .stamp-box { width:100px; height:70px; border:1px solid #000; margin:8px auto 0; }
</style>
</head>
<body>

<div class="form-title">ညွှန်စာရင်းတိုင်ကြားခြင်း (Overnight Stay Registration Form)</div>

<div class="date-row">နေ့စွဲ: <span class="underline">${form_date}</span></div>

<div class="address-row">
  တည်းခိုနေရပ်လိပ်စာ၊ အိမ်တိုက် (<span class="underline">${room.room_number}</span>) အခန်း/အလွာ (<span class="underline">${room.floor || ""}</span>) ၊
  &nbsp;&nbsp; လမ်း/အိမ်ယာ၊ အမှတ် (<span class="underline">&nbsp;&nbsp;&nbsp;</span>) ရပ်ကွက်၊ လှိုင်သာယာမြို့နယ်။
</div>

<table>
  <thead>
    <tr>
      <th style="width:28px">စဉ်</th>
      <th style="width:80px">အမည်</th>
      <th style="width:62px">မွေးသက္ကရာဇ်</th>
      <th style="width:70px">အဘ အမည်</th>
      <th style="width:70px">အမိ အမည်</th>
      <th style="width:82px">နိုင်ငံသားစိစစ်ရေးအမှတ်</th>
      <th style="width:80px">ယခင်နေရပ်လိပ်စာ</th>
      <th style="width:40px">လူမျိုး</th>
      <th style="width:55px">အလုပ်အကိုင်</th>
      <th style="width:50px">မှတ်ချက်</th>
    </tr>
  </thead>
  <tbody>${tenantRows}</tbody>
</table>

<div class="footer-note">
  အထက်ပါဧည့်စာရင်းတိုင်ကြားသူ (<span class="underline">&nbsp;${tenants.length}&nbsp;</span>) ဦးအား
  (<span class="underline">&nbsp;${from_date}&nbsp;</span>) ရက်နေ့မှ
  (<span class="underline">&nbsp;${to_date}&nbsp;</span>) ရက်နေ့အထိ သာ ဧည့်စာရင်းခွင့်ပြုသည်။
</div>

<div class="sig-section">
  <div class="sig-left">
    <div class="sig-line"><span>အိမ်ရှင်အမည် (Host Name):</span><span class="line">&nbsp;${host_name}</span></div>
    <div style="height:6px"></div>
    <div class="sig-line"><span>နိုင်ငံသားစိစစ်ရေးအမှတ် (NRC No.):</span><span class="line">&nbsp;${host_nrc}</span></div>
    <div style="height:6px"></div>
    <div class="sig-line"><span>အိမ်ရှင်နေရပ်လိပ်စာ (Host Address):</span><span class="line">&nbsp;${host_address}</span></div>
    <div style="height:6px"></div>
    <div class="sig-line"><span>ဆက်သွယ်ရန်ဖုန်း (Contact Phone):</span><span class="line">&nbsp;${host_phone}</span></div>
  </div>
  <div class="sig-right">
    <div>ရပ်ကွက်အုပ်ချုပ်ရေးမှူး</div>
    <div>အမှတ် (၆) ရပ်ကွက်၊</div>
    <div>လှိုင်သာယာမြို့နယ်။</div>
    <div class="stamp-box"></div>
  </div>
</div>

</body>
</html>`;
}

// GET /print/overnight-form?rooms=uuid1,uuid2
router.get("/overnight-form", auth, async (req, res) => {
  try {
    const { rooms, from_date, to_date, form_date } = req.query;

    if (!rooms) return res.status(400).json({ error: "No rooms specified" });

    const roomIds = rooms.split(",").map(r => r.trim());

    // Get settings
    const settingsRes = await pool.query(`SELECT key, value FROM settings WHERE key IN ('host_name','host_nrc','host_address','host_phone')`);
    const settings = {};
    settingsRes.rows.forEach(r => settings[r.key] = r.value);

    const today = new Date().toISOString().slice(0, 10);
    const dateRange = {
      form_date: form_date || today,
      from_date: from_date || today,
      to_date: to_date || today,
    };

    // Generate one HTML page per room
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

      allPagesHTML += generateFormHTML(room, tenants, settings, dateRange);
    }

    // Launch Puppeteer and generate PDF
    const browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });
    const page = await browser.newPage();
    await page.setContent(allPagesHTML, { waitUntil: "domcontentloaded" });
    await new Promise(r => setTimeout(r, 2000));;
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "10mm", bottom: "10mm", left: "0mm", right: "0mm" }
    });
    console.log("PDF size:", pdf.length, "bytes"); // add this
    await browser.close();

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=overnight_form.pdf");
    res.end(pdf, 'binary');

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error", detail: err.message });
  }
});

module.exports = router;