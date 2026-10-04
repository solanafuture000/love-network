import { useEffect, useState } from "react";
import {
  getLoveNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  EVENT_NAME,
} from "../services/notifications";

function BellIcon({ size = 20 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function MiningIcon({ size = 18 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14.5 2.5 5 13h6l-1.5 8.5L19 11h-6l1.5-8.5Z" />
    </svg>
  );
}

function UserIcon({ size = 18 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  );
}

function LogoutIcon({ size = 18 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10 5H6.5A1.5 1.5 0 0 0 5 6.5v11A1.5 1.5 0 0 0 6.5 19H10" />
      <path d="m14 8 4 4-4 4" />
      <path d="M18 12H9" />
    </svg>
  );
}

function CheckIcon({ size = 15 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m5 12 4 4L19 6" />
    </svg>
  );
}

function Header() {
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [notifications, setNotifications] = useState([]);

  const storedUser = localStorage.getItem("love_user");

  let username = "User";

  try {
    const user = storedUser ? JSON.parse(storedUser) : null;

    username =
      user?.username ||
      user?.name ||
      "User";
  } catch {
    username = "User";
  }

  const loadNotifications = () => {
    setNotifications(getLoveNotifications());
  };

  useEffect(() => {
    loadNotifications();

    const handleNotificationsChange = () => {
      loadNotifications();
    };

    window.addEventListener(
      EVENT_NAME,
      handleNotificationsChange
    );

    return () => {
      window.removeEventListener(
        EVENT_NAME,
        handleNotificationsChange
      );
    };
  }, []);

  const unreadCount = notifications.filter(
    (notification) => !notification.read
  ).length;

  const toggleNotifications = () => {
    setShowNotifications((current) => !current);
    setShowProfile(false);
  };

  const toggleProfile = () => {
    setShowProfile((current) => !current);
    setShowNotifications(false);
  };

  const handleNotificationClick = (id) => {
    markNotificationRead(id);
    loadNotifications();
  };

  const handleMarkAllRead = () => {
    markAllNotificationsRead();
    loadNotifications();
  };

  const handleLogout = () => {
    localStorage.removeItem("love_token");
    localStorage.removeItem("love_user");

    window.dispatchEvent(
      new Event("love-auth-change")
    );
  };

  const formatNotificationTime = (createdAt) => {
    if (!createdAt) return "";

    const date = new Date(createdAt);

    if (Number.isNaN(date.getTime())) {
      return "";
    }

    const difference =
      Date.now() - date.getTime();

    const minutes = Math.floor(
      difference / 60000
    );

    if (minutes < 1) {
      return "Just now";
    }

    if (minutes < 60) {
      return `${minutes}m ago`;
    }

    const hours = Math.floor(minutes / 60);

    if (hours < 24) {
      return `${hours}h ago`;
    }

    const days = Math.floor(hours / 24);

    if (days < 7) {
      return `${days}d ago`;
    }

    return date.toLocaleDateString();
  };

  return (
    <header className="dashboard-header">

      <div className="header-brand">
        <div className="brand-logo">
          L
        </div>

        <div>
          <h2>LOVE Network</h2>
          <p>
            Welcome back, {username}
          </p>
        </div>
      </div>

      <div className="header-actions">

        {/* ================================
            NOTIFICATIONS
        ================================= */}

        <div className="header-dropdown-wrapper">

          <button
            className="notification-button"
            type="button"
            onClick={toggleNotifications}
            aria-label="Notifications"
            title="Notifications"
          >
            <BellIcon size={20} />

            {unreadCount > 0 && (
              <span className="notification-dot">
                <span className="notification-count">
                  {unreadCount > 9
                    ? "9+"
                    : unreadCount}
                </span>
              </span>
            )}
          </button>

          {showNotifications && (
            <div className="header-dropdown notification-dropdown">

              <div className="dropdown-heading">

                <div className="dropdown-heading-icon">
                  <BellIcon size={17} />
                </div>

                <div>
                  <strong>
                    Notifications
                  </strong>

                  <small>
                    {unreadCount > 0
                      ? `${unreadCount} unread`
                      : "All caught up"}
                  </small>
                </div>

              </div>

              {notifications.length === 0 ? (

                <div className="notification-empty">

                  <div className="notification-empty-icon">
                    <BellIcon size={19} />
                  </div>

                  <div>
                    <strong>
                      No notifications
                    </strong>

                    <p>
                      Your LOVE Network updates
                      will appear here.
                    </p>
                  </div>

                </div>

              ) : (

                <>
                  <div className="notification-list">

                    {notifications.map(
                      (notification) => (

                        <button
                          key={notification.id}
                          type="button"
                          className={`notification-item ${
                            notification.read
                              ? "read"
                              : "unread"
                          }`}
                          onClick={() =>
                            handleNotificationClick(
                              notification.id
                            )
                          }
                        >

                          <div className="notification-item-icon">
                            {notification.type === "mining" ? (
                              <MiningIcon size={17} />
                            ) : (
                              <BellIcon size={17} />
                            )}
                          </div>

                          <div className="notification-item-content">

                            <strong>
                              {notification.title}
                            </strong>

                            <p>
                              {notification.message}
                            </p>

                            <small>
                              {formatNotificationTime(
                                notification.createdAt
                              )}
                            </small>

                          </div>

                          {!notification.read && (
                            <span className="notification-unread-dot" />
                          )}

                        </button>

                      )
                    )}

                  </div>

                  {unreadCount > 0 && (
                    <button
                      type="button"
                      className="mark-all-read"
                      onClick={handleMarkAllRead}
                    >
                      <CheckIcon size={14} />
                      Mark all as read
                    </button>
                  )}

                </>

              )}

            </div>
          )}

        </div>


        {/* ================================
            PROFILE
        ================================= */}

        <div className="header-dropdown-wrapper">

          <button
            className="profile-button"
            type="button"
            onClick={toggleProfile}
            aria-label="Profile"
            title="Profile"
          >
            {username
              .charAt(0)
              .toUpperCase()}
          </button>

          {showProfile && (

            <div className="header-dropdown profile-dropdown">

              <div className="profile-dropdown-header">

                <div className="profile-dropdown-avatar">
                  {username
                    .charAt(0)
                    .toUpperCase()}
                </div>

                <div>
                  <strong>
                    {username}
                  </strong>

                  <p>
                    LOVE Network Member
                  </p>
                </div>

              </div>


              <button
                type="button"
                className="profile-menu-item"
              >
                <UserIcon size={17} />
                <span>
                  View Profile
                </span>
              </button>


              <button
                type="button"
                className="profile-menu-item logout-item"
                onClick={handleLogout}
              >
                <LogoutIcon size={17} />
                <span>
                  Logout
                </span>
              </button>

            </div>

          )}

        </div>

      </div>

    </header>
  );
}

export default Header;
