require("dotenv").config({quiet:true});
const db = require("./database-pg");

(async () => {
  const tables = [
    "users",
    "wallets",
    "mining_sessions",
    "mining_config",
    "user_kyc",
    "referrals",
    "referral_rewards",
    "wallet_transactions",
    "email_otps"
  ];

  for (const table of tables) {
    await db.query(
      "SELECT setval(pg_get_serial_sequence('" + table + "','id'), COALESCE((SELECT MAX(id) FROM " + table + "),1), true)"
    );

    console.log("Sequence synced:", table);
  }

  await db.pool.end();
  console.log("ALL POSTGRES SEQUENCES SYNCED");
})().catch(async (error) => {
  console.error("SEQUENCE SYNC FAILED:", error.message);
  await db.pool.end();
  process.exit(1);
});
