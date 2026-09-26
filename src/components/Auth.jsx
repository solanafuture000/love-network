import React, { useState } from "react";
import PhoneInput, { getCountryCallingCode } from "react-phone-number-input";
import "react-phone-number-input/style.css";

const API_URL = "https://love-network.onrender.com";

export default function Auth() {
  const [mode, setMode] = useState("login");
  const [loginMethod, setLoginMethod] = useState("email");

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [mobileCountry, setMobileCountry] = useState("PK");
  const [password, setPassword] = useState("");
  const [referralCode, setReferralCode] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [showConfirmResetPassword, setShowConfirmResetPassword] =
    useState(false);

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
    const loginBody = {
      password,
    };

    if (loginMethod === "mobile") {
      if (!mobile) {
        throw new Error("Please enter your mobile number.");
      }

      loginBody.mobile = mobile;
    } else {
      if (!email.trim()) {
        throw new Error("Please enter your email address.");
      }

      loginBody.email = email.trim();
    }

    const response = await fetch(`${API_URL}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(loginBody),
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
      setMobile("");
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
        if (!mobile) {
          throw new Error("Please select your country and enter your mobile number.");
        }

        const response = await fetch(`${API_URL}/api/auth/register`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            username: username.trim(),
            email: email.trim(),
            password,
            mobile,
            countryCode: mobileCountry ? `+${getCountryCallingCode(mobileCountry)}` : "",
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
        setMobile("");
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

  const inputStyle = {
    width: "100%",
    boxSizing: "border-box",
    padding: "14px 15px",
    borderRadius: "12px",
    border: "1px solid rgba(148, 163, 184, 0.18)",
    outline: "none",
    background: "rgba(15, 23, 42, 0.82)",
    color: "#ffffff",
    fontSize: "14px",
    transition: "all 0.2s ease",
  };

  const labelStyle = {
    display: "block",
    marginBottom: "8px",
    color: "#cbd5e1",
    fontSize: "13px",
    fontWeight: "600",
  };

  const primaryButtonStyle = {
    width: "100%",
    padding: "14px",
    border: "none",
    borderRadius: "12px",
    cursor: loading ? "not-allowed" : "pointer",
    background: loading
      ? "linear-gradient(135deg, #475569, #334155)"
      : "linear-gradient(135deg, #2563eb, #7c3aed)",
    color: "#ffffff",
    fontSize: "14px",
    fontWeight: "700",
    boxShadow: loading
      ? "none"
      : "0 10px 30px rgba(59, 130, 246, 0.22)",
    opacity: loading ? 0.75 : 1,
    transition: "all 0.2s ease",
  };

  const secondaryButtonStyle = {
    width: "100%",
    marginTop: "10px",
    padding: "12px",
    border: "1px solid rgba(148, 163, 184, 0.18)",
    borderRadius: "12px",
    cursor: loading ? "not-allowed" : "pointer",
    background: "rgba(15, 23, 42, 0.45)",
    color: "#94a3b8",
    fontSize: "13px",
    fontWeight: "600",
  };

  const messageIsSuccess =
    message.toLowerCase().includes("successful") ||
    message.toLowerCase().includes("verified");

  const renderMessage = () => {
    if (!message) return null;

    return (
      <div
        style={{
          marginBottom: "18px",
          padding: "12px 14px",
          borderRadius: "12px",
          background: messageIsSuccess
            ? "rgba(34, 197, 94, 0.10)"
            : "rgba(59, 130, 246, 0.10)",
          border: messageIsSuccess
            ? "1px solid rgba(34, 197, 94, 0.25)"
            : "1px solid rgba(96, 165, 250, 0.22)",
          color: messageIsSuccess ? "#4ade80" : "#93c5fd",
          fontSize: "13px",
          lineHeight: "1.5",
          textAlign: "center",
        }}
      >
        {message}
      </div>
    );
  };

  const renderOtpInput = () => (
    <input
      type="text"
      inputMode="numeric"
      maxLength={6}
      value={otp}
      onChange={(e) =>
        setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))
      }
      placeholder="000000"
      autoComplete="one-time-code"
      autoFocus
      required
      style={{
        ...inputStyle,
        padding: "16px",
        fontSize: "25px",
        textAlign: "center",
        letterSpacing: "9px",
        fontWeight: "700",
      }}
    />
  );

  const phoneInputStyle = {
    "--PhoneInput-color--focus": "#60a5fa",
    "--PhoneInputCountrySelect-marginRight": "8px",
  };

  return (
    <>
      <style>{`
        * {
          box-sizing: border-box;
        }

        .love-auth-input:focus {
          border-color: rgba(96, 165, 250, 0.75) !important;
          box-shadow:
            0 0 0 3px rgba(59, 130, 246, 0.10),
            0 0 22px rgba(59, 130, 246, 0.08);
        }

        .love-primary-btn:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 14px 35px rgba(59, 130, 246, 0.30) !important;
        }

        .love-tab:hover {
          color: #ffffff !important;
        }

        .love-link:hover {
          color: #93c5fd !important;
        }

        .love-login-method {
          display: flex;
          gap: 6px;
          padding: 4px;
          margin-bottom: 17px;
          border-radius: 11px;
          background: rgba(2, 6, 23, 0.55);
          border: 1px solid rgba(148, 163, 184, 0.08);
        }

        .love-login-method button {
          flex: 1;
          padding: 9px 10px;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          font-size: 12px;
          font-weight: 700;
          transition: all 0.2s ease;
        }

        .love-phone-wrapper {
          width: 100%;
          min-height: 48px;
          display: flex;
          align-items: center;
          padding: 0 12px;
          border-radius: 12px;
          border: 1px solid rgba(148, 163, 184, 0.18);
          background: rgba(15, 23, 42, 0.82);
          transition: all 0.2s ease;
        }

        .love-phone-wrapper:focus-within {
          border-color: rgba(96, 165, 250, 0.75);
          box-shadow:
            0 0 0 3px rgba(59, 130, 246, 0.10),
            0 0 22px rgba(59, 130, 246, 0.08);
        }

        .love-phone-wrapper .PhoneInput {
          width: 100%;
          display: flex;
          align-items: center;
        }

        .love-phone-wrapper .PhoneInputCountry {
          margin-right: 10px;
        }

        .love-phone-wrapper .PhoneInputCountrySelect {
          color: #ffffff;
          background: #0f172a;
        }

        .love-phone-wrapper .PhoneInputCountrySelectArrow {
          color: #94a3b8;
          opacity: 1;
        }

        .love-phone-wrapper .PhoneInputInput {
          width: 100%;
          min-width: 0;
          border: none;
          outline: none;
          background: transparent;
          color: #ffffff;
          font-size: 14px;
          padding: 13px 4px;
        }

        .love-phone-wrapper .PhoneInputInput::placeholder {
          color: #64748b;
        }

        .love-phone-wrapper .PhoneInputInput:focus {
          outline: none;
          box-shadow: none;
        }

        .love-phone-wrapper .PhoneInputCountryIcon {
          width: 24px;
          height: 18px;
        }

        .love-phone-wrapper .PhoneInputCountryIconImg {
          display: block;
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .love-phone-hint {
          margin-top: 7px;
          color: #64748b;
          font-size: 10px;
          line-height: 1.4;
        }

        @keyframes loveFloat {
          0%, 100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-10px);
          }
        }

        @keyframes lovePulse {
          0%, 100% {
            opacity: 0.45;
            transform: scale(1);
          }
          50% {
            opacity: 0.75;
            transform: scale(1.08);
          }
        }

        @media (max-width: 520px) {
          .love-auth-wrapper {
            padding: 14px !important;
          }

          .love-auth-card {
            padding: 24px 18px !important;
            border-radius: 22px !important;
          }

          .love-brand-title {
            font-size: 29px !important;
          }
        }
      `}</style>

      <div
        className="love-auth-wrapper"
        style={{
          minHeight: "100vh",
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          overflow: "hidden",
          padding: "24px",
          background:
            "radial-gradient(circle at 15% 20%, rgba(37,99,235,0.16), transparent 32%), radial-gradient(circle at 85% 80%, rgba(124,58,237,0.16), transparent 32%), linear-gradient(145deg, #020617 0%, #071226 48%, #030712 100%)",
        }}
      >
        <div
          style={{
            position: "absolute",
            width: "280px",
            height: "280px",
            borderRadius: "50%",
            background: "rgba(37, 99, 235, 0.12)",
            filter: "blur(70px)",
            top: "-100px",
            left: "-80px",
            animation: "lovePulse 6s ease-in-out infinite",
          }}
        />

        <div
          style={{
            position: "absolute",
            width: "300px",
            height: "300px",
            borderRadius: "50%",
            background: "rgba(124, 58, 237, 0.12)",
            filter: "blur(80px)",
            bottom: "-120px",
            right: "-80px",
            animation: "lovePulse 7s ease-in-out infinite",
          }}
        />

        <div
          className="love-auth-card"
          style={{
            width: "100%",
            maxWidth: "455px",
            position: "relative",
            zIndex: 2,
            padding: "34px",
            borderRadius: "26px",
            background: "rgba(7, 15, 31, 0.88)",
            border: "1px solid rgba(148, 163, 184, 0.13)",
            boxShadow:
              "0 30px 90px rgba(0, 0, 0, 0.58), inset 0 1px 0 rgba(255,255,255,0.04)",
            backdropFilter: "blur(22px)",
          }}
        >
          <div
            style={{
              textAlign: "center",
              marginBottom: "28px",
            }}
          >
            <div
              style={{
                width: "70px",
                height: "70px",
                margin: "0 auto 15px",
                borderRadius: "22px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background:
                  "linear-gradient(135deg, rgba(37,99,235,0.95), rgba(124,58,237,0.95))",
                boxShadow:
                  "0 15px 40px rgba(59,130,246,0.28), inset 0 1px 0 rgba(255,255,255,0.25)",
                animation: "loveFloat 5s ease-in-out infinite",
              }}
            >
              <span
                style={{
                  color: "#ffffff",
                  fontSize: "30px",
                  fontWeight: "900",
                  letterSpacing: "-2px",
                }}
              >
                L
              </span>
            </div>

            <h1
              className="love-brand-title"
              style={{
                margin: 0,
                color: "#ffffff",
                fontSize: "34px",
                lineHeight: "1.1",
                fontWeight: "800",
                letterSpacing: "-1px",
              }}
            >
              LOVE <span style={{ color: "#60a5fa" }}>Network</span>
            </h1>

            <p
              style={{
                margin: "9px 0 0",
                color: "#64748b",
                fontSize: "12px",
                letterSpacing: "1.5px",
                textTransform: "uppercase",
                fontWeight: "600",
              }}
            >
              Community • Mining • Rewards
            </p>
          </div>

          {forgotPasswordOtpStep ? (
            <form onSubmit={handleVerifyForgotPassword}>
              <div style={{ textAlign: "center", marginBottom: "22px" }}>
                <div style={{ fontSize: "38px", marginBottom: "12px" }}>
                  🔐
                </div>

                <h2
                  style={{
                    margin: "0 0 8px",
                    color: "#ffffff",
                    fontSize: "22px",
                  }}
                >
                  Reset Password
                </h2>

                <p
                  style={{
                    margin: 0,
                    color: "#94a3b8",
                    fontSize: "13px",
                    lineHeight: "1.6",
                  }}
                >
                  Enter the verification code sent to
                  <br />
                  <strong style={{ color: "#e2e8f0" }}>{email}</strong>
                </p>
              </div>

              <div style={{ marginBottom: "14px" }}>
                {renderOtpInput()}
              </div>

              <div style={{ marginBottom: "12px" }}>
                <input
                  className="love-auth-input"
                  type={showResetPassword ? "text" : "password"}
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                  placeholder="New password (min 8 characters)"
                  autoComplete="new-password"
                  minLength={8}
                  required
                  style={inputStyle}
                />
              </div>

              <div style={{ marginBottom: "18px" }}>
                <input
                  className="love-auth-input"
                  type={showConfirmResetPassword ? "text" : "password"}
                  value={confirmResetPassword}
                  onChange={(e) =>
                    setConfirmResetPassword(e.target.value)
                  }
                  placeholder="Confirm new password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                  style={inputStyle}
                />
              </div>

              <div
                style={{
                  display: "flex",
                  gap: "8px",
                  marginBottom: "18px",
                }}
              >
                <button
                  type="button"
                  onClick={() =>
                    setShowResetPassword(!showResetPassword)
                  }
                  style={{
                    flex: 1,
                    padding: "8px",
                    border: "1px solid rgba(148,163,184,0.15)",
                    borderRadius: "9px",
                    background: "rgba(15,23,42,0.5)",
                    color: "#94a3b8",
                    fontSize: "11px",
                    cursor: "pointer",
                  }}
                >
                  {showResetPassword
                    ? "Hide New Password"
                    : "Show New Password"}
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setShowConfirmResetPassword(
                      !showConfirmResetPassword
                    )
                  }
                  style={{
                    flex: 1,
                    padding: "8px",
                    border: "1px solid rgba(148,163,184,0.15)",
                    borderRadius: "9px",
                    background: "rgba(15,23,42,0.5)",
                    color: "#94a3b8",
                    fontSize: "11px",
                    cursor: "pointer",
                  }}
                >
                  {showConfirmResetPassword
                    ? "Hide Confirm"
                    : "Show Confirm"}
                </button>
              </div>

              {renderMessage()}

              <button
                className="love-primary-btn"
                type="submit"
                disabled={loading}
                style={primaryButtonStyle}
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
                style={secondaryButtonStyle}
              >
                Back
              </button>
            </form>
          ) : forgotPasswordStep ? (
            <form onSubmit={handleForgotPassword}>
              <div style={{ textAlign: "center", marginBottom: "24px" }}>
                <div style={{ fontSize: "40px", marginBottom: "12px" }}>
                  🔑
                </div>

                <h2
                  style={{
                    margin: "0 0 8px",
                    color: "#ffffff",
                    fontSize: "22px",
                  }}
                >
                  Forgot Password?
                </h2>

                <p
                  style={{
                    margin: 0,
                    color: "#94a3b8",
                    fontSize: "13px",
                    lineHeight: "1.6",
                  }}
                >
                  Enter your registered email and we'll send you
                  <br />
                  a secure verification code.
                </p>
              </div>

              <div style={{ marginBottom: "18px" }}>
                <label style={labelStyle}>Email Address</label>
                <input
                  className="love-auth-input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                  style={inputStyle}
                />
              </div>

              {renderMessage()}

              <button
                className="love-primary-btn"
                type="submit"
                disabled={loading}
                style={primaryButtonStyle}
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
                style={secondaryButtonStyle}
              >
                ← Back to Login
              </button>
            </form>
          ) : registrationOtpStep ? (
            <form onSubmit={handleVerifyRegistrationOtp}>
              <div style={{ textAlign: "center", marginBottom: "24px" }}>
                <div style={{ fontSize: "40px", marginBottom: "12px" }}>
                  ✉️
                </div>

                <h2
                  style={{
                    margin: "0 0 8px",
                    color: "#ffffff",
                    fontSize: "22px",
                  }}
                >
                  Verify Your Email
                </h2>

                <p
                  style={{
                    margin: 0,
                    color: "#94a3b8",
                    fontSize: "13px",
                    lineHeight: "1.6",
                  }}
                >
                  We sent a 6-digit verification code to
                  <br />
                  <strong style={{ color: "#e2e8f0" }}>{email}</strong>
                </p>
              </div>

              <div style={{ marginBottom: "18px" }}>
                {renderOtpInput()}
              </div>

              {renderMessage()}

              <button
                className="love-primary-btn"
                type="submit"
                disabled={loading}
                style={primaryButtonStyle}
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
                style={secondaryButtonStyle}
              >
                ← Back to Register
              </button>
            </form>
          ) : !twoFactorStep ? (
            <>
              <div
                style={{
                  display: "flex",
                  gap: "5px",
                  marginBottom: "25px",
                  padding: "5px",
                  borderRadius: "13px",
                  background: "rgba(2, 6, 23, 0.65)",
                  border: "1px solid rgba(148, 163, 184, 0.08)",
                }}
              >
                <button
                  className="love-tab"
                  type="button"
                  onClick={() => {
                    setMode("login");
                    setMessage("");
                  }}
                  style={{
                    flex: 1,
                    padding: "11px",
                    border: "none",
                    borderRadius: "9px",
                    cursor: "pointer",
                    background:
                      mode === "login"
                        ? "linear-gradient(135deg, #2563eb, #4f46e5)"
                        : "transparent",
                    color: mode === "login" ? "#ffffff" : "#64748b",
                    fontWeight: "700",
                    fontSize: "13px",
                    boxShadow:
                      mode === "login"
                        ? "0 7px 20px rgba(37,99,235,0.20)"
                        : "none",
                  }}
                >
                  Sign In
                </button>

                <button
                  className="love-tab"
                  type="button"
                  onClick={() => {
                    setMode("register");
                    setMessage("");
                  }}
                  style={{
                    flex: 1,
                    padding: "11px",
                    border: "none",
                    borderRadius: "9px",
                    cursor: "pointer",
                    background:
                      mode === "register"
                        ? "linear-gradient(135deg, #2563eb, #4f46e5)"
                        : "transparent",
                    color:
                      mode === "register" ? "#ffffff" : "#64748b",
                    fontWeight: "700",
                    fontSize: "13px",
                    boxShadow:
                      mode === "register"
                        ? "0 7px 20px rgba(37,99,235,0.20)"
                        : "none",
                  }}
                >
                  Create Account
                </button>
              </div>

              <form onSubmit={handleSubmit}>
                {mode === "register" && (
                  <div style={{ marginBottom: "17px" }}>
                    <label style={labelStyle}>Username</label>

                    <input
                      className="love-auth-input"
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="Enter your username"
                      required
                      autoComplete="username"
                      style={inputStyle}
                    />
                  </div>
                )}

                {mode === "login" && (
                  <div className="love-login-method">
                    <button
                      type="button"
                      onClick={() => {
                        setLoginMethod("email");
                        setMessage("");
                      }}
                      style={{
                        background:
                          loginMethod === "email"
                            ? "linear-gradient(135deg, #2563eb, #4f46e5)"
                            : "transparent",
                        color:
                          loginMethod === "email"
                            ? "#ffffff"
                            : "#64748b",
                      }}
                    >
                      ✉ Email Login
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setLoginMethod("mobile");
                        setMessage("");
                      }}
                      style={{
                        background:
                          loginMethod === "mobile"
                            ? "linear-gradient(135deg, #2563eb, #4f46e5)"
                            : "transparent",
                        color:
                          loginMethod === "mobile"
                            ? "#ffffff"
                            : "#64748b",
                      }}
                    >
                      📱 Mobile Login
                    </button>
                  </div>
                )}

                {mode === "register" && (
                  <div style={{ marginBottom: "17px" }}>
                    <label style={labelStyle}>Mobile Number</label>

                    <div
                      className="love-phone-wrapper"
                      style={phoneInputStyle}
                    >
                      <PhoneInput
                        international
                        defaultCountry="PK"
                        countryCallingCodeEditable={false}
                        value={mobile}
                        onChange={setMobile}
                        onCountryChange={(country) => setMobileCountry(country || "PK")}
                        placeholder="300 1234567"
                      />
                    </div>

                    <div className="love-phone-hint">
                      Select your country flag and enter your mobile number.
                    </div>
                  </div>
                )}

                {mode === "login" && loginMethod === "email" && (
                  <div style={{ marginBottom: "17px" }}>
                    <label style={labelStyle}>Email Address</label>

                    <input
                      className="love-auth-input"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      required
                      autoComplete="email"
                      style={inputStyle}
                    />
                  </div>
                )}

                {mode === "login" && loginMethod === "mobile" && (
                  <div style={{ marginBottom: "17px" }}>
                    <label style={labelStyle}>Mobile Number</label>

                    <div
                      className="love-phone-wrapper"
                      style={phoneInputStyle}
                    >
                      <PhoneInput
                        international
                        defaultCountry="PK"
                        countryCallingCodeEditable={false}
                        value={mobile}
                        onChange={setMobile}
                        onCountryChange={(country) => setMobileCountry(country || "PK")}
                        placeholder="300 1234567"
                      />
                    </div>

                    <div className="love-phone-hint">
                      Select your country flag and enter your registered number.
                    </div>
                  </div>
                )}

                {mode === "register" && (
                  <div style={{ marginBottom: "17px" }}>
                    <label style={labelStyle}>Email Address</label>

                    <input
                      className="love-auth-input"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      required
                      autoComplete="email"
                      style={inputStyle}
                    />
                  </div>
                )}

                {mode === "register" && (
                  <div style={{ marginBottom: "17px" }}>
                    <label style={labelStyle}>
                      Referral Code{" "}
                      <span
                        style={{
                          color: "#64748b",
                          fontWeight: "400",
                        }}
                      >
                        (Optional)
                      </span>
                    </label>

                    <input
                      className="love-auth-input"
                      type="text"
                      value={referralCode}
                      onChange={(e) =>
                        setReferralCode(e.target.value.toUpperCase())
                      }
                      placeholder="Enter referral code"
                      autoComplete="off"
                      style={inputStyle}
                    />
                  </div>
                )}

                <div style={{ marginBottom: "10px" }}>
                  <label style={labelStyle}>Password</label>

                  <div style={{ position: "relative" }}>
                    <input
                      className="love-auth-input"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      required
                      minLength={6}
                      autoComplete={
                        mode === "login"
                          ? "current-password"
                          : "new-password"
                      }
                      style={{
                        ...inputStyle,
                        paddingRight: "78px",
                      }}
                    />

                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      style={{
                        position: "absolute",
                        top: "50%",
                        right: "9px",
                        transform: "translateY(-50%)",
                        border: "none",
                        borderRadius: "8px",
                        background: "rgba(51, 65, 85, 0.55)",
                        color: "#94a3b8",
                        padding: "7px 9px",
                        fontSize: "11px",
                        fontWeight: "600",
                        cursor: "pointer",
                      }}
                    >
                      {showPassword ? "Hide" : "Show"}
                    </button>
                  </div>
                </div>

                {mode === "login" && (
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "flex-end",
                      marginBottom: "19px",
                    }}
                  >
                    <button
                      className="love-link"
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
                        fontSize: "12px",
                        fontWeight: "600",
                        padding: "4px 0",
                      }}
                    >
                      Forgot Password?
                    </button>
                  </div>
                )}

                {mode === "register" && (
                  <div
                    style={{
                      marginBottom: "19px",
                      padding: "10px 12px",
                      borderRadius: "10px",
                      background: "rgba(37,99,235,0.06)",
                      border:
                        "1px solid rgba(96,165,250,0.10)",
                      color: "#64748b",
                      fontSize: "11px",
                      lineHeight: "1.5",
                    }}
                  >
                    By creating an account, you agree to use LOVE
                    Network responsibly.
                  </div>
                )}

                {renderMessage()}

                <button
                  className="love-primary-btn"
                  type="submit"
                  disabled={loading}
                  style={primaryButtonStyle}
                >
                  {loading
                    ? "Please wait..."
                    : mode === "login"
                    ? "Sign In to LOVE Network"
                    : "Create LOVE Network Account"}
                </button>
              </form>

              <div
                style={{
                  marginTop: "24px",
                  paddingTop: "18px",
                  borderTop:
                    "1px solid rgba(148, 163, 184, 0.08)",
                  textAlign: "center",
                }}
              >
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "7px",
                    color: "#64748b",
                    fontSize: "11px",
                  }}
                >
                  <span
                    style={{
                      width: "6px",
                      height: "6px",
                      borderRadius: "50%",
                      background: "#22c55e",
                      boxShadow: "0 0 10px rgba(34,197,94,0.7)",
                    }}
                  />
                  LOVE Network secure access
                </div>
              </div>
            </>
          ) : (
            <form onSubmit={handleVerify2FA}>
              <div style={{ textAlign: "center", marginBottom: "25px" }}>
                <div
                  style={{
                    width: "64px",
                    height: "64px",
                    margin: "0 auto 14px",
                    borderRadius: "20px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background:
                      "linear-gradient(135deg, rgba(37,99,235,0.18), rgba(124,58,237,0.18))",
                    border:
                      "1px solid rgba(96,165,250,0.18)",
                    fontSize: "28px",
                  }}
                >
                  🛡️
                </div>

                <h2
                  style={{
                    margin: "0 0 9px",
                    color: "#ffffff",
                    fontSize: "22px",
                  }}
                >
                  Security Verification
                </h2>

                <p
                  style={{
                    margin: 0,
                    color: "#94a3b8",
                    fontSize: "13px",
                    lineHeight: "1.6",
                  }}
                >
                  A 6-digit verification code has been sent to
                  <br />
                  your registered email address.
                </p>
              </div>

              <div style={{ marginBottom: "19px" }}>
                {renderOtpInput()}
              </div>

              {renderMessage()}

              <button
                className="love-primary-btn"
                type="submit"
                disabled={loading || otp.length !== 6}
                style={{
                  ...primaryButtonStyle,
                  background:
                    loading || otp.length !== 6
                      ? "linear-gradient(135deg, #334155, #475569)"
                      : "linear-gradient(135deg, #2563eb, #7c3aed)",
                }}
              >
                {loading ? "Verifying..." : "Verify & Login"}
              </button>

              <button
                type="button"
                onClick={resetTwoFactor}
                disabled={loading}
                style={secondaryButtonStyle}
              >
                ← Back to Login
              </button>
            </form>
          )}
        </div>
      </div>
    </>
  );
}




