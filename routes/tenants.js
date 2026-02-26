const express = require("express");
const router = express.Router();
const pool = require("../db");
const auth = require("../middleware/auth");
const { v4: uuidv4 } = require("uuid");
const https = require("https");

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

// ─── TENANT ROUTES ──────────────────────────────────────────────────────────

router.get("/", auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT tenants.*, rooms.room_number
      FROM tenants
      LEFT JOIN rooms ON tenants.room_id = rooms.id
      ORDER BY tenants.name ASC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/", auth, async (req, res) => {
  if (req.user.role !== "owner") return res.status(403).json({ error: "Unauthorized" });
  const { name, phone, room_id } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO tenants (id, name, phone, room_id, is_active) VALUES ($1,$2,$3,$4,true) RETURNING *`,
      [uuidv4(), name, phone, room_id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// PATCH update tenant info
router.patch("/:id", auth, async (req, res) => {
  if (req.user.role !== "owner") return res.status(403).json({ error: "Unauthorized" });
  const { name, phone, room_id, telegram_chat_id } = req.body;
  try {
    const result = await pool.query(
      `UPDATE tenants SET name=COALESCE($1,name), phone=COALESCE($2,phone), room_id=COALESCE($3,room_id), telegram_chat_id=COALESCE($4,telegram_chat_id) WHERE id=$5 RETURNING *`,
      [name, phone, room_id, telegram_chat_id, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// DELETE (deactivate) tenant
router.delete("/:id", auth, async (req, res) => {
  if (req.user.role !== "owner") return res.status(403).json({ error: "Unauthorized" });
  try {
    await pool.query(`UPDATE tenants SET is_active=false WHERE id=$1`, [req.params.id]);
    res.json({ message: "Tenant deactivated" });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// ─── BILLING ROUTES (WITH UPSERT) ───────────────────────────────────────────

// 1. Create bill from meter readings (The "Keep Going" Fix)
router.post("/create-bill-from-meters", auth, async (req, res) => {
  if (req.user.role !== "owner") return res.status(403).json({ error: "Unauthorized" });

  const { room_number, month, elec_prev, elec_curr, water_prev, water_curr } = req.body;

  if (!room_number || !month || elec_curr === undefined || elec_prev === undefined) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    // Get room & tenant
    const roomRes = await pool.query(`SELECT * FROM rooms WHERE room_number = $1`, [room_number]);
    const room = roomRes.rows[0];
    if (!room) return res.status(404).json({ error: "Room not found" });

    const tenantRes = await pool.query(`SELECT * FROM tenants WHERE room_id = $1 AND is_active = true`, [room.id]);
    const tenant = tenantRes.rows[0];
    if (!tenant) return res.status(404).json({ error: "No active tenant in room" });

    // Calculations
    const rent = Number(room.monthly_rent);
    const elecUnits = Number(elec_curr) - Number(elec_prev);
    const waterUnits = Number(water_curr || 0) - Number(water_prev || 0);
    const elec_rate = Number(req.body.elec_rate || 400);
    const water_rate = Number(req.body.water_rate || 15);
    console.log("DEBUG rates:", elec_rate, water_rate);
    const electricity = elecUnits * elec_rate;
    const water = waterUnits * water_rate;
    const total = rent + electricity + water;

    // THE UPSERT QUERY: Handles "Already Exists" by updating instead
    const result = await pool.query(
      `INSERT INTO bills
      (id, tenant_id, month, rent, water, electricity, amount, status, elec_prev, elec_curr, water_prev, water_curr, elec_rate, water_rate)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'unpaid', $8, $9, $10, $11, $12, $13)
       ON CONFLICT (tenant_id, month) 
       DO UPDATE SET 
        elec_prev = EXCLUDED.elec_prev,
        elec_curr = EXCLUDED.elec_curr,
        water_prev = EXCLUDED.water_prev,
        water_curr = EXCLUDED.water_curr,
        electricity = EXCLUDED.electricity,
        water = EXCLUDED.water,
        amount = EXCLUDED.amount,
        elec_rate = EXCLUDED.elec_rate,
        water_rate = EXCLUDED.water_rate
       RETURNING *`,
      [uuidv4(), tenant.id, month, rent, water, electricity, total, elec_prev, elec_curr, water_prev || 0, water_curr || 0, elec_rate, water_rate]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// 2. Standard Manual Bill Create (With Upsert)
router.post("/:id/create-bill", auth, async (req, res) => {
  if (req.user.role !== "owner") return res.status(403).json({ error: "Unauthorized" });

  const tenantId = req.params.id;
  const { rent = 0, water = 0, electricity = 0, month } = req.body;
  const targetMonth = month || new Date().toISOString().slice(0, 7);
  const total = Number(rent) + Number(water) + Number(electricity);

  try {
    const result = await pool.query(
      `INSERT INTO bills (id, tenant_id, month, rent, water, electricity, amount, status, elec_prev, elec_curr, water_prev, water_curr, elec_rate, water_rate)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'unpaid', $8, $9, $10, $11, $12, $13)
       ON CONFLICT (tenant_id, month)
       DO UPDATE SET 
         rent = EXCLUDED.rent,
         water = EXCLUDED.water,
         electricity = EXCLUDED.electricity,
         amount = EXCLUDED.amount,
         elec_rate = EXCLUDED.elec_rate,
         water_rate = EXCLUDED.water_rate
       RETURNING *`,
      [uuidv4(), tenantId, targetMonth, rent, water, electricity, total, elec_prev, elec_curr, water_prev || 0, water_curr || 0, elec_rate, water_rate]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// ─── STATUS & HISTORY ───────────────────────────────────────────────────────

router.get("/:id/bills", auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM bills WHERE tenant_id = $1 ORDER BY month ASC`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

