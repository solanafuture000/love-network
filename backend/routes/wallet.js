const express = require("express");
const db = require("../database");
const authenticateToken = require("../middleware/auth");

const router = express.Router();

router.get("/", authenticateToken, (req, res) => {
  try {
    const wallet = db.prepare(`
      SELECT
        id,
        user_id,
        balance,
        total_mined,
        created_at,
        updated_at
      FROM wallets
      WHERE user_id = ?
    `).get(req.user.userId);

    if (!wallet) {
      return res.status(404).json({
        success: false,
        message: "Wallet not found"
      });
    }

    const transactions = db.prepare(`
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
      LIMIT 20
    `).all(req.user.userId);

    res.json({
      success: true,
      wallet,
      transactions
    });
  } catch (error) {
    console.error("GET /api/wallet error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to load wallet"
    });
  }
});

router.post("/deposit", authenticateToken, (req, res) => {
  try {
    const amount = Number(req.body.amount);

    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid deposit amount."
      });
    }

    const result = db.transaction(() => {
      const wallet = db.prepare(`
        SELECT balance
        FROM wallets
        WHERE user_id = ?
      `).get(req.user.userId);

      if (!wallet) {
        throw new Error("Wallet not found");
      }

      const newBalance = Number(wallet.balance) + amount;

      db.prepare(`
        UPDATE wallets
        SET balance = ?, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ?
      `).run(newBalance, req.user.userId);

      const transaction = db.prepare(`
        INSERT INTO wallet_transactions
        (
          user_id,
          type,
          amount,
          balance_after,
          description
        )
        VALUES (?, ?, ?, ?, ?)
      `).run(
        req.user.userId,
        "DEPOSIT",
        amount,
        newBalance,
        "LOVE wallet deposit"
      );

      return {
        transactionId: transaction.lastInsertRowid,
        balance: newBalance
      };
    })();

    res.json({
      success: true,
      message: "LOVE deposited successfully.",
      ...result
    });
  } catch (error) {
    console.error("POST /api/wallet/deposit error:", error);

    res.status(500).json({
      success: false,
      message: error.message || "Deposit failed."
    });
  }
});

router.post("/withdraw", authenticateToken, (req, res) => {
  try {
    const amount = Number(req.body.amount);

    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid withdrawal amount."
      });
    }

    const result = db.transaction(() => {
      const wallet = db.prepare(`
        SELECT balance
        FROM wallets
        WHERE user_id = ?
      `).get(req.user.userId);

      if (!wallet) {
        throw new Error("Wallet not found");
      }

      const currentBalance = Number(wallet.balance);

      if (amount > currentBalance) {
        throw new Error("Insufficient LOVE balance.");
      }

      const newBalance = currentBalance - amount;

      db.prepare(`
        UPDATE wallets
        SET balance = ?, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ?
      `).run(newBalance, req.user.userId);

      const transaction = db.prepare(`
        INSERT INTO wallet_transactions
        (
          user_id,
          type,
          amount,
          balance_after,
          description
        )
        VALUES (?, ?, ?, ?, ?)
      `).run(
        req.user.userId,
        "WITHDRAW",
        amount,
        newBalance,
        "LOVE wallet withdrawal"
      );

      return {
        transactionId: transaction.lastInsertRowid,
        balance: newBalance
      };
    })();

    res.json({
      success: true,
      message: "LOVE withdrawn successfully.",
      ...result
    });
  } catch (error) {
    console.error("POST /api/wallet/withdraw error:", error);

    const status =
      error.message === "Insufficient LOVE balance." ? 400 : 500;

    res.status(status).json({
      success: false,
      message: error.message || "Withdrawal failed."
    });
  }
});

module.exports = router;
