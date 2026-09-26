const express = require("express");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const { sendOtpEmail } = require("../services/otpService");
const db = require("../database-pg");
const authenticateToken = require("../middleware/auth");

const router = express.Router();

/* =========================================================
   PROFILE
========================================================= */

router.get("/profile", authenticateToken, async (req, res) => {
  try {
    const userResult = await db.query(
      `
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
      WHERE id = $1
      `,
      [req.user.userId]
    );

    const user = userResult.rows[0];

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    const walletResult = await db.query(
      `
      SELECT
        id,
        balance,
        total_mined,
        created_at,
        updated_at
      FROM wallets
      WHERE user_id = $1
      `,
      [req.user.userId]
    );

    res.json({
      success: true,
      user,
      wallet: walletResult.rows[0] || null
    });
  } catch (error) {
    console.error("PROFILE ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Unable to load profile"
    });
  }
});


/* =========================================================
   UPDATE PROFILE
========================================================= */

router.put("/profile", authenticateToken, async (req, res) => {
  try {
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

    const existingUserResult = await db.query(
      `
      SELECT id
      FROM users
      WHERE username = $1
        AND id != $2
      LIMIT 1
      `,
      [trimmedUsername, req.user.userId]
    );

    if (existingUserResult.rows[0]) {
      return res.status(409).json({
        success: false,
        message: "Username already exists"
      });
    }

    await db.query(
      `
      UPDATE users
      SET username = $1
      WHERE id = $2
      `,
      [trimmedUsername, req.user.userId]
    );

    const updatedUserResult = await db.query(
      `
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
      WHERE id = $1
      `,
      [req.user.userId]
    );

    res.json({
      success: true,
      message: "Profile updated successfully",
      user: updatedUserResult.rows[0]
    });
  } catch (error) {
    console.error("UPDATE PROFILE ERROR:", error);

    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        message: "Username already exists"
      });
    }

    res.status(500).json({
      success: false,
      message: "Unable to update profile"
    });
  }
});


/* =========================================================
   CHANGE PASSWORD
========================================================= */

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

    const userResult = await db.query(
      `
      SELECT id, password_hash
      FROM users
      WHERE id = $1
      `,
      [req.user.userId]
    );

    const user = userResult.rows[0];

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

    await db.query(
      `
      UPDATE users
      SET password_hash = $1
      WHERE id = $2
      `,
      [newPasswordHash, req.user.userId]
    );

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


/* =========================================================
   CHANGE EMAIL - REQUEST OTP
========================================================= */

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

    const userResult = await db.query(
      `
      SELECT id, email, password_hash
      FROM users
      WHERE id = $1
      `,
      [req.user.userId]
    );

    const user = userResult.rows[0];

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

    const existingEmailResult = await db.query(
      `
      SELECT id
      FROM users
      WHERE LOWER(email) = $1
        AND id != $2
      LIMIT 1
      `,
      [email, user.id]
    );

    if (existingEmailResult.rows[0]) {
      return res.status(409).json({
        success: false,
        message: "Email address is already in use"
      });
    }

    const otp = String(
      Math.floor(100000 + Math.random() * 900000)
    );

    const otpHash = crypto
      .createHash("sha256")
      .update(otp)
      .digest("hex");

    const expiresAt = new Date(
      Date.now() + 10 * 60 * 1000
    ).toISOString();

    await db.query(
      `
      UPDATE email_otps
      SET verified = TRUE
      WHERE user_id = $1
        AND purpose = 'email_change'
        AND verified = FALSE
      `,
      [user.id]
    );

    await db.query(
      `
      INSERT INTO email_otps
      (
        user_id,
        email,
        otp_hash,
        expires_at,
        attempts,
        verified,
        purpose
      )
      VALUES ($1, $2, $3, $4, 0, FALSE, 'email_change')
      `,
      [
        user.id,
        email,
        otpHash,
        expiresAt
      ]
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


/* =========================================================
   CHANGE EMAIL - VERIFY OTP
========================================================= */

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

    const recordResult = await db.query(
      `
      SELECT
        id,
        email,
        otp_hash,
        expires_at,
        attempts
      FROM email_otps
      WHERE user_id = $1
        AND purpose = 'email_change'
        AND verified = FALSE
      ORDER BY id DESC
      LIMIT 1
      `,
      [req.user.userId]
    );

    const record = recordResult.rows[0];

    if (!record) {
      return res.status(400).json({
        success: false,
        message: "No active email verification code found"
      });
    }

    if (String(record.email).toLowerCase() !== email) {
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

    if (Number(record.attempts) >= 5) {
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
      await db.query(
        `
        UPDATE email_otps
        SET attempts = attempts + 1
        WHERE id = $1
        `,
        [record.id]
      );

      return res.status(401).json({
        success: false,
        message: "Invalid verification code"
      });
    }

    const existingEmailResult = await db.query(
      `
      SELECT id
      FROM users
      WHERE LOWER(email) = $1
        AND id != $2
      LIMIT 1
      `,
      [email, req.user.userId]
    );

    if (existingEmailResult.rows[0]) {
      return res.status(409).json({
        success: false,
        message: "Email address is already in use"
      });
    }

    const client = await db.pool.connect();

    try {
      await client.query("BEGIN");

      await client.query(
        `
        UPDATE users
        SET email = $1
        WHERE id = $2
        `,
        [email, req.user.userId]
      );

      await client.query(
        `
        UPDATE email_otps
        SET verified = TRUE
        WHERE id = $1
        `,
        [record.id]
      );

      await client.query("COMMIT");
    } catch (transactionError) {
      await client.query("ROLLBACK");
      throw transactionError;
    } finally {
      client.release();
    }

    res.json({
      success: true,
      message: "Email address changed successfully",
      email
    });
  } catch (error) {
    console.error("EMAIL CHANGE VERIFY ERROR:", error);

    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        message: "Email address is already in use"
      });
    }

    res.status(500).json({
      success: false,
      message: "Unable to change email"
    });
  }
});


