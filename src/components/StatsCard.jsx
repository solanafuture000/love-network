
function StatsCard({
  todayEarned = 0,
  weekEarned = 0,
  monthEarned = 0,
}) {
  return (
    <section className="stats-card">
      <div className="section-heading">
        <div>
          <span>Performance</span>
          <h3>Mining Statistics</h3>
        </div>

        <span className="stats-period">This Month</span>
      </div>

      <div className="stats-grid">
        <div>
          <small>Today</small>
          <strong>{todayEarned.toFixed(2)} LOVE</strong>
          <span>Mining</span>
        </div>

        <div>
          <small>This Week</small>
          <strong>{weekEarned.toFixed(2)} LOVE</strong>
          <span>Mining</span>
        </div>

        <div>
          <small>This Month</small>
          <strong>{monthEarned.toFixed(2)} LOVE</strong>
          <span>Mining</span>
        </div>
      </div>
    </section>
  );
}

export default StatsCard;

