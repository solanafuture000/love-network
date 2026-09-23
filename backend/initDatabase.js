const db = require("./database");

function addColumnIfMissing(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();

  const exists = columns.some((col) => col.name === column);

  if (!exists) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    console.log(`Added column ${table}.${column}`);
  }
}

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    email TEXT UNIQUE,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    successful_mining_sessions INTEGER DEFAULT 0,
    current_streak_days INTEGER DEFAULT 0,
    longest_streak_days INTEGER DEFAULT 0,
    last_mining_date DATETIME,
    kyc_status TEXT DEFAULT 'not_started',
    role TEXT DEFAULT 'USER',
    referral_code TEXT,
    email_verified INTEGER DEFAULT 0,
    two_factor_enabled INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS wallets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE,
    balance REAL DEFAULT 0,
    total_mined REAL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS mining_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    stopped_at DATETIME,
    duration_seconds INTEGER DEFAULT 0,
    reward REAL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS mining_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    total_mining_allocation REAL DEFAULT 400000000,
    total_mined REAL DEFAULT 0,
    phase1_limit REAL DEFAULT 100000000,
    phase2_limit REAL DEFAULT 200000000,
    phase3_limit REAL DEFAULT 300000000,
    phase4_limit REAL DEFAULT 400000000,
    phase1_rate REAL DEFAULT 0.010,
    phase2_rate REAL DEFAULT 0.0075,
    phase3_rate REAL DEFAULT 0.005,
    phase4_rate REAL DEFAULT 0.0025,
    mining_enabled INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS user_kyc (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'NOT_ELIGIBLE',
    eligible_at DATETIME,
    submitted_at DATETIME,
    approved_at DATETIME,
    rejection_reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS referrals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    referrer_user_id INTEGER NOT NULL,
    referred_user_id INTEGER NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'PENDING_KYC',
    reward_rate REAL DEFAULT 0,
    total_reward REAL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (referrer_user_id) REFERENCES users(id),
    FOREIGN KEY (referred_user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS referral_rewards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    referrer_user_id INTEGER NOT NULL,
    referred_user_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    reward_date DATE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (referrer_user_id) REFERENCES users(id),
    FOREIGN KEY (referred_user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS wallet_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    amount REAL NOT NULL,
    balance_after REAL NOT NULL,
    mining_session_id INTEGER,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (mining_session_id) REFERENCES mining_sessions(id)
  );

  CREATE TABLE IF NOT EXISTS email_otps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    email TEXT NOT NULL,
    otp_hash TEXT NOT NULL,
    expires_at DATETIME NOT NULL,
    attempts INTEGER DEFAULT 0,
    verified INTEGER DEFAULT 0,
    purpose TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

/*
  Existing databases may already have the tables with the older schema.
  Add any missing columns safely.
*/

addColumnIfMissing("users", "email_verified", "INTEGER DEFAULT 0");
addColumnIfMissing("users", "two_factor_enabled", "INTEGER DEFAULT 0");

addColumnIfMissing("email_otps", "user_id", "INTEGER");
addColumnIfMissing("email_otps", "otp_hash", "TEXT");
addColumnIfMissing("email_otps", "attempts", "INTEGER DEFAULT 0");

/*
  Make sure existing OTP rows have safe default values.
*/
db.prepare(`
  UPDATE email_otps
  SET attempts = 0
  WHERE attempts IS NULL
`).run();

db.prepare(`
  UPDATE users
  SET email_verified = 0
  WHERE email_verified IS NULL
`).run();

db.prepare(`
  UPDATE users
  SET two_factor_enabled = 0
  WHERE two_factor_enabled IS NULL
`).run();

console.log("LOVE Network database schema initialized");