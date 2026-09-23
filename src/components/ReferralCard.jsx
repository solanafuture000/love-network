import { useEffect, useState } from "react";
import { api } from "../services/api";

function ReferralCard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [referralData, setReferralData] = useState(null);

  const loadReferrals = async () => {
    try {
      setLoading(true);
      setError("");

      const data = await api.getReferrals();

      if (!data?.success) {
        throw new Error(data?.message || "Unable to load referral data");
      }

      setReferralData(data);
    } catch (err) {
      console.error("REFERRAL DATA ERROR:", err);
      setError(err.message || "Unable to load referral data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReferrals();
  }, []);

  const referralCode = referralData?.referralCode || "";
  const referralLink =
    referralData?.referralLink ||
    `http://localhost:5174/register?ref=${encodeURIComponent(referralCode)}`;

  const totalReferrals = Number(referralData?.totalReferrals || 0);
  const totalRewards = Number(referralData?.totalRewards || 0);

  const referrals = Array.isArray(referralData?.referrals)
    ? referralData.referrals
    : [];

  const handleCopy = async () => {
    if (!referralCode) return;

    try {
      await navigator.clipboard.writeText(referralCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("COPY ERROR:", err);
    }
  };

  const handleInvite = async () => {
    if (!referralCode) return;

    const shareText = "Join LOVE Network and start earning LOVE!";

    if (navigator.share) {
      try {
        await navigator.share({
          title: "LOVE Network",
          text: `${shareText} My referral code: ${referralCode}`,
          url: referralLink,
        });
      } catch (err) {
        // User cancelled sharing.
      }

      return;
    }

    try {
      await navigator.clipboard.writeText(
        `${shareText}\nReferral Code: ${referralCode}\n${referralLink}`
      );

      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("INVITE COPY ERROR:", err);
    }
  };

  const getStatusText = (status, kycStatus) => {
    if (kycStatus === "APPROVED" || status === "ACTIVE") {
      return "Active";
    }

    return "Pending KYC";
  };

  if (loading) {
    return (
      <section className="settings-card" id="referral">
        <div className="section-heading">
          <div>
            <span>Community</span>
            <h3>Invite & Earn</h3>
            <p>Build your network and earn referral rewards.</p>
          </div>

          <div className="settings-icon">👥</div>
        </div>

        <div className="settings-list">
          <div className="settings-row">
            <div>
              <strong>Loading referrals...</strong>
              <small>Please wait.</small>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="settings-card" id="referral">
      <div className="section-heading">
        <div>
          <span>Community</span>
          <h3>Invite & Earn</h3>
          <p>Build your network and earn referral rewards.</p>
        </div>

        <div className="settings-icon">👥</div>
      </div>

      <div className="settings-list">

        <div className="settings-row">
          <div>
            <strong>Total Referrals</strong>
            <small>People who joined using your referral.</small>
          </div>

          <strong>{totalReferrals}</strong>
        </div>

        <div className="settings-row">
          <div>
            <strong>Referral Earnings</strong>
            <small>Total LOVE earned from referrals.</small>
          </div>

          <strong>{totalRewards} LOVE</strong>
        </div>

        <div className="settings-row">
          <div>
            <strong>Your Referral Code</strong>
            <small>{referralCode || "Unavailable"}</small>
          </div>

          <button
            type="button"
            onClick={handleCopy}
            disabled={!referralCode}
          >
            {copied ? "✓ Copied" : "Copy"}
          </button>
        </div>

        <div className="settings-row">
          <div>
            <strong>Invite Friends</strong>
            <small>Share your referral link and grow your network.</small>
          </div>

          <button
            type="button"
            onClick={handleInvite}
            disabled={!referralCode}
          >
            Invite
          </button>
        </div>

        {error && (
          <div
            style={{
              padding: "10px 0",
              color: "#ef4444",
              fontSize: "13px"
            }}
          >
            {error}
          </div>
        )}

        <div style={{ marginTop: "8px" }}>
          <div style={{ marginBottom: "12px" }}>
            <strong>My Referrals</strong>

            <small
              style={{
                display: "block",
                marginTop: "4px",
                opacity: 0.7
              }}
            >
              Users who joined through your referral.
            </small>
          </div>

          {referrals.length === 0 ? (
            <div
              style={{
                padding: "14px",
                borderRadius: "12px",
                background: "rgba(255,255,255,0.04)",
                fontSize: "13px",
                opacity: 0.75
              }}
            >
              No referrals yet.
            </div>
          ) : (
            <div style={{ display: "grid", gap: "10px" }}>
              {referrals.map((referral) => (
                <div
                  key={referral.id}
                  style={{
                    padding: "14px",
                    borderRadius: "12px",
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.06)"
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: "12px",
                      alignItems: "center"
                    }}
                  >
                    <div>
                      <strong>
                        {referral.username || "Unknown User"}
                      </strong>

                      <small
                        style={{
                          display: "block",
                          marginTop: "4px",
                          opacity: 0.65
                        }}
                      >
                        {referral.email || ""}
                      </small>
                    </div>

                    <span
                      style={{
                        fontSize: "11px",
                        padding: "5px 9px",
                        borderRadius: "20px",
                        background:
                          referral.status === "ACTIVE" ||
                          referral.kyc_status === "APPROVED"
                            ? "rgba(34,197,94,0.15)"
                            : "rgba(234,179,8,0.15)"
                      }}
                    >
                      {getStatusText(
                        referral.status,
                        referral.kyc_status
                      )}
                    </span>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginTop: "10px",
                      fontSize: "12px",
                      opacity: 0.75
                    }}
                  >
                    <span>
                      Reward Rate:{" "}
                      {Number(referral.reward_rate || 0) * 100}%
                    </span>

                    <span>
                      Earned:{" "}
                      {Number(referral.total_reward || 0)} LOVE
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </section>
  );
}

export default ReferralCard;
