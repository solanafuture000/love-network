function BalanceCard({
  isMining,
  balance = 0,
  pendingBalance = 0,
  migrationBalance = 0
}) {
  const total = Number(balance || 0);
  const pending = Number(pendingBalance || 0);
  const migration = Number(migrationBalance || 0);

  const totalBalance = total.toFixed(2);
  const availableBalance = Math.max(
    0,
    total - pending
  ).toFixed(2);

  const pendingDisplay = pending.toFixed(2);
  const migrationDisplay = migration.toFixed(2);

  return (
    <section className="balance-card">
      <div className="balance-top">
        <div>
          <span>Main Balance</span>
          <h2>{totalBalance} LOVE</h2>
        </div>

        <div className="balance-icon">
          L
        </div>
      </div>

      <div className="balance-details">
        <div>
          <small>Available</small>
          <strong>{availableBalance} LOVE</strong>
        </div>

        <div>
          <small>Pending</small>
          <strong>{pendingDisplay} LOVE</strong>
        </div>

        <div>
          <small>Migration</small>
          <strong>{migrationDisplay} LOVE</strong>
        </div>
      </div>

      <div className="balance-footer">
        <span>
          {isMining
            ? "Mining is active"
            : "Mining is stopped"}
        </span>

        <span>
          {migration > 0
            ? `${migrationDisplay} LOVE ready for migration`
            : "KYC approval required for migration"}
        </span>
      </div>
    </section>
  );
}

export default BalanceCard;
