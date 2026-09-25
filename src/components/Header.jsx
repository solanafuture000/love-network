import { useState } from "react";

function Header() {
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfile, setShowProfile] = useState(false);

  const storedUser = localStorage.getItem("love_user");

  let username = "User";

  try {
    const user = storedUser ? JSON.parse(storedUser) : null;
    username = user?.username || user?.name || "User";
  } catch {
    username = "User";
  }

  const toggleNotifications = () => {
    setShowNotifications((current) => !current);
    setShowProfile(false);
  };

  const toggleProfile = () => {
    setShowProfile((current) => !current);
    setShowNotifications(false);
  };

  const handleLogout = () => {
    localStorage.removeItem("love_token");
    localStorage.removeItem("love_user");

    window.dispatchEvent(new Event("love-auth-change"));
  };

  return (
    <header className="dashboard-header">
      <div className="header-brand">
        <div className="brand-logo">L</div>

        <div>
          <h2>LOVE Network</h2>
          <p>Welcome back, {username}</p>
        </div>
      </div>

      <div className="header-actions">
        <div className="header-dropdown-wrapper">
          <button
            className="notification-button"
            type="button"
            onClick={toggleNotifications}
            aria-label="Notifications"
          >
            ??
          </button>

          {showNotifications && (
            <div className="header-dropdown notification-dropdown">
              <strong>Notifications</strong>
              <p>No new notifications</p>
            </div>
          )}
        </div>

        <div className="header-dropdown-wrapper">
          <button
            className="profile-button"
            type="button"
            onClick={toggleProfile}
            aria-label="Profile"
          >
            {username.charAt(0).toUpperCase()}
          </button>

          {showProfile && (
            <div className="header-dropdown profile-dropdown">
              <strong>{username}</strong>
              <p>LOVE Network Member</p>

              <button type="button">
                View Profile
              </button>

              <button
                type="button"
                onClick={handleLogout}
                style={{
                  marginTop: "10px",
                  width: "100%",
                  cursor: "pointer"
                }}
              >
                Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export default Header;
