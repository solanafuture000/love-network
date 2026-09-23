const express = require("express");
const cors = require("cors");
require("dotenv").config();

const db = require("./database");
const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/user");
const walletRoutes = require("./routes/wallet");
const miningRoutes = require("./routes/mining");
const historyRoutes = require("./routes/history");
const kycRoutes = require("./routes/kyc");
const adminRoutes = require("./routes/admin");
const otpRoutes = require("./routes/otp");

const app = express();
const PORT = process.env.PORT || 5000;

const allowedOrigins = (
  process.env.FRONTEND_URL ||
  "http://localhost:5173,http://localhost:5174"
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error("CORS origin not allowed"));
    }
  })
);
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/auth/otp", otpRoutes);
app.use("/api/user", userRoutes);
app.use("/api/wallet", walletRoutes);
app.use("/api/mining", miningRoutes);
app.use("/api/history", historyRoutes);
app.use("/api/kyc", kycRoutes);
app.use("/api/admin", adminRoutes);

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "LOVE Network Backend is running",
    database: "connected"
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`LOVE Network Backend running on http://localhost:${PORT}`);
});

