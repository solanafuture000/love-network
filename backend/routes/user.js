const express = require("express");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const { sendOtpEmail } = require("../services/otpService");
const db = require("../database");
const authenticateToken = require("../middleware/auth");
const router = express.Router();

router.get("/profile", authenticateToken, (req, res) => {
  const user = db
    .prepare(`
      SELECT
        id,
        username,
        email,
        role,
        referral_code,
        kyc_status,
        successful_mining_sessions,
        current_streak_days,
        longest_streak_days,
        last_mining_date,
        created_at
      FROM users
      WHERE id = ?
    `)
    .get(req.user.userId);

  if (!user) {
    return res.status(404).json({
      success: false,
      message: "User not found"
    });
  }

  const wallet = db
    .prepare(`
      SELECT
        id,
        balance,
        total_mined,
        created_at,
        updated_at
      FROM wallets
      WHERE user_id = ?
    `)
    .get(req.user.userId);

  res.json({
    success: true,
    user,
    wallet: wallet || null
  });
});

router.put("/profile", authenticateToken, (req, res) => {
  const { username } = req.body;

  if (!username || typeof username !== "string") {
    return res.status(400).json({
      success: false,
      message: "Username is required"
    });
  }

  const trimmedUsername = username.trim();

  if (trimmedUsername.length < 3) {
    return res.status(400).json({
      success: false,
      message: "Username must be at least 3 characters"
    });
  }

  if (trimmedUsername.length > 30) {
    return res.status(400).json({
      success: false,
      message: "Username must be 30 characters or less"
    });
  }

  const existingUser = db
    .prepare(`
      SELECT id
      FROM users
      WHERE username = ?
      AND id != ?
    `)
    .get(trimmedUsername, req.user.userId);

  if (existingUser) {
    return res.status(409).json({
      success: false,
      message: "Username already exists"
    });
  }

  db.prepare(`
    UPDATE users
    SET username = ?
    WHERE id = ?
  `).run(trimmedUsername, req.user.userId);

  const updatedUser = db
    .prepare(`
      SELECT
        id,
        username,
        email,
        role,
        referral_code,
        kyc_status,
        successful_mining_sessions,
        current_streak_days,
        longest_streak_days,
        last_mining_date,
        created_at
      FROM users
      WHERE id = ?
    `)
    .get(req.user.userId);

  res.json({
    success: true,
    message: "Profile updated successfully",
    user: updatedUser
  });
});

// CHANGE PASSWORD
router.put("/change-password", authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Current password and new password are required"
      });
    }

    if (typeof newPassword !== "string" || newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: "New password must be at least 6 characters"
      });
    }

    if (newPassword.length > 128) {
      return res.status(400).json({
        success: false,
        message: "New password is too long"
      });
    }

    const user = db
      .prepare(`
        SELECT id, password_hash
        FROM users
        WHERE id = ?
      `)
      .get(req.user.userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    const passwordMatches = await bcrypt.compare(
      currentPassword,
      user.password_hash
    );

    if (!passwordMatches) {
      return res.status(401).json({
        success: false,
        message: "Current password is incorrect"
      });
    }

    if (currentPassword === newPassword) {
      return res.status(400).json({
        success: false,
        message: "New password must be different from current password"
      });
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 12);

    db.prepare(`
      UPDATE users
      SET password_hash = ?
      WHERE id = ?
    `).run(newPasswordHash, req.user.userId);

    res.json({
      success: true,
      message: "Password changed successfully"
    });
  } catch (error) {
    console.error("CHANGE PASSWORD ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Unable to change password"
    });
  }
});

// CHANGE EMAIL

