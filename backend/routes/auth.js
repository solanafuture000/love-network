const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const db = require("../database");
const { sendOtpEmail } = require("../services/otpService");

const router = express.Router();

const JWT_SECRET =
  process.env.JWT_SECRET || "love-network-dev-secret";

const OTP_EXPIRY_MINUTES = 10;
const MAX_OTP_ATTEMPTS = 5;


/* =========================================================
   REFERRAL CODE
========================================================= */

function generateReferralCode(username, userId) {
  const base = username
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase()
    .slice(0, 8) || "LOVE";

  return `${base}${userId}`;
}


/* =========================================================
   OTP HELPERS
========================================================= */

function generateOtp() {
  return crypto.randomInt(100000, 1000000).toString();
}


function hashOtp(otp) {
  return crypto
    .createHash("sha256")
    .update(String(otp))
    .digest("hex");
}


function createChallengeToken(userId, email, purpose) {
  return jwt.sign(
    {
      userId,
      email,
      purpose
    },
    JWT_SECRET,
    {
      expiresIn: `${OTP_EXPIRY_MINUTES}m`
    }
  );
}


function verifyChallengeToken(challengeToken, expectedPurpose) {
  try {
    const decoded = jwt.verify(
      challengeToken,
      JWT_SECRET
    );

    if (decoded.purpose !== expectedPurpose) {
      return null;
    }

    return decoded;
  } catch (error) {
    return null;
  }
}


function createOtpRecord(userId, email, purpose) {
  const otp = generateOtp();
  const otpHash = hashOtp(otp);

  const expiresAt = new Date(
    Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000
  ).toISOString();

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
    VALUES (?, ?, ?, ?, 0, 0, ?)
  `).run(
    userId,
    email,
    otpHash,
    expiresAt,
    purpose
  );

  return otp;
}


async function sendOtp(userId, email, purpose) {
  const otp = createOtpRecord(
    userId,
    email,
    purpose
  );

  await sendOtpEmail(
    email,
    otp
  );
}


/* =========================================================
   REGISTER
========================================================= */

router.post("/register", async (req, res) => {
  try {
    let {
      username,
      email,
      password,
      referralCode
    } = req.body;

    username = String(username || "").trim();
    email = String(email || "").trim().toLowerCase();
    password = String(password || "");
    referralCode = String(referralCode || "")
      .trim()
      .toUpperCase();


    /* ---------------------------------------------
       VALIDATION
    --------------------------------------------- */

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


    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid email address"
      });
    }


    /* ---------------------------------------------
       CHECK EXISTING USER
    --------------------------------------------- */

    const existingUser = db.prepare(`
      SELECT
        id,
        username,
        email,
        email_verified
      FROM users
      WHERE LOWER(username) = LOWER(?)
         OR LOWER(email) = LOWER(?)
      LIMIT 1
    `).get(
      username,
      email
    );


    if (existingUser) {

      if (
        String(existingUser.email || "").toLowerCase() === email &&
        Number(existingUser.email_verified) === 0
      ) {
        return res.status(409).json({
          success: false,
          message: "This email is already registered but not verified. Please complete email verification."
        });
      }

      return res.status(409).json({
        success: false,
        message: "Username or email already exists"
      });
    }


    /* ---------------------------------------------
       REFERRAL
    --------------------------------------------- */

    let referrer = null;

    if (referralCode) {
      referrer = db.prepare(`
        SELECT
          id,
          username
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


    /* ---------------------------------------------
       PASSWORD HASH
    --------------------------------------------- */

    const passwordHash = await bcrypt.hash(
      password,
      12
    );


    /* ---------------------------------------------
       CREATE PENDING USER
    --------------------------------------------- */

    const createUser = db.transaction(() => {

      const result = db.prepare(`
        INSERT INTO users (
          username,
          email,
          password_hash,
          role,
          kyc_status,
          email_verified,
          two_factor_enabled
        )
        VALUES (?, ?, ?, 'USER', 'not_started', 0, 1)
      `).run(
        username,
        email,
        passwordHash
      );


      const userId = Number(
        result.lastInsertRowid
      );


      /* -----------------------------------------
         GENERATE REFERRAL CODE
      ----------------------------------------- */

      let generatedReferralCode =
        generateReferralCode(
          username,
          userId
        );


      let codeExists = db.prepare(`
        SELECT id
        FROM users
        WHERE referral_code = ?
      `).get(
        generatedReferralCode
      );


      let counter = 1;


      while (codeExists) {

        generatedReferralCode =
          `${generateReferralCode(
            username,
            userId
          )}${counter++}`;


        codeExists = db.prepare(`
          SELECT id
          FROM users
          WHERE referral_code = ?
        `).get(
          generatedReferralCode
        );
      }


      /* -----------------------------------------
         SAVE REFERRAL CODE
      ----------------------------------------- */

      db.prepare(`
        UPDATE users
        SET referral_code = ?
        WHERE id = ?
      `).run(
        generatedReferralCode,
        userId
      );


      /* -----------------------------------------
         CREATE WALLET
      ----------------------------------------- */

      db.prepare(`
        INSERT INTO wallets (
          user_id,
          balance,
          total_mined
        )
        VALUES (?, 0, 0)
      `).run(
        userId
      );


      /* -----------------------------------------
         CREATE REFERRAL RELATIONSHIP
      ----------------------------------------- */

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


      return userId;
    });


    const userId = createUser();


    /* ---------------------------------------------
       CREATE OTP
    --------------------------------------------- */

    const challengeToken =
      createChallengeToken(
        userId,
        email,
        "registration"
      );


    /* ---------------------------------------------
       SEND REGISTRATION OTP
    --------------------------------------------- */

    try {

      await sendOtp(
        userId,
        email,
        "registration"
      );

    } catch (emailError) {

      console.error(
        "REGISTRATION OTP EMAIL ERROR:",
        emailError
      );

      return res.status(503).json({
        success: false,
        message: "Account created as pending verification, but the verification email could not be sent. Please try again."
      });
    }


    /* ---------------------------------------------
       REGISTRATION RESPONSE
    --------------------------------------------- */

    return res.status(201).json({
      success: true,
      message: "Verification code sent to your email.",
      requiresEmailVerification: true,
      challengeToken,
      email
    });


  } catch (error) {

    console.error(
      "REGISTER ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Registration failed"
    });
  }
});


