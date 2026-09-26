const express = require("express");
const db = require("../database-pg");
const authenticateToken = require("../middleware/auth");

const router = express.Router();

router.get("/", authenticateToken, async (req, res) => {
  try {
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
      `,
      [req.user.userId]
    );

    const wallet = walletResult.rows[0];

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
      [req.user.userId]
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
  const client = await db.pool.connect();

  try {
    const amount = Number(req.body.amount);

    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid deposit amount."
      });
    }

    await client.query("BEGIN");

    const walletResult = await client.query(
      `
      SELECT balance
      FROM wallets
      WHERE user_id = $1
      FOR UPDATE
      `,
      [req.user.userId]
    );

    const wallet = walletResult.rows[0];

    if (!wallet) {
      throw new Error("Wallet not found");
    }

    const newBalance = Number(wallet.balance) + amount;

    await client.query(
      `
      UPDATE wallets
      SET balance = $1,
          updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $2
      `,
      [newBalance, req.user.userId]
    );

    const transactionResult = await client.query(
      `
      INSERT INTO wallet_transactions
      (
        user_id,
        type,
        amount,
        balance_after,
        description
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id
      `,
      [
        req.user.userId,
        "DEPOSIT",
        amount,
        newBalance,
        "LOVE wallet deposit"
      ]
    );

    await client.query("COMMIT");

    res.json({
      success: true,
      message: "LOVE deposited successfully.",
      transactionId: transactionResult.rows[0].id,
      balance: newBalance
    });
  } catch (error) {
    await client.query("ROLLBACK");

    console.error("POST /api/wallet/deposit error:", error);

    res.status(500).json({
      success: false,
      message: error.message || "Deposit failed."
    });
  } finally {
    client.release();
  }
});

router.post("/withdraw", authenticateToken, async (req, res) => {
  const client = await db.pool.connect();

  try {
    const amount = Number(req.body.amount);

    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid withdrawal amount."
      });
    }

    await client.query("BEGIN");

    const walletResult = await client.query(
      `
      SELECT balance
      FROM wallets
      WHERE user_id = $1
      FOR UPDATE
      `,
      [req.user.userId]
    );

    const wallet = walletResult.rows[0];

    if (!wallet) {
      throw new Error("Wallet not found");
    }

    const currentBalance = Number(wallet.balance);

    if (amount > currentBalance) {
      throw new Error("Insufficient LOVE balance.");
    }

    const newBalance = currentBalance - amount;

    await client.query(
      `
      UPDATE wallets
      SET balance = $1,
          updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $2
      `,
      [newBalance, req.user.userId]
    );

    const transactionResult = await client.query(
      `
      INSERT INTO wallet_transactions
      (
        user_id,
        type,
        amount,
        balance_after,
        description
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id
      `,
      [
        req.user.userId,
        "WITHDRAW",
        amount,
        newBalance,
        "LOVE wallet withdrawal"
      ]
    );

    await client.query("COMMIT");

    res.json({
      success: true,
      message: "LOVE withdrawn successfully.",
      transactionId: transactionResult.rows[0].id,
      balance: newBalance
    });
  } catch (error) {
    await client.query("ROLLBACK");

    console.error("POST /api/wallet/withdraw error:", error);

    const status =
      error.message === "Insufficient LOVE balance." ? 400 : 500;

    res.status(status).json({
      success: false,
      message: error.message || "Withdrawal failed."
    });
  } finally {
    client.release();
  }
});

module.exports = router;
