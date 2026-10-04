const express = require("express");
const db = require("../database-pg");
const authenticateToken = require("../middleware/auth");

const router = express.Router();

const MAX_SESSION_SECONDS = 12 * 60 * 60;

function getCurrentMiningPhase(totalMined, config) {
  const mined = Number(totalMined || 0);

  if (mined >= Number(config.phase4_limit)) {
    return {
      phase: 4,
      ratePerHour: 0,
      miningEnabled: false
    };
  }

  if (mined >= Number(config.phase3_limit)) {
    return {
      phase: 4,
      ratePerHour: Number(config.phase4_rate),
      miningEnabled: true
    };
  }

  if (mined >= Number(config.phase2_limit)) {
    return {
      phase: 3,
      ratePerHour: Number(config.phase3_rate),
      miningEnabled: true
    };
  }

  if (mined >= Number(config.phase1_limit)) {
    return {
      phase: 2,
      ratePerHour: Number(config.phase2_rate),
      miningEnabled: true
    };
  }

  return {
    phase: 1,
    ratePerHour: Number(config.phase1_rate),
    miningEnabled: true
  };
}

function parseDatabaseDate(value) {
  if (!value) return new Date();

  if (value instanceof Date) {
    return value;
  }

  const stringValue = String(value);

  const normalized = stringValue.includes("T")
    ? stringValue
    : stringValue.replace(" ", "T");

  return new Date(
    normalized.endsWith("Z")
      ? normalized
      : `${normalized}Z`
  );
}

async function getMiningConfig(client = db) {
  const result = await client.query(
    `
    SELECT *
    FROM mining_config
    WHERE id = 1
    LIMIT 1
    `
  );

  const config = result.rows[0];

  if (!config) {
    throw new Error("Mining configuration not found");
  }

  return config;
}

async function getActiveSession(userId, client = db) {
  const result = await client.query(
    `
    SELECT *
    FROM mining_sessions
    WHERE user_id = $1
      AND status = 'active'
    ORDER BY id DESC
    LIMIT 1
    `,
    [userId]
  );

  return result.rows[0] || null;
}

