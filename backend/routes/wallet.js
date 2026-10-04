const express = require("express");
const crypto = require("crypto");
const db = require("../database-pg");
const authenticateToken = require("../middleware/auth");
const {
  generateWallet,
  deriveWalletFromPrivateKey,
  encryptPrivateKey
} = require("../walletCrypto");

const router = express.Router();

/*
|--------------------------------------------------------------------------
| GET CURRENT LEGACY WALLET
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
        wallet_id,
        counterparty_wallet_id,
        transfer_reference,
        fee,
        status,
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
| Private keys are NEVER returned.
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
| LOVE â†’ LOVE TRANSFER
|--------------------------------------------------------------------------
| Direct wallet-to-wallet transfer.
|
| Sender:
|   balance decreases
|
| Receiver:
|   balance increases
|
| No admin approval.
| PostgreSQL transaction + row locks protect the balances.
*/
router.post("/transfer", authenticateToken, async (req, res) => {
  const senderUserId = Number(req.user.userId);

  try {
    const receiverAddress =
      typeof req.body.receiverAddress === "string"
        ? req.body.receiverAddress.trim().toUpperCase()
        : "";

    const amount = Number(req.body.amount);
    const walletId = Number(req.body.walletId);

    if (!Number.isInteger(walletId) || walletId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Valid sender wallet is required."
      });
    }

    if (!receiverAddress) {
      return res.status(400).json({
        success: false,
        message: "Receiver wallet address is required."
      });
    }

    if (
      !receiverAddress.startsWith("LOVE") ||
      receiverAddress.length !== 44
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid LOVE wallet address."
      });
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid LOVE amount."
      });
    }

    if (amount > 100000000) {
      return res.status(400).json({
        success: false,
        message: "Transfer amount is too large."
      });
    }

    const client = await db.pool.connect();

    try {
      await client.query("BEGIN");

      /*
      |--------------------------------------------------------------------------
      | Find current unlocked sender wallet
      |--------------------------------------------------------------------------
      */
      const senderResult = await client.query(
        `
        SELECT
          id,
          user_id,
          wallet_name,
          public_address,
          balance
        FROM user_wallets
        WHERE id = $1
          AND user_id = $2
        LIMIT 1
        `,
        [walletId, senderUserId]
      );

      const senderWallet = senderResult.rows[0];

      if (!senderWallet) {
        await client.query("ROLLBACK");

        return res.status(404).json({
          success: false,
          message: "Sender wallet not found."
        });
      }

      /*
      |--------------------------------------------------------------------------
      | Find receiver wallet
      |--------------------------------------------------------------------------
      */
      const receiverResult = await client.query(
        `
        SELECT
          id,
          user_id,
          wallet_name,
          public_address,
          balance
        FROM user_wallets
        WHERE public_address = $1
        LIMIT 1
        `,
        [receiverAddress]
      );

      const receiverWallet = receiverResult.rows[0];

      if (!receiverWallet) {
        await client.query("ROLLBACK");

        return res.status(404).json({
          success: false,
          message: "Receiver LOVE wallet not found."
        });
      }

      /*
      |--------------------------------------------------------------------------
      | Prevent self transfer
      |--------------------------------------------------------------------------
      */
      if (
        Number(receiverWallet.id) ===
        Number(senderWallet.id)
      ) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          success: false,
          message: "You cannot transfer LOVE to the same wallet."
        });
      }

      /*
      |--------------------------------------------------------------------------
      | Lock both wallet rows in deterministic order
      |--------------------------------------------------------------------------
      | This reduces deadlock risk when two transfers happen simultaneously.
      */
      const firstWalletId = Math.min(
        Number(senderWallet.id),
        Number(receiverWallet.id)
      );

      const secondWalletId = Math.max(
        Number(senderWallet.id),
        Number(receiverWallet.id)
      );

      const lockedResult = await client.query(
        `
        SELECT
          id,
          user_id,
          wallet_name,
          public_address,
          balance
        FROM user_wallets
        WHERE id IN ($1, $2)
        ORDER BY id
        FOR UPDATE
        `,
        [firstWalletId, secondWalletId]
      );

      const lockedWallets = lockedResult.rows;

      const lockedSender = lockedWallets.find(
        (wallet) =>
          Number(wallet.id) === Number(senderWallet.id)
      );

      const lockedReceiver = lockedWallets.find(
        (wallet) =>
          Number(wallet.id) === Number(receiverWallet.id)
      );

      if (!lockedSender || !lockedReceiver) {
        await client.query("ROLLBACK");

        return res.status(500).json({
          success: false,
          message: "Unable to lock transfer wallets."
        });
      }

      const senderBalance = Number(lockedSender.balance);
      const receiverBalance = Number(lockedReceiver.balance);

      /*
      |--------------------------------------------------------------------------
      | Balance check
      |--------------------------------------------------------------------------
      */
      if (amount > senderBalance) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          success: false,
          message: "Insufficient LOVE balance.",
          balance: senderBalance
        });
      }

      const senderNewBalance =
        senderBalance - amount;

      const receiverNewBalance =
        receiverBalance + amount;

      /*
      |--------------------------------------------------------------------------
      | Update sender
      |--------------------------------------------------------------------------
      */
      await client.query(
        `
        UPDATE user_wallets
        SET
          balance = $1,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        `,
        [
          senderNewBalance,
          senderWallet.id
        ]
      );

      /*
      |--------------------------------------------------------------------------
      | Update receiver
      |--------------------------------------------------------------------------
      */
      await client.query(
        `
        UPDATE user_wallets
        SET
          balance = $1,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        `,
        [
          receiverNewBalance,
          receiverWallet.id
        ]
      );

      /*
      |--------------------------------------------------------------------------
      | Unique transfer reference
      |--------------------------------------------------------------------------
      */
      const transferReference =
        `LOVE-${Date.now()}-${crypto.randomBytes(6).toString("hex").toUpperCase()}`;

      /*
      |--------------------------------------------------------------------------
      | Sender transaction
      |--------------------------------------------------------------------------
      */
      const senderTransaction = await client.query(
        `
        INSERT INTO wallet_transactions
        (
          user_id,
          type,
          amount,
          balance_after,
          description,
          wallet_id,
          counterparty_wallet_id,
          transfer_reference,
          fee,
          status
        )
        VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8, 0, 'COMPLETED')
        RETURNING id
        `,
        [
          senderUserId,
          "TRANSFER_OUT",
          amount,
          senderNewBalance,
          `LOVE transfer to ${receiverWallet.public_address}`,
          senderWallet.id,
          receiverWallet.id,
          transferReference
        ]
      );

      /*
      |--------------------------------------------------------------------------
      | Receiver transaction
      |--------------------------------------------------------------------------
      */
      await client.query(
        `
        INSERT INTO wallet_transactions
        (
          user_id,
          type,
          amount,
          balance_after,
          description,
          wallet_id,
          counterparty_wallet_id,
          transfer_reference,
          fee,
          status
        )
        VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8, 0, 'COMPLETED')
        `,
        [
          Number(receiverWallet.user_id),
          "TRANSFER_IN",
          amount,
          receiverNewBalance,
          `LOVE received from ${senderWallet.public_address}`,
          receiverWallet.id,
          senderWallet.id,
          transferReference
        ]
      );

      await client.query("COMMIT");

      return res.json({
        success: true,
        message: "LOVE transferred successfully.",
        transfer: {
          reference: transferReference,
          amount,
          fee: 0,
          senderWallet: senderWallet.public_address,
          receiverWallet: receiverWallet.public_address,
          senderBalance: senderNewBalance,
          receiverBalance: receiverNewBalance,
          transactionId: senderTransaction.rows[0].id,
          status: "COMPLETED"
        }
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
      "POST /api/wallet/transfer error:",
      error
    );

    res.status(500).json({
      success: false,
      message: error.message || "LOVE transfer failed."
    });
  }
});


