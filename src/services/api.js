const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

async function request(endpoint, options = {}) {
  const token = localStorage.getItem("love_token");

  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || `Request failed: ${response.status}`);
  }

  return data;
}

export const api = {
  register(data) {
    return request("/auth/register", {
      method: "POST",
      body: JSON.stringify(data)
    });
  },

  login(data) {
    return request("/auth/login", {
      method: "POST",
      body: JSON.stringify(data)
    });
  },

  forgotPassword(email) {
    return request("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email })
    });
  },

  verifyForgotPassword(challengeToken, otp, newPassword) {
    return request("/auth/forgot-password/verify", {
      method: "POST",
      body: JSON.stringify({
        challengeToken,
        otp,
        newPassword
      })
    });
  },

  getProfile() {
    return request("/user/profile");
  },

  updateProfile(data) {
    return request("/user/profile", {
      method: "PUT",
      body: JSON.stringify(data)
    });
  },

  changePassword(currentPassword, newPassword) {
    return request("/user/change-password", {
      method: "PUT",
      body: JSON.stringify({ currentPassword, newPassword })
    });
  },

  deleteAccount(currentPassword) {
    return request("/user/account", {
      method: "DELETE",
      body: JSON.stringify({ currentPassword })
    });
  },

  changeEmail(newEmail, currentPassword) {
    return request("/user/change-email", {
      method: "PUT",
      body: JSON.stringify({ newEmail, currentPassword })
    });
  },

  requestEmailChangeOtp(newEmail, currentPassword) {
    return request("/user/change-email/request", {
      method: "PUT",
      body: JSON.stringify({ newEmail, currentPassword })
    });
  },

  verifyEmailChangeOtp(newEmail, otp) {
    return request("/user/change-email/verify", {
      method: "PUT",
      body: JSON.stringify({ newEmail, otp })
    });
  },

  getMiningDashboard() {
    return request("/mining/dashboard");
  },

  getMiningStatus() {
    return request("/mining/status");
  },

  startMining() {
    return request("/mining/start", { method: "POST" });
  },

  stopMining() {
    return request("/mining/stop", { method: "POST" });
  },

  getMiningPool() {
    return request("/mining/pool");
  },

  getMiningHistory() {
    return request("/history/mining");
  },

  getTransactions() {
    return request("/history/transactions");
  },

  getReferrals() {
    return request("/user/referrals");
  },

  // KYC
  getKycStatus() {
    return request("/kyc/status");
  },

  submitKyc() {
    return request("/kyc/submit", {
      method: "POST"
    });
  },

  // Wallet
  getWallet() {
    return request("/wallet");
  },

  // 2FA
  get2FAStatus() {
    return request("/auth/otp/2fa/status");
  },

  send2FAOtp() {
    return request("/auth/otp/2fa/send", {
      method: "POST"
    });
  },

  verify2FAOtp(otp) {
    return request("/auth/otp/2fa/verify", {
      method: "POST",
      body: JSON.stringify({ otp })
    });
  }
};

