
import { useEffect, useState } from "react";

function ProfileCard() {
  const [name, setName] = useState(() => {
    return localStorage.getItem("love_profile_name") || "Hamdan";
  });

  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    localStorage.setItem("love_profile_name", name);
  }, [name]);

  const handleSave = () => {
    const trimmedName = name.trim();

    if (!trimmedName) {
      return;
    }

    setName(trimmedName);
    localStorage.setItem("love_profile_name", trimmedName);

    setEditing(false);
    setSaved(true);

    setTimeout(() => {
      setSaved(false);
    }, 2000);
  };

  const handleCancel = () => {
    setName(
      localStorage.getItem("love_profile_name") || "Hamdan"
    );

    setEditing(false);
  };

  return (
    <section className="settings-card" id="profile">
      <div className="section-heading">
        <div>
          <span>Account</span>
          <h3>My Profile</h3>
          <p>Manage your LOVE Network account.</p>
        </div>

        <div className="settings-icon">
          👤
        </div>
      </div>

      <div className="settings-list">

        {/* Display Name */}
        <div className="settings-row">
          <div>
            <strong>Display Name</strong>

            {editing ? (
              <input
                type="text"
                value={name}
                onChange={(event) =>
                  setName(event.target.value)
                }
                autoFocus
              />
            ) : (
              <small>{name}</small>
            )}
          </div>

          {!editing && (
            <button
              type="button"
              className="settings-action-button"
              onClick={() => setEditing(true)}
            >
              Edit
            </button>
          )}
        </div>

        {/* Member Status */}
        <div className="settings-row">
          <div>
            <strong>Member Status</strong>
            <small>Current LOVE Network account status.</small>
          </div>

          <strong>Active Member</strong>
        </div>

        {/* Account ID */}
        <div className="settings-row">
          <div>
            <strong>Account ID</strong>
            <small>Unique identifier for your account.</small>
          </div>

          <strong>LOVE-2026-001</strong>
        </div>

        {/* Edit Actions */}
        {editing && (
          <div className="settings-form-actions">
            <button
              type="button"
              onClick={handleCancel}
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleSave}
            >
              Save Changes
            </button>
          </div>
        )}

      </div>

      {saved && (
        <div className="settings-message">
          ✓ Profile updated successfully
        </div>
      )}
    </section>
  );
}

export default ProfileCard;
