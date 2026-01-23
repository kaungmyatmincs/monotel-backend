const bcrypt = require("bcrypt");
const { randomUUID } = require("crypto");
const pool = require("../db");

(async () => {
  const id = randomUUID();
  const name = "Owner";
  const email = "owner@monotel.com";
  const password = "admin123"; // change later
  const role = "owner";

  const passwordHash = await bcrypt.hash(password, 10);

  await pool.query(
    `INSERT INTO users (id, name, email, password_hash, role)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, name, email, passwordHash, role]
  );

  console.log("Owner user created");
  process.exit();
})();
