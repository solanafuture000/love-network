const express = require("express");
const crypto = require("crypto");
const db = require("../database");
const { sendOtpEmail } = require("../services/otpService");
const authenticateToken = require("../middleware/auth");

const router = express.Router();

function generateOtp() {
  return crypto.randomInt(100000, 1000000).toString();
}

function hashOtp(otp) {
  return crypto
    .createHash("sha256")
    .update(otp)
    .digest("hex");
}

// SEND NORMAL EMAIL OTP
router.post("/send", async (req, res) => {
  try {
    let { userId, email } = req.body;

    userId = Number(userId);
    email = String(email || "").trim().toLowerCase();

    if (!userId || !email) {
      return res.status(400).json({
        success: false,
        message: "User ID and email are required"
      });
    }

    const user = db.prepare(`
      SELECT id, email
      FROM users
      WHERE id = ?
      LIMIT 1
    `).get(userId);

    if (!user || user.email.toLowerCase() !== email) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    db.prepare(`
      UPDATE email_otps
      SET verified = 1
      WHERE user_id = ?
        AND verified = 0
    `).run(userId);

    const otp = generateOtp();
    const otpHash = hashOtp(otp);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    db.prepare(`
      INSERT INTO email_otps (
        user_id,
        email,
        otp_hash,
        expires_at,
        attempts,
        verified
      )
      VALUES (?, ?, ?, ?, 0, 0)
    `).run(userId, email, otpHash, expiresAt);

    await sendOtpEmail(email, otp);

    return res.json({
      success: true,
      message: "OTP sent successfully",
      expiresIn: 600
    });

  } catch (error) {
    console.error("SEND OTP ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to send OTP"
    });
  }
});

// VERIFY NORMAL EMAIL OTP
router.post("/verify", (req, res) => {
  try {
    let { userId, otp } = req.body;

    userId = Number(userId);
    otp = String(otp || "").trim();

    if (!userId || !otp) {
      return res.status(400).json({
        success: false,
        message: "User ID and OTP are required"
      });
    }

    if (!/^\d{6}$/.test(otp)) {
      return res.status(400).json({
        success: false,
        message: "OTP must be 6 digits"
      });
    }

    const record = db.prepare(`
      SELECT *
      FROM email_otps
      WHERE user_id = ?
        AND verified = 0
      ORDER BY id DESC
      LIMIT 1
    `).get(userId);

    if (!record) {
      return res.status(400).json({
        success: false,
        message: "No active OTP found"
      });
    }

    if (new Date(record.expires_at).getTime() < Date.now()) {
      return res.status(400).json({
        success: false,
        message: "OTP has expired"
      });
    }

    if (record.attempts >= 5) {
      return res.status(429).json({
        success: false,
        message: "Too many incorrect attempts"
      });
    }

    const otpHash = hashOtp(otp);

    if (otpHash !== record.otp_hash) {
      db.prepare(`
        UPDATE email_otps
        SET attempts = attempts + 1
        WHERE id = ?
      `).run(record.id);

      return res.status(401).json({
        success: false,
        message: "Invalid OTP"
      });
    }

    db.prepare(`
      UPDATE email_otps
      SET verified = 1
      WHERE id = ?
    `).run(record.id);

    return res.json({
      success: true,
      message: "OTP verified successfully"
    });

  } catch (error) {
    console.error("VERIFY OTP ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "OTP verification failed"
    });
  }
});

// SEND 2FA OTP
router.post("/2fa/send", authenticateToken, async (req, res) => {
  try {
    const userId = Number(req.user.userId);

    const user = db.prepare(`
      SELECT id, email, two_factor_enabled
      FROM users
      WHERE id = ?
      LIMIT 1
    `).get(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    db.prepare(`
      UPDATE email_otps
      SET verified = 1
      WHERE user_id = ?
        AND verified = 0
    `).run(userId);

    const otp = generateOtp();
    const otpHash = hashOtp(otp);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    db.prepare(`
      INSERT INTO email_otps (
        user_id,
        email,
        otp_hash,
        expires_at,
        attempts,
        verified
      )
      VALUES (?, ?, ?, ?, 0, 0)
    `).run(userId, user.email, otpHash, expiresAt);

    await sendOtpEmail(user.email, otp);

    return res.json({
      success: true,
      message: "2FA verification code sent to your email",
      expiresIn: 600,
      action: user.two_factor_enabled ? "disable" : "enable"
    });

  } catch (error) {
    console.error("2FA SEND ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to send 2FA verification code"
    });
  }
});

