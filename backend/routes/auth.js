const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const db = require("../database");
const { sendOtpEmail } = require("../services/otpService");

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || "love-network-dev-secret";

function generateReferralCode(username, userId) {
  const base = username
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase()
    .slice(0, 8) || "LOVE";

  return `${base}${userId}`;
}

function generateOtp() {
  return crypto.randomInt(100000, 1000000).toString();
}

function hashOtp(otp) {
  return crypto
    .createHash("sha256")
    .update(otp)
    .digest("hex");
}

function createOtpExpiry() {
  return new Date(Date.now() + 10 * 60 * 1000).toISOString();
}


/* =========================================================
   REGISTER
========================================================= */

router.post("/register", async (req, res) => {
  try {
    let { username, email, password, referralCode } = req.body;

    username = String(username || "").trim();
    email = String(email || "").trim().toLowerCase();
    password = String(password || "");
    referralCode = String(referralCode || "").trim().toUpperCase();

    if (!username || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Username, email and password are required"
      });
    }

    if (username.length < 3 || username.length > 30) {
      return res.status(400).json({
        success: false,
        message: "Username must be between 3 and 30 characters"
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters"
      });
    }

    const existingUser = db.prepare(`
      SELECT id
      FROM users
      WHERE LOWER(username) = LOWER(?)
         OR LOWER(email) = LOWER(?)
      LIMIT 1
    `).get(username, email);

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "Username or email already exists"
      });
    }

    let referrer = null;

    if (referralCode) {
      referrer = db.prepare(`
        SELECT id, username
        FROM users
        WHERE UPPER(referral_code) = UPPER(?)
        LIMIT 1
      `).get(referralCode);

      if (!referrer) {
        return res.status(400).json({
          success: false,
          message: "Invalid referral code"
        });
      }
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const createUser = db.transaction(() => {
      const result = db.prepare(`
        INSERT INTO users (
          username,
          email,
          password_hash,
          role,
          kyc_status,
          email_verified
        )
        VALUES (?, ?, ?, 'USER', 'not_started', 0)
      `).run(
        username,
        email,
        passwordHash
      );

      const userId = Number(result.lastInsertRowid);

      let generatedReferralCode = generateReferralCode(
        username,
        userId
      );

      let codeExists = db.prepare(`
        SELECT id
        FROM users
        WHERE referral_code = ?
      `).get(generatedReferralCode);

      let counter = 1;

      while (codeExists) {
        generatedReferralCode =
          `${generateReferralCode(username, userId)}${counter++}`;

        codeExists = db.prepare(`
          SELECT id
          FROM users
          WHERE referral_code = ?
        `).get(generatedReferralCode);
      }

      db.prepare(`
        UPDATE users
        SET referral_code = ?
        WHERE id = ?
      `).run(
        generatedReferralCode,
        userId
      );

      // Automatically create wallet
      db.prepare(`
        INSERT INTO wallets (
          user_id,
          balance,
          total_mined
        )
        VALUES (?, 0, 0)
      `).run(userId);

      // Create referral relationship
      if (referrer) {
        db.prepare(`
          INSERT INTO referrals (
            referrer_user_id,
            referred_user_id,
            status,
            reward_rate,
            total_reward
          )
          VALUES (?, ?, 'PENDING_KYC', 0, 0)
        `).run(
          referrer.id,
          userId
        );
      }

      return db.prepare(`
        SELECT
          id,
          username,
          email,
          role,
          referral_code,
          kyc_status,
          email_verified,
          created_at
        FROM users
        WHERE id = ?
      `).get(userId);
    });

    const user = createUser();

    /* ---------------------------------------------
       REGISTRATION OTP
    --------------------------------------------- */

    const otp = generateOtp();
    const otpHash = hashOtp(otp);
    const expiresAt = createOtpExpiry();

    // Invalidate previous registration OTPs
    db.prepare(`
      UPDATE email_otps
      SET verified = 1
      WHERE user_id = ?
        AND purpose = 'registration'
        AND verified = 0
    `).run(user.id);

    // Save registration OTP
    db.prepare(`
      INSERT INTO email_otps (
        user_id,
        email,
        otp_hash,
        expires_at,
        attempts,
        verified,
        purpose
      )
      VALUES (?, ?, ?, ?, 0, 0, 'registration')
    `).run(
      user.id,
      user.email,
      otpHash,
      expiresAt
    );

    try {
      await sendOtpEmail(user.email, otp);
    } catch (emailError) {
      console.error(
        "REGISTRATION OTP EMAIL ERROR:",
        emailError
      );

      db.prepare(`
        DELETE FROM users
        WHERE id = ?
      `).run(user.id);

      return res.status(500).json({
        success: false,
        message: "Unable to send verification email"
      });
    }

    const challengeToken = jwt.sign(
      {
        userId: user.id,
        purpose: "registration_verification"
      },
      JWT_SECRET,
      {
        expiresIn: "10m"
      }
    );

    return res.status(201).json({
      success: true,
      requiresEmailVerification: true,
      challengeToken,
      message: "Registration successful. Verification OTP sent to your email.",
      expiresIn: 600
    });

  } catch (error) {
    console.error("REGISTER ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Registration failed"
    });
  }
});