/* =========================================================
   CHANGE EMAIL - DIRECT
========================================================= */

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

    const userResult = await db.query(
      `
      SELECT id, email, password_hash
      FROM users
      WHERE id = $1
      `,
      [req.user.userId]
    );

    const user = userResult.rows[0];

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

    const existingEmailResult = await db.query(
      `
      SELECT id
      FROM users
      WHERE LOWER(email) = $1
        AND id != $2
      LIMIT 1
      `,
      [email, req.user.userId]
    );

    if (existingEmailResult.rows[0]) {
      return res.status(409).json({
        success: false,
        message: "Email address is already in use"
      });
    }

    await db.query(
      `
      UPDATE users
      SET email = $1
      WHERE id = $2
      `,
      [email, req.user.userId]
    );

    res.json({
      success: true,
      message: "Email address updated successfully",
      email
    });
  } catch (error) {
    console.error("CHANGE EMAIL ERROR:", error);

    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        message: "Email address is already in use"
      });
    }

    res.status(500).json({
      success: false,
      message: "Unable to change email"
    });
  }
});


/* =========================================================
   REFERRAL DATA
========================================================= */

router.get("/referrals", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    const userResult = await db.query(
      `
      SELECT
        id,
        username,
        referral_code
      FROM users
      WHERE id = $1
      `,
      [userId]
    );

    const user = userResult.rows[0];

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    const referralsResult = await db.query(
      `
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
      WHERE r.referrer_user_id = $1
      ORDER BY r.id DESC
      `,
      [userId]
    );

    const rewardsResult = await db.query(
      `
      SELECT
        id,
        referred_user_id,
        amount,
        status,
        reward_date,
        created_at
      FROM referral_rewards
      WHERE referrer_user_id = $1
      ORDER BY id DESC
      `,
      [userId]
    );

    const referrals = referralsResult.rows;
    const rewards = rewardsResult.rows;

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


/* =========================================================
   DELETE ACCOUNT
========================================================= */

router.delete("/account", authenticateToken, async (req, res) => {
  try {
    const { currentPassword } = req.body;

    if (!currentPassword) {
      return res.status(400).json({
        success: false,
        message: "Current password is required"
      });
    }

    const userResult = await db.query(
      `
      SELECT id, password_hash
      FROM users
      WHERE id = $1
      `,
      [req.user.userId]
    );

    const user = userResult.rows[0];

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

    const client = await db.pool.connect();

    try {
      await client.query("BEGIN");

      const userId = user.id;

      await client.query(
        "DELETE FROM email_otps WHERE user_id = $1",
        [userId]
      );

      await client.query(
        "DELETE FROM user_kyc WHERE user_id = $1",
        [userId]
      );

      await client.query(
        "DELETE FROM wallet_transactions WHERE user_id = $1",
        [userId]
      );

      await client.query(
        `
        DELETE FROM referral_rewards
        WHERE referrer_user_id = $1
           OR referred_user_id = $1
        `,
        [userId]
      );

      await client.query(
        `
        DELETE FROM referrals
        WHERE referrer_user_id = $1
           OR referred_user_id = $1
        `,
        [userId]
      );

      await client.query(
        "DELETE FROM mining_sessions WHERE user_id = $1",
        [userId]
      );

      await client.query(
        "DELETE FROM wallets WHERE user_id = $1",
        [userId]
      );

      const deleteResult = await client.query(
        "DELETE FROM users WHERE id = $1",
        [userId]
      );

      if (deleteResult.rowCount !== 1) {
        throw new Error("Account deletion failed");
      }

      await client.query("COMMIT");
    } catch (transactionError) {
      await client.query("ROLLBACK");
      throw transactionError;
    } finally {
      client.release();
    }

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


/* =========================================================
   EXPORT
========================================================= */

module.exports = router;
