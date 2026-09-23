import { useEffect, useState } from "react";
import { api } from "../services/api";

function SettingsCard() {
  const [notifications, setNotifications] = useState(() => {
    return localStorage.getItem("love_notifications") !== "false";
  });

  const [open, setOpen] = useState(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [email, setEmail] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [emailOtp, setEmailOtp] = useState("");
  const [emailOtpSent, setEmailOtpSent] = useState(false);

  const [twoFactor, setTwoFactor] = useState(false);
  const [otpMode, setOtpMode] = useState(false);
  const [otp, setOtp] = useState("");

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [twoFactorLoading, setTwoFactorLoading] = useState(true);
  const [twoFactorSending, setTwoFactorSending] = useState(false);
  const [twoFactorVerifying, setTwoFactorVerifying] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadSecurity() {
      try {
        const profile = await api.getProfile();

        if (active) {
          setEmail(profile?.user?.email || "");
        }
      } catch (err) {
        console.error("SETTINGS PROFILE ERROR:", err);
      }

      try {
        const data = await api.get2FAStatus();

        if (active) {
          setTwoFactor(Boolean(data.twoFactorEnabled));
        }
      } catch (err) {
        console.error("SETTINGS 2FA ERROR:", err);
      } finally {
        if (active) {
          setTwoFactorLoading(false);
        }
      }
    }

    loadSecurity();

    return () => {
      active = false;
    };
  }, []);

  const clearMessages = () => {
    setMessage("");
    setError("");
  };

  const toggleNotifications = () => {
    const next = !notifications;

    setNotifications(next);
    localStorage.setItem("love_notifications", String(next));

    setError("");
    setMessage(
      next
        ? "Notifications enabled."
        : "Notifications disabled."
    );
  };

  const resetForms = () => {
    setOpen(null);
    setCurrentPassword("");
    setPassword("");
    setConfirmPassword("");
    setNewEmail("");
    setEmailOtp("");
    setEmailOtpSent(false);
    setOtp("");
    setOtpMode(false);
    clearMessages();
  };

  const handlePasswordSave = async (event) => {
    event.preventDefault();
    clearMessages();

    if (!currentPassword) {
      setError("Enter your current password.");
      return;
    }

    if (password.length < 6) {
      setError("New password must be at least 6 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      const data = await api.changePassword(
        currentPassword,
        password
      );

      setMessage(
        data?.message || "Password changed successfully."
      );

      setCurrentPassword("");
      setPassword("");
      setConfirmPassword("");
      setOpen(null);
    } catch (err) {
      setError(err.message || "Unable to change password.");
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSave = async (event) => {
    event.preventDefault();
    clearMessages();

    if (!currentPassword) {
      setError("Enter your current password.");
      return;
    }

    if (!newEmail || !newEmail.includes("@")) {
      setError("Enter a valid email address.");
      return;
    }

    setLoading(true);

    try {
      if (!emailOtpSent) {
        const data = await api.requestEmailChangeOtp(
          newEmail,
          currentPassword
        );

        setEmailOtpSent(true);

        setMessage(
          data?.message ||
          "Verification code sent to your new email address."
        );
      } else {
        if (!/^\d{6}$/.test(emailOtp)) {
          setError("Enter the 6-digit verification code.");
          return;
        }

        const data = await api.verifyEmailChangeOtp(
          newEmail,
          emailOtp
        );

        const updatedEmail = data?.email || newEmail;

        setEmail(updatedEmail);
        setNewEmail("");
        setEmailOtp("");
        setCurrentPassword("");
        setEmailOtpSent(false);
        setOpen(null);

        setMessage(
          data?.message ||
          "Email address changed successfully."
        );
      }
    } catch (err) {
      setError(
        err.message ||
        (emailOtpSent
          ? "Unable to verify email."
          : "Unable to send verification code.")
      );
    } finally {
      setLoading(false);
    }
  };

  async function handleTwoFactorRequest() {
    setError("");
    setMessage("");
    setTwoFactorSending(true);

    try {
      await api.send2FAOtp();

      setOtp("");
      setOtpMode(true);

      setMessage(
        twoFactor
          ? "Verification code sent to your email to disable 2FA."
          : "Verification code sent to your email to enable 2FA."
      );
    } catch (err) {
      setError(
        err.message || "Failed to send verification code."
      );
    } finally {
      setTwoFactorSending(false);
    }
  }

  async function handleTwoFactorVerify() {
    if (!/^\d{6}$/.test(otp)) {
      setError("Enter the 6-digit verification code.");
      return;
    }

    setError("");
    setMessage("");
    setTwoFactorVerifying(true);

    try {
      const data = await api.verify2FAOtp(otp);

      setTwoFactor(Boolean(data.twoFactorEnabled));
      setOtp("");
      setOtpMode(false);

      setMessage(
        data.message ||
        "Two-factor authentication status updated successfully."
      );
    } catch (err) {
      setError(err.message || "Verification failed.");
    } finally {
      setTwoFactorVerifying(false);
    }
  }

  const handleLogout = () => {
    localStorage.removeItem("love_token");
    localStorage.removeItem("love_user");
    window.location.reload();
  };

  return (
    <section className="settings-card" id="settings">
      <div className="section-heading">
        <div>
          <span>Preferences & Security</span>
          <h3>Settings</h3>
          <p>Manage your LOVE Network account and security.</p>
        </div>

        <div className="settings-icon">
          ?
        </div>
      </div>

      <div className="settings-list">

        <div className="settings-row">
          <div>
            <strong>Notifications</strong>
            <small>
              Receive mining and account updates.
            </small>
          </div>

          <button
            type="button"
            className={
              notifications
                ? "settings-toggle active"
                : "settings-toggle"
            }
            onClick={toggleNotifications}
          >
            {notifications ? "ON" : "OFF"}
          </button>
        </div>

        <div className="settings-row">
          <div>
            <strong>Change Password</strong>
            <small>
              Update your LOVE Network account password.
            </small>
          </div>

          <button
            type="button"
            className="settings-action-button"
            onClick={() => {
              clearMessages();
              setOpen(open === "password" ? null : "password");
              setOtpMode(false);
            }}
          >
            {open === "password" ? "Close" : "Change"}
          </button>
        </div>

        {open === "password" && (
          <form
            className="settings-form"
            onSubmit={handlePasswordSave}
          >
            <label>
              Current Password

              <input
                type="password"
                value={currentPassword}
                onChange={(event) =>
                  setCurrentPassword(event.target.value)
                }
                placeholder="Enter current password"
                required
              />
            </label>

            <label>
              New Password

              <input
                type="password"
                value={password}
                onChange={(event) =>
                  setPassword(event.target.value)
                }
                placeholder="Enter new password"
                minLength="6"
                required
              />
            </label>

            <label>
              Confirm Password

              <input
                type="password"
                value={confirmPassword}
                onChange={(event) =>
                  setConfirmPassword(event.target.value)
                }
                placeholder="Confirm new password"
                minLength="6"
                required
              />
            </label>

            <div className="settings-form-actions">
              <button
                type="button"
                onClick={resetForms}
                disabled={loading}
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={loading}
              >
                {loading ? "Saving..." : "Save Password"}
              </button>
            </div>
          </form>
        )}

        <div className="settings-row">
          <div>
            <strong>Email Address</strong>
            <small>
              {email || "Loading..."}
            </small>
          </div>

          <button
            type="button"
            className="settings-action-button"
            onClick={() => {
              clearMessages();
              setOpen(open === "email" ? null : "email");
              setOtpMode(false);
            }}
          >
            {open === "email" ? "Close" : "Change"}
          </button>
        </div>

        {open === "email" && (
          <form
            className="settings-form"
            onSubmit={handleEmailSave}
          >
            <label>
              Current Password

              <input
                type="password"
                value={currentPassword}
                onChange={(event) =>
                  setCurrentPassword(event.target.value)
                }
                placeholder="Enter current password"
                required
              />
            </label>

            <label>
              New Email Address

              <input
                type="email"
                value={newEmail}
                onChange={(event) =>
                  setNewEmail(event.target.value)
                }
                placeholder="Enter new email address"
                required
                disabled={emailOtpSent}
              />
            </label>

            {emailOtpSent && (
              <label>
                Verification Code

                <input
                  type="text"
                  inputMode="numeric"
                  maxLength="6"
                  value={emailOtp}
                  onChange={(event) =>
                    setEmailOtp(
                      event.target.value
                        .replace(/\D/g, "")
                        .slice(0, 6)
                    )
                  }
                  placeholder="Enter 6-digit OTP"
                  autoComplete="one-time-code"
                  required
                />

                <small>
                  A verification code was sent to your new email address.
                </small>
              </label>
            )}

            <div className="settings-form-actions">
              <button
                type="button"
                onClick={resetForms}
                disabled={loading}
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={loading}
              >
                {loading
                  ? "Please wait..."
                  : emailOtpSent
                    ? "Verify & Change Email"
                    : "Send Verification Code"}
              </button>
            </div>
          </form>
        )}

        <div className="settings-row">
          <div>
            <strong>Two-Factor Authentication</strong>
            <small>
              {twoFactor
                ? "2FA is currently enabled on your account."
                : "Require an additional verification step when signing in."}
            </small>
          </div>

          <button
            type="button"
            className="settings-action-button"
            onClick={handleTwoFactorRequest}
            disabled={
              twoFactorLoading ||
              twoFactorSending ||
              otpMode
            }
          >
            {twoFactorLoading
              ? "Loading..."
              : twoFactorSending
                ? "Sending..."
                : twoFactor
                  ? "Disable"
                  : "Enable"}
          </button>
        </div>

        {otpMode && (
          <div className="settings-form">
            <strong>Email Verification</strong>

            <small>
              Enter the 6-digit code sent to your registered email.
            </small>

            <input
              type="text"
              inputMode="numeric"
              maxLength="6"
              value={otp}
              onChange={(event) =>
                setOtp(
                  event.target.value
                    .replace(/\D/g, "")
                    .slice(0, 6)
                )
              }
              placeholder="000000"
              autoComplete="one-time-code"
            />

            <div className="settings-form-actions">
              <button
                type="button"
                onClick={() => {
                  setOtp("");
                  setOtpMode(false);
                  clearMessages();
                }}
                disabled={twoFactorVerifying}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleTwoFactorVerify}
                disabled={
                  twoFactorVerifying ||
                  otp.length !== 6
                }
              >
                {twoFactorVerifying
                  ? "Verifying..."
                  : "Verify Code"}
              </button>
            </div>
          </div>
        )}

        <div className="settings-row">
          <div>
            <strong>Active Sessions</strong>
            <small>
              Session management will be available when device-session tracking is enabled.
            </small>
          </div>

          <span className="profile-badge">
            Coming Soon
          </span>
        </div>

        <div className="settings-row">
          <div>
            <strong>Logout</strong>
            <small>
              Sign out of your LOVE Network account.
            </small>
          </div>

          <button
            type="button"
            className="settings-logout-button"
            onClick={handleLogout}
          >
            Logout
          </button>
        </div>

      </div>

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

export default SettingsCard;