/* =========================================================
   REGISTER OTP VERIFY
========================================================= */

router.post(
  "/register/verify",
  async (req, res) => {

    try {

      const {
        challengeToken,
        otp
      } = req.body;


      if (!challengeToken || !otp) {
        return res.status(400).json({
          success: false,
          message: "Verification token and OTP are required"
        });
      }


      if (!/^\d{6}$/.test(String(otp).trim())) {
        return res.status(400).json({
          success: false,
          message: "Please enter the 6-digit OTP"
        });
      }


      const decoded =
        verifyChallengeToken(
          challengeToken,
          "registration"
        );


      if (!decoded) {
        return res.status(400).json({
          success: false,
          message: "Verification code has expired. Please register again."
        });
      }


      const user = db.prepare(`
        SELECT
          id,
          username,
          email,
          email_verified
        FROM users
        WHERE id = ?
        LIMIT 1
      `).get(
        decoded.userId
      );


      if (!user) {
        return res.status(404).json({
          success: false,
          message: "Registration account not found"
        });
      }


      if (Number(user.email_verified) === 1) {
        return res.status(400).json({
          success: false,
          message: "Email is already verified"
        });
      }


      const otpRecord = db.prepare(`
        SELECT *
        FROM email_otps
        WHERE user_id = ?
          AND purpose = 'registration'
          AND verified = 0
        ORDER BY id DESC
        LIMIT 1
      `).get(
        user.id
      );


      if (!otpRecord) {
        return res.status(400).json({
          success: false,
          message: "Verification code not found"
        });
      }


      if (
        new Date(otpRecord.expires_at).getTime() <
        Date.now()
      ) {
        return res.status(400).json({
          success: false,
          message: "Verification code has expired"
        });
      }


      if (
        Number(otpRecord.attempts) >=
        MAX_OTP_ATTEMPTS
      ) {
        return res.status(429).json({
          success: false,
          message: "Too many incorrect attempts. Please register again."
        });
      }


      const otpHash =
        hashOtp(
          String(otp).trim()
        );


      if (otpHash !== otpRecord.otp_hash) {

        db.prepare(`
          UPDATE email_otps
          SET attempts = attempts + 1
          WHERE id = ?
        `).run(
          otpRecord.id
        );

        return res.status(400).json({
          success: false,
          message: "Invalid verification code"
        });
      }


      db.transaction(() => {

        db.prepare(`
          UPDATE email_otps
          SET verified = 1
          WHERE id = ?
        `).run(
          otpRecord.id
        );


        db.prepare(`
          UPDATE users
          SET email_verified = 1
          WHERE id = ?
        `).run(
          user.id
        );

      })();


      return res.json({
        success: true,
        message: "Email verified successfully. Please login."
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
  }
);


/* =========================================================
   RESEND REGISTRATION OTP
========================================================= */

router.post(
  "/register/resend",
  async (req, res) => {

    try {

      const {
        email
      } = req.body;


      const normalizedEmail =
        String(email || "")
          .trim()
          .toLowerCase();


      if (!normalizedEmail) {
        return res.status(400).json({
          success: false,
          message: "Email is required"
        });
      }


      const user = db.prepare(`
        SELECT
          id,
          email,
          email_verified
        FROM users
        WHERE LOWER(email) = LOWER(?)
        LIMIT 1
      `).get(
        normalizedEmail
      );


      if (!user) {
        return res.status(404).json({
          success: false,
          message: "Registration not found"
        });
      }


      if (Number(user.email_verified) === 1) {
        return res.status(400).json({
          success: false,
          message: "Email is already verified"
        });
      }


      const challengeToken =
        createChallengeToken(
          user.id,
          user.email,
          "registration"
        );


      await sendOtp(
        user.id,
        user.email,
        "registration"
      );


      return res.json({
        success: true,
        message: "Verification code sent again.",
        challengeToken,
        email: user.email
      });


    } catch (error) {

      console.error(
        "RESEND REGISTRATION OTP ERROR:",
        error
      );

      return res.status(503).json({
        success: false,
        message: "Unable to send verification email"
      });
    }
  }
);


/* =========================================================
   LOGIN
========================================================= */

router.post("/login", async (req, res) => {

  try {

    let {
      email,
      password
    } = req.body;


    email = String(email || "").trim().toLowerCase();
    password = String(password || "");


    /* ---------------------------------------------
       VALIDATION
    --------------------------------------------- */

    if (!email || !password) {

      return res.status(400).json({
        success: false,
        message: "Email and password are required"
      });
    }


    /* ---------------------------------------------
       FIND USER BY EMAIL
    --------------------------------------------- */

    const user = db.prepare(`
      SELECT *
      FROM users
      WHERE LOWER(email) = LOWER(?)
      LIMIT 1
    `).get(
      email
    );


    if (!user) {

      return res.status(401).json({
        success: false,
        message: "Invalid email or password"
      });
    }


    /* ---------------------------------------------
       EMAIL VERIFICATION
    --------------------------------------------- */

    if (Number(user.email_verified) !== 1) {

      return res.status(403).json({
        success: false,
        message: "Please verify your email before logging in."
      });
    }


    /* ---------------------------------------------
       PASSWORD
    --------------------------------------------- */

    const passwordMatch =
      await bcrypt.compare(
        password,
        user.password_hash
      );


    if (!passwordMatch) {

      return res.status(401).json({
        success: false,
        message: "Invalid email or password"
      });
    }


    /* ---------------------------------------------
       CREATE LOGIN OTP
    --------------------------------------------- */

    const challengeToken =
      createChallengeToken(
        user.id,
        user.email,
        "login"
      );


    try {

      await sendOtp(
        user.id,
        user.email,
        "login"
      );

    } catch (emailError) {

      console.error(
        "LOGIN OTP EMAIL ERROR:",
        emailError
      );

      return res.status(503).json({
        success: false,
        message: "Unable to send login verification code. Please try again."
      });
    }


    /* ---------------------------------------------
       OTP REQUIRED
    --------------------------------------------- */

    return res.json({
      success: true,
      message: "Verification code sent to your email.",
      requiresTwoFactor: true,
      challengeToken
    });


  } catch (error) {

    console.error(
      "LOGIN ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Login failed"
    });
  }
});


/* =========================================================
   LOGIN OTP VERIFY
========================================================= */

router.post(
  "/otp/2fa/login/verify",
  async (req, res) => {

    try {

      const {
        challengeToken,
        otp
      } = req.body;


      if (!challengeToken || !otp) {
        return res.status(400).json({
          success: false,
          message: "Verification token and OTP are required"
        });
      }


      if (!/^\d{6}$/.test(String(otp).trim())) {
        return res.status(400).json({
          success: false,
          message: "Please enter the 6-digit OTP"
        });
      }


      const decoded =
        verifyChallengeToken(
          challengeToken,
          "login"
        );


      if (!decoded) {
        return res.status(400).json({
          success: false,
          message: "Login verification code has expired. Please login again."
        });
      }


      const user = db.prepare(`
        SELECT *
        FROM users
        WHERE id = ?
        LIMIT 1
      `).get(
        decoded.userId
      );


      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found"
        });
      }


      const otpRecord = db.prepare(`
        SELECT *
        FROM email_otps
        WHERE user_id = ?
          AND purpose = 'login'
          AND verified = 0
        ORDER BY id DESC
        LIMIT 1
      `).get(
        user.id
      );


      if (!otpRecord) {
        return res.status(400).json({
          success: false,
          message: "Login verification code not found"
        });
      }


      if (
        new Date(otpRecord.expires_at).getTime() <
        Date.now()
      ) {
        return res.status(400).json({
          success: false,
          message: "Login verification code has expired"
        });
      }


      if (
        Number(otpRecord.attempts) >=
        MAX_OTP_ATTEMPTS
      ) {
        return res.status(429).json({
          success: false,
          message: "Too many incorrect attempts. Please login again."
        });
      }


      const otpHash =
        hashOtp(
          String(otp).trim()
        );


      if (otpHash !== otpRecord.otp_hash) {

        db.prepare(`
          UPDATE email_otps
          SET attempts = attempts + 1
          WHERE id = ?
        `).run(
          otpRecord.id
        );

        return res.status(400).json({
          success: false,
          message: "Invalid verification code"
        });
      }


      db.prepare(`
        UPDATE email_otps
        SET verified = 1
        WHERE id = ?
      `).run(
        otpRecord.id
      );


      /* ---------------------------------------------
         CREATE FINAL LOGIN TOKEN
      --------------------------------------------- */

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
          email_verified: 1,
          created_at: user.created_at
        }
      });


    } catch (error) {

      console.error(
        "LOGIN OTP VERIFY ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        message: "OTP verification failed"
      });
    }
  }
);


