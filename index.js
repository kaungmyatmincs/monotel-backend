const express = require("express");
const app = express();

const pool = require("./db");

app.get("/", (req, res) => {
  res.json({ status: "Backend running" });
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

app.get("/db-test", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");
    res.json({
      status: "DB connected",
      time: result.rows[0],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      status: "DB error",
      error: err.message,
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
