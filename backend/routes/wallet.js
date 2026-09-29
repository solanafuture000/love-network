
const express = require("express");
const db = require("../database-pg");
const authenticateToken = require("../middleware/auth");
const {
  generateWallet,
  encryptPrivateKey
} = require("../walletCrypto");

const router = express.Router();

/*
|--------------------------------------------------------------------------
| GET CURRENT WALLET
|--------------------------------------------------------------------------
| Existing wallet endpoint preserved.
*/
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


/*
|--------------------------------------------------------------------------
| GET MY WALLETS
|--------------------------------------------------------------------------
| Returns all wallets belonging to the logged-in user.
| Private keys are NEVER returned here.
*/
router.get("/list", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    const result = await db.query(
      `
      SELECT
        id,
        wallet_name,
        public_address,
        public_key,
        balance,
        total_mined,
        is_default,
        created_at,
        updated_at
      FROM user_wallets
      WHERE user_id = $1
      ORDER BY is_default DESC, id ASC
      `,
      [userId]
    );

    res.json({
      success: true,
      wallets: result.rows
    });
  } catch (error) {
    console.error("GET /api/wallet/list error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to load wallets."
    });
  }
});


/*
|--------------------------------------------------------------------------
| CREATE / ADD NEW WALLET
|--------------------------------------------------------------------------
| Generates:
| - Public key
| - LOVE address
| - Private key
|
| Private key is encrypted before being stored.
| The plain private key is returned ONLY at creation time.
*/
router.post("/create", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    let walletName =
      typeof req.body.walletName === "string"
        ? req.body.walletName.trim()
        : "";

    if (!walletName) {
      walletName = "LOVE Wallet";
    }

    if (walletName.length > 50) {
      return res.status(400).json({
        success: false,
        message: "Wallet name must be 50 characters or less."
      });
    }

    const generated = generateWallet();

    const encryptedPrivateKey = encryptPrivateKey(
      generated.privateKey
    );

    const client = await db.pool.connect();

    try {
      await client.query("BEGIN");

      const walletCountResult = await client.query(
        `
        SELECT COUNT(*)::int AS count
        FROM user_wallets
        WHERE user_id = $1
        `,
        [userId]
      );

      const walletCount =
        Number(walletCountResult.rows[0]?.count || 0);

      const isDefault = walletCount === 0;

      const insertResult = await client.query(
        `
        INSERT INTO user_wallets
        (
          user_id,
          wallet_name,
          public_address,
          public_key,
          encrypted_private_key,
          balance,
          total_mined,
          is_default
        )
        VALUES
        ($1, $2, $3, $4, $5, 0, 0, $6)
        RETURNING
          id,
          wallet_name,
          public_address,
          public_key,
          balance,
          total_mined,
          is_default,
          created_at,
          updated_at
        `,
        [
          userId,
          walletName,
          generated.publicAddress,
          generated.publicKey,
          encryptedPrivateKey,
          isDefault
        ]
      );

      await client.query("COMMIT");

      const wallet = insertResult.rows[0];

      return res.status(201).json({
        success: true,
        message: "LOVE wallet created successfully.",
        wallet,
        privateKey: generated.privateKey,
        warning:
          "Save this private key securely. It will not be shown again."
      });
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {}

      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("POST /api/wallet/create error:", error);

    res.status(500).json({
      success: false,
      message: error.message || "Failed to create wallet."
    });
  }
});


/*
|--------------------------------------------------------------------------
| DEPOSIT
|--------------------------------------------------------------------------
| Existing endpoint preserved for now.
| Direct wallet-to-wallet transfer will be added separately.
*/
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

    const client = await db.pool.connect();

    try {
      await client.query("BEGIN");

      const walletResult = await client.query(
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
        await client.query("ROLLBACK");

        return res.status(404).json({
          success: false,
          message: "Wallet not found"
        });
      }

      const newBalance =
        Number(wallet.balance) + amount;

      await client.query(
        `
        UPDATE wallets
        SET
          balance = $1,
          updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $2
        `,
        [newBalance, userId]
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

      await client.query("COMMIT");

      res.json({
        success: true,
        message: "LOVE deposited successfully.",
        transactionId: transactionResult.rows[0].id,
        balance: newBalance
      });
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {}

      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error(
      "POST /api/wallet/deposit error:",
      error
    );

    res.status(500).json({
      success: false,
      message: error.message || "Deposit failed."
    });
  }
});


/*
|--------------------------------------------------------------------------
| WITHDRAW
|--------------------------------------------------------------------------
| Existing endpoint preserved for now.
| BSC withdrawal is NOT being implemented yet.
*/
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

    const client = await db.pool.connect();

    try {
      await client.query("BEGIN");

      const walletResult = await client.query(
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
        await client.query("ROLLBACK");

        return res.status(404).json({
          success: false,
          message: "Wallet not found"
        });
      }

      const currentBalance =
        Number(wallet.balance);

      if (amount > currentBalance) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          success: false,
          message: "Insufficient LOVE balance."
        });
      }

      const newBalance =
        currentBalance - amount;

      await client.query(
        `
        UPDATE wallets
        SET
          balance = $1,
          updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $2
        `,
        [newBalance, userId]
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

      await client.query("COMMIT");

      res.json({
        success: true,
        message: "LOVE withdrawn successfully.",
        transactionId:
          transactionResult.rows[0].id,
        balance: newBalance
      });
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {}

      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error(
      "POST /api/wallet/withdraw error:",
      error
    );

    res.status(500).json({
      success: false,
      message: error.message || "Withdrawal failed."
    });
  }
});


module.exports = router;
