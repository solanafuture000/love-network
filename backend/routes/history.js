const express = require("express");
const db = require("../database");
const authenticateToken = require("../middleware/auth");

const router = express.Router();

// MINING HISTORY
router.get("/mining", authenticateToken, (req, res) => {
  try {
    const history = db
      .prepare(`
        SELECT
          id,
          started_at,
          stopped_at,
          duration_seconds,
          reward,
          status
        FROM mining_sessions
        WHERE user_id = ?
        ORDER BY id DESC
      `)
      .all(req.user.userId);

    res.json({
      success: true,
      count: history.length,
      history
    });
  } catch (error) {
    console.error("MINING HISTORY ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
});

// WALLET TRANSACTION HISTORY
router.get("/transactions", authenticateToken, (req, res) => {
  try {
    const transactions = db
      .prepare(`
        SELECT
          id,
          type,
          amount,
          balance_after,
          mining_session_id,
          description,
          created_at
        FROM wallet_transactions
        WHERE user_id = ?
        ORDER BY id DESC
      `)
      .all(req.user.userId);

    res.json({
      success: true,
      count: transactions.length,
      transactions
    });
  } catch (error) {
    console.error("TRANSACTION HISTORY ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
});

module.exports = router;
