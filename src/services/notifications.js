const STORAGE_KEY = "love_notifications";
const EVENT_NAME = "love-notifications-change";

function getNotifications() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const parsed = stored ? JSON.parse(stored) : [];

    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveNotifications(notifications) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(notifications.slice(0, 50))
  );

  window.dispatchEvent(new Event(EVENT_NAME));
}

export function getLoveNotifications() {
  return getNotifications();
}

export function getUnreadNotificationCount() {
  return getNotifications().filter(
    (notification) => !notification.read
  ).length;
}

export function addLoveNotification({
  type = "system",
  title,
  message,
  icon = "bell",
}) {
  if (!title || !message) return;

  const notifications = getNotifications();

  const notification = {
    id:
      Date.now().toString() +
      "-" +
      Math.random().toString(36).slice(2, 8),
    type,
    title,
    message,
    icon,
    read: false,
    createdAt: new Date().toISOString(),
  };

  saveNotifications([notification, ...notifications]);
}

export function markAllNotificationsRead() {
  const notifications = getNotifications().map(
    (notification) => ({
      ...notification,
      read: true,
    })
  );

  saveNotifications(notifications);
}

export function markNotificationRead(id) {
  const notifications = getNotifications().map(
    (notification) =>
      notification.id === id
        ? { ...notification, read: true }
        : notification
  );

  saveNotifications(notifications);
}

export function clearLoveNotifications() {
  localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event(EVENT_NAME));
}

export { EVENT_NAME };
