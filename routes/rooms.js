const express = require("express");
const router = express.Router();
const pool = require("../db");
const auth = require("../middleware/auth");
const { v4: uuidv4 } = require("uuid");

// GET all rooms (with building name)
router.get("/", auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT rooms.*, buildings.name AS building_name
      FROM rooms
      LEFT JOIN buildings ON rooms.building_id = buildings.id
      ORDER BY room_number ASC
    `);

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// CREATE room (owner only)
router.post("/", auth, async (req, res) => {
  if (req.user.role !== "owner") {
    return res.status(403).json({ error: "Only owner can create rooms" });
  }

  const { building_id, room_number, floor, monthly_rent } = req.body;

  if (!building_id || !room_number) {
    return res.status(400).json({ error: "Required fields missing" });
  }

  try {
    const result = await pool.query(
      `INSERT INTO rooms 
      (id, building_id, room_number, floor, monthly_rent, is_occupied, is_active)
      VALUES ($1,$2,$3,$4,$5,false,true)
      RETURNING *`,
      [uuidv4(), building_id, room_number, floor, monthly_rent]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// UPDATE room
router.put("/:id", auth, async (req, res) => {
  const { room_number, floor, monthly_rent, is_occupied } = req.body;

  try {
    const result = await pool.query(
      `UPDATE rooms
       SET room_number=$1, floor=$2, monthly_rent=$3, is_occupied=$4
       WHERE id=$5
       RETURNING *`,
      [room_number, floor, monthly_rent, is_occupied, req.params.id]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// TOGGLE occupied
router.patch("/:id/toggle", auth, async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE rooms
       SET is_occupied = NOT is_occupied
       WHERE id=$1
       RETURNING *`,
      [req.params.id]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// DELETE room (owner only)
router.delete("/:id", auth, async (req, res) => {
  if (req.user.role !== "owner") {
    return res.status(403).json({ error: "Only owner can delete rooms" });
  }

  try {
    await pool.query("DELETE FROM rooms WHERE id=$1", [req.params.id]);
    res.json({ message: "Room deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
