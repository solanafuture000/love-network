const express = require("express");
const db = require("../database");
const authenticateToken = require("../middleware/auth");
const {
  KYC_MINING_SESSIONS,
  updateKycEligibility
} = require("../kycService");

const router = express.Router();

// KYC STATUS
router.get("/status", authenticateToken, (req, res) => {
  try {
    const userId = req.user.userId;

    const status = updateKycEligibility(userId);

    const mining = db
      .prepare(`
        SELECT COUNT(*) AS completed_sessions
        FROM mining_sessions
        WHERE user_id = ?
          AND status = 'completed'
      `)
      .get(userId);

    const kyc = db
      .prepare(`
        SELECT
          status,
          eligible_at,
          submitted_at,
          approved_at,
          rejection_reason
        FROM user_kyc
        WHERE user_id = ?
      `)
      .get(userId);

    res.json({
      success: true,
      kyc: {
        status,
        completed_sessions: mining.completed_sessions,
        required_sessions: KYC_MINING_SESSIONS,
        remaining_sessions: Math.max(
          0,
          KYC_MINING_SESSIONS - mining.completed_sessions
        ),
        eligible: status === "ELIGIBLE" || status === "PENDING" || status === "APPROVED",
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
router.post("/submit", authenticateToken, (req, res) => {
  try {
    const userId = req.user.userId;

    // Always refresh eligibility through the central KYC service.
    const status = updateKycEligibility(userId);

    const kyc = db
      .prepare(`
        SELECT
          id,
          status,
          eligible_at,
          submitted_at,
          approved_at,
          rejection_reason
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

    if (status === "NOT_ELIGIBLE") {
      const completed = db
        .prepare(`
          SELECT COUNT(*) AS completed_sessions
          FROM mining_sessions
          WHERE user_id = ?
            AND status = 'completed'
        `)
        .get(userId);

      return res.status(403).json({
        success: false,
        message: "KYC is not eligible yet",
        completed_sessions: completed.completed_sessions,
        required_sessions: KYC_MINING_SESSIONS,
        remaining_sessions: Math.max(
          0,
          KYC_MINING_SESSIONS - completed.completed_sessions
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

    db.prepare(`
      UPDATE user_kyc
      SET status = 'PENDING',
          submitted_at = CURRENT_TIMESTAMP,
          approved_at = NULL,
          rejection_reason = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
    `).run(userId);

    const updatedKyc = db
      .prepare(`
        SELECT
          id,
          user_id,
          status,
          eligible_at,
          submitted_at,
          approved_at,
          rejection_reason
        FROM user_kyc
        WHERE user_id = ?
      `)
      .get(userId);

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