/* =========================================================
   VERIFY REGISTRATION EMAIL OTP
========================================================= */

router.post("/register/verify", async (req, res) => {
  try {
    const { challengeToken, otp } = req.body;

    if (!challengeToken || !otp) {
      return res.status(400).json({
        success: false,
        message: "Verification token and OTP are required"
      });
    }

    if (!/^\d{6}$/.test(String(otp).trim())) {
      return res.status(400).json({
        success: false,
        message: "OTP must be 6 digits"
      });
    }

    let decoded;

    try {
      decoded = jwt.verify(
        challengeToken,
        JWT_SECRET
      );
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: "Verification session expired. Please register again."
      });
    }

    if (
      decoded.purpose !== "registration_verification"
    ) {
      return res.status(401).json({
        success: false,
        message: "Invalid verification session"
      });
    }

    const user = db.prepare(`
      SELECT *
      FROM users
      WHERE id = ?
      LIMIT 1
    `).get(decoded.userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    if (Number(user.email_verified) === 1) {
      return res.json({
        success: true,
        message: "Email is already verified"
      });
    }

    const otpRow = db.prepare(`
      SELECT *
      FROM email_otps
      WHERE user_id = ?
        AND purpose = 'registration'
        AND verified = 0
      ORDER BY id DESC
      LIMIT 1
    `).get(user.id);

    if (!otpRow) {
      return res.status(400).json({
        success: false,
        message: "No active verification OTP found"
      });
    }

    if (
      new Date(otpRow.expires_at).getTime() < Date.now()
    ) {
      db.prepare(`
        UPDATE email_otps
        SET verified = 1
        WHERE id = ?
      `).run(otpRow.id);

      return res.status(400).json({
        success: false,
        message: "OTP has expired. Please request a new OTP."
      });
    }

    if (Number(otpRow.attempts) >= 5) {
      return res.status(429).json({
        success: false,
        message: "Too many incorrect attempts. Please request a new OTP."
      });
    }

    const submittedHash = hashOtp(
      String(otp).trim()
    );

    if (submittedHash !== otpRow.otp_hash) {
      db.prepare(`
        UPDATE email_otps
        SET attempts = attempts + 1
        WHERE id = ?
      `).run(otpRow.id);

      const remainingAttempts =
        Math.max(
          0,
          4 - Number(otpRow.attempts)
        );

      return res.status(400).json({
        success: false,
        message: `Incorrect OTP. ${remainingAttempts} attempts remaining.`
      });
    }

    // Mark OTP verified
    db.prepare(`
      UPDATE email_otps
      SET verified = 1
      WHERE id = ?
    `).run(otpRow.id);

    // Verify user's email
    db.prepare(`
      UPDATE users
      SET email_verified = 1
      WHERE id = ?
    `).run(user.id);

    return res.json({
      success: true,
      message: "Email verified successfully. You can now login.",
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        referral_code: user.referral_code,
        kyc_status: user.kyc_status,
        email_verified: 1,
        created_at: user.created_at
      }
    });

  } catch (error) {
    console.error(
      "REGISTRATION OTP VERIFY ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "OTP verification failed"
    });
  }
});


/* =========================================================
   RESEND REGISTRATION OTP
========================================================= */

