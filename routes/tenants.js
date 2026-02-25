const express = require("express");
const router = express.Router();
const pool = require("../db");
const auth = require("../middleware/auth");
const { v4: uuidv4 } = require("uuid");
const https = require("https");

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

// ─── EXISTING ROUTES (unchanged) ────────────────────────────────────────────

// GET all tenants
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

// CREATE tenant (owner only)
router.post("/", auth, async (req, res) => {
  if (req.user.role !== "owner") {
    return res.status(403).json({ error: "Only owner can create tenants" });
  }

  const { name, phone, room_id } = req.body;

  if (!name || !room_id) {
    return res.status(400).json({ error: "Name and room required" });
  }

  try {
    const result = await pool.query(
      `INSERT INTO tenants (id, name, phone, room_id, is_active)
       VALUES ($1,$2,$3,$4,true)
       RETURNING *`,
      [uuidv4(), name, phone, room_id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// GET single tenant
router.get("/:id", auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM tenants WHERE id=$1`,
      [req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// DELETE tenant (owner only)
router.delete("/:id", auth, async (req, res) => {
  if (req.user.role !== "owner") {
    return res.status(403).json({ error: "Only owner can delete tenants" });
  }

  try {
    await pool.query("DELETE FROM tenants WHERE id=$1", [req.params.id]);
    res.json({ message: "Tenant deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// GET current month bill for tenant
router.get("/:id/current-bill", auth, async (req, res) => {
  const tenantId = req.params.id;
  const now = new Date();
  const month = now.toISOString().slice(0, 7);

  try {
    const result = await pool.query(
      `SELECT id, rent, water, electricity, amount AS total, status, paid_at, month
       FROM bills
       WHERE tenant_id = $1 AND month = $2`,
      [tenantId, month]
    );

    if (result.rows.length === 0) return res.json(null);
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// CREATE bill for current month
router.post("/:id/create-bill", auth, async (req, res) => {
  if (req.user.role !== "owner") {
    return res.status(403).json({ error: "Only owner can create bills" });
  }

  const tenantId = req.params.id;
  const { rent = 0, water = 0, electricity = 0 } = req.body;
  const now = new Date();
  const month = now.toISOString().slice(0, 7);
  const total = Number(rent) + Number(water) + Number(electricity);

  try {
    const result = await pool.query(
      `INSERT INTO bills
       (id, tenant_id, month, rent, water, electricity, amount, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'unpaid')
       RETURNING *`,
      [require("uuid").v4(), tenantId, month, rent, water, electricity, total]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === "23505") {
      return res.status(400).json({ error: "Bill already exists for this month" });
    }
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// MARK bill as paid
router.patch("/bills/:billId/mark-paid", auth, async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE bills SET status = 'paid', paid_at = NOW() WHERE id = $1 RETURNING *`,
      [req.params.billId]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// GET all bills for tenant (history)
router.get("/:id/bills", auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, month, rent, water, electricity, amount AS total, status, paid_at
       FROM bills
       WHERE tenant_id = $1
       ORDER BY month ASC`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// MARK bill as unpaid
router.patch("/bills/:billId/mark-unpaid", auth, async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE bills SET status = 'unpaid', paid_at = NULL WHERE id = $1 RETURNING *`,
      [req.params.billId]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── NEW: TELEGRAM ROUTES ────────────────────────────────────────────────────

// SAVE telegram chat_id for a tenant
router.patch("/:id/telegram-chat-id", auth, async (req, res) => {
  if (req.user.role !== "owner") {
    return res.status(403).json({ error: "Only owner can update tenant" });
  }

  const { chat_id } = req.body;

  if (!chat_id) {
    return res.status(400).json({ error: "chat_id required" });
  }

  try {
    const result = await pool.query(
      `UPDATE tenants SET telegram_chat_id = $1 WHERE id = $2 RETURNING *`,
      [chat_id, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// SEND bill via Telegram
router.post("/:id/send-bill-telegram", auth, async (req, res) => {
  if (req.user.role !== "owner") {
    return res.status(403).json({ error: "Only owner can send bills" });
  }

  try {
    // Get tenant
    const tenantResult = await pool.query(
      `SELECT * FROM tenants WHERE id = $1`,
      [req.params.id]
    );
    const tenant = tenantResult.rows[0];

    if (!tenant) return res.status(404).json({ error: "Tenant not found" });
    if (!tenant.telegram_chat_id) {
      return res.status(400).json({ error: "Tenant has no Telegram chat_id saved" });
    }

    // Get current month bill
    const now = new Date();
    const month = req.body.month || now.toISOString().slice(0, 7);

    const billResult = await pool.query(
      `SELECT * FROM bills WHERE tenant_id = $1 AND month = $2`,
      [req.params.id, month]
    );
    const bill = billResult.rows[0];

    if (!bill) return res.status(404).json({ error: "No bill found for this month" });

    // Build message
    const message =
      `🏠 *Monotel - Bill for ${bill.month}*\n` +
      `👤 Tenant: ${tenant.name}\n` +
      `─────────────────\n` +
      `🛏 Rent:        ฿${bill.rent}\n` +
      `💧 Water:       ฿${bill.water}\n` +
      `⚡ Electricity: ฿${bill.electricity}\n` +
      `─────────────────\n` +
      `💰 *Total: ฿${bill.amount}*\n` +
      `📌 Status: ${bill.status}`;

    // Send to Telegram
    const payload = JSON.stringify({
      chat_id: tenant.telegram_chat_id,
      text: message,
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

    const telegramReq = https.request(options, (telegramRes) => {
      let data = "";
      telegramRes.on("data", (chunk) => (data += chunk));
      telegramRes.on("end", () => {
        const parsed = JSON.parse(data);
        if (parsed.ok) {
          res.json({ message: "Bill sent via Telegram" });
        } else {
          res.status(500).json({ error: "Telegram error", detail: parsed });
        }
      });
    });

    telegramReq.on("error", (e) => {
      console.error(e);
      res.status(500).json({ error: "Failed to reach Telegram" });
    });

    telegramReq.write(payload);
    telegramReq.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;