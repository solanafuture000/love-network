const express = require("express");
const db = require("../database-pg");
const authenticateToken = require("../middleware/auth");

const {
  KYC_MINING_SESSIONS,
  updateKycEligibility
} = require("../kycService");

const router = express.Router();

// KYC STATUS
router.get("/status", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    const status = await updateKycEligibility(userId);

    const miningResult = await db.query(
      `SELECT COUNT(*)::int AS completed_sessions
       FROM mining_sessions
       WHERE user_id = $1
         AND status = 'completed'`,
      [userId]
    );

    const completedSessions = Number(
      miningResult.rows[0]?.completed_sessions || 0
    );

    const kycResult = await db.query(
      `SELECT status, eligible_at, submitted_at, approved_at, rejection_reason
       FROM user_kyc
       WHERE user_id = $1
       LIMIT 1`,
      [userId]
    );

    const kyc = kycResult.rows[0] || null;

    res.json({
      success: true,
      kyc: {
        status,
        completed_sessions: completedSessions,
        required_sessions: KYC_MINING_SESSIONS,
        remaining_sessions: Math.max(
          0,
          KYC_MINING_SESSIONS - completedSessions
        ),
        eligible:
          status === "ELIGIBLE" ||
          status === "PENDING" ||
          status === "APPROVED",
        submitted_at: kyc?.submitted_at || null,
        approved_at: kyc?.approved_at || null,
        rejection_reason: kyc?.rejection_reason || null
      }
    });
  } catch (error) {
    console.error("KYC STATUS ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
});


// SUBMIT KYC
router.post("/submit", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    const status = await updateKycEligibility(userId);

    const kycResult = await db.query(
      `SELECT id, status, eligible_at, submitted_at, approved_at, rejection_reason
       FROM user_kyc
       WHERE user_id = $1
       LIMIT 1`,
      [userId]
    );

    const kyc = kycResult.rows[0] || null;

    if (!kyc) {
      return res.status(404).json({
        success: false,
        message: "KYC record not found"
      });
    }

    if (status === "NOT_ELIGIBLE") {
      const miningResult = await db.query(
        `SELECT COUNT(*)::int AS completed_sessions
         FROM mining_sessions
         WHERE user_id = $1
           AND status = 'completed'`,
        [userId]
      );

      const completedSessions = Number(
        miningResult.rows[0]?.completed_sessions || 0
      );

      return res.status(403).json({
        success: false,
        message: "KYC is not eligible yet",
        completed_sessions: completedSessions,
        required_sessions: KYC_MINING_SESSIONS,
        remaining_sessions: Math.max(
          0,
          KYC_MINING_SESSIONS - completedSessions
        )
      });
    }

    if (status === "PENDING") {
      return res.status(409).json({
        success: false,
        message: "KYC is already pending review"
      });
    }

    if (status === "APPROVED") {
      return res.status(409).json({
        success: false,
        message: "KYC is already approved"
      });
    }

    if (status !== "ELIGIBLE") {
      return res.status(409).json({
        success: false,
        message: "KYC cannot be submitted in current status",
        status
      });
    }

    await db.query(
      `UPDATE user_kyc
       SET status = 'PENDING',
           submitted_at = CURRENT_TIMESTAMP,
           approved_at = NULL,
           rejection_reason = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $1`,
      [userId]
    );

    const updatedKycResult = await db.query(
      `SELECT id, user_id, status, eligible_at, submitted_at,
              approved_at, rejection_reason
       FROM user_kyc
       WHERE user_id = $1
       LIMIT 1`,
      [userId]
    );

    const updatedKyc = updatedKycResult.rows[0] || null;

    res.json({
      success: true,
      message: "KYC submitted successfully",
      kyc: updatedKyc
    });
  } catch (error) {
    console.error("KYC SUBMIT ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
});


module.exports = router;
