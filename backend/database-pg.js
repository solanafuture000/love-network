const { Pool } = require("pg");

const connectionString = process.env.SUPABASE_DATABASE_URL;

if (!connectionString) {
  throw new Error("SUPABASE_DATABASE_URL is not configured");
}

const pool = new Pool({
  connectionString,
  ssl: {
    rejectUnauthorized: false
  }
});

pool.on("error", (error) => {
  console.error("LOVE Network PostgreSQL pool error:", error);
});

async function query(text, params = []) {
  return pool.query(text, params);
}

async function testConnection() {
  const result = await pool.query("SELECT NOW() AS now");
  return result.rows[0];
}

module.exports = {
  pool,
  query,
  testConnection
};
