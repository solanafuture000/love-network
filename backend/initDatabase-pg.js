const db = require("./database-pg");

async function initDatabase() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      email TEXT UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      successful_mining_sessions INTEGER DEFAULT 0,
      current_streak_days INTEGER DEFAULT 0,
      longest_streak_days INTEGER DEFAULT 0,
      last_mining_date TIMESTAMPTZ,
      kyc_status TEXT DEFAULT 'not_started',
      role TEXT DEFAULT 'USER',
      referral_code TEXT UNIQUE,
      email_verified BOOLEAN DEFAULT FALSE,
      two_factor_enabled BOOLEAN DEFAULT FALSE
    );

    CREATE TABLE IF NOT EXISTS wallets (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      balance NUMERIC DEFAULT 0,
      total_mined NUMERIC DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS mining_sessions (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      stopped_at TIMESTAMPTZ,
      duration_seconds INTEGER DEFAULT 0,
      reward NUMERIC DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      reward_per_hour NUMERIC DEFAULT 0,
      mining_phase INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS mining_config (
      id BIGSERIAL PRIMARY KEY,
      total_mining_allocation NUMERIC DEFAULT 100000000,
      total_mined NUMERIC DEFAULT 0,
      phase1_limit NUMERIC DEFAULT 25000000,
      phase2_limit NUMERIC DEFAULT 50000000,
      phase3_limit NUMERIC DEFAULT 75000000,
      phase4_limit NUMERIC DEFAULT 100000000,
      phase1_rate NUMERIC DEFAULT 0.010,
      phase2_rate NUMERIC DEFAULT 0.0075,
      phase3_rate NUMERIC DEFAULT 0.005,
      phase4_rate NUMERIC DEFAULT 0.0025,
      mining_enabled BOOLEAN DEFAULT TRUE
    );

    CREATE TABLE IF NOT EXISTS user_kyc (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'NOT_ELIGIBLE',
      eligible_at TIMESTAMPTZ,
      submitted_at TIMESTAMPTZ,
      approved_at TIMESTAMPTZ,
      rejection_reason TEXT,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS referrals (
      id BIGSERIAL PRIMARY KEY,
      referrer_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      referred_user_id BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'PENDING_KYC',
      reward_rate NUMERIC DEFAULT 0,
      total_reward NUMERIC DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS referral_rewards (
      id BIGSERIAL PRIMARY KEY,
      referrer_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      referred_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      amount NUMERIC NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      reward_date DATE NOT NULL,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS wallet_transactions (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      amount NUMERIC NOT NULL,
      balance_after NUMERIC NOT NULL,
      mining_session_id BIGINT REFERENCES mining_sessions(id) ON DELETE SET NULL,
      description TEXT,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS email_otps (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      email TEXT NOT NULL,
      otp_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      attempts INTEGER DEFAULT 0,
      verified BOOLEAN DEFAULT FALSE,
      purpose TEXT,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );

    INSERT INTO mining_config (
      id,
      total_mining_allocation,
      total_mined,
      phase1_limit,
      phase2_limit,
      phase3_limit,
      phase4_limit,
      phase1_rate,
      phase2_rate,
      phase3_rate,
      phase4_rate,
      mining_enabled
    )
    VALUES (
      1,
      100000000,
      0,
      25000000,
      50000000,
      75000000,
      100000000,
      0.010,
      0.0075,
      0.005,
      0.0025,
      TRUE
    )
    ON CONFLICT (id) DO NOTHING;
  `);

  console.log("LOVE Network PostgreSQL schema initialized");

  const result = await db.query(`
    SELECT
      COUNT(*)::int AS tables_check
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN (
        'users',
        'wallets',
        'mining_sessions',
        'mining_config',
        'user_kyc',
        'referrals',
        'referral_rewards',
        'wallet_transactions',
        'email_otps'
      )
  `);

  console.log("LOVE Network PostgreSQL tables:", result.rows[0].tables_check);

  await db.pool.end();
}

initDatabase().catch(async (error) => {
  console.error("POSTGRES SCHEMA ERROR:", error.message);
  await db.pool.end();
  process.exit(1);
});
