import { useEffect, useState } from "react";
import { api } from "../services/api";

function MigrationCard() {
  const [migration, setMigration] = useState(null);
  const [destinationAddress, setDestinationAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(true);
  const [migrating, setMigrating] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(null);

  const loadMigration = async () => {
    try {
      setLoading(true);
      setError("");

      const data = await api.getMigrationStatus();

      if (data.success) {
        setMigration(data.migration);
      }
    } catch (err) {
      console.error("MIGRATION STATUS ERROR:", err);
      setError(err.message || "Unable to load migration status.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMigration();
  }, []);

  const handleMigration = async (event) => {
    event.preventDefault();

    if (!destinationAddress.trim()) {
      setError("Please enter a LOVE wallet address.");
      return;
    }

    const migrationAmount = Number(amount);

    if (!Number.isFinite(migrationAmount) || migrationAmount <= 0) {
      setError("Please enter a valid migration amount.");
      return;
    }

    if (migrationAmount > availableBalance) {
      setError("Migration amount exceeds available balance.");
      return;
    }

    try {
      setMigrating(true);
      setError("");
      setSuccess(null);

      const data = await api.migrateMiningBalance(
        destinationAddress.trim(),
        migrationAmount
      );

      if (data.success) {
        setSuccess(data.migration);
        setDestinationAddress("");
        setAmount("");
        await loadMigration();
      }
    } catch (err) {
      console.error("MIGRATION ERROR:", err);
      setError(err.message || "Migration failed.");
    } finally {
      setMigrating(false);
    }
  };

  const kycApproved =
    migration?.kyc_status === "APPROVED";

  const availableBalance =
    Number(migration?.available_balance || 0);

  if (loading) {
    return (
      <section className="migration-card">
        <div className="migration-header">
          <div>
            <span>Migration</span>
            <h3>LOVE Balance Migration</h3>
          </div>
        </div>

        <div className="migration-loading">
          Loading migration status...
        </div>
      </section>
    );
  }

  return (
    <section className="migration-card">
      <div className="migration-header">
        <div>
          <span>Migration</span>
          <h3>LOVE Balance Migration</h3>
          <p>
            Move your mined LOVE balance to your LOVE wallet
            after KYC approval.
          </p>
        </div>

        <div className="migration-icon">↗</div>
      </div>

      <div className="migration-status-row">
        <div>
          <small>KYC Status</small>
          <strong>
            {migration?.kyc_status || "NOT_ELIGIBLE"}
          </strong>
        </div>

        <div>
          <small>Migratable Balance</small>
          <strong>
            {availableBalance.toFixed(6)} LOVE
          </strong>
        </div>
      </div>

      {error && (
        <div className="migration-error">
          {error}
        </div>
      )}

      {success && (
        <div className="migration-success">
          <strong>✓ Migration Successful</strong>

          <div>
            Amount:{" "}
            {Number(success.amount || 0).toFixed(6)} LOVE
          </div>

          <div>
            Destination: {success.destinationAddress}
          </div>

          <div>
            Reference: {success.transferReference}
          </div>
        </div>
      )}

      {!kycApproved && (
        <div className="migration-locked">
          <div className="migration-lock-icon">🔒</div>

          <strong>Migration Locked</strong>

          <p>
            Migration becomes available after your KYC
            verification is approved.
          </p>
        </div>
      )}

      {kycApproved && availableBalance <= 0 && !success && (
        <div className="migration-info">
          No mined LOVE balance is currently available
          for migration.
        </div>
      )}

      {kycApproved && availableBalance > 0 && (
        <form
          className="migration-form"
          onSubmit={handleMigration}
        >
          <label>
            Destination LOVE Wallet Address

            <input
              type="text"
              value={destinationAddress}
              onChange={(event) =>
                setDestinationAddress(event.target.value)
              }
              placeholder="LOVE........................................"
              autoComplete="off"
              spellCheck="false"
              required
            />
          </label>

          <label>
            Amount to migrate

            <input
              type="number"
              value={amount}
              onChange={(event) =>
                setAmount(event.target.value)
              }
              min="0.000001"
              max={availableBalance}
              step="0.000001"
              placeholder="Enter amount"
              inputMode="decimal"
              required
            />
          </label>

          <div className="migration-amount">
            <span>Available to migrate</span>
            <strong>
              {availableBalance.toFixed(6)} LOVE
            </strong>
          </div>

          <button
            type="submit"
            disabled={migrating}
          >
            {migrating
              ? "Migrating..."
              : `Migrate ${availableBalance.toFixed(6)} LOVE`}
          </button>

          <small className="migration-note">
            You can migrate any amount up to your available migration balance.
          </small>
        </form>
      )}

      {migration?.last_migration && (
        <div className="migration-history">
          <small>Last Migration</small>

          <div>
            {Number(
              migration.last_migration.amount || 0
            ).toFixed(6)}{" "}
            LOVE
          </div>

          <span>
            {migration.last_migration.transfer_reference}
          </span>
        </div>
      )}
    </section>
  );
}

export default MigrationCard;