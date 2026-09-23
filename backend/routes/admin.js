const express = require("express");
const db = require("../database");
const authenticateToken = require("../middleware/auth");
const requireAdmin = require("../middleware/admin");

const router = express.Router();

// All admin routes require valid JWT + ADMIN role
router.use(authenticateToken, requireAdmin);

// GET PENDING KYC
router.get("/kyc", (req, res) => {
  try {
    const submissions = db
      .prepare(`
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
      `)
      .all();

    res.json({
      success: true,
      count: submissions.length,
      submissions
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
router.post("/kyc/:userId/approve", (req, res) => {
  try {
    const userId = Number(req.params.userId);

    const kyc = db
      .prepare(`
        SELECT id, status
        FROM user_kyc
        WHERE user_id = ?
      `)
      .get(userId);

    if (!kyc) {
      return res.status(404).json({
        success: false,
        message: "KYC record not found"
      });
    }

    if (kyc.status !== "PENDING") {
      return res.status(409).json({
        success: false,
        message: "KYC is not pending"
      });
    }

    const approveKyc = db.transaction(() => {
    db.prepare(`
      UPDATE user_kyc
      SET
        status = 'APPROVED',
        approved_at = CURRENT_TIMESTAMP,
        rejection_reason = NULL,
        updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
    `).run(userId);

    db.prepare(`
      UPDATE referrals
      SET
        status = 'ACTIVE',
        reward_rate = 0.10,
        updated_at = CURRENT_TIMESTAMP
      WHERE referred_user_id = ?
        AND status = 'PENDING_KYC'
    `).run(userId);

    // Release pending referral rewards after KYC approval
    const pendingRewards = db.prepare(`
      SELECT
        id,
        referrer_user_id,
        referred_user_id,
        amount,
        source_mining_session_id
      FROM referral_rewards
      WHERE referred_user_id = ?
        AND status = 'PENDING'
      ORDER BY id ASC
    `).all(userId);

    for (const referralReward of pendingRewards) {
      const referrerWallet = db.prepare(`
        SELECT balance
        FROM wallets
        WHERE user_id = ?
        LIMIT 1
      `).get(referralReward.referrer_user_id);

      if (!referrerWallet) {
        throw new Error(
          "Referrer wallet not found for referral reward " +
          referralReward.id
        );
      }

      const amount = Number(
        Number(referralReward.amount).toFixed(8)
      );

      const newBalance = Number(
        (
          Number(referrerWallet.balance) + amount
        ).toFixed(8)
      );

      db.prepare(`
        UPDATE wallets
        SET
          balance = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ?
      `).run(
        newBalance,
        referralReward.referrer_user_id
      );

      db.prepare(`
        INSERT INTO wallet_transactions
        (
          user_id,
          type,
          amount,
          balance_after,
          mining_session_id,
          description
        )
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        referralReward.referrer_user_id,
        "REFERRAL_REWARD",
        amount,
        newBalance,
        referralReward.source_mining_session_id || null,
        "Referral reward released after KYC approval"
      );

      db.prepare(`
        UPDATE referral_rewards
        SET status = 'CREDITED'
        WHERE id = ?
          AND status = 'PENDING'
      `).run(referralReward.id);

      db.prepare(`
        UPDATE referrals
        SET
          total_reward = total_reward + ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE referrer_user_id = ?
          AND referred_user_id = ?
      `).run(
        amount,
        referralReward.referrer_user_id,
        referralReward.referred_user_id
      );
    }
  });

  approveKyc();

    res.json({
      success: true,
      message: "KYC approved successfully"
    });
  } catch (error) {
    console.error("ADMIN KYC APPROVE ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
});

// REJECT KYC
router.post("/kyc/:userId/reject", (req, res) => {
  try {
    const userId = Number(req.params.userId);
    const { reason } = req.body;

    const kyc = db
      .prepare(`
        SELECT id, status
        FROM user_kyc
        WHERE user_id = ?
      `)
      .get(userId);

    if (!kyc) {
      return res.status(404).json({
        success: false,
        message: "KYC record not found"
      });
    }

    if (kyc.status !== "PENDING") {
      return res.status(409).json({
        success: false,
        message: "KYC is not pending"
      });
    }

    db.prepare(`
      UPDATE user_kyc
      SET status = 'ELIGIBLE',
          approved_at = NULL,
          rejection_reason = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
    `).run(reason || "KYC rejected by admin", userId);

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


