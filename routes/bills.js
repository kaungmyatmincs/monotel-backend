const express = require("express");
const router = express.Router();
const pool = require("../db");
const auth = require("../middleware/auth");

// GET /bills/room/:roomId — get all bills for a room (via tenant)
router.get("/room/:roomId", auth, async (req, res) => {
  try {
    const { roomId } = req.params;
    const result = await pool.query(
      `SELECT b.*, t.name as tenant_name
       FROM bills b
       JOIN tenants t ON b.tenant_id = t.id
       WHERE t.room_id = $1
       ORDER BY b.created_at DESC`,
      [roomId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET /bills/:id — get single bill
router.get("/:id", auth, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT b.*, t.name as tenant_name, t.room_id,
              r.room_number, r.monthly_rent
       FROM bills b
       JOIN tenants t ON b.tenant_id = t.id
       JOIN rooms r ON t.room_id = r.id
       WHERE b.id = $1`,
      [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Bill not found" });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// POST /bills — create a new bill
// Body: { tenant_id, month, elec_prev, elec_curr, elec_rate,
//          water_prev, water_curr, water_rate, extra_charges }
// extra_charges: [{ label: "Light bulb change", amount: 500 }, ...]
router.post("/", auth, async (req, res) => {
  try {
    const {
      tenant_id,
      month,
      elec_prev,
      elec_curr,
      elec_rate,
      water_prev,
      water_curr,
      water_rate,
      extra_charges = [],
    } = req.body;

    // Get room rent
    const tenantRes = await pool.query(
      `SELECT t.*, r.monthly_rent FROM tenants t JOIN rooms r ON t.room_id = r.id WHERE t.id = $1`,
      [tenant_id]
    );
    if (tenantRes.rows.length === 0) return res.status(404).json({ error: "Tenant not found" });
    const tenant = tenantRes.rows[0];

    const rent = parseFloat(tenant.monthly_rent) || 0;
    const electricity = (elec_curr - elec_prev) * elec_rate;
    const water = (water_curr - water_prev) * water_rate;
    const extraTotal = extra_charges.reduce((sum, c) => sum + parseFloat(c.amount || 0), 0);
    const amount = rent + electricity + water + extraTotal;

    const id = require("crypto").randomUUID();
    const result = await pool.query(
      `INSERT INTO bills
        (id, tenant_id, month, rent, electricity, water,
         elec_prev, elec_curr, elec_rate,
         water_prev, water_curr, water_rate,
         extra_charges, amount, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'unpaid')
       RETURNING *`,
      [
        id, tenant_id, month, rent, electricity, water,
        elec_prev, elec_curr, elec_rate,
        water_prev, water_curr, water_rate,
        JSON.stringify(extra_charges), amount,
      ]
    );

    // Send Telegram if tenant has chat_id
    if (tenant.telegram_chat_id) {
      await sendTelegramBill(tenant, result.rows[0], rent, electricity, water, extra_charges, amount);
    }

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    if (err.constraint === "unique_tenant_month") {
      return res.status(409).json({ error: "Bill for this tenant and month already exists" });
    }
    res.status(500).json({ error: err.message });
  }
});

// PATCH /bills/:id/pay — mark bill as paid
router.patch("/:id/pay", auth, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `UPDATE bills SET status = 'paid', paid_at = now() WHERE id = $1 RETURNING *`,
      [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Bill not found" });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /bills/:id
router.delete("/:id", auth, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query(`DELETE FROM bills WHERE id = $1`, [id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ── Telegram helper ──────────────────────────────────────────────────────────
async function sendTelegramBill(tenant, bill, rent, electricity, water, extraCharges, total) {
  const https = require("https");
  const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

  const elecUnits = bill.elec_curr - bill.elec_prev;
  const waterUnits = bill.water_curr - bill.water_prev;

  let extraLines = "";
  if (extraCharges && extraCharges.length > 0) {
    extraLines = extraCharges
      .map((c) => `  • ${c.label}: ${Number(c.amount).toLocaleString()} ks`)
      .join("\n");
    extraLines = `\n➕ Extra Charges:\n${extraLines}`;
  }

  const text =
    `🧾 *Bill for ${bill.month}*\n` +
    `Room: ${tenant.room_id}\n` +
    `Tenant: ${tenant.name}\n\n` +
    `🏠 Rent: ${Number(rent).toLocaleString()} ks\n` +
    `⚡ Electricity (${elecUnits} units × ${bill.elec_rate} ks): ${Number(electricity).toLocaleString()} ks\n` +
    `💧 Water (${waterUnits} units × ${bill.water_rate} ks): ${Number(water).toLocaleString()} ks` +
    extraLines +
    `\n\n💰 *Total: ${Number(total).toLocaleString()} ks*\n` +
    `Status: ${bill.status === "paid" ? "✅ Paid" : "⏳ Unpaid"}`;

  const payload = JSON.stringify({
    chat_id: tenant.telegram_chat_id,
    text,
    parse_mode: "Markdown",
  });

  const options = {
    hostname: "api.telegram.org",
    path: `/bot${TELEGRAM_TOKEN}/sendMessage`,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(payload),
    },
  };

  return new Promise((resolve) => {
    const req = https.request(options, (res) => {
      res.on("data", () => {});
      res.on("end", resolve);
    });
    req.on("error", console.error);
    req.write(payload);
    req.end();
  });
}

module.exports = router;