async function settleMiningSession(session, userId) {
  const client = await db.pool.connect();

  try {
    await client.query("BEGIN");

    const walletResult = await client.query(
      `
      SELECT
        id,
        balance,
        total_mined
      FROM wallets
      WHERE user_id = $1
      FOR UPDATE
      `,
      [userId]
    );

    let wallet = walletResult.rows[0] || null;

    if (!wallet) {
      const walletInsert = await client.query(
        `
        INSERT INTO wallets
          (user_id, balance, total_mined)
        VALUES
          ($1, 0, 0)
        ON CONFLICT (user_id) DO NOTHING
        RETURNING
          id,
          balance,
          total_mined
        `,
        [userId]
      );

      wallet = walletInsert.rows[0] || null;

      if (!wallet) {
        const retryWallet = await client.query(
          `
          SELECT
            id,
            balance,
            total_mined
          FROM wallets
          WHERE user_id = $1
          FOR UPDATE
          `,
          [userId]
        );

        wallet = retryWallet.rows[0] || null;
      }
    }

    if (!wallet) {
      throw new Error("Wallet not found");
    }

    const configResult = await client.query(
      `
      SELECT *
      FROM mining_config
      WHERE id = 1
      FOR UPDATE
      `
    );

    const config = configResult.rows[0];

    if (!config) {
      throw new Error("Mining configuration not found");
    }

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

    const rewardPerHour = Number(
      session.reward_per_hour || 0
    );

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

    const sessionUpdate = await client.query(
      `
      UPDATE mining_sessions
      SET
        stopped_at = CURRENT_TIMESTAMP,
        duration_seconds = $1,
        reward = $2,
        status = 'completed'
      WHERE id = $3
        AND user_id = $4
        AND status = 'active'
      RETURNING *
      `,
      [
        durationSeconds,
        reward,
        session.id,
        userId
      ]
    );

    if (sessionUpdate.rowCount !== 1) {
      throw new Error("Mining session was already settled");
    }

    const completedSession = sessionUpdate.rows[0];

    const kycBalanceResult = await client.query(
      `
      SELECT status
      FROM user_kyc
      WHERE user_id = $1
      LIMIT 1
      `,
      [userId]
    );

    const kycBalanceApproved =
      String(kycBalanceResult.rows[0]?.status || "").toUpperCase() === "APPROVED";

    const newBalance = Number(
      (
        Number(wallet.balance || 0) +
        reward
      ).toFixed(8)
    );

    const newMigrationBalance = Number(
      (
        Number(wallet.migration_balance || 0) +
        (kycBalanceApproved ? reward : 0)
      ).toFixed(8)
    );

    const newWalletTotalMined = Number(
      (
        Number(wallet.total_mined) +
        reward
      ).toFixed(8)
    );

    const newGlobalTotalMined = Number(
      (
        Number(config.total_mined) +
        reward
      ).toFixed(8)
    );

    await client.query(
      `
      UPDATE wallets
      SET
        balance = $1,
        total_mined = $2,
        migration_balance = $3,
        updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $4
      `,
      [
        newBalance,
        newWalletTotalMined,
        newMigrationBalance,
        userId
      ]
    );

    if (reward > 0) {
      await client.query(
        `
        INSERT INTO wallet_transactions
        (
          user_id,
          type,
          amount,
          balance_after,
          mining_session_id,
          description
        )
        VALUES
        ($1, $2, $3, $4, $5, $6)
        `,
        [
          userId,
          "MINING_REWARD",
          reward,
          newBalance,
          session.id,
          durationSeconds >= MAX_SESSION_SECONDS
            ? "Mining reward - 12 hour session completed"
            : "Mining reward"
        ]
      );

      // ==========================================
      // LEVEL 1 REFERRAL REWARD - 10%
      // Only the direct referrer receives reward.
      // ==========================================
      const referralResult = await client.query(
        `
        SELECT
          id,
          referrer_user_id,
          referred_user_id,
          status,
          reward_rate
        FROM referrals
        WHERE referred_user_id = $1
        LIMIT 1
        `,
        [userId]
      );

      const referral = referralResult.rows[0] || null;

      if (referral) {
        const rewardRate =
          Number(referral.reward_rate) > 0
            ? Number(referral.reward_rate)
            : 0.10;

        const referralReward = Number(
          (
            reward *
            rewardRate
          ).toFixed(8)
        );

        if (referralReward > 0) {
          const existingRewardResult = await client.query(
            `
            SELECT id
            FROM referral_rewards
            WHERE source_mining_session_id = $1
            LIMIT 1
            `,
            [session.id]
          );

          const existingReferralReward =
            existingRewardResult.rows[0] || null;

          if (!existingReferralReward) {
            const kycResult = await client.query(
              `
              SELECT status
              FROM user_kyc
              WHERE user_id = $1
              LIMIT 1
              `,
              [userId]
            );

            const kyc = kycResult.rows[0] || null;

            const kycApproved =
              kyc &&
              String(kyc.status).toUpperCase() === "APPROVED";

            const rewardStatus =
              kycApproved
                ? "CREDITED"
                : "PENDING";

            await client.query(
              `
              INSERT INTO referral_rewards
              (
                referrer_user_id,
                referred_user_id,
                amount,
                status,
                reward_date,
                source_mining_session_id
              )
              VALUES
              ($1, $2, $3, $4, CURRENT_DATE, $5)
              `,
              [
                referral.referrer_user_id,
                userId,
                referralReward,
                rewardStatus,
                session.id
              ]
            );

            const referrerWalletResult =
              await client.query(
                `
                SELECT
                  balance,
                  pending_balance,
                  migration_balance
                FROM wallets
                WHERE user_id = $1
                FOR UPDATE
                `,
                [referral.referrer_user_id]
              );

            const referrerWallet =
              referrerWalletResult.rows[0] || null;

            if (!referrerWallet) {
              throw new Error("Referrer wallet not found");
            }

            const referrerKycResult = await client.query(
              `
              SELECT status
              FROM user_kyc
              WHERE user_id = $1
              LIMIT 1
              `,
              [referral.referrer_user_id]
            );

            const referrerKycApproved =
              String(referrerKycResult.rows[0]?.status || "").toUpperCase() === "APPROVED";

            const referrerNewBalance = Number(
              (
                Number(referrerWallet.balance || 0) +
                referralReward
              ).toFixed(8)
            );

            if (kycApproved) {
              const referrerNewMigrationBalance = Number(
                (
                  Number(referrerWallet.migration_balance || 0) +
                  (referrerKycApproved ? referralReward : 0)
                ).toFixed(8)
              );

              await client.query(
                `
                UPDATE wallets
                SET
                  balance = $1,
                  migration_balance = $2,
                  updated_at = CURRENT_TIMESTAMP
                WHERE user_id = $3
                `,
                [
                  referrerNewBalance,
                  referrerNewMigrationBalance,
                  referral.referrer_user_id
                ]
              );

              await client.query(
                `
                INSERT INTO wallet_transactions
                (
                  user_id,
                  type,
                  amount,
                  balance_after,
                  mining_session_id,
                  description
                )
                VALUES
                ($1, $2, $3, $4, $5, $6)
                `,
                [
                  referral.referrer_user_id,
                  "REFERRAL_REWARD",
                  referralReward,
                  referrerNewBalance,
                  session.id,
                  "Referral reward - 10% of direct referred user's mining reward"
                ]
              );

              await client.query(
                `
                UPDATE referrals
                SET
                  total_reward =
                    COALESCE(total_reward, 0) + $1,
                  updated_at = CURRENT_TIMESTAMP
                WHERE id = $2
                `,
                [
                  referralReward,
                  referral.id
                ]
              );
            } else {
              const referrerNewPendingBalance = Number(
                (
                  Number(referrerWallet.pending_balance || 0) +
                  referralReward
                ).toFixed(8)
              );

              await client.query(
                `
                UPDATE wallets
                SET
                  balance = $1,
                  pending_balance = $2,
                  updated_at = CURRENT_TIMESTAMP
                WHERE user_id = $3
                `,
                [
                  referrerNewBalance,
                  referrerNewPendingBalance,
                  referral.referrer_user_id
                ]
              );
            }
          }
        }
      }
    }

    await client.query(
      `
      UPDATE users
      SET
        successful_mining_sessions =
          COALESCE(successful_mining_sessions, 0) + 1,
        last_mining_date = CURRENT_DATE
      WHERE id = $1
      `,
      [userId]
    );

    const miningEnabled =
      newGlobalTotalMined <
      Number(config.total_mining_allocation);

    await client.query(
      `
      UPDATE mining_config
      SET
        total_mined = $1,
        mining_enabled = $2,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
      `,
      [
        newGlobalTotalMined,
        miningEnabled ? 1 : 0
      ]
    );

    const updatedWalletResult = await client.query(
      `
      SELECT
        balance,
        total_mined
      FROM wallets
      WHERE user_id = $1
      `,
      [userId]
    );

    const updatedWallet =
      updatedWalletResult.rows[0] || null;

    const updatedConfig = await getMiningConfig(client);

    const transactionResult = await client.query(
      `
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
      WHERE mining_session_id = $1
      ORDER BY id DESC
      LIMIT 1
      `,
      [session.id]
    );

    await client.query("COMMIT");

    return {
      completedSession,
      updatedWallet,
      updatedConfig,
      walletTransaction:
        transactionResult.rows[0] || null,
      calculatedReward: Number(
        calculatedReward.toFixed(8)
      ),
      actualReward: reward,
      durationSeconds
    };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {}

    throw error;
  } finally {
    client.release();
  }
}


