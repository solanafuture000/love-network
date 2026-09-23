import { useEffect, useState } from "react";
import Header from "../components/Header";
import MiningCard from "../components/MiningCard";
import BalanceCard from "../components/BalanceCard";
import StatsCard from "../components/StatsCard";
import ReferralCard from "../components/ReferralCard";
import KycCard from "../components/KycCard";
import QuickActions from "../components/QuickActions";
import WalletCard from "../components/WalletCard";
import ProfileCard from "../components/ProfileCard";
import HistoryCard from "../components/HistoryCard";
import SettingsCard from "../components/SettingsCard";
import PrivacyCard from "../components/PrivacyCard";
import HelpSupportCard from "../components/HelpSupportCard";
import BottomNavigation from "../components/BottomNavigation";
import { api } from "../services/api";

export default function Dashboard() {
  const [isMining, setIsMining] = useState(false);
  const [balance, setBalance] = useState(0);
  const [todayEarned, setTodayEarned] = useState(0);
  const [weekEarned, setWeekEarned] = useState(0);
  const [monthEarned, setMonthEarned] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadDashboard = async () => {
    try {
      setError("");

      const data = await api.getMiningDashboard(); console.log("MINING DASHBOARD API:", data);

      if (data.user?.walletBalance !== undefined) {
        setBalance(Number(data.user.walletBalance));
      }

      setIsMining(Boolean(data.user?.miningActive));

      const statistics = data.statistics || {};

      setTodayEarned(
        Number(statistics.todayEarned || 0)
      );

      setWeekEarned(
        Number(statistics.weekEarned || 0)
      );

      setMonthEarned(
        Number(statistics.monthEarned || 0)
      );
    } catch (err) {
      console.error("Dashboard error:", err);
      setError(err.message || "Unable to load dashboard");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();

    const interval = setInterval(() => {
      loadDashboard();
    }, 10000);

    return () => clearInterval(interval);
  }, []);

  const handleMining = async (value) => {
    try {
      setError("");

      if (value) {
        const data = await api.startMining();

        setIsMining(true);

        if (data.wallet?.balance !== undefined) {
          setBalance(Number(data.wallet.balance));
        }

        setTodayEarned(0);
      } else {
        const data = await api.stopMining();

        setIsMining(false);

        if (data.wallet?.balance !== undefined) {
          setBalance(Number(data.wallet.balance));
        }
      }

      await loadDashboard();
    } catch (err) {
      console.error("Mining error:", err);

      if (err.message === "Mining is already active") {
        setIsMining(true);
        setError("");
      } else {
        setError(err.message || "Mining request failed");
      }

      await loadDashboard();
    }
  };

  const handleWalletBalance = (newBalance) => {
    const safeBalance = Number(newBalance);

    if (Number.isFinite(safeBalance)) {
      setBalance(safeBalance);
    }
  };

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#070b16",
          color: "#ffffff",
          fontSize: "16px",
        }}
      >
        Loading LOVE Network...
      </div>
    );
  }

  return (
    <div className="dashboard">
      <Header />

      {error && (
        <div
          style={{
            margin: "15px",
            padding: "12px 14px",
            borderRadius: "10px",
            background: "rgba(239, 68, 68, 0.12)",
            border: "1px solid rgba(239, 68, 68, 0.35)",
            color: "#f87171",
            fontSize: "14px",
          }}
        >
          {error}
        </div>
      )}

      <main className="dashboard-content">
        <BalanceCard
          isMining={isMining}
          balance={balance}
        />

        <div id="mining">
          <MiningCard
            isMining={isMining}
            setIsMining={setIsMining}
          />
        </div>

        <StatsCard
          todayEarned={todayEarned}
          weekEarned={weekEarned}
          monthEarned={monthEarned}
        />

        <div id="wallet">
          <WalletCard
            balance={balance}
            setBalance={handleWalletBalance}
          />
        </div>

        <div id="referral">
          <ReferralCard />
        </div>

        <div id="kyc">
          <KycCard />
        </div>

        <ProfileCard />

        <HistoryCard />

        <SettingsCard />

        <PrivacyCard />

        <HelpSupportCard />

        <QuickActions />
      </main>

      <BottomNavigation />
    </div>
  );
}