/* =========================================================
   FORGOT PASSWORD
========================================================= */

router.post(
  "/forgot-password",
  async (req, res) => {

    try {

      const email =
        String(req.body.email || "")
          .trim()
          .toLowerCase();


      if (!email) {
        return res.status(400).json({
          success: false,
          message: "Email is required"
        });
      }


      const user = db.prepare(`
        SELECT
          id,
          email,
          email_verified
        FROM users
        WHERE LOWER(email) = LOWER(?)
        LIMIT 1
      `).get(
        email
      );


      if (!user) {
        return res.status(404).json({
          success: false,
          message: "No account found with this email"
        });
      }


      if (Number(user.email_verified) !== 1) {
        return res.status(403).json({
          success: false,
          message: "Please verify your email first."
        });
      }


      const challengeToken =
        createChallengeToken(
          user.id,
          user.email,
          "forgot_password"
        );


      try {

        await sendOtp(
          user.id,
          user.email,
          "forgot_password"
        );

      } catch (emailError) {

        console.error(
          "FORGOT PASSWORD OTP EMAIL ERROR:",
          emailError
        );

        return res.status(503).json({
          success: false,
          message: "Unable to send password reset code"
        });
      }


      return res.json({
        success: true,
        message: "Password reset code sent to your email.",
        challengeToken
      });


    } catch (error) {

      console.error(
        "FORGOT PASSWORD ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        message: "Unable to process password reset"
      });
    }
  }
);


