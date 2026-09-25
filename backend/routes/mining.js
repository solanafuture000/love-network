const express = require("express");
const db = require("../database");
const authenticateToken = require("../middleware/auth");

const router = express.Router();

const MAX_SESSION_SECONDS = 12 * 60 * 60;

function getMiningConfig() {
  const config = db
    .prepare("SELECT * FROM mining_config WHERE id = 1")
    .get();

  if (!config) {
    throw new Error("Mining configuration not found");
  }

  return config;
}

function getCurrentMiningPhase(totalMined, config) {
  if (totalMined >= config.phase4_limit) {
    return {
      phase: 4,
      ratePerHour: 0,
      miningEnabled: false
    };
  }

  if (totalMined >= config.phase3_limit) {
    return {
      phase: 4,
      ratePerHour: config.phase4_rate,
      miningEnabled: true
    };
  }

  if (totalMined >= config.phase2_limit) {
    return {
      phase: 3,
      ratePerHour: config.phase3_rate,
      miningEnabled: true
    };
  }

  if (totalMined >= config.phase1_limit) {
    return {
      phase: 2,
      ratePerHour: config.phase2_rate,
      miningEnabled: true
    };
  }

  return {
    phase: 1,
    ratePerHour: config.phase1_rate,
    miningEnabled: true
  };
}

function parseDatabaseDate(value) {
  if (!value) return new Date();

  const normalized = value.includes("T")
    ? value
    : value.replace(" ", "T");

  return new Date(
    normalized.endsWith("Z")
      ? normalized
      : `${normalized}Z`
  );
}

