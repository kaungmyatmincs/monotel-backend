const express = require("express");
const router = express.Router();
const pool = require("../db");
const auth = require("../middleware/auth");
const { v4: uuidv4 } = require("uuid");

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

  // Get current month in YYYY-MM format
  const now = new Date();
  const month = now.toISOString().slice(0, 7);

  try {
    const result = await pool.query(
      `SELECT rent, water, electricity, amount AS total, status, paid_at, month
       FROM bills
       WHERE tenant_id = $1 AND month = $2`,
      [tenantId, month]
    );

    if (result.rows.length === 0) {
      return res.json(null);
    }

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
      `UPDATE bills
       SET status = 'paid',
           paid_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [req.params.billId]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
