const db = require("./database-pg");

async function upgradeWalletSchema() {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS user_wallets (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        wallet_name TEXT NOT NULL DEFAULT 'LOVE Wallet',
        public_address TEXT NOT NULL UNIQUE,
        encrypted_private_key TEXT NOT NULL,
        is_default BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_user_wallets_user_id
        ON user_wallets(user_id);

      CREATE UNIQUE INDEX IF NOT EXISTS idx_user_wallets_one_default
        ON user_wallets(user_id)
        WHERE is_default = TRUE;
    `);

    console.log("LOVE Network multi-wallet schema ready");
  } catch (error) {
    console.error("MULTI-WALLET SCHEMA ERROR:", error.message);
    process.exitCode = 1;
  } finally {
    await db.pool.end();
  }
}

upgradeWalletSchema();
