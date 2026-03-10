const express = require("express");
const router = express.Router();
const pool = require("../db");
const auth = require("../middleware/auth");

// GET /settings — returns all settings as a flat object
router.get("/", auth, async (req, res) => {
  try {
    const result = await pool.query(`SELECT key, value FROM settings`);
    const settings = {};
    result.rows.forEach(r => settings[r.key] = r.value);
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /settings — update one or more keys
router.patch("/", auth, async (req, res) => {
  try {
    const updates = req.body;
    for (const [key, value] of Object.entries(updates)) {
      await pool.query(
        `INSERT INTO settings (key, value) VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = $2`,
        [key, value]
      );
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;