// ==========================================
// START MINING
// ==========================================
router.post(
  "/start",
  authenticateToken,
  async (req, res) => {
    try {
      const userId = req.user.userId;

      let existingSession =
        await getActiveSession(userId);

      if (existingSession) {
        const startedAt =
          parseDatabaseDate(
            existingSession.started_at
          );

        const ageSeconds = Math.floor(
          (
            Date.now() -
            startedAt.getTime()
          ) / 1000
        );

        if (
          ageSeconds >=
          MAX_SESSION_SECONDS
        ) {
          await settleMiningSession(
            existingSession,
            userId
          );

          existingSession =
            await getActiveSession(userId);
        } else {
          return res.status(409).json({
            success: false,
            message: "Mining is already active",
            session: existingSession,
            remainingSeconds:
              MAX_SESSION_SECONDS -
              ageSeconds
          });
        }
      }

      const config =
        await getMiningConfig();

      if (
        Number(config.mining_enabled) !== 1 ||
        Number(config.total_mined) >=
          Number(config.total_mining_allocation)
      ) {
        return res.status(403).json({
          success: false,
          message:
            "Mining pool has been exhausted",
          miningEnabled: false,
          totalMined:
            Number(config.total_mined),
          miningAllocation:
            Number(
              config.total_mining_allocation
            )
        });
      }

      const phase =
        getCurrentMiningPhase(
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

      // Ensure wallet exists.
      await db.query(
        `
        INSERT INTO wallets
          (user_id, balance, total_mined)
        VALUES
          ($1, 0, 0)
        ON CONFLICT (user_id) DO NOTHING
        `,
        [userId]
      );

      const sessionResult =
        await db.query(
          `
          INSERT INTO mining_sessions
          (
            user_id,
            status,
            reward_per_hour,
            mining_phase
          )
          VALUES
          ($1, 'active', $2, $3)
          RETURNING *
          `,
          [
            userId,
            phase.ratePerHour,
            phase.phase
          ]
        );

      const session =
        sessionResult.rows[0];

      res.status(201).json({
        success: true,
        message: "Mining started",
        maxSessionHours: 12,
        phase: phase.phase,
        rewardPerHour:
          phase.ratePerHour,
        session
      });
    } catch (error) {
      console.error(
        "MINING START ERROR:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          error.message ||
          "Internal server error"
      });
    }
  }
);


