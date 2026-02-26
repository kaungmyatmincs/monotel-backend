const express = require("express");
const router = express.Router();
const pool = require("../db");
const auth = require("../middleware/auth");

// GET dashboard summary
router.get("/", auth, async (req, res) => {
  try {
    const revenueRes = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total_collected FROM bills WHERE status = 'paid'`
    );
    const unpaidRes = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total_unpaid FROM bills WHERE status = 'unpaid'`
    );
    const tenantRes = await pool.query(
      `SELECT COUNT(*) AS total_tenants FROM tenants WHERE is_active = true`
    );
    const roomRes = await pool.query(
      `SELECT COUNT(*) AS total_rooms,
              SUM(CASE WHEN is_occupied THEN 1 ELSE 0 END) AS occupied_rooms
       FROM rooms`
    );
    const paidMonthlyRes = await pool.query(
      `SELECT month, SUM(amount) AS revenue
       FROM bills WHERE status = 'paid'
       GROUP BY month ORDER BY month ASC`
    );
    const allMonthlyRes = await pool.query(
      `SELECT month, SUM(amount) AS revenue
       FROM bills
       GROUP BY month ORDER BY month ASC`
    );
    const unpaidBillsRes = await pool.query(
      `SELECT bills.id, bills.month, bills.amount, tenants.name AS tenant_name
       FROM bills
       JOIN tenants ON bills.tenant_id = tenants.id
       WHERE bills.status = 'unpaid'
       ORDER BY bills.month ASC`
    );
    const totalBillsRes = await pool.query(`SELECT COUNT(*) AS total FROM bills`);
    const paidBillsRes = await pool.query(`SELECT COUNT(*) AS paid FROM bills WHERE status = 'paid'`);

    res.json({
      total_collected: revenueRes.rows[0].total_collected,
      total_unpaid: unpaidRes.rows[0].total_unpaid,
      total_tenants: tenantRes.rows[0].total_tenants,
      total_rooms: roomRes.rows[0].total_rooms,
      occupied_rooms: roomRes.rows[0].occupied_rooms,
      monthly_revenue: paidMonthlyRes.rows,
      all_monthly_revenue: allMonthlyRes.rows,
      unpaid_bills: unpaidBillsRes.rows,
      total_bills: totalBillsRes.rows[0].total,
      paid_bills: paidBillsRes.rows[0].paid,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;