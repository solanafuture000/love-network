import React, { useState } from "react";

const API_URL = "http://localhost:5000";

export default function Auth() {
  const [mode, setMode] = useState("login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [referralCode, setReferralCode] = useState("");

  const [twoFactorStep, setTwoFactorStep] = useState(false);
  const [registrationOtpStep, setRegistrationOtpStep] = useState(false);
  const [forgotPasswordStep, setForgotPasswordStep] = useState(false);
  const [forgotPasswordOtpStep, setForgotPasswordOtpStep] = useState(false);
  const [resetPassword, setResetPassword] = useState("");
  const [confirmResetPassword, setConfirmResetPassword] = useState("");

  const [challengeToken, setChallengeToken] = useState("");
  const [otp, setOtp] = useState("");

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const handleLogin = async () => {
    const response = await fetch(`${API_URL}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        username: username.trim(),
        password,
      }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.message || "Login failed");
    }

    if (data.requiresTwoFactor) {
      setChallengeToken(data.challengeToken);
      setTwoFactorStep(true);
      setOtp("");
      setMessage("OTP sent to your registered email.");
      return;
    }

    if (data.token) {
      localStorage.setItem("love_token", data.token);
    }

    if (data.user) {
      localStorage.setItem("love_user", JSON.stringify(data.user));
    }

    window.dispatchEvent(new Event("love-auth-change"));

    setMessage("Login successful!");
  };

  const handleVerify2FA = async (e) => {
    e.preventDefault();

    if (!/^\d{6}$/.test(otp.trim())) {
      setMessage("Please enter the 6-digit OTP.");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const response = await fetch(
        `${API_URL}/api/auth/otp/2fa/login/verify`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            challengeToken,
            otp: otp.trim(),
          }),
        }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.message || "OTP verification failed");
      }

      if (data.token) {
        localStorage.setItem("love_token", data.token);
      }

      if (data.user) {
        localStorage.setItem("love_user", JSON.stringify(data.user));
      }

      window.dispatchEvent(new Event("love-auth-change"));

      setMessage("2FA login successful!");
      setTwoFactorStep(false);
      setChallengeToken("");
      setOtp("");
    } catch (error) {
      console.error("2FA LOGIN ERROR:", error);
      setMessage(error.message || "OTP verification failed");
    } finally {
      setLoading(false);
    }
  };


  const handleForgotPassword = async (e) => {
    e.preventDefault();

    if (!email.trim()) {
      setMessage("Please enter your email address.");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const response = await fetch(
        `${API_URL}/api/auth/forgot-password`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: email.trim(),
          }),
        }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.message || "Unable to send reset code");
      }

      if (data.challengeToken) {
        setChallengeToken(data.challengeToken);
        setOtp("");
        setForgotPasswordStep(false);
        setForgotPasswordOtpStep(true);
        setMessage(
          "Verification code sent to your email. Enter the 6-digit OTP."
        );
      } else {
        setMessage(
          data.message ||
            "If this email is registered, a verification code has been sent."
        );
      }
    } catch (error) {
      console.error("FORGOT PASSWORD ERROR:", error);
      setMessage(error.message || "Unable to send reset code");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyForgotPassword = async (e) => {
    e.preventDefault();

    if (!/^\d{6}$/.test(otp.trim())) {
      setMessage("Please enter the 6-digit OTP.");
      return;
    }

    if (resetPassword.length < 8) {
      setMessage("New password must be at least 8 characters.");
      return;
    }

    if (resetPassword !== confirmResetPassword) {
      setMessage("Passwords do not match.");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const response = await fetch(
        `${API_URL}/api/auth/forgot-password/verify`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            challengeToken,
            otp: otp.trim(),
            newPassword: resetPassword,
          }),
        }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.message || "Password reset failed");
      }

      setForgotPasswordOtpStep(false);
      setForgotPasswordStep(false);
      setChallengeToken("");
      setOtp("");
      setResetPassword("");
      setConfirmResetPassword("");
      setEmail("");
      setMode("login");
      setMessage(
        data.message || "Password reset successfully. Please login."
      );
    } catch (error) {
      console.error("RESET PASSWORD ERROR:", error);
      setMessage(error.message || "Password reset failed");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyRegistrationOtp = async (e) => {
    e.preventDefault();

    if (!/^\d{6}$/.test(otp.trim())) {
      setMessage("Please enter the 6-digit OTP.");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const response = await fetch(
        `${API_URL}/api/auth/register/verify`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            challengeToken,
            otp: otp.trim(),
          }),
        }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.message || "OTP verification failed");
      }

      setRegistrationOtpStep(false);
      setChallengeToken("");
      setOtp("");
      setPassword("");
      setReferralCode("");
      setMode("login");
      setMessage(
        data.message || "Email verified successfully. Please login."
      );
    } catch (error) {
      console.error("REGISTRATION OTP ERROR:", error);
      setMessage(error.message || "OTP verification failed");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    setLoading(true);
    setMessage("");

    try {
      if (mode === "login") {
        await handleLogin();
      } else {
        const response = await fetch(`${API_URL}/api/auth/register`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            username: username.trim(),
            email: email.trim(),
            password,
            referralCode: referralCode.trim() || undefined,
          }),
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(data.message || "Registration failed");
        }

        if (data.requiresEmailVerification && data.challengeToken) {
          setChallengeToken(data.challengeToken);
          setOtp("");
          setMessage(
            "Verification code sent to your email. Enter the 6-digit OTP."
          );
          setRegistrationOtpStep(true);
          setEmail(data.email || email.trim());
          return;
        }

        setMessage("Registration successful! Please login.");

        setMode("login");
        setEmail("");
        setPassword("");
        setReferralCode("");
      }
    } catch (error) {
      console.error("Auth error:", error);
      setMessage(error.message || "Server error");
    } finally {
      setLoading(false);
    }
  };

  const resetTwoFactor = () => {
    setTwoFactorStep(false);
    setChallengeToken("");
    setOtp("");
    setMessage("");
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background:
          "linear-gradient(135deg, #070b16 0%, #101a33 50%, #07111f 100%)",
        padding: "20px",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "430px",
          background: "rgba(15, 23, 42, 0.96)",
          border: "1px solid rgba(255, 255, 255, 0.12)",
          borderRadius: "20px",
          padding: "32px",
          boxSizing: "border-box",
          boxShadow: "0 20px 60px rgba(0, 0, 0, 0.45)",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: "28px" }}>
          <h1
            style={{
              margin: 0,
              color: "#ffffff",
              fontSize: "32px",
              fontWeight: "700",
            }}
          >
            LOVE Network
          </h1>

          <p
            style={{
              marginTop: "8px",
              marginBottom: 0,
              color: "#94a3b8",
              fontSize: "14px",
            }}
          >
            {forgotPasswordStep || forgotPasswordOtpStep
              ? "Password recovery"
              : registrationOtpStep
              ? "Email verification"
              : twoFactorStep
              ? "Verify your login"
              : mode === "login"
              ? "Welcome back to LOVE Network"
              : "Create your LOVE Network account"}
          </p>
        </div>

        {forgotPasswordOtpStep ? (
          <form onSubmit={handleVerifyForgotPassword}>
            <div
              style={{
                textAlign: "center",
                padding: "10px 0 20px",
              }}
            >
              <div style={{ fontSize: "42px", marginBottom: "12px" }}>
                ??
              </div>

              <h2
                style={{
                  margin: "0 0 10px",
                  color: "#ffffff",
                  fontSize: "22px",
                }}
              >
                Reset Password
              </h2>

              <p
                style={{
                  margin: "0 auto 22px",
                  color: "#94a3b8",
                  fontSize: "14px",
                  lineHeight: "1.6",
                }}
              >
                Enter the 6-digit code sent to
                <br />
                <strong style={{ color: "#e2e8f0" }}>{email}</strong>
              </p>

              <input
                type="text"
                value={otp}
                onChange={(e) =>
                  setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                placeholder="Enter 6-digit OTP"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                autoFocus
                required
                style={{
                  width: "100%",
                  padding: "15px",
                  boxSizing: "border-box",
                  borderRadius: "10px",
                  border: "1px solid #334155",
                  outline: "none",
                  background: "#0f172a",
                  color: "#ffffff",
                  fontSize: "22px",
                  textAlign: "center",
                  letterSpacing: "8px",
                  marginBottom: "14px",
                }}
              />

              <input
                type="password"
                value={resetPassword}
                onChange={(e) => setResetPassword(e.target.value)}
                placeholder="New password (min 8 characters)"
                autoComplete="new-password"
                minLength={8}
                required
                style={{
                  width: "100%",
                  padding: "13px",
                  boxSizing: "border-box",
                  borderRadius: "10px",
                  border: "1px solid #334155",
                  outline: "none",
                  background: "#0f172a",
                  color: "#ffffff",
                  fontSize: "15px",
                  marginBottom: "12px",
                }}
              />

              <input
                type="password"
                value={confirmResetPassword}
                onChange={(e) =>
                  setConfirmResetPassword(e.target.value)
                }
                placeholder="Confirm new password"
                autoComplete="new-password"
                minLength={8}
                required
                style={{
                  width: "100%",
                  padding: "13px",
                  boxSizing: "border-box",
                  borderRadius: "10px",
                  border: "1px solid #334155",
                  outline: "none",
                  background: "#0f172a",
                  color: "#ffffff",
                  fontSize: "15px",
                  marginBottom: "16px",
                }}
              />


              {mode === "login" && (
                <div
                  style={{
                    textAlign: "right",
                    marginBottom: "10px",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setForgotPasswordStep(true);
                      setMessage("");
                    }}
                    style={{
                      border: "none",
                      background: "transparent",
                      color: "#60a5fa",
                      cursor: "pointer",
                      fontSize: "13px",
                      padding: "4px 0",
                    }}
                  >
                    Forgot Password?
                  </button>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                style={{
                  width: "100%",
                  padding: "13px",
                  border: "none",
                  borderRadius: "10px",
                  cursor: loading ? "not-allowed" : "pointer",
                  background: "#2563eb",
                  color: "#ffffff",
                  fontWeight: "600",
                  fontSize: "15px",
                  opacity: loading ? 0.7 : 1,
                }}
              >
                {loading ? "Resetting..." : "Reset Password"}
              </button>

              <button
                type="button"
                onClick={() => {
                  setForgotPasswordOtpStep(false);
                  setForgotPasswordStep(true);
                  setChallengeToken("");
                  setOtp("");
                  setResetPassword("");
                  setConfirmResetPassword("");
                  setMessage("");
                }}
                style={{
                  width: "100%",
                  marginTop: "10px",
                  padding: "11px",
                  border: "1px solid #334155",
                  borderRadius: "10px",
                  cursor: "pointer",
                  background: "transparent",
                  color: "#94a3b8",
                  fontWeight: "600",
                }}
              >
                Back
              </button>
            </div>

            {message && (
              <div
                style={{
                  marginTop: "16px",
                  padding: "12px",
                  borderRadius: "10px",
                  background: "rgba(37, 99, 235, 0.12)",
                  border: "1px solid rgba(37, 99, 235, 0.3)",
                  color: "#bfdbfe",
                  fontSize: "14px",
                  textAlign: "center",
                }}
              >
                {message}
              </div>
            )}
          </form>
        ) : forgotPasswordStep ? (
          <form onSubmit={handleForgotPassword}>
            <div
              style={{
                textAlign: "center",
                padding: "10px 0 20px",
              }}
            >
              <div style={{ fontSize: "42px", marginBottom: "12px" }}>
                ??
              </div>

              <h2
                style={{
                  margin: "0 0 10px",
                  color: "#ffffff",
                  fontSize: "22px",
                }}
              >
                Forgot Password?
              </h2>

              <p
                style={{
                  margin: "0 auto 22px",
                  color: "#94a3b8",
                  fontSize: "14px",
                  lineHeight: "1.6",
                }}
              >
                Enter your registered email address and we'll send you a
                verification code.
              </p>

              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
                autoComplete="email"
                required
                style={{
                  width: "100%",
                  padding: "13px",
                  boxSizing: "border-box",
                  borderRadius: "10px",
                  border: "1px solid #334155",
                  outline: "none",
                  background: "#0f172a",
                  color: "#ffffff",
                  fontSize: "15px",
                  marginBottom: "14px",
                }}
              />

              <button
                type="submit"
                disabled={loading}
                style={{
                  width: "100%",
                  padding: "13px",
                  border: "none",
                  borderRadius: "10px",
                  cursor: loading ? "not-allowed" : "pointer",
                  background: "#2563eb",
                  color: "#ffffff",
                  fontWeight: "600",
                  fontSize: "15px",
                  opacity: loading ? 0.7 : 1,
                }}
              >
                {loading ? "Sending..." : "Send Verification Code"}
              </button>

              <button
                type="button"
                onClick={() => {
                  setForgotPasswordStep(false);
                  setEmail("");
                  setMessage("");
                  setMode("login");
                }}
                style={{
                  width: "100%",
                  marginTop: "10px",
                  padding: "11px",
                  border: "1px solid #334155",
                  borderRadius: "10px",
                  cursor: "pointer",
                  background: "transparent",
                  color: "#94a3b8",
                  fontWeight: "600",
                }}
              >
                Back to Login
              </button>
            </div>

            {message && (
              <div
                style={{
                  marginTop: "16px",
                  padding: "12px",
                  borderRadius: "10px",
                  background: "rgba(37, 99, 235, 0.12)",
                  border: "1px solid rgba(37, 99, 235, 0.3)",
                  color: "#bfdbfe",
                  fontSize: "14px",
                  textAlign: "center",
                }}
              >
                {message}
              </div>
            )}
          </form>
        ) : registrationOtpStep ? (
          <form onSubmit={handleVerifyRegistrationOtp}>
            <div
              style={{
                textAlign: "center",
                padding: "10px 0 20px",
              }}
            >
              <div
                style={{
                  fontSize: "42px",
                  marginBottom: "12px",
                }}
              >
                ??
              </div>

              <h2
                style={{
                  margin: "0 0 10px",
                  color: "#ffffff",
                  fontSize: "22px",
                }}
              >
                Verify Your Email
              </h2>

              <p
                style={{
                  margin: "0 auto 22px",
                  color: "#94a3b8",
                  fontSize: "14px",
                  lineHeight: "1.6",
                }}
              >
                We sent a 6-digit verification code to
                <br />
                <strong style={{ color: "#e2e8f0" }}>{email}</strong>
              </p>

              <input
                type="text"
                value={otp}
                onChange={(e) =>
                  setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                placeholder="Enter 6-digit OTP"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                autoFocus
                required
                style={{
                  width: "100%",
                  padding: "15px",
                  boxSizing: "border-box",
                  borderRadius: "10px",
                  border: "1px solid #334155",
                  outline: "none",
                  background: "#0f172a",
                  color: "#ffffff",
                  fontSize: "22px",
                  textAlign: "center",
                  letterSpacing: "8px",
                  marginBottom: "16px",
                }}
              />

              <button
                type="submit"
                disabled={loading}
                style={{
                  width: "100%",
                  padding: "13px",
                  border: "none",
                  borderRadius: "10px",
                  cursor: loading ? "not-allowed" : "pointer",
                  background: "#2563eb",
                  color: "#ffffff",
                  fontWeight: "600",
                  fontSize: "15px",
                  opacity: loading ? 0.7 : 1,
                }}
              >
                {loading ? "Verifying..." : "Verify Email"}
              </button>

              <button
                type="button"
                onClick={() => {
                  setRegistrationOtpStep(false);
                  setChallengeToken("");
                  setOtp("");
                  setMode("register");
                  setMessage("");
                }}
                style={{
                  width: "100%",
                  marginTop: "10px",
                  padding: "11px",
                  border: "1px solid #334155",
                  borderRadius: "10px",
                  cursor: "pointer",
                  background: "transparent",
                  color: "#94a3b8",
                  fontWeight: "600",
                }}
              >
                Back to Register
              </button>
            </div>

            {message && (
              <div
                style={{
                  marginTop: "16px",
                  padding: "12px",
                  borderRadius: "10px",
                  background: "rgba(37, 99, 235, 0.12)",
                  border: "1px solid rgba(37, 99, 235, 0.3)",
                  color: "#bfdbfe",
                  fontSize: "14px",
                  textAlign: "center",
                }}
              >
                {message}
              </div>
            )}
          </form>
        ) : !twoFactorStep ? (
          <>
            <div
              style={{
                display: "flex",
                gap: "8px",
                marginBottom: "24px",
                background: "#0b1220",
                padding: "5px",
                borderRadius: "12px",
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setMode("login");
                  setMessage("");
                }}
                style={{
                  flex: 1,
                  padding: "11px",
                  border: "none",
                  borderRadius: "8px",
                  cursor: "pointer",
                  background: mode === "login" ? "#2563eb" : "transparent",
                  color: "#ffffff",
                  fontWeight: "600",
                }}
              >
                Login
              </button>

              <button
                type="button"
                onClick={() => {
                  setMode("register");
                  setMessage("");
                }}
                style={{
                  flex: 1,
                  padding: "11px",
                  border: "none",
                  borderRadius: "8px",
                  cursor: "pointer",
                  background: mode === "register" ? "#2563eb" : "transparent",
                  color: "#ffffff",
                  fontWeight: "600",
                }}
              >
                Register
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: "18px" }}>
                <label
                  style={{
                    display: "block",
                    marginBottom: "7px",
                    color: "#e2e8f0",
                    fontSize: "14px",
                    fontWeight: "600",
                  }}
                >
                  Username
                </label>

                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter username"
                  required
                  autoComplete="username"
                  style={{
                    width: "100%",
                    padding: "13px 14px",
                    boxSizing: "border-box",
                    borderRadius: "10px",
                    border: "1px solid #334155",
                    outline: "none",
                    background: "#0f172a",
                    color: "#ffffff",
                    fontSize: "15px",
                  }}
                />
              </div>

              {mode === "register" && (
                <>
                  <div style={{ marginBottom: "18px" }}>
                    <label
                      style={{
                        display: "block",
                        marginBottom: "7px",
                        color: "#e2e8f0",
                        fontSize: "14px",
                        fontWeight: "600",
                      }}
                    >
                      Email
                    </label>

                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Enter email"
                      required
                      autoComplete="email"
                      style={{
                        width: "100%",
                        padding: "13px 14px",
                        boxSizing: "border-box",
                        borderRadius: "10px",
                        border: "1px solid #334155",
                        outline: "none",
                        background: "#0f172a",
                        color: "#ffffff",
                        fontSize: "15px",
                      }}
                    />
                  </div>

                  <div style={{ marginBottom: "18px" }}>
                    <label
                      style={{
                        display: "block",
                        marginBottom: "7px",
                        color: "#e2e8f0",
                        fontSize: "14px",
                        fontWeight: "600",
                      }}
                    >
                      Referral Code
                    </label>

                    <input
                      type="text"
                      value={referralCode}
                      onChange={(e) => setReferralCode(e.target.value)}
                      placeholder="Optional referral code"
                      autoComplete="off"
                      style={{
                        width: "100%",
                        padding: "13px 14px",
                        boxSizing: "border-box",
                        borderRadius: "10px",
                        border: "1px solid #334155",
                        outline: "none",
                        background: "#0f172a",
                        color: "#ffffff",
                        fontSize: "15px",
                      }}
                    />
                  </div>
                </>
              )}

              <div style={{ marginBottom: "18px" }}>
                <label
                  style={{
                    display: "block",
                    marginBottom: "7px",
                    color: "#e2e8f0",
                    fontSize: "14px",
                    fontWeight: "600",
                  }}
                >
                  Password
                </label>

                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  required
                  minLength={6}
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                  style={{
                    width: "100%",
                    padding: "13px 14px",
                    boxSizing: "border-box",
                    borderRadius: "10px",
                    border: "1px solid #334155",
                    outline: "none",
                    background: "#0f172a",
                    color: "#ffffff",
                    fontSize: "15px",
                  }}
                />
              </div>

              {message && (
                <div
                  style={{
                    marginBottom: "18px",
                    padding: "12px 14px",
                    borderRadius: "10px",
                    background: message.includes("successful")
                      ? "rgba(34, 197, 94, 0.12)"
                      : "rgba(239, 68, 68, 0.12)",
                    border: `1px solid ${
                      message.includes("successful")
                        ? "rgba(34, 197, 94, 0.35)"
                        : "rgba(239, 68, 68, 0.35)"
                    }`,
                    color: message.includes("successful")
                      ? "#4ade80"
                      : "#f87171",
                    fontSize: "14px",
                  }}
                >
                  {message}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                style={{
                  width: "100%",
                  padding: "14px",
                  border: "none",
                  borderRadius: "10px",
                  cursor: loading ? "not-allowed" : "pointer",
                  background: loading ? "#475569" : "#2563eb",
                  color: "#ffffff",
                  fontSize: "15px",
                  fontWeight: "700",
                  opacity: loading ? 0.8 : 1,
                }}
              >
                {loading
                  ? "Please wait..."
                  : mode === "login"
                  ? "Login"
                  : "Create Account"}
              </button>
            </form>
          </>
        ) : (
          <form onSubmit={handleVerify2FA}>
            <div
              style={{
                textAlign: "center",
                marginBottom: "22px",
                color: "#94a3b8",
                fontSize: "14px",
                lineHeight: "1.6",
              }}
            >
              A 6-digit verification code has been sent to your registered
              email address.
            </div>

            <div style={{ marginBottom: "18px" }}>
              <label
                style={{
                  display: "block",
                  marginBottom: "7px",
                  color: "#e2e8f0",
                  fontSize: "14px",
                  fontWeight: "600",
                }}
              >
                Verification Code
              </label>

              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={otp}
                onChange={(e) =>
                  setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                placeholder="Enter 6-digit OTP"
                autoComplete="one-time-code"
                autoFocus
                required
                style={{
                  width: "100%",
                  padding: "15px",
                  boxSizing: "border-box",
                  borderRadius: "10px",
                  border: "1px solid #334155",
                  outline: "none",
                  background: "#0f172a",
                  color: "#ffffff",
                  fontSize: "22px",
                  textAlign: "center",
                  letterSpacing: "6px",
                }}
              />
            </div>

            {message && (
              <div
                style={{
                  marginBottom: "18px",
                  padding: "12px 14px",
                  borderRadius: "10px",
                  background: message.includes("successful")
                    ? "rgba(34, 197, 94, 0.12)"
                    : "rgba(59, 130, 246, 0.12)",
                  border: "1px solid rgba(59, 130, 246, 0.35)",
                  color: "#60a5fa",
                  fontSize: "14px",
                  textAlign: "center",
                }}
              >
                {message}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || otp.length !== 6}
              style={{
                width: "100%",
                padding: "14px",
                border: "none",
                borderRadius: "10px",
                cursor:
                  loading || otp.length !== 6 ? "not-allowed" : "pointer",
                background:
                  loading || otp.length !== 6 ? "#475569" : "#2563eb",
                color: "#ffffff",
                fontSize: "15px",
                fontWeight: "700",
              }}
            >
              {loading ? "Verifying..." : "Verify & Login"}
            </button>

            <button
              type="button"
              onClick={resetTwoFactor}
              disabled={loading}
              style={{
                width: "100%",
                marginTop: "10px",
                padding: "12px",
                border: "1px solid #334155",
                borderRadius: "10px",
                cursor: loading ? "not-allowed" : "pointer",
                background: "transparent",
                color: "#94a3b8",
                fontSize: "14px",
                fontWeight: "600",
              }}
            >
              Back to Login
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
