const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const db = require("../database-pg");
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
   MOBILE HELPERS
========================================================= */

function normalizeCountryCode(value) {
  let code = String(value || "").trim();

  code = code.replace(/[^\d+]/g, "");

  if (!code) {
    return "";
  }

  if (!code.startsWith("+")) {
    code = `+${code}`;
  }

  return code;
}


function normalizeMobile(value, countryCode = "") {
  let mobile = String(value || "").trim();

  mobile = mobile.replace(/[^\d+]/g, "");

  if (!mobile) {
    return "";
  }

  /*
    react-phone-number-input normally returns E.164:

    +923001234567

    If a plain national number is received,
    country code will be added automatically.
  */

  if (!mobile.startsWith("+")) {
    const normalizedCode =
      normalizeCountryCode(countryCode);

    const nationalNumber =
      mobile.replace(/\D/g, "");

    mobile =
      `${normalizedCode}${nationalNumber}`;
  }

  return mobile;
}


function isValidCountryCode(countryCode) {
  return /^\+\d{1,4}$/.test(countryCode);
}


function isValidMobile(mobile) {
  /*
    E.164 maximum is 15 digits including country code.
    Minimum kept at 7 digits to support international numbers.
  */

  return /^\+\d{7,15}$/.test(mobile);
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


function verifyChallengeToken(
  challengeToken,
  expectedPurpose
) {
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


async function createOtpRecord(
  userId,
  email,
  purpose
) {
  const otp = generateOtp();
  const otpHash = hashOtp(otp);

  const expiresAt = new Date(
    Date.now() +
      OTP_EXPIRY_MINUTES * 60 * 1000
  );

  await db.query(
    `
    INSERT INTO email_otps (
      user_id,
      email,
      otp_hash,
      expires_at,
      attempts,
      verified,
      purpose
    )
    VALUES ($1, $2, $3, $4, 0, FALSE, $5)
    `,
    [
      userId,
      email,
      otpHash,
      expiresAt,
      purpose
    ]
  );

  return otp;
}


async function sendOtp(
  userId,
  email,
  purpose
) {
  const otp = await createOtpRecord(
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

router.post(
  "/register",
  async (req, res) => {
    let client;

    try {
      let {
        username,
        email,
        password,
        referralCode,
        countryCode,
        mobile
      } = req.body;

      username =
        String(username || "").trim();

      email =
        String(email || "")
          .trim()
          .toLowerCase();

      password =
        String(password || "");

      referralCode =
        String(referralCode || "")
          .trim()
          .toUpperCase();

      countryCode =
        normalizeCountryCode(countryCode);

      mobile =
        normalizeMobile(
          mobile,
          countryCode
        );


      /* ---------------------------------------------
         VALIDATION
      --------------------------------------------- */

      if (
        !username ||
        !email ||
        !password ||
        !countryCode ||
        !mobile
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Username, email, country code, mobile and password are required"
        });
      }


      if (
        username.length < 3 ||
        username.length > 30
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Username must be between 3 and 30 characters"
        });
      }


      if (password.length < 6) {
        return res.status(400).json({
          success: false,
          message:
            "Password must be at least 6 characters"
        });
      }


      if (
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
          email
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Please enter a valid email address"
        });
      }


      if (
        !isValidCountryCode(countryCode)
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Please select a valid country code"
        });
      }


      if (!isValidMobile(mobile)) {
        return res.status(400).json({
          success: false,
          message:
            "Please enter a valid international mobile number"
        });
      }


      if (
        !mobile.startsWith(countryCode)
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Mobile number does not match the selected country code"
        });
      }


      /* ---------------------------------------------
         CHECK EXISTING USER
      --------------------------------------------- */

      const existingUserResult =
        await db.query(
          `
          SELECT
            id,
            username,
            email,
            mobile,
            email_verified
          FROM users
          WHERE LOWER(username) = LOWER($1)
             OR LOWER(email) = LOWER($2)
             OR mobile = $3
          LIMIT 1
          `,
          [
            username,
            email,
            mobile
          ]
        );

      const existingUser =
        existingUserResult.rows[0];


      if (existingUser) {

        if (
          String(
            existingUser.email || ""
          ).toLowerCase() === email &&
          existingUser.email_verified === false
        ) {
          return res.status(409).json({
            success: false,
            message:
              "This email is already registered but not verified. Please complete email verification."
          });
        }


        if (
          existingUser.mobile === mobile
        ) {
          return res.status(409).json({
            success: false,
            message:
              "This mobile number is already registered"
          });
        }


        return res.status(409).json({
          success: false,
          message:
            "Username or email already exists"
        });
      }


      /* ---------------------------------------------
         REFERRAL
      --------------------------------------------- */

      let referrer = null;

      if (referralCode) {

        const referrerResult =
          await db.query(
            `
            SELECT
              id,
              username
            FROM users
            WHERE UPPER(referral_code) = UPPER($1)
            LIMIT 1
            `,
            [
              referralCode
            ]
          );

        referrer =
          referrerResult.rows[0] ||
          null;


        if (!referrer) {
          return res.status(400).json({
            success: false,
            message:
              "Invalid referral code"
          });
        }
      }


      /* ---------------------------------------------
         PASSWORD HASH
      --------------------------------------------- */

      const passwordHash =
        await bcrypt.hash(
          password,
          12
        );


      /* ---------------------------------------------
         CREATE USER + WALLET + REFERRAL
      --------------------------------------------- */

      client =
        await db.pool.connect();

      await client.query("BEGIN");


      const createUserResult =
        await client.query(
          `
          INSERT INTO users (
            username,
            email,
            country_code,
            mobile,
            password_hash,
            role,
            kyc_status,
            email_verified,
            two_factor_enabled
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            'USER',
            'not_started',
            FALSE,
            TRUE
          )
          RETURNING id
          `,
          [
            username,
            email,
            countryCode,
            mobile,
            passwordHash
          ]
        );


      const userId =
        createUserResult.rows[0].id;


      /* ---------------------------------------------
         GENERATE UNIQUE REFERRAL CODE
      --------------------------------------------- */

      let generatedReferralCode =
        generateReferralCode(
          username,
          userId
        );


      let codeExistsResult =
        await client.query(
          `
          SELECT id
          FROM users
          WHERE referral_code = $1
          LIMIT 1
          `,
          [
            generatedReferralCode
          ]
        );


      let counter = 1;


      while (
        codeExistsResult.rows.length > 0
      ) {

        generatedReferralCode =
          `${generateReferralCode(
            username,
            userId
          )}${counter++}`;


        codeExistsResult =
          await client.query(
            `
            SELECT id
            FROM users
            WHERE referral_code = $1
            LIMIT 1
            `,
            [
              generatedReferralCode
            ]
          );
      }


      /* ---------------------------------------------
         SAVE REFERRAL CODE
      --------------------------------------------- */

      await client.query(
        `
        UPDATE users
        SET referral_code = $1
        WHERE id = $2
        `,
        [
          generatedReferralCode,
          userId
        ]
      );


      /* ---------------------------------------------
         CREATE WALLET
      --------------------------------------------- */

      await client.query(
        `
        INSERT INTO wallets (
          user_id,
          balance,
          total_mined
        )
        VALUES ($1, 0, 0)
        `,
        [
          userId
        ]
      );


      /* ---------------------------------------------
         CREATE REFERRAL RELATIONSHIP
      --------------------------------------------- */

      if (referrer) {

        await client.query(
          `
          INSERT INTO referrals (
            referrer_user_id,
            referred_user_id,
            status,
            reward_rate,
            total_reward
          )
          VALUES (
            $1,
            $2,
            'PENDING_KYC',
            0,
            0
          )
          `,
          [
            referrer.id,
            userId
          ]
        );
      }


      await client.query("COMMIT");

      client.release();
      client = null;


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
          message:
            "Account created as pending verification, but the verification email could not be sent. Please try again."
        });
      }


      /* ---------------------------------------------
         REGISTRATION RESPONSE
      --------------------------------------------- */

      return res.status(201).json({
        success: true,
        message:
          "Verification code sent to your email.",
        requiresEmailVerification: true,
        challengeToken,
        email,
        countryCode,
        mobile
      });


    } catch (error) {

      if (client) {

        try {
          await client.query(
            "ROLLBACK"
          );
        } catch (rollbackError) {

          console.error(
            "REGISTER ROLLBACK ERROR:",
            rollbackError
          );
        }

        client.release();
      }


      console.error(
        "REGISTER ERROR:",
        error
      );


      if (error.code === "23505") {

        if (
          String(
            error.constraint || ""
          ).includes("mobile")
        ) {
          return res.status(409).json({
            success: false,
            message:
              "This mobile number is already registered"
          });
        }

        return res.status(409).json({
          success: false,
          message:
            "Username, email or mobile number already exists"
        });
      }


      return res.status(500).json({
        success: false,
        message:
          "Registration failed"
      });
    }
  }
);


