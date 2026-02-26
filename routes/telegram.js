const express = require("express");
const router = express.Router();
const pool = require("../db");

router.post("/webhook", async (req, res) => {
  try {
    const message = req.body.message;
    if (!message) return res.sendStatus(200);

    const chatId = message.chat.id.toString();
    const text = message.text || "";

    if (text.startsWith("/start")) {
      const parts = text.split(" ");
      const roomNumber = parts[1];

      if (!roomNumber) {
        await sendMessage(chatId, "👋 Welcome to Monotel!\n\nPlease send your room number:\n/start 101");
        return res.sendStatus(200);
      }

      const roomRes = await pool.query(`SELECT * FROM rooms WHERE room_number = $1`, [roomNumber]);
      const room = roomRes.rows[0];

      if (!room) {
        await sendMessage(chatId, `❌ Room ${roomNumber} not found. Please check your room number.`);
        return res.sendStatus(200);
      }

      const tenantRes = await pool.query(
        `SELECT * FROM tenants WHERE room_id = $1 AND is_active = true`, [room.id]
      );
      const tenant = tenantRes.rows[0];

      if (!tenant) {
        await sendMessage(chatId, `❌ No active tenant found in room ${roomNumber}.`);
        return res.sendStatus(200);
      }

      await pool.query(
        `UPDATE tenants SET telegram_chat_id = $1 WHERE id = $2`,
        [chatId, tenant.id]
      );

      await sendMessage(chatId, `✅ Connected! Hi ${tenant.name}, you will now receive bills for Room ${roomNumber} here.`);
    }

    res.sendStatus(200);
  } catch (err) {
    console.error(err);
    res.sendStatus(200);
  }
});

async function sendMessage(chatId, text) {
  const https = require("https");
  const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const payload = JSON.stringify({ chat_id: chatId, text });
  const options = {
    hostname: "api.telegram.org",
    path: `/bot${TELEGRAM_TOKEN}/sendMessage`,
    method: "POST",
    headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) },
  };
  return new Promise((resolve) => {
    const req = https.request(options, (res) => {
      res.on("data", () => {});
      res.on("end", resolve);
    });
    req.write(payload);
    req.end();
  });
}

module.exports = router;