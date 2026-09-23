import { useEffect, useState } from "react";
import { api } from "../services/api";

function WalletCard({ balance, setBalance }) {
  const [copied, setCopied] = useState(false);
  const [action, setAction] = useState(null);
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState("");
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  const walletAddress = "LOVE7X9K2M8N4P6Q";

  const loadWallet = async () => {
    try {
      setLoading(true);

      const data = await api.getWallet();

      if (data.success && data.wallet) {
        setBalance(Number(data.wallet.balance || 0));
        setTransactions(data.transactions || []);
      }
    } catch (error) {
      console.error("WALLET API ERROR:", error);
      setMessage(error.message || "Failed to load wallet.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWallet();
  }, []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(walletAddress);
      setCopied(true);

      setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch {
      setCopied(false);
    }
  };

  const openAction = (type) => {
    setAction(type);
    setAmount("");
    setMessage("");
  };

  const closeAction = () => {
    setAction(null);
    setAmount("");
    setMessage("");
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    const value = Number(amount);

    if (!value || value <= 0) {
      setMessage("Enter a valid amount.");
      return;
    }

    if (action === "withdraw" && value > Number(balance)) {
      setMessage("Insufficient LOVE balance.");
      return;
    }

    setMessage(
      action === "deposit"
        ? "Deposit processing will be connected to the backend next."
        : "Withdraw processing will be connected to the backend next."
    );
  };

  return (
    <section className="settings-card" id="wallet">
      <div className="section-heading">
        <div>
          <span>Wallet</span>
          <h3>LOVE Wallet</h3>
          <p>
            Manage your LOVE balance and wallet transactions.
          </p>
        </div>

        <div className="settings-icon">
          ??
        </div>
      </div>

      <div className="settings-list">

        <div className="settings-row">
          <div>
            <strong>Available Balance</strong>
            <small>
              Your current LOVE wallet balance.
            </small>
          </div>

          <strong>
            {loading ? "Loading..." : `${Number(balance).toFixed(2)} LOVE`}
          </strong>
        </div>

        <div className="settings-row">
          <div>
            <strong>Wallet Address</strong>
            <small>{walletAddress}</small>
          </div>

          <button
            type="button"
            className="settings-action-button"
            onClick={handleCopy}
          >
            {copied ? "? Copied" : "Copy"}
          </button>
        </div>

        {!action && (
          <>
            <div className="settings-row">
              <div>
                <strong>Deposit LOVE</strong>
                <small>
                  Add LOVE to your wallet balance.
                </small>
              </div>

              <button
                type="button"
                className="settings-action-button"
                onClick={() => openAction("deposit")}
              >
                Deposit
              </button>
            </div>

            <div className="settings-row">
              <div>
                <strong>Withdraw LOVE</strong>
                <small>
                  Withdraw LOVE from your available balance.
                </small>
              </div>

              <button
                type="button"
                className="settings-action-button"
                onClick={() => openAction("withdraw")}
              >
                Withdraw
              </button>
            </div>
          </>
        )}

        {action && (
          <form
            className="settings-form"
            onSubmit={handleSubmit}
          >
            <label>
              {action === "deposit"
                ? "Deposit Amount"
                : "Withdraw Amount"}

              <input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(event) =>
                  setAmount(event.target.value)
                }
                placeholder="0.00 LOVE"
                required
              />
            </label>

            {message && (
              <div className="settings-message">
                {message}
              </div>
            )}

            <div className="settings-form-actions">
              <button
                type="button"
                onClick={closeAction}
              >
                Cancel
              </button>

              <button type="submit">
                {action === "deposit"
                  ? "Deposit LOVE"
                  : "Withdraw LOVE"}
              </button>
            </div>
          </form>
        )}

      </div>

      {!action && message && (
        <div className="settings-message">
          {message}
        </div>
      )}

      <div className="wallet-history">
        <div className="wallet-history-header">
          <div>
            <small>History</small>
            <h4>Recent Transactions</h4>
          </div>

          <span>{transactions.length}</span>
        </div>

        {loading ? (
          <div className="wallet-empty">
            Loading transactions...
          </div>
        ) : transactions.length === 0 ? (
          <div className="wallet-empty">
            No transactions yet.
          </div>
        ) : (
          <div className="wallet-transactions">
            {transactions.slice(0, 10).map((transaction) => (
              <div
                className="wallet-transaction"
                key={transaction.id}
              >
                <div>
                  <strong>
                    {transaction.type === "deposit"
                      ? "Deposit"
                      : transaction.type === "withdraw"
                        ? "Withdraw"
                        : transaction.type}
                  </strong>

                  <small>
                    {transaction.created_at
                      ? new Date(transaction.created_at).toLocaleString()
                      : ""}
                  </small>
                </div>

                <div className="wallet-transaction-right">
                  <strong
                    className={
                      transaction.type === "deposit" ||
                      transaction.type === "MINING_REWARD"
                        ? "transaction-positive"
                        : "transaction-negative"
                    }
                  >
                    {transaction.type === "deposit" ||
                    transaction.type === "MINING_REWARD"
                      ? "+"
                      : "-"}
                    {Number(transaction.amount).toFixed(2)} LOVE
                  </strong>

                  <small>
                    Completed
                  </small>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export default WalletCard;