/* =========================================================
   REGISTER OTP VERIFY
========================================================= */

router.post(
  "/register/verify",
  async (req, res) => {

    let client;

    try {

      const {
        challengeToken,
        otp
      } = req.body;


      if (
        !challengeToken ||
        !otp
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Verification token and OTP are required"
        });
      }


      if (
        !/^\d{6}$/.test(
          String(otp).trim()
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Please enter the 6-digit OTP"
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
          message:
            "Verification code has expired. Please register again."
        });
      }


      const userResult =
        await db.query(
          `
          SELECT
            id,
            username,
            email,
            email_verified
          FROM users
          WHERE id = $1
          LIMIT 1
          `,
          [
            decoded.userId
          ]
        );


      const user =
        userResult.rows[0];


      if (!user) {
        return res.status(404).json({
          success: false,
          message:
            "Registration account not found"
        });
      }


      if (
        user.email_verified === true
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Email is already verified"
        });
      }


      const otpResult =
        await db.query(
          `
          SELECT *
          FROM email_otps
          WHERE user_id = $1
            AND purpose = 'registration'
            AND verified = FALSE
          ORDER BY id DESC
          LIMIT 1
          `,
          [
            user.id
          ]
        );


      const otpRecord =
        otpResult.rows[0];


      if (!otpRecord) {
        return res.status(400).json({
          success: false,
          message:
            "Verification code not found"
        });
      }


      if (
        new Date(
          otpRecord.expires_at
        ).getTime() <
        Date.now()
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Verification code has expired"
        });
      }


      if (
        Number(
          otpRecord.attempts
        ) >= MAX_OTP_ATTEMPTS
      ) {
        return res.status(429).json({
          success: false,
          message:
            "Too many incorrect attempts. Please register again."
        });
      }


      const otpHash =
        hashOtp(
          String(otp).trim()
        );


      if (
        otpHash !==
        otpRecord.otp_hash
      ) {

        await db.query(
          `
          UPDATE email_otps
          SET attempts = attempts + 1
          WHERE id = $1
          `,
          [
            otpRecord.id
          ]
        );

        return res.status(400).json({
          success: false,
          message:
            "Invalid verification code"
        });
      }


      client =
        await db.pool.connect();

      await client.query("BEGIN");


      await client.query(
        `
        UPDATE email_otps
        SET verified = TRUE
        WHERE id = $1
        `,
        [
          otpRecord.id
        ]
      );


      await client.query(
        `
        UPDATE users
        SET email_verified = TRUE
        WHERE id = $1
        `,
        [
          user.id
        ]
      );


      await client.query("COMMIT");

      client.release();
      client = null;


      return res.json({
        success: true,
        message:
          "Email verified successfully. Please login."
      });


    } catch (error) {

      if (client) {

        try {
          await client.query(
            "ROLLBACK"
          );
        } catch (rollbackError) {

          console.error(
            "REGISTER OTP ROLLBACK ERROR:",
            rollbackError
          );
        }

        client.release();
      }


      console.error(
        "REGISTRATION OTP VERIFY ERROR:",
        error
      );


      return res.status(500).json({
        success: false,
        message:
          "OTP verification failed"
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
          message:
            "Email is required"
        });
      }


      const userResult =
        await db.query(
          `
          SELECT
            id,
            email,
            email_verified
          FROM users
          WHERE LOWER(email) = LOWER($1)
          LIMIT 1
          `,
          [
            normalizedEmail
          ]
        );


      const user =
        userResult.rows[0];


      if (!user) {
        return res.status(404).json({
          success: false,
          message:
            "Registration not found"
        });
      }


      if (
        user.email_verified === true
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Email is already verified"
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
        message:
          "Verification code sent again.",
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
        message:
          "Unable to send verification email"
      });
    }
  }
);