router.post("/register/resend", async (req, res) => {
  try {
    const { challengeToken } = req.body;

    if (!challengeToken) {
      return res.status(400).json({
        success: false,
        message: "Verification token is required"
      });
    }

    let decoded;

    try {
      decoded = jwt.verify(
        challengeToken,
        JWT_SECRET
      );
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: "Verification session expired. Please register again."
      });
    }

    if (
      decoded.purpose !== "registration_verification"
    ) {
      return res.status(401).json({
        success: false,
        message: "Invalid verification session"
      });
    }

    const user = db.prepare(`
      SELECT *
      FROM users
      WHERE id = ?
      LIMIT 1
    `).get(decoded.userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    if (Number(user.email_verified) === 1) {
      return res.status(400).json({
        success: false,
        message: "Email is already verified"
      });
    }

    const otp = generateOtp();
    const otpHash = hashOtp(otp);
    const expiresAt = createOtpExpiry();

    // Invalidate old registration OTP
    db.prepare(`
      UPDATE email_otps
      SET verified = 1
      WHERE user_id = ?
        AND purpose = 'registration'
        AND verified = 0
    `).run(user.id);

    // Save new OTP
    db.prepare(`
      INSERT INTO email_otps (
        user_id,
        email,
        otp_hash,
        expires_at,
        attempts,
        verified,
        purpose
      )
      VALUES (?, ?, ?, ?, 0, 0, 'registration')
    `).run(
      user.id,
      user.email,
      otpHash,
      expiresAt
    );

    try {
      await sendOtpEmail(
        user.email,
        otp
      );
    } catch (emailError) {
      console.error(
        "RESEND REGISTRATION OTP EMAIL ERROR:",
        emailError
      );

      db.prepare(`
        UPDATE email_otps
        SET verified = 1
        WHERE user_id = ?
          AND purpose = 'registration'
          AND verified = 0
      `).run(user.id);

      return res.status(500).json({
        success: false,
        message: "Unable to resend verification email"
      });
    }

    const newChallengeToken = jwt.sign(
      {
        userId: user.id,
        purpose: "registration_verification"
      },
      JWT_SECRET,
      {
        expiresIn: "10m"
      }
    );

    return res.json({
      success: true,
      challengeToken: newChallengeToken,
      message: "A new verification OTP has been sent.",
      expiresIn: 600
    });

  } catch (error) {
    console.error(
      "RESEND REGISTRATION OTP ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Unable to resend OTP"
    });
  }
});


/* =========================================================
   LOGIN
========================================================= */

router.post("/login", async (req, res) => {
  try {
    let { username, password } = req.body;

    username = String(username || "").trim();
    password = String(password || "");

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: "Username and password are required"
      });
    }

    const user = db.prepare(`
      SELECT *
      FROM users
      WHERE LOWER(username) = LOWER(?)
      LIMIT 1
    `).get(username);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid username or password"
      });
    }

    const passwordMatch = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (!passwordMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid username or password"
      });
    }

    // EMAIL VERIFICATION CHECK
    if (Number(user.email_verified) !== 1) {
      return res.status(403).json({
        success: false,
        requiresEmailVerification: true,
        message: "Please verify your email before logging in."
      });
    }

    /* =====================================================
       LOGIN 2FA
    ===================================================== */

    if (Number(user.two_factor_enabled) === 1) {
      const otp = generateOtp();
      const otpHash = hashOtp(otp);
      const expiresAt = createOtpExpiry();

      // Invalidate previous login OTPs
      db.prepare(`
        UPDATE email_otps
        SET verified = 1
        WHERE user_id = ?
          AND purpose = 'login_2fa'
          AND verified = 0
      `).run(user.id);

      // Save new login OTP
      db.prepare(`
        INSERT INTO email_otps (
          user_id,
          email,
          otp_hash,
          expires_at,
          attempts,
          verified,
          purpose
        )
        VALUES (?, ?, ?, ?, 0, 0, 'login_2fa')
      `).run(
        user.id,
        user.email,
        otpHash,
        expiresAt
      );

      try {
        await sendOtpEmail(
          user.email,
          otp
        );
      } catch (emailError) {
        console.error(
          "LOGIN 2FA EMAIL ERROR:",
          emailError
        );

        db.prepare(`
          UPDATE email_otps
          SET verified = 1
          WHERE user_id = ?
            AND purpose = 'login_2fa'
            AND verified = 0
        `).run(user.id);

        return res.status(500).json({
          success: false,
          message: "Unable to send 2FA OTP"
        });
      }

      const challengeToken = jwt.sign(
        {
          userId: user.id,
          purpose: "login_2fa"
        },
        JWT_SECRET,
        {
          expiresIn: "10m"
        }
      );

      return res.json({
        success: true,
        requiresTwoFactor: true,
        challengeToken,
        message: "2FA verification required",
        expiresIn: 600
      });
    }

    /* =====================================================
       NORMAL LOGIN
    ===================================================== */

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
      message: "Login successful",
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        referral_code: user.referral_code,
        kyc_status: user.kyc_status,
        email_verified: user.email_verified,
        created_at: user.created_at
      }
    });

  } catch (error) {
    console.error("LOGIN ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Login failed"
    });
  }
});



