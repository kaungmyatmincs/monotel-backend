console.log("STARTING APP");

require("dotenv").config();

const cors = require("cors");

const express = require("express");
const app = express();
app.use(cors());
app.use(express.json());

const pool = require("./db");

const jwt = require("jsonwebtoken");

const bcrypt = require("bcrypt");

const auth = require("./middleware/auth");

const buildingsRoutes = require("./routes/buildings");

const roomsRoutes = require("./routes/rooms");

const tenantsRoutes = require("./routes/tenants");

const dashboardRoutes = require("./routes/dashboard");

const telegramRoutes = require("./routes/telegram");

const printRoutes = require("./routes/print");

const settingsRoutes = require("./routes/settings");

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

app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password required" });
  }

  try {
    const result = await pool.query(
      "SELECT * FROM users WHERE email = $1",
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password_hash);

    if (!match) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        role: user.role
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/protected", auth, (req, res) => {
  res.json({
    message: "Access granted",
    user: req.user
  });
});

app.use("/buildings", buildingsRoutes);

app.use("/rooms", roomsRoutes);

app.use("/tenants", tenantsRoutes);

app.use("/dashboard", dashboardRoutes);

app.use("/telegram", telegramRoutes);

app.use("/print", printRoutes);

app.use("/settings", settingsRoutes);

console.log("ABOUT TO LISTEN");

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