/* =========================================================
   LOGIN
   EMAIL OR MOBILE
========================================================= */

router.post(
  "/login",
  async (req, res) => {

    try {

      let {
        email,
        mobile,
        countryCode,
        password
      } = req.body;


      email =
        String(email || "")
          .trim()
          .toLowerCase();

      countryCode =
        normalizeCountryCode(
          countryCode
        );

      mobile =
        normalizeMobile(
          mobile,
          countryCode
        );

      password =
        String(password || "");


      /* ---------------------------------------------
         VALIDATION
      --------------------------------------------- */

      if (!password) {
        return res.status(400).json({
          success: false,
          message:
            "Password is required"
        });
      }


      if (!email && !mobile) {
        return res.status(400).json({
          success: false,
          message:
            "Email or mobile number is required"
        });
      }


      if (email && mobile) {
        return res.status(400).json({
          success: false,
          message:
            "Please use either email or mobile number"
        });
      }


      if (mobile) {

        if (
          !isValidMobile(mobile)
        ) {
          return res.status(400).json({
            success: false,
            message:
              "Please enter a valid international mobile number"
          });
        }
      }


      /* ---------------------------------------------
         FIND USER
      --------------------------------------------- */

      let userResult;


      if (mobile) {

        userResult =
          await db.query(
            `
            SELECT *
            FROM users
            WHERE mobile = $1
            LIMIT 1
            `,
            [
              mobile
            ]
          );

      } else {

        userResult =
          await db.query(
            `
            SELECT *
            FROM users
            WHERE LOWER(email) = LOWER($1)
            LIMIT 1
            `,
            [
              email
            ]
          );
      }


      const user =
        userResult.rows[0];


      if (!user) {

        return res.status(401).json({
          success: false,
          message:
            "Invalid email/mobile or password"
        });
      }


      /* ---------------------------------------------
         EMAIL VERIFICATION
      --------------------------------------------- */

      if (
        user.email_verified !== true
      ) {

        return res.status(403).json({
          success: false,
          message:
            "Please verify your email before logging in."
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
          message:
            "Invalid email/mobile or password"
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

        /*
          2FA / OTP is still sent
          to the user's registered email.
        */

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
          message:
            "Unable to send login verification code. Please try again."
        });
      }


      /* ---------------------------------------------
         OTP REQUIRED
      --------------------------------------------- */

      return res.json({
        success: true,
        message:
          "Verification code sent to your email.",
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
        message:
          "Login failed"
      });
    }
  }
);


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


      if (
        !challengeToken ||
        !otp
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Verification token and OTP are required"
        });
      }


      if (
        !/^\d{6}$/.test(
          String(otp).trim()
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Please enter the 6-digit OTP"
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
          message:
            "Login verification code has expired. Please login again."
        });
      }


      const userResult =
        await db.query(
          `
          SELECT *
          FROM users
          WHERE id = $1
          LIMIT 1
          `,
          [
            decoded.userId
          ]
        );


      const user =
        userResult.rows[0];


      if (!user) {
        return res.status(404).json({
          success: false,
          message:
            "User not found"
        });
      }


      const otpResult =
        await db.query(
          `
          SELECT *
          FROM email_otps
          WHERE user_id = $1
            AND purpose = 'login'
            AND verified = FALSE
          ORDER BY id DESC
          LIMIT 1
          `,
          [
            user.id
          ]
        );


      const otpRecord =
        otpResult.rows[0];


      if (!otpRecord) {
        return res.status(400).json({
          success: false,
          message:
            "Login verification code not found"
        });
      }


      if (
        new Date(
          otpRecord.expires_at
        ).getTime() <
        Date.now()
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Login verification code has expired"
        });
      }


      if (
        Number(
          otpRecord.attempts
        ) >= MAX_OTP_ATTEMPTS
      ) {
        return res.status(429).json({
          success: false,
          message:
            "Too many incorrect attempts. Please login again."
        });
      }


      const otpHash =
        hashOtp(
          String(otp).trim()
        );


      if (
        otpHash !==
        otpRecord.otp_hash
      ) {

        await db.query(
          `
          UPDATE email_otps
          SET attempts = attempts + 1
          WHERE id = $1
          `,
          [
            otpRecord.id
          ]
        );


        return res.status(400).json({
          success: false,
          message:
            "Invalid verification code"
        });
      }


      await db.query(
        `
        UPDATE email_otps
        SET verified = TRUE
        WHERE id = $1
        `,
        [
          otpRecord.id
        ]
      );


      /* ---------------------------------------------
         CREATE FINAL LOGIN TOKEN
      --------------------------------------------- */

      const token =
        jwt.sign(
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
        message:
          "Login successful",
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          country_code:
            user.country_code || null,
          mobile:
            user.mobile || null,
          role: user.role,
          referral_code:
            user.referral_code,
          kyc_status:
            user.kyc_status,
          email_verified: 1,
          created_at:
            user.created_at
        }
      });


    } catch (error) {

      console.error(
        "LOGIN OTP VERIFY ERROR:",
        error
      );


      return res.status(500).json({
        success: false,
        message:
          "OTP verification failed"
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
          message:
            "Email is required"
        });
      }


      const userResult =
        await db.query(
          `
          SELECT
            id,
            email,
            email_verified
          FROM users
          WHERE LOWER(email) = LOWER($1)
          LIMIT 1
          `,
          [
            email
          ]
        );


      const user =
        userResult.rows[0];


      if (!user) {
        return res.status(404).json({
          success: false,
          message:
            "No account found with this email"
        });
      }


      if (
        user.email_verified !== true
      ) {
        return res.status(403).json({
          success: false,
          message:
            "Please verify your email first."
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
          message:
            "Unable to send password reset code"
        });
      }


      return res.json({
        success: true,
        message:
          "Password reset code sent to your email.",
        challengeToken
      });


    } catch (error) {

      console.error(
        "FORGOT PASSWORD ERROR:",
        error
      );


      return res.status(500).json({
        success: false,
        message:
          "Unable to process password reset"
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

    let client;

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
          message:
            "Verification token, OTP and new password are required"
        });
      }


      if (
        !/^\d{6}$/.test(
          String(otp).trim()
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Please enter the 6-digit OTP"
        });
      }


      if (
        String(newPassword).length < 8
      ) {
        return res.status(400).json({
          success: false,
          message:
            "New password must be at least 8 characters"
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
          message:
            "Password reset code has expired. Please request a new code."
        });
      }


      const userResult =
        await db.query(
          `
          SELECT *
          FROM users
          WHERE id = $1
          LIMIT 1
          `,
          [
            decoded.userId
          ]
        );


      const user =
        userResult.rows[0];


      if (!user) {
        return res.status(404).json({
          success: false,
          message:
            "User not found"
        });
      }


      const otpResult =
        await db.query(
          `
          SELECT *
          FROM email_otps
          WHERE user_id = $1
            AND purpose = 'forgot_password'
            AND verified = FALSE
          ORDER BY id DESC
          LIMIT 1
          `,
          [
            user.id
          ]
        );


      const otpRecord =
        otpResult.rows[0];


      if (!otpRecord) {
        return res.status(400).json({
          success: false,
          message:
            "Password reset code not found"
        });
      }


      if (
        new Date(
          otpRecord.expires_at
        ).getTime() <
        Date.now()
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Password reset code has expired"
        });
      }


      if (
        Number(
          otpRecord.attempts
        ) >= MAX_OTP_ATTEMPTS
      ) {
        return res.status(429).json({
          success: false,
          message:
            "Too many incorrect attempts. Please request a new code."
        });
      }


      const otpHash =
        hashOtp(
          String(otp).trim()
        );


      if (
        otpHash !==
        otpRecord.otp_hash
      ) {

        await db.query(
          `
          UPDATE email_otps
          SET attempts = attempts + 1
          WHERE id = $1
          `,
          [
            otpRecord.id
          ]
        );


        return res.status(400).json({
          success: false,
          message:
            "Invalid verification code"
        });
      }


      const passwordHash =
        await bcrypt.hash(
          String(newPassword),
          12
        );


      client =
        await db.pool.connect();

      await client.query("BEGIN");


      await client.query(
        `
        UPDATE email_otps
        SET verified = TRUE
        WHERE id = $1
        `,
        [
          otpRecord.id
        ]
      );


      await client.query(
        `
        UPDATE users
        SET password_hash = $1
        WHERE id = $2
        `,
        [
          passwordHash,
          user.id
        ]
      );


      await client.query("COMMIT");

      client.release();
      client = null;


      return res.json({
        success: true,
        message:
          "Password reset successfully. Please login."
      });


    } catch (error) {

      if (client) {

        try {
          await client.query(
            "ROLLBACK"
          );
        } catch (rollbackError) {

          console.error(
            "PASSWORD RESET ROLLBACK ERROR:",
            rollbackError
          );
        }

        client.release();
      }


      console.error(
        "PASSWORD RESET VERIFY ERROR:",
        error
      );


      return res.status(500).json({
        success: false,
        message:
          "Password reset failed"
      });
    }
  }
);


/* =========================================================
   EXPORT
========================================================= */

module.exports = router;