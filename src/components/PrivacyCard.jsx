import { useEffect, useState } from "react";
import { api } from "../services/api";

function PrivacyCard() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadProfile() {
      try {
        const data = await api.getProfile();

        if (active) {
          setProfile(data);
        }
      } catch (err) {
        console.error("PRIVACY PROFILE ERROR:", err);

        if (active) {
          setError(err.message || "Unable to load account data.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadProfile();

    return () => {
      active = false;
    };
  }, []);

  const handleDownload = () => {
    if (!profile?.user) {
      setError("Account data is not available yet.");
      return;
    }

    const data = {
      account: {
        id: profile.user.id,
        username: profile.user.username,
        email: profile.user.email,
        role: profile.user.role,
        referralCode: profile.user.referral_code,
        kycStatus: profile.user.kyc_status,
        successfulMiningSessions:
          profile.user.successful_mining_sessions,
        currentStreakDays:
          profile.user.current_streak_days,
        longestStreakDays:
          profile.user.longest_streak_days,
        lastMiningDate:
          profile.user.last_mining_date,
        createdAt:
          profile.user.created_at,
      },

      wallet: profile.wallet
        ? {
            id: profile.wallet.id,
            balance: profile.wallet.balance,
            totalMined: profile.wallet.total_mined,
            createdAt: profile.wallet.created_at,
            updatedAt: profile.wallet.updated_at,
          }
        : null,

      exportDate: new Date().toISOString(),
    };

    const blob = new Blob(
      [JSON.stringify(data, null, 2)],
      { type: "application/json" }
    );

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "love-network-account-data.json";

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);

    setError("");
    setMessage("Your account data has been downloaded.");

    setTimeout(() => {
      setMessage("");
    }, 2500);
  };

  const openDeleteConfirmation = () => {
    setError("");
    setMessage("");
    setDeletePassword("");
    setConfirmDelete(true);
  };

  const cancelDelete = () => {
    if (deleteLoading) return;

    setConfirmDelete(false);
    setDeletePassword("");
    setError("");
  };

  const handleDelete = async () => {
    if (!deletePassword.trim()) {
      setError("Please enter your current password.");
      return;
    }

    setDeleteLoading(true);
    setError("");
    setMessage("");

    try {
      const data = await api.deleteAccount(deletePassword);

      if (!data?.success) {
        throw new Error(
          data?.message || "Unable to delete account."
        );
      }

      localStorage.removeItem("love_token");
      localStorage.removeItem("love_user");

      setMessage(
        "Your LOVE Network account has been permanently deleted."
      );

      setConfirmDelete(false);
      setDeletePassword("");

      setTimeout(() => {
        window.location.href = "/login";
      }, 1200);
    } catch (err) {
      console.error("DELETE ACCOUNT ERROR:", err);
      setError(
        err.message || "Unable to delete account."
      );
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <section className="settings-card" id="privacy">
      <div className="section-heading">
        <div>
          <span>Privacy</span>
          <h3>Privacy & Data</h3>
          <p>Manage your LOVE Network account data.</p>
        </div>

        <div className="settings-icon">
          ??
        </div>
      </div>

      <div className="settings-list">
        <div className="settings-row">
          <div>
            <strong>Account Data</strong>
            <small>
              {loading
                ? "Loading your account information..."
                : profile?.user
                  ? `Account ID: ${profile.user.id} • ${profile.user.username}`
                  : "Unable to load account information."}
            </small>
          </div>

          <span className="profile-badge">
            Protected
          </span>
        </div>

        <div className="settings-row">
          <div>
            <strong>Download My Data</strong>
            <small>
              Download a copy of your real LOVE Network account and wallet information.
            </small>
          </div>

          <button
            type="button"
            className="settings-action-button"
            onClick={handleDownload}
            disabled={loading || !profile?.user}
          >
            {loading ? "Loading..." : "Download"}
          </button>
        </div>

        <div className="settings-row">
          <div>
            <strong>Delete Account</strong>
            <small>
              Permanently delete your account and associated data.
            </small>
          </div>

          <button
            type="button"
            className="settings-action-button"
            onClick={openDeleteConfirmation}
            disabled={deleteLoading}
          >
            Delete
          </button>
        </div>
      </div>

      {confirmDelete && (
        <div className="settings-form">
          <strong>Delete your account permanently?</strong>

          <small>
            This action cannot be undone. All account data,
            wallet data, mining history and referral records
            associated with this account will be deleted.
          </small>

          <input
            type="password"
            value={deletePassword}
            onChange={(e) => setDeletePassword(e.target.value)}
            placeholder="Enter your current password"
            disabled={deleteLoading}
            autoComplete="current-password"
          />

          <div className="settings-form-actions">
            <button
              type="button"
              onClick={cancelDelete}
              disabled={deleteLoading}
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleDelete}
              disabled={deleteLoading || !deletePassword.trim()}
            >
              {deleteLoading ? "Deleting..." : "Confirm Delete"}
            </button>
          </div>
        </div>
      )}

      {message && (
        <div className="settings-message">
          {message}
        </div>
      )}

      {error && (
        <div
          className="settings-message"
          style={{ color: "#f87171" }}
        >
          {error}
        </div>
      )}
    </section>
  );
}

export default PrivacyCard;
