const express = require("express");
const router = express.Router();
const pool = require("../db");
const auth = require("../middleware/auth");
const { v4: uuidv4 } = require("uuid");

// GET all buildings
router.get("/", auth, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM buildings ORDER BY created_at ASC");
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// CREATE building (owner only)
router.post("/", auth, async (req, res) => {
  if (req.user.role !== "owner") {
    return res.status(403).json({ error: "Only owner can create buildings" });
  }

  const { name } = req.body;

  if (!name) {
    return res.status(400).json({ error: "Name required" });
  }

  try {
    const result = await pool.query(
      "INSERT INTO buildings (id, name) VALUES ($1, $2) RETURNING *",
      [uuidv4(), name]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// UPDATE building name (owner only)
router.put("/:id", auth, async (req, res) => {
  if (req.user.role !== "owner") {
    return res.status(403).json({ error: "Only owner can update buildings" });
  }

  const { name } = req.body;

  try {
    const result = await pool.query(
      "UPDATE buildings SET name = $1 WHERE id = $2 RETURNING *",
      [name, req.params.id]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// DELETE building (owner only)
router.delete("/:id", auth, async (req, res) => {
  if (req.user.role !== "owner") {
    return res.status(403).json({ error: "Only owner can delete buildings" });
  }

  try {
    await pool.query("DELETE FROM buildings WHERE id = $1", [req.params.id]);
    res.json({ message: "Building deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
