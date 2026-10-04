const express = require("express");
const crypto = require("crypto");

const db = require("../database-pg");
const authenticateToken = require("../middleware/auth");

const router = express.Router();

/*
  GET /api/migration/status

  Returns:
  - KYC status
  - current mining balance
  - whether migration is available
  - last migration
*/
router.get("/status", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    const kycResult = await db.query(
      `
        SELECT status, approved_at
        FROM user_kyc
        WHERE user_id = $1
        LIMIT 1
      `,
      [userId]
    );

    const kyc = kycResult.rows[0] || null;

    const walletResult = await db.query(
      `
        SELECT id, balance, total_mined, pending_balance, migration_balance FROM wallets
        WHERE user_id = $1
        LIMIT 1
      `,
      [userId]
    );

    const miningWallet = walletResult.rows[0] || null;

    const migrationResult = await db.query(
      `
        SELECT
          id,
          amount,
          destination_address,
          transfer_reference,
          status,
          created_at,
          completed_at
        FROM mining_migrations
        WHERE user_id = $1
        ORDER BY id DESC
        LIMIT 1
      `,
      [userId]
    );

    const lastMigration = migrationResult.rows[0] || null;

    const balance = Number(miningWallet?.balance || 0);
    const pendingBalance = Number(miningWallet?.pending_balance || 0);
    const migrationBalance = Number(miningWallet?.migration_balance || 0);
    const approved = kyc?.status === "APPROVED";

    res.json({
      success: true,
      migration: {
        kyc_status: kyc?.status || "NOT_ELIGIBLE",
        approved_at: kyc?.approved_at || null,
        eligible: approved,
        balance,
        pending_balance: pendingBalance,
        migration_balance: approved ? migrationBalance : 0,
        total_mined: Number(miningWallet?.total_mined || 0),
        available_balance: approved ? migrationBalance : 0,
        last_migration: lastMigration
      }
    });
  } catch (error) {
    console.error("MIGRATION STATUS ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Unable to load migration status."
    });
  }
});


/*
  POST /api/migration

  Migrates the user's complete available mining balance
  into an existing LOVE wallet address.
*/
router.post("/", authenticateToken, async (req, res) => {
  const client = await db.pool.connect();

  try {
    const userId = req.user.userId;

    const destinationAddress = String(
      req.body?.destinationAddress || ""
    )
      .trim()
      .toUpperCase();

    if (!/^LOVE[A-Z0-9]{40}$/.test(destinationAddress)) {
      return res.status(400).json({
        success: false,
        message: "Invalid LOVE wallet address."
      });
    }

    await client.query("BEGIN");

    // Only fully approved KYC users can migrate.
    const kycResult = await client.query(
      `
        SELECT status, approved_at
        FROM user_kyc
        WHERE user_id = $1
        FOR UPDATE
      `,
      [userId]
    );

    const kyc = kycResult.rows[0] || null;

    if (!kyc || kyc.status !== "APPROVED") {
      await client.query("ROLLBACK");

      return res.status(403).json({
        success: false,
        message: "Migration is available only after KYC approval.",
        kyc_status: kyc?.status || "NOT_ELIGIBLE"
      });
    }

    // Lock the mining balance so two migration requests
    // cannot spend the same balance simultaneously.
    const sourceResult = await client.query(
      `
        SELECT id, user_id, balance, migration_balance, total_mined
        FROM wallets
        WHERE user_id = $1
        FOR UPDATE
      `,
      [userId]
    );

    const sourceWallet = sourceResult.rows[0] || null;

    if (!sourceWallet) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        success: false,
        message: "Mining wallet not found."
      });
    }

    const requestedAmount = Number(req.body?.amount || 0);
    const availableMigrationBalance = Number(
      sourceWallet.migration_balance || 0
    );

    if (
      !Number.isFinite(requestedAmount) ||
      requestedAmount <= 0
    ) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message: "Enter a valid migration amount."
      });
    }

    if (requestedAmount > availableMigrationBalance) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message: "Insufficient migration balance."
      });
    }

    const amount = Number(
      requestedAmount.toFixed(8)
    );

    // Destination must be an existing LOVE wallet.
    const destinationResult = await client.query(
      `
        SELECT
          id,
          user_id,
          public_address,
          balance
        FROM user_wallets
        WHERE public_address = $1
        FOR UPDATE
      `,
      [destinationAddress]
    );

    const destinationWallet = destinationResult.rows[0] || null;

    if (!destinationWallet) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        success: false,
        message: "Destination LOVE wallet was not found."
      });
    }

    const destinationOldBalance = Number(
      destinationWallet.balance || 0
    );

    const destinationNewBalance =
      destinationOldBalance + amount;

    const transferReference =
      `LOVE-MIG-${Date.now()}-${crypto
        .randomBytes(6)
        .toString("hex")
        .toUpperCase()}`;

    // Remove the available mining balance.
    await client.query(
      `
        UPDATE wallets
        SET
          balance = balance - $1,
          migration_balance = migration_balance - $1,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `,
      [amount, sourceWallet.id]
    );

    // Keep total_mined unchanged because it represents
    // the user's lifetime mined amount.
    await client.query(
      `
        UPDATE user_wallets
        SET balance = balance + $1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `,
      [amount, destinationWallet.id]
    );

    // Create migration record.
    const migrationResult = await client.query(
      `
        INSERT INTO mining_migrations (
          user_id,
          source_wallet_id,
          destination_wallet_id,
          destination_address,
          amount,
          transfer_reference,
          status,
          completed_at
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          'COMPLETED',
          CURRENT_TIMESTAMP
        )
        RETURNING
          id,
          amount,
          destination_address,
          transfer_reference,
          status,
          created_at,
          completed_at
      `,
      [
        userId,
        sourceWallet.id,
        destinationWallet.id,
        destinationAddress,
        amount,
        transferReference
      ]
    );

    // Add migration transaction to the destination wallet history.
    const transactionResult = await client.query(
      `
        INSERT INTO wallet_transactions (
          user_id,
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
        )
        VALUES (
          $1,
          'MIGRATION',
          $2,
          $3,
          $4,
          CURRENT_TIMESTAMP,
          $5,
          NULL,
          $6,
          0,
          'COMPLETED'
        )
        RETURNING id
      `,
      [
        userId,
        amount,
        destinationNewBalance,
        "Mining balance migrated after KYC approval.",
        destinationWallet.id,
        transferReference
      ]
    );

    await client.query("COMMIT");

    res.json({
      success: true,
      message: "Mining balance migrated successfully.",
      migration: {
        id: migrationResult.rows[0].id,
        amount: Number(migrationResult.rows[0].amount),
        destinationAddress:
          migrationResult.rows[0].destination_address,
        transferReference:
          migrationResult.rows[0].transfer_reference,
        status: migrationResult.rows[0].status,
        transactionId: transactionResult.rows[0].id,
        sourceMiningBalance: Number(
          (
            Number(sourceWallet.balance) - amount
          ).toFixed(8)
        ),
        destinationWalletBalance: destinationNewBalance,
        completedAt: migrationResult.rows[0].completed_at
      }
    });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error(
        "MIGRATION ROLLBACK ERROR:",
        rollbackError
      );
    }

    console.error("MIGRATION ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Migration failed. No balance was transferred."
    });
  } finally {
    client.release();
  }
});

module.exports = router;