router.put("/change-email/request", authenticateToken, async (req, res) => {
  try {
    const { newEmail, currentPassword } = req.body;

    if (!newEmail || !currentPassword) {
      return res.status(400).json({
        success: false,
        message: "New email and current password are required"
      });
    }

    const email = newEmail.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid email address"
      });
    }

    const user = db.prepare(`
      SELECT id, email, password_hash
      FROM users
      WHERE id = ?
    `).get(req.user.userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    const passwordMatches = await bcrypt.compare(
      currentPassword,
      user.password_hash
    );

    if (!passwordMatches) {
      return res.status(401).json({
        success: false,
        message: "Current password is incorrect"
      });
    }

    if (email === String(user.email || "").toLowerCase()) {
      return res.status(400).json({
        success: false,
        message: "New email must be different from current email"
      });
    }

    const existingEmail = db.prepare(`
      SELECT id FROM users
      WHERE LOWER(email) = ? AND id != ?
    `).get(email, user.id);

    if (existingEmail) {
      return res.status(409).json({
        success: false,
        message: "Email address is already in use"
      });
    }

    const otp = String(Math.floor(100000 + Math.random() * 900000));

    const otpHash = crypto
      .createHash("sha256")
      .update(otp)
      .digest("hex");

    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    db.prepare(`
      UPDATE email_otps
      SET verified = 1
      WHERE user_id = ?
      AND purpose = 'email_change'
      AND verified = 0
    `).run(user.id);

    db.prepare(`
      INSERT INTO email_otps
      (user_id, email, otp_hash, expires_at, attempts, verified, purpose)
      VALUES (?, ?, ?, ?, 0, 0, 'email_change')
    `).run(
      user.id,
      email,
      otpHash,
      expiresAt
    );

    await sendOtpEmail(email, otp);

    res.json({
      success: true,
      message: "Verification code sent to your new email address",
      expiresIn: 600
    });
  } catch (error) {
    console.error("EMAIL CHANGE OTP ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Unable to send email verification code"
    });
  }
});

router.put("/change-email/verify", authenticateToken, async (req, res) => {
  try {
    const { newEmail, otp } = req.body;

    if (!newEmail || !otp) {
      return res.status(400).json({
        success: false,
        message: "New email and OTP are required"
      });
    }

    const email = newEmail.trim().toLowerCase();

    const record = db.prepare(`
      SELECT id, email, otp_hash, expires_at, attempts
      FROM email_otps
      WHERE user_id = ?
      AND purpose = 'email_change'
      AND verified = 0
      ORDER BY id DESC
      LIMIT 1
    `).get(req.user.userId);

    if (!record) {
      return res.status(400).json({
        success: false,
        message: "No active email verification code found"
      });
    }

    if (record.email.toLowerCase() !== email) {
      return res.status(400).json({
        success: false,
        message: "Email does not match the verification request"
      });
    }

    if (new Date(record.expires_at).getTime() < Date.now()) {
      return res.status(400).json({
        success: false,
        message: "Verification code has expired"
      });
    }

    if (record.attempts >= 5) {
      return res.status(429).json({
        success: false,
        message: "Too many incorrect attempts"
      });
    }

    const otpHash = crypto
      .createHash("sha256")
      .update(String(otp).trim())
      .digest("hex");

    if (otpHash !== record.otp_hash) {
      db.prepare(`
        UPDATE email_otps
        SET attempts = attempts + 1
        WHERE id = ?
      `).run(record.id);

      return res.status(401).json({
        success: false,
        message: "Invalid verification code"
      });
    }

    const existingEmail = db.prepare(`
      SELECT id FROM users
      WHERE LOWER(email) = ? AND id != ?
    `).get(email, req.user.userId);

    if (existingEmail) {
      return res.status(409).json({
        success: false,
        message: "Email address is already in use"
      });
    }

    db.prepare(`
      UPDATE users
      SET email = ?
      WHERE id = ?
    `).run(email, req.user.userId);

    db.prepare(`
      UPDATE email_otps
      SET verified = 1
      WHERE id = ?
    `).run(record.id);

    res.json({
      success: true,
      message: "Email address changed successfully",
      email
    });
  } catch (error) {
    console.error("EMAIL CHANGE VERIFY ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Unable to change email"
    });
  }
});