// ==========================================
// STOP MINING
// ==========================================
router.post(
  "/stop",
  authenticateToken,
  async (req, res) => {
    try {
      const userId = req.user.userId;

      const session =
        await getActiveSession(userId);

      if (!session) {
        return res.status(404).json({
          success: false,
          message:
            "No active mining session found"
        });
      }

      const result =
        await settleMiningSession(
          session,
          userId
        );

      res.json({
        success: true,
        message:
          result.durationSeconds >=
          MAX_SESSION_SECONDS
            ? "Mining session completed after 12 hours"
            : "Mining stopped",
        phase:
          session.mining_phase,
        rewardPerHour:
          Number(
            session.reward_per_hour
          ),
        maxSessionHours: 12,
        calculatedReward:
          result.calculatedReward,
        actualReward:
          result.actualReward,
        totalMined:
          Number(
            result.updatedConfig.total_mined
          ),
        miningAllocation:
          Number(
            result.updatedConfig.total_mining_allocation
          ),
        miningEnabled:
          Number(
            result.updatedConfig.mining_enabled
          ) === 1,
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
        message:
          error.message ||
          "Internal server error"
      });
    }
  }
);


// ==========================================
// MINING STATUS
// ==========================================
router.get(
  "/status",
  authenticateToken,
  async (req, res) => {
    try {
      const userId = req.user.userId;

      let session =
        await getActiveSession(userId);

      let autoCompleted = false;
      let settlement = null;

      if (session) {
        const startedAt =
          parseDatabaseDate(
            session.started_at
          );

        const ageSeconds = Math.floor(
          (
            Date.now() -
            startedAt.getTime()
          ) / 1000
        );

        if (
          ageSeconds >=
          MAX_SESSION_SECONDS
        ) {
          settlement =
            await settleMiningSession(
              session,
              userId
            );

          autoCompleted = true;
          session =
            settlement.completedSession;
        }
      }

      if (!session) {
        const latestResult =
          await db.query(
            `
            SELECT
              id,
              started_at,
              stopped_at,
              duration_seconds,
              reward,
              status,
              reward_per_hour,
              mining_phase
            FROM mining_sessions
            WHERE user_id = $1
            ORDER BY id DESC
            LIMIT 1
            `,
            [userId]
          );

        session =
          latestResult.rows[0] || null;
      }

      const config =
        await getMiningConfig();

      const phase =
        getCurrentMiningPhase(
          config.total_mined,
          config
        );

      let remainingSessionSeconds = 0;

      if (
        session &&
        session.status === "active"
      ) {
        const startedAt =
          parseDatabaseDate(
            session.started_at
          );

        const ageSeconds = Math.floor(
          (
            Date.now() -
            startedAt.getTime()
          ) / 1000
        );

        remainingSessionSeconds =
          Math.max(
            0,
            MAX_SESSION_SECONDS -
              ageSeconds
          );
      }

      res.json({
        success: true,
        autoCompleted,
        mining: session || null,
        remainingSessionSeconds,
        maxSessionSeconds:
          MAX_SESSION_SECONDS,
        maxSessionHours: 12,
        settlement:
          settlement
            ? {
                actualReward:
                  settlement.actualReward,
                calculatedReward:
                  settlement.calculatedReward
              }
            : null,
        pool: {
          allocation:
            Number(
              config.total_mining_allocation
            ),
          totalMined:
            Number(
              Number(
                config.total_mined
              ).toFixed(8)
            ),
          remaining:
            Number(
              Math.max(
                0,
                Number(
                  config.total_mining_allocation
                ) -
                Number(
                  config.total_mined
                )
              ).toFixed(8)
            ),
          miningEnabled:
            Number(
              config.mining_enabled
            ) === 1,
          phase:
            phase.phase,
          rewardPerHour:
            phase.ratePerHour
        }
      });
    } catch (error) {
      console.error(
        "MINING STATUS ERROR:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          error.message ||
          "Internal server error"
      });
    }
  }
);


