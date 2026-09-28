const db = require("./database-pg");

const KYC_MINING_SESSIONS = 50;

async function updateKycEligibility(userId) {
  const userResult = await db.query(
    `
      SELECT id, username, email
      FROM users
      WHERE id = $1
    `,
    [userId]
  );

  const user = userResult.rows[0] || null;

  console.log("KYC DEBUG:", {
    userId,
    userExists: !!user,
    user: user || null
  });

  if (!user) {
    console.warn("KYC: user not found in PostgreSQL:", userId);
    return "NOT_ELIGIBLE";
  }

  const sessionsResult = await db.query(
    `
      SELECT COUNT(*)::int AS completed_sessions
      FROM mining_sessions
      WHERE user_id = $1
        AND status = 'completed'
    `,
    [userId]
  );

  const completedSessions =
    Number(sessionsResult.rows[0]?.completed_sessions || 0);

  let kycResult = await db.query(
    `
      SELECT id, status
      FROM user_kyc
      WHERE user_id = $1
      LIMIT 1
    `,
    [userId]
  );

  let kyc = kycResult.rows[0] || null;

  if (!kyc) {
    await db.query(
      `
        INSERT INTO user_kyc (user_id, status)
        VALUES ($1, 'NOT_ELIGIBLE')
      `,
      [userId]
    );

    kycResult = await db.query(
      `
        SELECT id, status
        FROM user_kyc
        WHERE user_id = $1
        LIMIT 1
      `,
      [userId]
    );

    kyc = kycResult.rows[0] || null;
  }

  if (!kyc) {
    throw new Error("Unable to create or load KYC record");
  }

  // Pending and approved KYC must never be changed automatically.
  if (kyc.status === "PENDING" || kyc.status === "APPROVED") {
    return kyc.status;
  }

  // User is not eligible until the required sessions are completed.
  if (completedSessions < KYC_MINING_SESSIONS) {
    if (kyc.status === "ELIGIBLE") {
      await db.query(
        `
          UPDATE user_kyc
          SET status = 'NOT_ELIGIBLE',
              eligible_at = NULL,
              updated_at = CURRENT_TIMESTAMP
          WHERE user_id = $1
        `,
        [userId]
      );
    }

    return "NOT_ELIGIBLE";
  }

  // User becomes eligible after completing 50 sessions.
  if (kyc.status === "NOT_ELIGIBLE") {
    await db.query(
      `
        UPDATE user_kyc
        SET status = 'ELIGIBLE',
            eligible_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $1
      `,
      [userId]
    );

    return "ELIGIBLE";
  }

  return kyc.status;
}

module.exports = {
  KYC_MINING_SESSIONS,
  updateKycEligibility
};