// VERIFY 2FA OTP AND TOGGLE
router.post("/2fa/verify", authenticateToken, (req, res) => {
  try {
    const userId = Number(req.user.userId);
    const otp = String(req.body.otp || "").trim();

    if (!/^\d{6}$/.test(otp)) {
      return res.status(400).json({
        success: false,
        message: "OTP must be 6 digits"
      });
    }

    const record = db.prepare(`
      SELECT *
      FROM email_otps
      WHERE user_id = ?
        AND verified = 0
      ORDER BY id DESC
      LIMIT 1
    `).get(userId);

    if (!record) {
      return res.status(400).json({
        success: false,
        message: "No active OTP found"
      });
    }

    if (new Date(record.expires_at).getTime() < Date.now()) {
      return res.status(400).json({
        success: false,
        message: "OTP has expired"
      });
    }

    if (record.attempts >= 5) {
      return res.status(429).json({
        success: false,
        message: "Too many incorrect attempts"
      });
    }

    const otpHash = hashOtp(otp);

    if (otpHash !== record.otp_hash) {
      db.prepare(`
        UPDATE email_otps
        SET attempts = attempts + 1
        WHERE id = ?
      `).run(record.id);

      return res.status(401).json({
        success: false,
        message: "Invalid OTP"
      });
    }

    const user = db.prepare(`
      SELECT id, two_factor_enabled
      FROM users
      WHERE id = ?
      LIMIT 1
    `).get(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    const newState = user.two_factor_enabled ? 0 : 1;

    db.prepare(`
      UPDATE email_otps
      SET verified = 1
      WHERE id = ?
    `).run(record.id);

    db.prepare(`
      UPDATE users
      SET two_factor_enabled = ?
      WHERE id = ?
    `).run(newState, userId);

    return res.json({
      success: true,
      message: newState
        ? "Two-factor authentication enabled successfully"
        : "Two-factor authentication disabled successfully",
      twoFactorEnabled: Boolean(newState)
    });

  } catch (error) {
    console.error("2FA VERIFY ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "2FA verification failed"
    });
  }
});

// GET 2FA STATUS
router.get("/2fa/status", authenticateToken, (req, res) => {
  try {
    const userId = Number(req.user.userId);

    const user = db.prepare(`
      SELECT two_factor_enabled
      FROM users
      WHERE id = ?
      LIMIT 1
    `).get(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    return res.json({
      success: true,
      twoFactorEnabled: Boolean(user.two_factor_enabled)
    });

  } catch (error) {
    console.error("2FA STATUS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get 2FA status"
    });
  }
});


// VERIFY LOGIN 2FA OTP
router.post("/2fa/login/verify", (req, res) => {
  try {
    const jwt = require("jsonwebtoken");
    const JWT_SECRET = process.env.JWT_SECRET || "love-network-dev-secret";

    let { challengeToken, otp } = req.body;

    challengeToken = String(challengeToken || "").trim();
    otp = String(otp || "").trim();

    if (!challengeToken || !otp) {
      return res.status(400).json({
        success: false,
        message: "Challenge token and OTP are required"
      });
    }

    if (!/^\d{6}$/.test(otp)) {
      return res.status(400).json({
        success: false,
        message: "OTP must be 6 digits"
      });
    }

    let payload;

    try {
      payload = jwt.verify(challengeToken, JWT_SECRET);
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: "Login verification session expired"
      });
    }

    if (payload.purpose !== "login_2fa" || !payload.userId) {
      return res.status(401).json({
        success: false,
        message: "Invalid login verification session"
      });
    }

    const userId = Number(payload.userId);

    const record = db.prepare(`
      SELECT *
      FROM email_otps
      WHERE user_id = ?
        AND purpose = 'login_2fa'
        AND verified = 0
      ORDER BY id DESC
      LIMIT 1
    `).get(userId);

    if (!record) {
      return res.status(400).json({
        success: false,
        message: "No active login OTP found"
      });
    }

    if (new Date(record.expires_at).getTime() < Date.now()) {
      return res.status(400).json({
        success: false,
        message: "OTP has expired"
      });
    }

    if (record.attempts >= 5) {
      return res.status(429).json({
        success: false,
        message: "Too many incorrect attempts"
      });
    }

    const otpHash = hashOtp(otp);

    if (otpHash !== record.otp_hash) {
      db.prepare(`
        UPDATE email_otps
        SET attempts = attempts + 1
        WHERE id = ?
      `).run(record.id);

      return res.status(401).json({
        success: false,
        message: "Invalid OTP"
      });
    }

    db.prepare(`
      UPDATE email_otps
      SET verified = 1
      WHERE id = ?
    `).run(record.id);

    const user = db.prepare(`
      SELECT
        id,
        username,
        email,
        role,
        referral_code,
        kyc_status,
        created_at
      FROM users
      WHERE id = ?
      LIMIT 1
    `).get(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    const token = jwt.sign(
      {
        userId: user.id,
        username: user.username,
        role: user.role
      },
      JWT_SECRET,
      {
        expiresIn: "7d"
      }
    );

    return res.json({
      success: true,
      message: "2FA login successful",
      token,
      user
    });

  } catch (error) {
    console.error("LOGIN 2FA VERIFY ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "2FA login verification failed"
    });
  }
});

module.exports = router;