// ==========================================
// MINING POOL INFO
// ==========================================
router.get(
  "/pool",
  async (req, res) => {
    try {
      const config =
        await getMiningConfig();

      const phase =
        getCurrentMiningPhase(
          config.total_mined,
          config
        );

      const totalAllocation =
        Number(
          config.total_mining_allocation
        );

      const totalMined =
        Number(
          config.total_mined
        );

      const remaining =
        Math.max(
          0,
          totalAllocation -
            totalMined
        );

      const progressPercent =
        totalAllocation > 0
          ? Number(
              (
                (
                  totalMined /
                  totalAllocation
                ) *
                100
              ).toFixed(8)
            )
          : 0;

      res.json({
        success: true,
        pool: {
          totalAllocation,
          totalMined:
            Number(
              totalMined.toFixed(8)
            ),
          remaining:
            Number(
              remaining.toFixed(8)
            ),
          progressPercent,
          phase:
            phase.phase,
          rewardPerHour:
            phase.ratePerHour,
          miningEnabled:
            Number(
              config.mining_enabled
            ) === 1
        }
      });
    } catch (error) {
      console.error(
        "MINING POOL ERROR:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          error.message ||
          "Internal server error"
      });
    }
  }
);


// ==========================================
// MINING DASHBOARD
// ==========================================
router.get(
  "/dashboard",
  authenticateToken,
  async (req, res) => {
    try {
      const userId = req.user.userId;

      let activeSession =
        await getActiveSession(userId);

      let autoCompleted = false;

      if (activeSession) {
        const startedAt =
          parseDatabaseDate(
            activeSession.started_at
          );

        const ageSeconds = Math.floor(
          (
            Date.now() -
            startedAt.getTime()
          ) / 1000
        );

        if (
          ageSeconds >=
          MAX_SESSION_SECONDS
        ) {
          await settleMiningSession(
            activeSession,
            userId
          );

          autoCompleted = true;
          activeSession = null;
        }
      }

      // Automatically create wallet for valid users.
      await db.query(
        `
        INSERT INTO wallets
          (user_id, balance, total_mined)
        VALUES
          ($1, 0, 0)
        ON CONFLICT (user_id) DO NOTHING
        `,
        [userId]
      );

      const walletResult =
        await db.query(
          `
          SELECT
            balance,
            total_mined
          FROM wallets
          WHERE user_id = $1
          LIMIT 1
          `,
          [userId]
        );

      const wallet =
        walletResult.rows[0] || null;

      if (!wallet) {
        return res.status(404).json({
          success: false,
          message: "Wallet not found"
        });
      }

      const config =
        await getMiningConfig();

      const phase =
        getCurrentMiningPhase(
          config.total_mined,
          config
        );

      // ==========================================
      // MINING STATISTICS
      // ==========================================
      const statisticsResult =
        await db.query(
          `
          SELECT
            COALESCE(
              SUM(
                CASE
                  WHEN stopped_at::date =
                       CURRENT_DATE
                  THEN reward
                  ELSE 0
                END
              ),
              0
            ) AS "todayEarned",

            COALESCE(
              SUM(
                CASE
                  WHEN stopped_at::date >=
                       CURRENT_DATE - INTERVAL '6 days'
                  THEN reward
                  ELSE 0
                END
              ),
              0
            ) AS "weekEarned",

            COALESCE(
              SUM(
                CASE
                  WHEN DATE_TRUNC(
                    'month',
                    stopped_at
                  ) =
                  DATE_TRUNC(
                    'month',
                    CURRENT_TIMESTAMP
                  )
                  THEN reward
                  ELSE 0
                END
              ),
              0
            ) AS "monthEarned"

          FROM mining_sessions
          WHERE user_id = $1
            AND status = 'completed'
            AND stopped_at IS NOT NULL
          `,
          [userId]
        );

      const statistics =
        statisticsResult.rows[0] || {};

      let remainingSessionSeconds = 0;

      if (
        activeSession &&
        activeSession.status === "active"
      ) {
        const startedAt =
          parseDatabaseDate(
            activeSession.started_at
          );

        const ageSeconds = Math.floor(
          (
            Date.now() -
            startedAt.getTime()
          ) / 1000
        );

        remainingSessionSeconds =
          Math.max(
            0,
            MAX_SESSION_SECONDS -
              ageSeconds
          );
      }

      const totalAllocation =
        Number(
          config.total_mining_allocation
        );

      const totalMined =
        Number(
          config.total_mined
        );

      const remaining =
        Math.max(
          0,
          totalAllocation -
            totalMined
        );

      const progressPercent =
        totalAllocation > 0
          ? Number(
              (
                (
                  totalMined /
                  totalAllocation
                ) *
                100
              ).toFixed(8)
            )
          : 0;

      res.json({
        success: true,
        autoCompleted,
        user: {
          userId,
          walletBalance:
            Number(
              Number(
                wallet.balance
              ).toFixed(8)
            ),
          totalMined:
            Number(
              Number(
                wallet.total_mined
              ).toFixed(8)
            ),
          pendingBalance:
            Number(
              Number(
                wallet.pending_balance || 0
              ).toFixed(8)
            ),
          migrationBalance:
            Number(
              Number(
                wallet.migration_balance || 0
              ).toFixed(8)
            ),
          miningActive:
            !!activeSession
        },
        session:
          activeSession || null,
        statistics: {
          todayEarned:
            Number(
              Number(
                statistics.todayEarned || 0
              ).toFixed(8)
            ),
          weekEarned:
            Number(
              Number(
                statistics.weekEarned || 0
              ).toFixed(8)
            ),
          monthEarned:
            Number(
              Number(
                statistics.monthEarned || 0
              ).toFixed(8)
            )
        },
        mining: {
          phase:
            phase.phase,
          rewardPerHour:
            activeSession
              ? Number(
                  activeSession.reward_per_hour
                )
              : phase.ratePerHour,
          miningEnabled:
            Number(
              config.mining_enabled
            ) === 1,
          maxSessionHours: 12,
          remainingSessionSeconds
        },
        pool: {
          totalAllocation,
          totalMined:
            Number(
              totalMined.toFixed(8)
            ),
          remaining:
            Number(
              remaining.toFixed(8)
            ),
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
        message:
          error.message ||
          "Internal server error"
      });
    }
  }
);

module.exports = router;