/* =========================================================
   PASSWORD RESET VERIFY
========================================================= */

router.post(
  "/forgot-password/verify",
  async (req, res) => {

    try {

      const {
        challengeToken,
        otp,
        newPassword
      } = req.body;


      if (
        !challengeToken ||
        !otp ||
        !newPassword
      ) {
        return res.status(400).json({
          success: false,
          message: "Verification token, OTP and new password are required"
        });
      }


      if (!/^\d{6}$/.test(String(otp).trim())) {
        return res.status(400).json({
          success: false,
          message: "Please enter the 6-digit OTP"
        });
      }


      if (String(newPassword).length < 8) {
        return res.status(400).json({
          success: false,
          message: "New password must be at least 8 characters"
        });
      }


      const decoded =
        verifyChallengeToken(
          challengeToken,
          "forgot_password"
        );


      if (!decoded) {
        return res.status(400).json({
          success: false,
          message: "Password reset code has expired. Please request a new code."
        });
      }


      const user = db.prepare(`
        SELECT *
        FROM users
        WHERE id = ?
        LIMIT 1
      `).get(
        decoded.userId
      );


      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found"
        });
      }


      const otpRecord = db.prepare(`
        SELECT *
        FROM email_otps
        WHERE user_id = ?
          AND purpose = 'forgot_password'
          AND verified = 0
        ORDER BY id DESC
        LIMIT 1
      `).get(
        user.id
      );


      if (!otpRecord) {
        return res.status(400).json({
          success: false,
          message: "Password reset code not found"
        });
      }


      if (
        new Date(otpRecord.expires_at).getTime() <
        Date.now()
      ) {
        return res.status(400).json({
          success: false,
          message: "Password reset code has expired"
        });
      }


      if (
        Number(otpRecord.attempts) >=
        MAX_OTP_ATTEMPTS
      ) {
        return res.status(429).json({
          success: false,
          message: "Too many incorrect attempts. Please request a new code."
        });
      }


      const otpHash =
        hashOtp(
          String(otp).trim()
        );


      if (otpHash !== otpRecord.otp_hash) {

        db.prepare(`
          UPDATE email_otps
          SET attempts = attempts + 1
          WHERE id = ?
        `).run(
          otpRecord.id
        );

        return res.status(400).json({
          success: false,
          message: "Invalid verification code"
        });
      }


      const passwordHash =
        await bcrypt.hash(
          String(newPassword),
          12
        );


      db.transaction(() => {

        db.prepare(`
          UPDATE email_otps
          SET verified = 1
          WHERE id = ?
        `).run(
          otpRecord.id
        );


        db.prepare(`
          UPDATE users
          SET password_hash = ?
          WHERE id = ?
        `).run(
          passwordHash,
          user.id
        );

      })();


      return res.json({
        success: true,
        message: "Password reset successfully. Please login."
      });


    } catch (error) {

      console.error(
        "PASSWORD RESET VERIFY ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        message: "Password reset failed"
      });
    }
  }
);


/* =========================================================
   EXPORT
========================================================= */

module.exports = router;
