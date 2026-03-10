require('dotenv').config();
const pool = require("./db");

async function seed() {
  await pool.query(`UPDATE settings SET value = $1 WHERE key = 'ward_number'`, ['၆']);
  await pool.query(`UPDATE settings SET value = $1 WHERE key = 'street_name'`, ['သီရိ']);
  console.log("done");
  process.exit();
}

seed();