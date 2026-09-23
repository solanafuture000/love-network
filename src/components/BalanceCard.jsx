
function BalanceCard({ isMining, balance = 1250 }) {
  const totalBalance = Number(balance).toFixed(2);

  const availableBalance = Number(balance).toFixed(2);

  const pendingBalance = isMining ? "0.00" : "0.00";

  return (
    <section className="balance-card">
      <div className="balance-top">
        <div>
          <span>Total Balance</span>
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
          <strong>{pendingBalance} LOVE</strong>
        </div>
      </div>

      <div className="balance-footer">
        <span>
          {isMining
            ? "Mining is active"
            : "Mining is stopped"}
        </span>

        <span>
          {isMining
            ? "Earning LOVE"
            : "Start mining"}
        </span>
      </div>
    </section>
  );
}

export default BalanceCard;

