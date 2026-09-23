const db = require("./database");

const KYC_MINING_SESSIONS = 50;

function updateKycEligibility(userId) {
  const result = db
    .prepare(`
      SELECT COUNT(*) AS completed_sessions
      FROM mining_sessions
      WHERE user_id = ?
        AND status = 'completed'
    `)
    .get(userId);

  const completedSessions = result.completed_sessions;

  let kyc = db
    .prepare(`
      SELECT id, status
      FROM user_kyc
      WHERE user_id = ?
    `)
    .get(userId);

  if (!kyc) {
    db.prepare(`
      INSERT INTO user_kyc (user_id, status)
      VALUES (?, 'NOT_ELIGIBLE')
    `).run(userId);

    kyc = db
      .prepare(`
        SELECT id, status
        FROM user_kyc
        WHERE user_id = ?
      `)
      .get(userId);
  }

  // Pending and approved KYC must never be changed automatically.
  if (kyc.status === "PENDING" || kyc.status === "APPROVED") {
    return kyc.status;
  }

  // User is not eligible until the required sessions are completed.
  if (completedSessions < KYC_MINING_SESSIONS) {
    if (kyc.status === "ELIGIBLE") {
      db.prepare(`
        UPDATE user_kyc
        SET status = 'NOT_ELIGIBLE',
            eligible_at = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ?
      `).run(userId);
    }

    return "NOT_ELIGIBLE";
  }

  // User becomes eligible after completing 50 sessions.
  if (kyc.status === "NOT_ELIGIBLE") {
    db.prepare(`
      UPDATE user_kyc
      SET status = 'ELIGIBLE',
          eligible_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
    `).run(userId);

    return "ELIGIBLE";
  }

  return kyc.status;
}

module.exports = {
  KYC_MINING_SESSIONS,
  updateKycEligibility
};
