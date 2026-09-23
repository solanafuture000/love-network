const Database = require("better-sqlite3");
const path = require("path");

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, "love-network.db");
const db = new Database(dbPath);

db.pragma("journal_mode = WAL");

console.log("LOVE Network Database connected");

module.exports = db;

