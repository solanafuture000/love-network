require("dotenv").config({ quiet: true });

const db = require("./database-pg");

(async () => {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS mining_migrations (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL,
        source_wallet_id BIGINT NOT NULL,
        destination_wallet_id BIGINT NOT NULL,
        destination_address TEXT NOT NULL,
        amount NUMERIC NOT NULL CHECK (amount > 0),
        transfer_reference TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'COMPLETED',
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMPTZ
      );

      CREATE INDEX IF NOT EXISTS idx_mining_migrations_user_id
        ON mining_migrations(user_id);

      CREATE INDEX IF NOT EXISTS idx_mining_migrations_destination_wallet
        ON mining_migrations(destination_wallet_id);
    `);

    console.log("MINING MIGRATIONS TABLE READY");
  } catch (error) {
    console.error("MIGRATION TABLE ERROR:", error);
    process.exitCode = 1;
  } finally {
    await db.pool.end();
  }
})();