router.patch("/bills/:billId/mark-paid", auth, async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE bills SET status = 'paid', paid_at = NOW() WHERE id = $1 RETURNING *`,
      [req.params.billId]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

router.patch("/bills/:billId/mark-unpaid", auth, async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE bills SET status='unpaid', paid_at=NULL WHERE id=$1 RETURNING *`,
      [req.params.billId]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// ─── TELEGRAM ───────────────────────────────────────────────────────────────

router.post("/:id/send-bill-telegram", auth, async (req, res) => {
  if (req.user.role !== "owner") return res.status(403).json({ error: "Unauthorized" });
  try {
    const tenantRes = await pool.query(`SELECT * FROM tenants WHERE id = $1`, [req.params.id]);
    const tenant = tenantRes.rows[0];
    const billRes = await pool.query(`SELECT * FROM bills WHERE tenant_id = $1 AND month = $2`, [tenant.id, req.body.month || new Date().toISOString().slice(0, 7)]);
    const bill = billRes.rows[0];

    if (!bill || !tenant.telegram_chat_id) return res.status(400).json({ error: "Missing bill or chat_id" });

    const elecUnits = Number(bill.elec_curr) - Number(bill.elec_prev);
    const waterUnits = Number(bill.water_curr) - Number(bill.water_prev);
    const elecRate = bill.elec_rate || 400;
    const waterRate = bill.water_rate || 15;

    const message = `🏠 *Monotel Bill — ${bill.month}*\n\n` +
      `🛏 Rent: ฿${bill.rent}\n` +
      `⚡ Electricity: ${elecUnits} units × ฿${elecRate} = ฿${bill.electricity}\n` +
      `💧 Water: ${waterUnits} units × ฿${waterRate} = ฿${bill.water}\n` +
      `─────────────────\n` +
      `💰 *Total: ฿${bill.amount}*\n\n` +
      `Status: ${bill.status === 'paid' ? '✅ Paid' : '❌ Unpaid'}`;
    
    const payload = JSON.stringify({ chat_id: tenant.telegram_chat_id, text: message, parse_mode: "Markdown" });
    const options = {
      hostname: "api.telegram.org",
      path: `/bot${TELEGRAM_TOKEN}/sendMessage`,
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
    };

    const tReq = https.request(options, (tRes) => {
      tRes.on("end", () => res.json({ message: "Sent" }));
    });
    tReq.write(payload);
    tReq.end();
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// PATCH set telegram chat id
router.patch("/:id/telegram-chat-id", auth, async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE tenants SET telegram_chat_id=$1 WHERE id=$2 RETURNING *`,
      [req.body.telegram_chat_id, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;