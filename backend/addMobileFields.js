const db = require("./database-pg");

async function run() {
  try {
    await db.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS country_code VARCHAR(10),
      ADD COLUMN IF NOT EXISTS mobile VARCHAR(30)
    `);

    await db.query(`
      DROP INDEX IF EXISTS users_mobile_unique_idx
    `);

    await db.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS users_mobile_unique_idx
      ON users (mobile)
      WHERE mobile IS NOT NULL AND mobile <> ''
    `);

    console.log("MOBILE COUNTRY CODE MIGRATION OK");
  } catch (error) {
    console.error("MIGRATION ERROR:", error.message);
    throw error;
  }
}

module.exports = { run };