function settleMiningSession(session, userId) {
  const wallet = db
    .prepare(`
      SELECT id, balance, total_mined
      FROM wallets
      WHERE user_id = ?
    `)
    .get(userId);

  if (!wallet) {
    throw new Error("Wallet not found");
  }

  const config = getMiningConfig();

  const startedAt = parseDatabaseDate(session.started_at);
  const now = new Date();

  const elapsedSeconds = Math.max(
    0,
    Math.floor((now - startedAt) / 1000)
  );

  const durationSeconds = Math.min(
    elapsedSeconds,
    MAX_SESSION_SECONDS
  );

  const rewardPerHour = Number(session.reward_per_hour || 0);

  const calculatedReward =
    (durationSeconds / 3600) * rewardPerHour;

  const remainingPool = Math.max(
    0,
    Number(config.total_mining_allocation) -
      Number(config.total_mined)
  );

  const reward = Number(
    Math.min(
      calculatedReward,
      remainingPool
    ).toFixed(8)
  );

  const transaction = db.transaction(() => {
    const updateSession = db.prepare(`
      UPDATE mining_sessions
      SET
        stopped_at = CURRENT_TIMESTAMP,
        duration_seconds = ?,
        reward = ?,
        status = 'completed'
      WHERE id = ?
        AND user_id = ?
        AND status = 'active'
    `);

    const result = updateSession.run(
      durationSeconds,
      reward,
      session.id,
      userId
    );

    if (result.changes !== 1) {
      throw new Error("Mining session was already settled");
    }

    const newBalance = Number(
      (Number(wallet.balance) + reward).toFixed(8)
    );

    const newWalletTotalMined = Number(
      (Number(wallet.total_mined) + reward).toFixed(8)
    );

    const newGlobalTotalMined = Number(
      (Number(config.total_mined) + reward).toFixed(8)
    );

    db.prepare(`
      UPDATE wallets
      SET
        balance = ?,
        total_mined = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
    `).run(
      newBalance,
      newWalletTotalMined,
      userId
    );

    if (reward > 0) {
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
        userId,
        "MINING_REWARD",
        reward,
        newBalance,
        session.id,
        durationSeconds >= MAX_SESSION_SECONDS
          ? "Mining reward - 12 hour session completed"
          : "Mining reward"
      );

      // ==========================================
      // REFERRAL REWARD - 10%
      // ==========================================
      const referral = db.prepare(`
        SELECT
          id,
          referrer_user_id,
          referred_user_id,
          status,
          reward_rate
        FROM referrals
        WHERE referred_user_id = ?
        LIMIT 1
      `).get(userId);

      if (referral) {
        const rewardRate =
          Number(referral.reward_rate) > 0
            ? Number(referral.reward_rate)
            : 0.10;

        const referralReward = Number(
          (reward * rewardRate).toFixed(8)
        );

        if (referralReward > 0) {
          const existingReferralReward = db.prepare(`
            SELECT id
            FROM referral_rewards
            WHERE source_mining_session_id = ?
            LIMIT 1
          `).get(session.id);

          if (!existingReferralReward) {
            const kyc = db.prepare(`
              SELECT status
              FROM user_kyc
              WHERE user_id = ?
              LIMIT 1
            `).get(userId);

            const kycApproved =
              kyc && kyc.status === "APPROVED";

            const rewardStatus =
              kycApproved ? "CREDITED" : "PENDING";

            db.prepare(`
              INSERT INTO referral_rewards
              (
                referrer_user_id,
                referred_user_id,
                amount,
                status,
                reward_date,
                source_mining_session_id
              )
              VALUES (?, ?, ?, ?, date('now'), ?)
            `).run(
              referral.referrer_user_id,
              userId,
              referralReward,
              rewardStatus,
              session.id
            );

            // Only migrate referral reward to referrer's
            // wallet after KYC approval.
            if (kycApproved) {
              const referrerWallet = db.prepare(`
                SELECT balance
                FROM wallets
                WHERE user_id = ?
                LIMIT 1
              `).get(referral.referrer_user_id);

              if (!referrerWallet) {
                throw new Error("Referrer wallet not found");
              }

              const referrerNewBalance = Number(
                (
                  Number(referrerWallet.balance) +
                  referralReward
                ).toFixed(8)
              );

              db.prepare(`
                UPDATE wallets
                SET
                  balance = ?,
                  updated_at = CURRENT_TIMESTAMP
                WHERE user_id = ?
              `).run(
                referrerNewBalance,
                referral.referrer_user_id
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
                referral.referrer_user_id,
                "REFERRAL_REWARD",
                referralReward,
                referrerNewBalance,
                session.id,
                "Referral reward - 10% of referred user's mining reward"
              );

              db.prepare(`
                UPDATE referrals
                SET
                  total_reward = total_reward + ?,
                  updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
              `).run(
                referralReward,
                referral.id
              );
            }
          }
        }
      }
    }

    db.prepare("UPDATE users SET successful_mining_sessions = successful_mining_sessions + 1, last_mining_date = date('now') WHERE id = ?").run(userId);

    if (
      newGlobalTotalMined >=
      Number(config.total_mining_allocation)
    ) {
      db.prepare(`
        UPDATE mining_config
        SET
          total_mined = ?,
          mining_enabled = 0,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = 1
      `).run(newGlobalTotalMined);
    } else {
      db.prepare(`
        UPDATE mining_config
        SET
          total_mined = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = 1
      `).run(newGlobalTotalMined);
    }
  });

  transaction();

  const completedSession = db
    .prepare(`
      SELECT *
      FROM mining_sessions
      WHERE id = ?
    `)
    .get(session.id);

  const updatedWallet = db
    .prepare(`
      SELECT balance, total_mined
      FROM wallets
      WHERE user_id = ?
    `)
    .get(userId);

  const updatedConfig = getMiningConfig();

  const walletTransaction = db
    .prepare(`
      SELECT
        id,
        user_id,
        type,
        amount,
        balance_after,
        mining_session_id,
        description,
        created_at
      FROM wallet_transactions
      WHERE mining_session_id = ?
      ORDER BY id DESC
      LIMIT 1
    `)
    .get(session.id);

  return {
    completedSession,
    updatedWallet,
    updatedConfig,
    walletTransaction,
    calculatedReward: Number(
      calculatedReward.toFixed(8)
    ),
    actualReward: reward,
    durationSeconds
  };
}

function getActiveSession(userId) {
  return db
    .prepare(`
      SELECT *
      FROM mining_sessions
      WHERE user_id = ?
        AND status = 'active'
      ORDER BY id DESC
      LIMIT 1
    `)
    .get(userId);
}

