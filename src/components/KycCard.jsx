import { useEffect, useState } from "react";
import { api } from "../services/api";

function KycCard() {
  const [kyc, setKyc] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const loadKyc = async () => {
    try {
      setLoading(true);
      setError("");

      const data = await api.getKycStatus();

      if (data.success) {
        setKyc(data.kyc);
      }
    } catch (err) {
      console.error("KYC STATUS ERROR:", err);
      setError(err.message || "Unable to load KYC status.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadKyc();
  }, []);

  const handleStart = () => {
    setError("");
    setShowForm(true);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    try {
      setSubmitting(true);
      setError("");

      const data = await api.submitKyc();

      if (data.success) {
        setShowForm(false);
        await loadKyc();
      }
    } catch (err) {
      console.error("KYC SUBMIT ERROR:", err);
      setError(err.message || "Unable to submit KYC.");
    } finally {
      setSubmitting(false);
    }
  };

  const status = kyc?.status || "LOADING";

  const statusLabel = {
    NOT_ELIGIBLE: "Not Eligible",
    ELIGIBLE: "Eligible",
    PENDING: "Submitted for Review",
    APPROVED: "Approved"
  };

  return (
    <section className="kyc-card">
      <div className="kyc-header">
        <div>
          <span>Security</span>
          <h3>Identity Verification</h3>
          <p>
            Complete KYC to unlock all account features.
          </p>
        </div>

        <div className="kyc-icon">
          ✓
        </div>
      </div>

      <div className="kyc-status-row">
        <div>
          <small>Verification Status</small>
          <strong>
            {loading ? "Loading..." : statusLabel[status] || status}
          </strong>
        </div>

        <div className="kyc-status">
          <span>
            {status === "APPROVED"
              ? "Approved"
              : status === "PENDING"
              ? "Review"
              : status === "ELIGIBLE"
              ? "Ready"
              : "Pending"}
          </span>
        </div>
      </div>

      {error && (
        <div className="kyc-error">
          {error}
        </div>
      )}

      {!loading && status === "NOT_ELIGIBLE" && (
        <div className="kyc-info">
          Complete {kyc.remaining_sessions} more mining sessions
          to become eligible for KYC.
        </div>
      )}

      {!loading && status === "ELIGIBLE" && !showForm && (
        <button type="button" onClick={handleStart}>
          Complete KYC
        </button>
      )}

      {!loading && status === "PENDING" && (
        <div className="kyc-success">
          ✓ Your verification has been submitted and is under review.
        </div>
      )}

      {!loading && status === "APPROVED" && (
        <div className="kyc-success">
          ✓ Your identity verification has been approved.
        </div>
      )}

      {showForm && status === "ELIGIBLE" && (
        <form className="kyc-form" onSubmit={handleSubmit}>
          <label>
            Full Name
            <input
              type="text"
              placeholder="Enter your full name"
              required
            />
          </label>

          <label>
            ID Number
            <input
              type="text"
              placeholder="Enter your ID number"
              required
            />
          </label>

          <label>
            Country
            <select defaultValue="" required>
              <option value="" disabled>
                Select country
              </option>
              <option value="PK">Pakistan</option>
              <option value="IN">India</option>
              <option value="BD">Bangladesh</option>
              <option value="AE">United Arab Emirates</option>
              <option value="other">Other</option>
            </select>
          </label>

          <div className="kyc-form-actions">
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setError("");
              }}
              disabled={submitting}
            >
              Cancel
            </button>

            <button type="submit" disabled={submitting}>
              {submitting ? "Submitting..." : "Submit Verification"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

export default KycCard;
