function QuickActions() {
  const actions = [
    { icon: "⛏", label: "Mining", target: "mining" },
    { icon: "👥", label: "Invite", target: "referral" },
    { icon: "W", label: "Wallet", target: "wallet" },
    { icon: "⚙", label: "Settings", target: "settings" },
  ];

  const handleAction = (target) => {
    const section = document.getElementById(target);

    if (section) {
      section.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  };

  return (
    <section className="quick-actions">
      <div className="section-heading">
        <div>
          <span>Shortcuts</span>
          <h3>Quick Actions</h3>
        </div>
      </div>

      <div className="actions-grid">
        {actions.map((action) => (
          <button
            type="button"
            key={action.label}
            onClick={() => handleAction(action.target)}
          >
            <span className="action-icon">{action.icon}</span>
            <span>{action.label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

export default QuickActions;