/*
|--------------------------------------------------------------------------
| DEPOSIT
|--------------------------------------------------------------------------
| Existing endpoint preserved for now.
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
| BSC withdrawal is NOT implemented yet.
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




/*
|--------------------------------------------------------------------------
| UNLOCK EXISTING WALLET
|--------------------------------------------------------------------------
*/
router.get("/:walletId/transactions", authenticateToken, async (req, res) => {
  try {
    const userId = Number(req.user.userId);
    const walletId = Number(req.params.walletId);

    if (!Number.isInteger(walletId) || walletId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Valid wallet ID is required."
      });
    }

    const walletResult = await db.query(
      `
        SELECT id
        FROM user_wallets
        WHERE id = $1
          AND user_id = $2
        LIMIT 1
      `,
      [walletId, userId]
    );

    if (!walletResult.rows[0]) {
      return res.status(404).json({
        success: false,
        message: "Wallet not found."
      });
    }

    const result = await db.query(
      `
        SELECT
          id,
          type,
          amount,
          balance_after,
          description,
          created_at,
          wallet_id,
          counterparty_wallet_id,
          transfer_reference,
          fee,
          status
        FROM wallet_transactions
        WHERE wallet_id = $1
        ORDER BY id DESC
        LIMIT 50
      `,
      [walletId]
    );

    return res.json({
      success: true,
      walletId,
      count: result.rows.length,
      transactions: result.rows
    });
  } catch (error) {
    console.error("GET WALLET TRANSACTIONS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load wallet transactions."
    });
  }
});
router.post("/unlock", authenticateToken, async (req, res) => {
  try {
    const userId = Number(req.user.userId);

    const walletId = Number(req.body.walletId);

    const privateKey =
      typeof req.body.privateKey === "string"
        ? req.body.privateKey.trim()
        : "";

    if (!Number.isInteger(walletId) || walletId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Valid wallet ID is required."
      });
    }

    if (!privateKey) {
      return res.status(400).json({
        success: false,
        message: "Private key is required."
      });
    }

    const walletResult = await db.query(
      `
      SELECT
        id,
        user_id,
        wallet_name,
        public_address,
        public_key,
        balance,
        total_mined,
        is_default,
        created_at,
        updated_at
      FROM user_wallets
      WHERE id = $1
        AND user_id = $2
      LIMIT 1
      `,
      [walletId, userId]
    );

    const wallet = walletResult.rows[0];

    if (!wallet) {
      return res.status(404).json({
        success: false,
        message: "Wallet not found."
      });
    }

    let derivedWallet;

    try {
      derivedWallet =
        deriveWalletFromPrivateKey(privateKey);
    } catch {
      return res.status(401).json({
        success: false,
        message: "Invalid private key."
      });
    }

    const publicKeyMatches =
      derivedWallet.publicKey === wallet.public_key;

    const addressMatches =
      derivedWallet.publicAddress === wallet.public_address;

    if (!publicKeyMatches || !addressMatches) {
      return res.status(401).json({
        success: false,
        message: "Private key does not belong to this wallet."
      });
    }

    return res.json({
      success: true,
      message: "Wallet unlocked successfully.",
      wallet
    });
  } catch (error) {
    console.error(
      "POST /api/wallet/unlock error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to unlock wallet."
    });
  }
});

module.exports = router;

