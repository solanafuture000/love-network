const express = require("express");
const db = require("../database-pg");
const authenticateToken = require("../middleware/auth");
const requireAdmin = require("../middleware/admin");

const router = express.Router();

router.use(authenticateToken, requireAdmin);

// GET PENDING KYC
router.get("/kyc", async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        k.id,
        k.user_id,
        u.username,
        u.email,
        k.status,
        k.eligible_at,
        k.submitted_at,
        k.approved_at,
        k.rejection_reason
      FROM user_kyc k
      JOIN users u ON u.id = k.user_id
      WHERE k.status = 'PENDING'
      ORDER BY k.submitted_at ASC
    `);

    res.json({
      success: true,
      count: result.rows.length,
      submissions: result.rows
    });
  } catch (error) {
    console.error("ADMIN KYC LIST ERROR:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
});

// APPROVE KYC
router.post("/kyc/:userId/approve", async (req, res) => {
  const client = await db.pool.connect();

  try {
    const userId = Number(req.params.userId);

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID"
      });
    }

    await client.query("BEGIN");

    const kycResult = await client.query(`
      SELECT id, status
      FROM user_kyc
      WHERE user_id = $1
      FOR UPDATE
    `, [userId]);

    const kyc = kycResult.rows[0] || null;

    if (!kyc) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "KYC record not found"
      });
    }

    if (kyc.status !== "PENDING") {
      await client.query("ROLLBACK");
      return res.status(409).json({
        success: false,
        message: "KYC is not pending"
      });
    }

    await client.query(`
      UPDATE user_kyc
      SET
        status = 'APPROVED',
        approved_at = CURRENT_TIMESTAMP,
        rejection_reason = NULL,
        updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $1
    `, [userId]);

    await client.query(`
      UPDATE users
      SET kyc_status = 'APPROVED'
      WHERE id = $1
    `, [userId]);

    await client.query(`
      UPDATE referrals
      SET
        status = 'ACTIVE',
        reward_rate = 0.10,
        updated_at = CURRENT_TIMESTAMP
      WHERE referred_user_id = $1
        AND status = 'PENDING_KYC'
    `, [userId]);

    const pendingResult = await client.query(`
      SELECT
        id,
        referrer_user_id,
        referred_user_id,
        amount,
        source_mining_session_id
      FROM referral_rewards
      WHERE referred_user_id = $1
        AND status = 'PENDING'
      ORDER BY id ASC
      FOR UPDATE
    `, [userId]);

    const affectedReferrers = new Set();

    for (const reward of pendingResult.rows) {
      const amount = Number(
        Number(reward.amount || 0).toFixed(8)
      );

      if (!Number.isFinite(amount) || amount <= 0) {
        continue;
      }

      const walletResult = await client.query(`
        SELECT
          balance,
          pending_balance,
          migration_balance
        FROM wallets
        WHERE user_id = $1
        FOR UPDATE
      `, [reward.referrer_user_id]);

      const wallet = walletResult.rows[0] || null;

      if (!wallet) {
        throw new Error(
          "Referrer wallet not found for reward " + reward.id
        );
      }

      const currentBalance = Number(wallet.balance || 0);

      const newPendingBalance = Math.max(
        0,
        Number(wallet.pending_balance || 0) - amount
      );

      const referrerKycResult = await client.query(`
        SELECT status
        FROM user_kyc
        WHERE user_id = $1
        LIMIT 1
      `, [reward.referrer_user_id]);

      const referrerApproved =
        String(
          referrerKycResult.rows[0]?.status || ""
        ).toUpperCase() === "APPROVED";

      const newMigrationBalance = referrerApproved
        ? Math.max(
            0,
            Number(
              (
                currentBalance -
                newPendingBalance
              ).toFixed(8)
            )
          )
        : 0;

      await client.query(`
        UPDATE wallets
        SET
          pending_balance = $1,
          migration_balance = $2,
          updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $3
      `, [
        newPendingBalance,
        newMigrationBalance,
        reward.referrer_user_id
      ]);

      await client.query(`
        INSERT INTO wallet_transactions
        (
          user_id,
          type,
          amount,
          balance_after,
          mining_session_id,
          description
        )
        VALUES
        ($1, $2, $3, $4, $5, $6)
      `, [
        reward.referrer_user_id,
        "REFERRAL_REWARD_RELEASED",
        amount,
        currentBalance,
        reward.source_mining_session_id || null,
        "Pending referral reward released after referred user KYC approval"
      ]);

      await client.query(`
        UPDATE referral_rewards
        SET status = 'CREDITED'
        WHERE id = $1
          AND status = 'PENDING'
      `, [reward.id]);

      await client.query(`
        UPDATE referrals
        SET
          total_reward = COALESCE(total_reward, 0) + $1,
          updated_at = CURRENT_TIMESTAMP
        WHERE referrer_user_id = $2
          AND referred_user_id = $3
      `, [
        amount,
        reward.referrer_user_id,
        reward.referred_user_id
      ]);

      affectedReferrers.add(Number(reward.referrer_user_id));
    }

    await client.query(`
      UPDATE wallets
      SET
        migration_balance = GREATEST(
          0,
          balance - pending_balance
        ),
        updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $1
    `, [userId]);

    for (const referrerId of affectedReferrers) {
      const referrerKyc = await client.query(`
        SELECT status
        FROM user_kyc
        WHERE user_id = $1
        LIMIT 1
      `, [referrerId]);

      const approved =
        String(
          referrerKyc.rows[0]?.status || ""
        ).toUpperCase() === "APPROVED";

      await client.query(`
        UPDATE wallets
        SET
          migration_balance = CASE
            WHEN $2 = TRUE
              THEN GREATEST(0, balance - pending_balance)
            ELSE 0
          END,
          updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $1
      `, [referrerId, approved]);
    }

    await client.query("COMMIT");

    res.json({
      success: true,
      message: "KYC approved successfully"
    });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {}

    console.error("ADMIN KYC APPROVE ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  } finally {
    client.release();
  }
});

// REJECT KYC
router.post("/kyc/:userId/reject", async (req, res) => {
  try {
    const userId = Number(req.params.userId);
    const reason =
      req.body?.reason ||
      "KYC rejected by admin";

    const result = await db.query(`
      UPDATE user_kyc
      SET
        status = 'ELIGIBLE',
        approved_at = NULL,
        rejection_reason = $1,
        updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $2
        AND status = 'PENDING'
      RETURNING id
    `, [reason, userId]);

    if (!result.rows[0]) {
      return res.status(409).json({
        success: false,
        message: "KYC is not pending"
      });
    }

    await db.query(`
      UPDATE users
      SET kyc_status = 'ELIGIBLE'
      WHERE id = $1
    `, [userId]);

    await db.query(`
      UPDATE wallets
      SET
        migration_balance = 0,
        updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $1
    `, [userId]);

    res.json({
      success: true,
      message: "KYC rejected successfully"
    });
  } catch (error) {
    console.error("ADMIN KYC REJECT ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
});

module.exports = router;
