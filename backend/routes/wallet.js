const express = require("express");
const db = require("../database-pg");
const authenticateToken = require("../middleware/auth");

const router = express.Router();

router.get("/", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    const walletResult = await db.query(
      `
      SELECT
        id,
        user_id,
        balance,
        total_mined,
        created_at,
        updated_at
      FROM wallets
      WHERE user_id = $1
      LIMIT 1
      `,
      [userId]
    );

    let wallet = walletResult.rows[0] || null;

    // Create wallet automatically if it does not exist
    if (!wallet) {
      const insertResult = await db.query(
        `
        INSERT INTO wallets
          (user_id, balance, total_mined)
        VALUES
          ($1, 0, 0)
        ON CONFLICT (user_id) DO NOTHING
        RETURNING
          id,
          user_id,
          balance,
          total_mined,
          created_at,
          updated_at
        `,
        [userId]
      );

      wallet = insertResult.rows[0] || null;

      // Handle race condition / existing wallet
      if (!wallet) {
        const retryResult = await db.query(
          `
          SELECT
            id,
            user_id,
            balance,
            total_mined,
            created_at,
            updated_at
          FROM wallets
          WHERE user_id = $1
          LIMIT 1
          `,
          [userId]
        );

        wallet = retryResult.rows[0] || null;
      }
    }

    if (!wallet) {
      return res.status(404).json({
        success: false,
        message: "Wallet not found"
      });
    }

    const transactionsResult = await db.query(
      `
      SELECT
        id,
        type,
        amount,
        balance_after,
        mining_session_id,
        description,
        created_at
      FROM wallet_transactions
      WHERE user_id = $1
      ORDER BY id DESC
      LIMIT 20
      `,
      [userId]
    );

    res.json({
      success: true,
      wallet,
      transactions: transactionsResult.rows
    });
  } catch (error) {
    console.error("GET /api/wallet error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to load wallet"
    });
  }
});


router.post("/deposit", authenticateToken, async (req, res) => {
  try {
    const amount = Number(req.body.amount);

    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid deposit amount."
      });
    }

    const userId = req.user.userId;

    await db.query("BEGIN");

    const walletResult = await db.query(
      `
      SELECT balance
      FROM wallets
      WHERE user_id = $1
      FOR UPDATE
      `,
      [userId]
    );

    const wallet = walletResult.rows[0];

    if (!wallet) {
      await db.query("ROLLBACK");

      return res.status(404).json({
        success: false,
        message: "Wallet not found"
      });
    }

    const newBalance = Number(wallet.balance) + amount;

    await db.query(
      `
      UPDATE wallets
      SET
        balance = $1,
        updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $2
      `,
      [newBalance, userId]
    );

    const transactionResult = await db.query(
      `
      INSERT INTO wallet_transactions
      (
        user_id,
        type,
        amount,
        balance_after,
        description
      )
      VALUES
      ($1, $2, $3, $4, $5)
      RETURNING id
      `,
      [
        userId,
        "DEPOSIT",
        amount,
        newBalance,
        "LOVE wallet deposit"
      ]
    );

    await db.query("COMMIT");

    res.json({
      success: true,
      message: "LOVE deposited successfully.",
      transactionId: transactionResult.rows[0].id,
      balance: newBalance
    });
  } catch (error) {
    try {
      await db.query("ROLLBACK");
    } catch {}

    console.error("POST /api/wallet/deposit error:", error);

    res.status(500).json({
      success: false,
      message: error.message || "Deposit failed."
    });
  }
});


router.post("/withdraw", authenticateToken, async (req, res) => {
  try {
    const amount = Number(req.body.amount);

    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid withdrawal amount."
      });
    }

    const userId = req.user.userId;

    await db.query("BEGIN");

    const walletResult = await db.query(
      `
      SELECT balance
      FROM wallets
      WHERE user_id = $1
      FOR UPDATE
      `,
      [userId]
    );

    const wallet = walletResult.rows[0];

    if (!wallet) {
      await db.query("ROLLBACK");

      return res.status(404).json({
        success: false,
        message: "Wallet not found"
      });
    }

    const currentBalance = Number(wallet.balance);

    if (amount > currentBalance) {
      await db.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message: "Insufficient LOVE balance."
      });
    }

    const newBalance = currentBalance - amount;

    await db.query(
      `
      UPDATE wallets
      SET
        balance = $1,
        updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $2
      `,
      [newBalance, userId]
    );

    const transactionResult = await db.query(
      `
      INSERT INTO wallet_transactions
      (
        user_id,
        type,
        amount,
        balance_after,
        description
      )
      VALUES
      ($1, $2, $3, $4, $5)
      RETURNING id
      `,
      [
        userId,
        "WITHDRAW",
        amount,
        newBalance,
        "LOVE wallet withdrawal"
      ]
    );

    await db.query("COMMIT");

    res.json({
      success: true,
      message: "LOVE withdrawn successfully.",
      transactionId: transactionResult.rows[0].id,
      balance: newBalance
    });
  } catch (error) {
    try {
      await db.query("ROLLBACK");
    } catch {}

    console.error("POST /api/wallet/withdraw error:", error);

    res.status(500).json({
      success: false,
      message: error.message || "Withdrawal failed."
    });
  }
});


module.exports = router;