router.put("/change-email", authenticateToken, async (req, res) => {
  try {
    const { newEmail, currentPassword } = req.body;

    if (!newEmail || typeof newEmail !== "string") {
      return res.status(400).json({
        success: false,
        message: "New email is required"
      });
    }

    if (!currentPassword) {
      return res.status(400).json({
        success: false,
        message: "Current password is required"
      });
    }

    const email = newEmail.trim().toLowerCase();

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid email address"
      });
    }

    const user = db
      .prepare(`
        SELECT id, email, password_hash
        FROM users
        WHERE id = ?
      `)
      .get(req.user.userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    const passwordMatches = await bcrypt.compare(
      currentPassword,
      user.password_hash
    );

    if (!passwordMatches) {
      return res.status(401).json({
        success: false,
        message: "Current password is incorrect"
      });
    }

    if (email === String(user.email || "").toLowerCase()) {
      return res.status(400).json({
        success: false,
        message: "New email must be different from current email"
      });
    }

    const existingEmail = db
      .prepare(`
        SELECT id
        FROM users
        WHERE LOWER(email) = ?
        AND id != ?
      `)
      .get(email, req.user.userId);

    if (existingEmail) {
      return res.status(409).json({
        success: false,
        message: "Email address is already in use"
      });
    }

    db.prepare(`
      UPDATE users
      SET email = ?
      WHERE id = ?
    `).run(email, req.user.userId);

    res.json({
      success: true,
      message: "Email address updated successfully",
      email
    });
  } catch (error) {
    console.error("CHANGE EMAIL ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Unable to change email"
    });
  }
});

// REFERRAL DATA
router.get("/referrals", authenticateToken, (req, res) => {
  try {
    const userId = req.user.userId;

    const user = db
      .prepare(`
        SELECT
          id,
          username,
          referral_code
        FROM users
        WHERE id = ?
      `)
      .get(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    const referrals = db
      .prepare(`
        SELECT
          r.id,
          r.referred_user_id,
          r.status,
          r.reward_rate,
          r.total_reward,
          r.created_at,
          u.username,
          u.email,
          u.kyc_status
        FROM referrals r
        JOIN users u
          ON u.id = r.referred_user_id
        WHERE r.referrer_user_id = ?
        ORDER BY r.id DESC
      `)
      .all(userId);

    const rewards = db
      .prepare(`
        SELECT
          id,
          referred_user_id,
          amount,
          status,
          reward_date,
          created_at
        FROM referral_rewards
        WHERE referrer_user_id = ?
        ORDER BY id DESC
      `)
      .all(userId);

    const totalRewards = rewards.reduce(
      (sum, reward) => sum + Number(reward.amount || 0),
      0
    );

    res.json({
      success: true,
      referralCode: user.referral_code || null,
      referralLink: user.referral_code
        ? `http://localhost:5174/register?ref=${encodeURIComponent(user.referral_code)}`
        : null,
      totalReferrals: referrals.length,
      totalRewards: Number(totalRewards.toFixed(8)),
      referrals,
      rewards
    });
  } catch (error) {
    console.error("REFERRAL DATA ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Unable to load referral data"
    });
  }
});


// DELETE ACCOUNT
router.delete("/account", authenticateToken, async (req, res) => {
  try {
    const { currentPassword } = req.body;

    if (!currentPassword) {
      return res.status(400).json({
        success: false,
        message: "Current password is required"
      });
    }

    const user = db.prepare(`
      SELECT id, password_hash
      FROM users
      WHERE id = ?
    `).get(req.user.userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    const passwordMatches = await bcrypt.compare(
      currentPassword,
      user.password_hash
    );

    if (!passwordMatches) {
      return res.status(401).json({
        success: false,
        message: "Current password is incorrect"
      });
    }

    const deleteAccount = db.transaction(() => {
      const userId = user.id;

      db.prepare(
        "DELETE FROM email_otps WHERE user_id = ?"
      ).run(userId);

      db.prepare(
        "DELETE FROM user_kyc WHERE user_id = ?"
      ).run(userId);

      db.prepare(
        "DELETE FROM wallet_transactions WHERE user_id = ?"
      ).run(userId);

      db.prepare(
        "DELETE FROM referral_rewards WHERE referrer_user_id = ? OR referred_user_id = ?"
      ).run(userId, userId);

      db.prepare(
        "DELETE FROM referrals WHERE referrer_user_id = ? OR referred_user_id = ?"
      ).run(userId, userId);

      db.prepare(
        "DELETE FROM mining_sessions WHERE user_id = ?"
      ).run(userId);

      db.prepare(
        "DELETE FROM wallets WHERE user_id = ?"
      ).run(userId);

      const result = db.prepare(
        "DELETE FROM users WHERE id = ?"
      ).run(userId);

      if (result.changes !== 1) {
        throw new Error("Account deletion failed");
      }
    });

    deleteAccount();

    res.json({
      success: true,
      message: "Your LOVE Network account has been permanently deleted."
    });
  } catch (error) {
    console.error("DELETE ACCOUNT ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Unable to delete account"
    });
  }
});

module.exports = router;


