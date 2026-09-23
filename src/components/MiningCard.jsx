import { useEffect, useState } from "react";
import { api } from "../services/api";

const MINING_DURATION = 12 * 60 * 60 * 1000;

function MiningCard({ isMining, setIsMining }) {
  const [timeLeft, setTimeLeft] = useState(0);
  const [earned, setEarned] = useState(0);
  const [rate, setRate] = useState(0.25);
  const [loading, setLoading] = useState(false);

  const loadMiningStatus = async () => {
    try {
      const data = await api.getMiningDashboard();

      const active = Boolean(data.user?.miningActive);

      setIsMining(active);

      if (data.mining?.rewardPerHour !== undefined) {
        setRate(Number(data.mining.rewardPerHour));
      }

      if (
        active &&
        data.mining?.remainingSessionSeconds !== undefined
      ) {
        setTimeLeft(
          Number(data.mining.remainingSessionSeconds) * 1000
        );
      } else if (!active) {
        setTimeLeft(0);
      }

      if (
        data.session?.reward !== undefined &&
        data.session?.reward !== null
      ) {
        setEarned(Number(data.session.reward || 0));
      } else {
        setEarned(0);
      }
    } catch (error) {
      console.error("Mining dashboard status error:", error);
    }
  };

  useEffect(() => {
    loadMiningStatus();

    const syncTimer = setInterval(() => {
      loadMiningStatus();
    }, 10000);

    return () => clearInterval(syncTimer);
  }, []);

  useEffect(() => {
    if (!isMining) return;

    const countdownTimer = setInterval(() => {
      setTimeLeft((previous) => {
        if (previous <= 1000) {
          return 0;
        }

        return previous - 1000;
      });
    }, 1000);

    return () => clearInterval(countdownTimer);
  }, [isMining]);

  useEffect(() => {
    if (isMining && timeLeft === 0) {
      loadMiningStatus();
    }
  }, [timeLeft, isMining]);

  const handleStartMining = async () => {
    if (isMining || loading) return;

    try {
      setLoading(true);

      const data = await api.startMining();

      setIsMining(true);

      if (data.rewardPerHour !== undefined) {
        setRate(Number(data.rewardPerHour));
      }

      setTimeLeft(
        Number(data.maxSessionHours || 12) *
          60 *
          60 *
          1000
      );

      setEarned(0);
    } catch (error) {
      console.error("Start mining error:", error);
      alert(error.message || "Unable to start mining");
      await loadMiningStatus();
    } finally {
      setLoading(false);
    }
  };

  const totalSeconds = Math.floor(timeLeft / 1000);

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const formattedTime =
    String(hours).padStart(2, "0") +
    ":" +
    String(minutes).padStart(2, "0") +
    ":" +
    String(seconds).padStart(2, "0");

  const progress = isMining
    ? ((MINING_DURATION - timeLeft) / MINING_DURATION) * 100
    : 0;

  return (
    <section className="mining-card">
      <div className="mining-card-header">
        <div>
          <span>Mining Status</span>
          <h3>{isMining ? "Mining Active" : "Ready to Mine"}</h3>
        </div>

        <div
          className={
            isMining
              ? "mining-status-dot active"
              : "mining-status-dot inactive"
          }
        />
      </div>

      <div className="mining-rate">
        <span>Current Mining Rate</span>
        <strong>{rate.toFixed(2)} LOVE / hour</strong>
      </div>

      {isMining && (
        <div className="mining-countdown">
          <span>Time Remaining</span>
          <strong>{formattedTime}</strong>
        </div>
      )}

      <div className="mining-progress">
        <div
          className="mining-progress-bar"
          style={{
            width: `${Math.min(100, Math.max(0, progress))}%`,
          }}
        />
      </div>

      <div className="mining-info">
        <div>
          <small>Session</small>
          <strong>{isMining ? "12 Hours" : "Ready"}</strong>
        </div>

        <div>
          <small>Session Earned</small>
          <strong>{earned.toFixed(2)} LOVE</strong>
        </div>
      </div>

      <button
        type="button"
        onClick={handleStartMining}
        disabled={isMining || loading}
      >
        {loading
          ? "Starting..."
          : isMining
          ? "Mining in Progress"
          : "Start Mining"}
      </button>
    </section>
  );
}

export default MiningCard;