// ==================== FORGOT PASSWORD ====================

router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || !email.trim()) {
      return res.status(400).json({
        success: false,
        message: "Email is required."
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const user = db
      .prepare("SELECT id, username, email FROM users WHERE LOWER(email) = ?")
      .get(normalizedEmail);

    // Do not reveal whether an email exists.
    if (!user) {
      return res.json({
        success: true,
        message: "If this email is registered, a verification code has been sent."
      });
    }

    const otp = generateOtp();
    const otpHash = hashOtp(otp);
    const expiresAt = createOtpExpiry();

    db.prepare(`
      UPDATE email_otps
      SET verified = 1
      WHERE user_id = ?
        AND purpose = 'password_reset'
        AND verified = 0
    `).run(user.id);

    db.prepare(`
      INSERT INTO email_otps
      (user_id, email, otp_hash, expires_at, verified, purpose, attempts, created_at)
      VALUES (?, ?, ?, ?, 0, 'password_reset', 0, datetime('now'))
    `).run(
      user.id,
      user.email,
      otpHash,
      expiresAt
    );

    await sendOtpEmail(user.email, otp);

    const challengeToken = jwt.sign(
      {
        userId: user.id,
        purpose: "password_reset"
      },
      process.env.JWT_SECRET,
      { expiresIn: "10m" }
    );

    return res.json({
      success: true,
      message: "If this email is registered, a verification code has been sent.",
      challengeToken,
      expiresIn: 600
    });
  } catch (error) {
    console.error("FORGOT PASSWORD ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to send password reset code."
    });
  }
});

router.post("/forgot-password/verify", async (req, res) => {
  try {
    const { challengeToken, otp, newPassword } = req.body;

    if (!challengeToken || !otp || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Verification code and new password are required."
      });
    }

    if (!/^\d{6}$/.test(String(otp).trim())) {
      return res.status(400).json({
        success: false,
        message: "Please enter the 6-digit OTP."
      });
    }

    if (String(newPassword).length < 8) {
      return res.status(400).json({
        success: false,
        message: "New password must be at least 8 characters."
      });
    }

    let payload;

    try {
      payload = jwt.verify(
        challengeToken,
        process.env.JWT_SECRET
      );
    } catch {
      return res.status(400).json({
        success: false,
        message: "Reset session expired. Please request a new OTP."
      });
    }

    if (payload.purpose !== "password_reset") {
      return res.status(400).json({
        success: false,
        message: "Invalid password reset session."
      });
    }

    const record = db.prepare(`
      SELECT *
      FROM email_otps
      WHERE user_id = ?
        AND purpose = 'password_reset'
        AND verified = 0
      ORDER BY id DESC
      LIMIT 1
    `).get(payload.userId);

    if (!record) {
      return res.status(400).json({
        success: false,
        message: "OTP not found. Please request a new code."
      });
    }

    if (new Date(record.expires_at).getTime() < Date.now()) {
      return res.status(400).json({
        success: false,
        message: "OTP has expired. Please request a new code."
      });
    }

    if ((record.attempts || 0) >= 5) {
      return res.status(429).json({
        success: false,
        message: "Too many incorrect attempts. Please request a new code."
      });
    }

    const incomingHash = hashOtp(String(otp).trim());

    if (incomingHash !== record.otp_hash) {
      db.prepare(`
        UPDATE email_otps
        SET attempts = attempts + 1
        WHERE id = ?
      `).run(record.id);

      return res.status(400).json({
        success: false,
        message: "Invalid verification code."
      });
    }

    const passwordHash = await bcrypt.hash(
      String(newPassword),
      12
    );

    const transaction = db.transaction(() => {
      db.prepare(`
        UPDATE users
        SET password_hash = ?
        WHERE id = ?
      `).run(passwordHash, payload.userId);

      db.prepare(`
        UPDATE email_otps
        SET verified = 1
        WHERE id = ?
      `).run(record.id);
    });

    transaction();

    return res.json({
      success: true,
      message: "Password reset successfully. Please login with your new password."
    });
  } catch (error) {
    console.error("PASSWORD RESET VERIFY ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to reset password."
    });
  }
});

module.exports = router;