// START MINING
router.post("/start", authenticateToken, (req, res) => {
  try {
    const userId = req.user.userId;

    const existingSession = getActiveSession(userId);

    if (existingSession) {
      const startedAt = parseDatabaseDate(
        existingSession.started_at
      );

      const ageSeconds = Math.floor(
        (Date.now() - startedAt.getTime()) / 1000
      );

      if (ageSeconds >= MAX_SESSION_SECONDS) {
        settleMiningSession(
          existingSession,
          userId
        );
      } else {
        return res.status(409).json({
          success: false,
          message: "Mining is already active",
          session: existingSession,
          remainingSeconds:
            MAX_SESSION_SECONDS - ageSeconds
        });
      }
    }

    const config = getMiningConfig();

    if (
      config.mining_enabled !== 1 ||
      config.total_mined >= config.total_mining_allocation
    ) {
      return res.status(403).json({
        success: false,
        message: "Mining pool has been exhausted",
        miningEnabled: false,
        totalMined: config.total_mined,
        miningAllocation:
          config.total_mining_allocation
      });
    }

    const phase = getCurrentMiningPhase(
      config.total_mined,
      config
    );

    if (!phase.miningEnabled) {
      return res.status(403).json({
        success: false,
        message:
          "Mining is disabled because the mining pool is exhausted",
        miningEnabled: false
      });
    }

    const wallet = db
      .prepare(`
        SELECT id
        FROM wallets
        WHERE user_id = ?
      `)
      .get(userId);

    if (!wallet) {
      return res.status(404).json({
        success: false,
        message: "Wallet not found"
      });
    }

    const result = db
      .prepare(`
        INSERT INTO mining_sessions
        (
          user_id,
          status,
          reward_per_hour,
          mining_phase
        )
        VALUES (?, 'active', ?, ?)
      `)
      .run(
        userId,
        phase.ratePerHour,
        phase.phase
      );

    const session = db
      .prepare(`
        SELECT *
        FROM mining_sessions
        WHERE id = ?
      `)
      .get(result.lastInsertRowid);

    res.status(201).json({
      success: true,
      message: "Mining started",
      maxSessionHours: 12,
      phase: phase.phase,
      rewardPerHour: phase.ratePerHour,
      session
    });

  } catch (error) {
    console.error(
      "MINING START ERROR:",
      error
    );

    res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
});

// STOP MINING
router.post("/stop", authenticateToken, (req, res) => {
  try {
    const userId = req.user.userId;

    const session = getActiveSession(userId);

    if (!session) {
      return res.status(404).json({
        success: false,
        message: "No active mining session found"
      });
    }

    const result = settleMiningSession(
      session,
      userId
    );

    res.json({
      success: true,
      message:
        result.durationSeconds >= MAX_SESSION_SECONDS
          ? "Mining session completed after 12 hours"
          : "Mining stopped",
      phase: session.mining_phase,
      rewardPerHour: session.reward_per_hour,
      maxSessionHours: 12,
      calculatedReward:
        result.calculatedReward,
      actualReward:
        result.actualReward,
      totalMined:
        result.updatedConfig.total_mined,
      miningAllocation:
        result.updatedConfig.total_mining_allocation,
      miningEnabled:
        result.updatedConfig.mining_enabled === 1,
      session:
        result.completedSession,
      wallet:
        result.updatedWallet,
      transaction:
        result.walletTransaction || null
    });

  } catch (error) {
    console.error(
      "MINING STOP ERROR:",
      error
    );

    res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
});

// MINING STATUS
router.get("/status", authenticateToken, (req, res) => {
  try {
    const userId = req.user.userId;

    let session = getActiveSession(userId);

    let autoCompleted = false;
    let settlement = null;

    if (session) {
      const startedAt = parseDatabaseDate(
        session.started_at
      );

      const ageSeconds = Math.floor(
        (Date.now() - startedAt.getTime()) / 1000
      );

      if (ageSeconds >= MAX_SESSION_SECONDS) {
        settlement = settleMiningSession(
          session,
          userId
        );

        autoCompleted = true;
        session = settlement.completedSession;
      }
    }

    if (!session) {
      session = db
        .prepare(`
          SELECT id, started_at, stopped_at,
                 duration_seconds, reward,
                 status, reward_per_hour,
                 mining_phase
          FROM mining_sessions
          WHERE user_id = ?
          ORDER BY id DESC
          LIMIT 1
        `)
        .get(userId);
    }

    const config = getMiningConfig();

    const phase = getCurrentMiningPhase(
      config.total_mined,
      config
    );

    let remainingSessionSeconds = 0;

    if (
      session &&
      session.status === "active"
    ) {
      const startedAt = parseDatabaseDate(
        session.started_at
      );

      const ageSeconds = Math.floor(
        (Date.now() - startedAt.getTime()) / 1000
      );

      remainingSessionSeconds = Math.max(
        0,
        MAX_SESSION_SECONDS - ageSeconds
      );
    }

    res.json({
      success: true,
      autoCompleted,
      mining: session || null,
      remainingSessionSeconds,
      maxSessionSeconds: MAX_SESSION_SECONDS,
      maxSessionHours: 12,
      settlement: settlement
        ? {
            actualReward:
              settlement.actualReward,
            calculatedReward:
              settlement.calculatedReward
          }
        : null,
      pool: {
        allocation:
          config.total_mining_allocation,
        totalMined:
          Number(config.total_mined.toFixed(8)),
        remaining:
          Number(
            Math.max(
              0,
              config.total_mining_allocation -
                config.total_mined
            ).toFixed(8)
          ),
        miningEnabled:
          config.mining_enabled === 1,
        phase: phase.phase,
        rewardPerHour: phase.ratePerHour
      }
    });

  } catch (error) {
    console.error(
      "MINING STATUS ERROR:",
      error
    );

    res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
});

// MINING POOL INFO
router.get("/pool", (req, res) => {
  try {
    const config = getMiningConfig();

    const phase = getCurrentMiningPhase(
      config.total_mined,
      config
    );
const remaining = Math.max(
      0,
      config.total_mining_allocation -
        config.total_mined
    );

    const progressPercent = Number(
      (
        (config.total_mined /
          config.total_mining_allocation) *
        100
      ).toFixed(8)
    );

    res.json({
      success: true,
      pool: {
        totalAllocation:
          config.total_mining_allocation,
        totalMined:
          Number(config.total_mined.toFixed(8)),
        remaining:
          Number(remaining.toFixed(8)),
        progressPercent,
        phase: phase.phase,
        rewardPerHour: phase.ratePerHour,
        miningEnabled:
          config.mining_enabled === 1
      }
    });

  } catch (error) {
    console.error(
      "MINING POOL ERROR:",
      error
    );

    res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
});

// MINING DASHBOARD
router.get("/dashboard", authenticateToken, (req, res) => {
  try {
    const userId = req.user.userId;

    let activeSession =
      getActiveSession(userId);

    let autoCompleted = false;

    if (activeSession) {
      const startedAt = parseDatabaseDate(
        activeSession.started_at
      );

      const ageSeconds = Math.floor(
        (Date.now() - startedAt.getTime()) / 1000
      );

      if (ageSeconds >= MAX_SESSION_SECONDS) {
        settleMiningSession(
          activeSession,
          userId
        );

        autoCompleted = true;
        activeSession = null;
      }
    }

    const wallet = db
      .prepare(`
        SELECT balance, total_mined
        FROM wallets
        WHERE user_id = ?
      `)
      .get(userId);

    if (!wallet) {
      return res.status(404).json({
        success: false,
        message: "Wallet not found"
      });
    }

    const config = getMiningConfig();

    const phase = getCurrentMiningPhase(
      config.total_mined,
      config
    );

    // ==========================================
    // MINING STATISTICS
    // ==========================================
    const statistics = db.prepare(`
      SELECT
        COALESCE(SUM(
          CASE
            WHEN date(stopped_at) = date('now', 'localtime')
            THEN reward
            ELSE 0
          END
        ), 0) AS todayEarned,

        COALESCE(SUM(
          CASE
            WHEN date(stopped_at) >= date('now', 'localtime', '-6 days')
            THEN reward
            ELSE 0
          END
        ), 0) AS weekEarned,

        COALESCE(SUM(
          CASE
            WHEN strftime('%Y-%m', stopped_at) =
                 strftime('%Y-%m', 'now', 'localtime')
            THEN reward
            ELSE 0
          END
        ), 0) AS monthEarned

      FROM mining_sessions
      WHERE user_id = ?
        AND status = 'completed'
        AND stopped_at IS NOT NULL
    `).get(userId);

    let remainingSessionSeconds = 0;

    if (activeSession) {
      const startedAt = parseDatabaseDate(
        activeSession.started_at
      );

      const ageSeconds = Math.floor(
        (Date.now() - startedAt.getTime()) / 1000
      );

      remainingSessionSeconds = Math.max(
        0,
        MAX_SESSION_SECONDS - ageSeconds
      );
    }

    const remaining = Math.max(
      0,
      config.total_mining_allocation -
        config.total_mined
    );

    const progressPercent = Number(
      (
        (config.total_mined /
          config.total_mining_allocation) *
        100
      ).toFixed(8)
    );

    res.json({
      success: true,
      autoCompleted,
      user: {
        userId,
        walletBalance:
          Number(wallet.balance.toFixed(8)),
        totalMined:
          Number(wallet.total_mined.toFixed(8)),
        miningActive:
          !!activeSession
      },
      session:
        activeSession || null,
      statistics: {
        todayEarned: Number(
          Number(statistics.todayEarned || 0).toFixed(8)
        ),
        weekEarned: Number(
          Number(statistics.weekEarned || 0).toFixed(8)
        ),
        monthEarned: Number(
          Number(statistics.monthEarned || 0).toFixed(8)
        )
      },
      mining: {
        phase: phase.phase,
        rewardPerHour: activeSession
          ? activeSession.reward_per_hour
          : phase.ratePerHour,
        miningEnabled:
          config.mining_enabled === 1,
        maxSessionHours: 12,
        remainingSessionSeconds
      },
      pool: {
        totalAllocation:
          config.total_mining_allocation,
        totalMined:
          Number(config.total_mined.toFixed(8)),
        remaining:
          Number(remaining.toFixed(8)),
        progressPercent
      }
    });

  } catch (error) {
    console.error(
      "MINING DASHBOARD ERROR:",
      error
    );

    res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
});

module.exports = router;






