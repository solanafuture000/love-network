
import { useEffect, useState } from "react";
import { api } from "../services/api";

function WalletCard({ balance, setBalance }) {
  const [copied, setCopied] = useState("");
  const [action, setAction] = useState(null);
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState("");
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  const [wallets, setWallets] = useState([]);
  const [walletsLoading, setWalletsLoading] = useState(true);

  const [showCreateWallet, setShowCreateWallet] = useState(false);
  const [walletName, setWalletName] = useState("LOVE Wallet");
  const [creatingWallet, setCreatingWallet] = useState(false);

  const [newWallet, setNewWallet] = useState(null);

  const copyText = async (value, type) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(type);

      setTimeout(() => {
        setCopied("");
      }, 2000);
    } catch {
      setCopied("");
    }
  };

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

  const loadWallets = async () => {
    try {
      setWalletsLoading(true);

      const data = await api.getWallets();

      if (data.success) {
        setWallets(data.wallets || []);
      }
    } catch (error) {
      console.error("WALLETS API ERROR:", error);
      setMessage(error.message || "Failed to load wallets.");
    } finally {
      setWalletsLoading(false);
    }
  };

  useEffect(() => {
    loadWallet();
    loadWallets();
  }, []);

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

    if (
      action === "withdraw" &&
      value > Number(balance)
    ) {
      setMessage("Insufficient LOVE balance.");
      return;
    }

    setMessage(
      action === "deposit"
        ? "Deposit processing will be connected next."
        : "Withdraw processing will be connected next."
    );
  };

  const handleCreateWallet = async (event) => {
    event.preventDefault();

    const name = walletName.trim();

    if (!name) {
      setMessage("Enter a wallet name.");
      return;
    }

    try {
      setCreatingWallet(true);
      setMessage("");
      setNewWallet(null);

      const data = await api.createWallet(name);

      if (!data.success || !data.wallet) {
        throw new Error(
          data.message || "Wallet creation failed."
        );
      }

      setNewWallet({
        wallet: data.wallet,
        privateKey: data.privateKey,
        warning: data.warning
      });

      setWalletName("LOVE Wallet");
      setShowCreateWallet(false);

      await loadWallets();
    } catch (error) {
      console.error("CREATE WALLET ERROR:", error);

      setMessage(
        error.message || "Failed to create wallet."
      );
    } finally {
      setCreatingWallet(false);
    }
  };

  const closeNewWallet = () => {
    setNewWallet(null);
  };

  return (
    <section className="settings-card" id="wallet">

      {/* ------------------------------------------------ */}
      {/* HEADER */}
      {/* ------------------------------------------------ */}

      <div className="section-heading">
        <div>
          <span>Wallet</span>

          <h3>LOVE Wallet</h3>

          <p>
            Manage your LOVE wallets and transactions.
          </p>
        </div>

        <div className="settings-icon">
          L
        </div>
      </div>


      {/* ------------------------------------------------ */}
      {/* MAIN BALANCE */}
      {/* ------------------------------------------------ */}

      <div className="settings-list">

        <div className="settings-row">
          <div>
            <strong>Available Balance</strong>

            <small>
              Your current LOVE wallet balance.
            </small>
          </div>

          <strong>
            {loading
              ? "Loading..."
              : `${Number(balance).toFixed(2)} LOVE`}
          </strong>
        </div>


        {/* ------------------------------------------------ */}
        {/* CREATE WALLET */}
        {/* ------------------------------------------------ */}

        <div className="settings-row">
          <div>
            <strong>My Wallets</strong>

            <small>
              Create and manage your LOVE wallets.
            </small>
          </div>

          <button
            type="button"
            className="settings-action-button"
            onClick={() => {
              setShowCreateWallet(true);
              setMessage("");
            }}
          >
            + Add Wallet
          </button>
        </div>


        {/* ------------------------------------------------ */}
        {/* CREATE WALLET FORM */}
        {/* ------------------------------------------------ */}

        {showCreateWallet && (
          <form
            className="settings-form"
            onSubmit={handleCreateWallet}
          >
            <label>
              Wallet Name

              <input
                type="text"
                value={walletName}
                maxLength={50}
                onChange={(event) =>
                  setWalletName(event.target.value)
                }
                placeholder="LOVE Wallet"
                required
              />
            </label>

            <div className="settings-message">
              A new public/private key pair will be generated
              for this wallet.
            </div>

            <div className="settings-form-actions">
              <button
                type="button"
                onClick={() => {
                  setShowCreateWallet(false);
                  setMessage("");
                }}
                disabled={creatingWallet}
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={creatingWallet}
              >
                {creatingWallet
                  ? "Creating..."
                  : "Create Wallet"}
              </button>
            </div>
          </form>
        )}


        {/* ------------------------------------------------ */}
        {/* WALLET LIST */}
        {/* ------------------------------------------------ */}

        <div className="wallet-history">

          <div className="wallet-history-header">
            <div>
              <small>Wallets</small>

              <h4>My LOVE Wallets</h4>
            </div>

            <span>
              {wallets.length}
            </span>
          </div>


          {walletsLoading ? (
            <div className="wallet-empty">
              Loading wallets...
            </div>
          ) : wallets.length === 0 ? (
            <div className="wallet-empty">
              No wallet created yet.
            </div>
          ) : (
            <div className="wallet-transactions">

              {wallets.map((wallet) => (
                <div
                  className="wallet-transaction"
                  key={wallet.id}
                >

                  <div>
                    <strong>
                      {wallet.wallet_name}
                    </strong>

                    <small>
                      {wallet.is_default
                        ? "Default Wallet"
                        : "LOVE Wallet"}
                    </small>

                    <small>
                      {wallet.public_address}
                    </small>
                  </div>

                  <div className="wallet-transaction-right">

                    <strong>
                      {Number(
                        wallet.balance || 0
                      ).toFixed(2)}{" "}
                      LOVE
                    </strong>

                    <button
                      type="button"
                      className="settings-action-button"
                      onClick={() =>
                        copyText(
                          wallet.public_address,
                          `address-${wallet.id}`
                        )
                      }
                    >
                      {copied ===
                      `address-${wallet.id}`
                        ? "Copied"
                        : "Copy"}
                    </button>

                  </div>

                </div>
              ))}

            </div>
          )}

        </div>


        {/* ------------------------------------------------ */}
        {/* NEW WALLET PRIVATE KEY */}
        {/* ------------------------------------------------ */}

        {newWallet && (
          <div className="settings-message">

            <strong>
              Wallet Created Successfully
            </strong>

            <p>
              {newWallet.warning}
            </p>

            <div className="settings-row">
              <div>
                <strong>
                  Wallet Address
                </strong>

                <small>
                  {newWallet.wallet.public_address}
                </small>
              </div>

              <button
                type="button"
                className="settings-action-button"
                onClick={() =>
                  copyText(
                    newWallet.wallet.public_address,
                    "new-address"
                  )
                }
              >
                {copied === "new-address"
                  ? "Copied"
                  : "Copy"}
              </button>
            </div>


            <div className="settings-row">
              <div>
                <strong>
                  Public Key
                </strong>

                <small>
                  {newWallet.wallet.public_key}
                </small>
              </div>

              <button
                type="button"
                className="settings-action-button"
                onClick={() =>
                  copyText(
                    newWallet.wallet.public_key,
                    "public-key"
                  )
                }
              >
                {copied === "public-key"
                  ? "Copied"
                  : "Copy"}
              </button>
            </div>


            <div className="settings-row">
              <div>
                <strong>
                  Private Key
                </strong>

                <small>
                  Save this key securely. It will not be
                  shown again.
                </small>

                <small>
                  {newWallet.privateKey}
                </small>
              </div>

              <button
                type="button"
                className="settings-action-button"
                onClick={() =>
                  copyText(
                    newWallet.privateKey,
                    "private-key"
                  )
                }
              >
                {copied === "private-key"
                  ? "Copied"
                  : "Copy"}
              </button>
            </div>


            <button
              type="button"
              onClick={closeNewWallet}
            >
              I Saved My Private Key
            </button>

          </div>
        )}


        {/* ------------------------------------------------ */}
        {/* CURRENT WALLET ADDRESS */}
        {/* ------------------------------------------------ */}

        {!showCreateWallet &&
          !newWallet &&
          wallets.length > 0 && (
            <div className="settings-row">

              <div>
                <strong>
                  Default Wallet Address
                </strong>

                <small>
                  {wallets.find(
                    (wallet) =>
                      wallet.is_default
                  )?.public_address ||
                    wallets[0].public_address}
                </small>
              </div>

              <button
                type="button"
                className="settings-action-button"
                onClick={() =>
                  copyText(
                    wallets.find(
                      (wallet) =>
                        wallet.is_default
                    )?.public_address ||
                      wallets[0].public_address,
                    "default-address"
                  )
                }
              >
                {copied === "default-address"
                  ? "Copied"
                  : "Copy"}
              </button>

            </div>
          )}


        {/* ------------------------------------------------ */}
        {/* DEPOSIT / WITHDRAW */}
        {/* ------------------------------------------------ */}

        {!action && (
          <>
            <div className="settings-row">

              <div>
                <strong>
                  Deposit LOVE
                </strong>

                <small>
                  Add LOVE to your wallet balance.
                </small>
              </div>

              <button
                type="button"
                className="settings-action-button"
                onClick={() =>
                  openAction("deposit")
                }
              >
                Deposit
              </button>

            </div>


            <div className="settings-row">

              <div>
                <strong>
                  Withdraw LOVE
                </strong>

                <small>
                  BSC withdrawal will be added later.
                </small>
              </div>

              <button
                type="button"
                className="settings-action-button"
                onClick={() =>
                  openAction("withdraw")
                }
              >
                Withdraw
              </button>

            </div>
          </>
        )}


        {/* ------------------------------------------------ */}
        {/* DEPOSIT / WITHDRAW FORM */}
        {/* ------------------------------------------------ */}

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
                  setAmount(
                    event.target.value
                  )
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


      {/* ------------------------------------------------ */}
      {/* GENERAL MESSAGE */}
      {/* ------------------------------------------------ */}

      {!action &&
        message &&
        !newWallet && (
          <div className="settings-message">
            {message}
          </div>
        )}


      {/* ------------------------------------------------ */}
      {/* TRANSACTION HISTORY */}
      {/* ------------------------------------------------ */}

      <div className="wallet-history">

        <div className="wallet-history-header">

          <div>
            <small>
              History
            </small>

            <h4>
              Recent Transactions
            </h4>
          </div>

          <span>
            {transactions.length}
          </span>

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

            {transactions
              .slice(0, 10)
              .map((transaction) => {

                const isPositive =
                  transaction.type ===
                    "DEPOSIT" ||
                  transaction.type ===
                    "deposit" ||
                  transaction.type ===
                    "MINING_REWARD";

                return (
                  <div
                    className="wallet-transaction"
                    key={transaction.id}
                  >

                    <div>

                      <strong>
                        {transaction.type}
                      </strong>

                      <small>
                        {transaction.created_at
                          ? new Date(
                              transaction.created_at
                            ).toLocaleString()
                          : ""}
                      </small>

                    </div>


                    <div className="wallet-transaction-right">

                      <strong
                        className={
                          isPositive
                            ? "transaction-positive"
                            : "transaction-negative"
                        }
                      >
                        {isPositive
                          ? "+"
                          : "-"}
                        {Number(
                          transaction.amount
                        ).toFixed(2)}{" "}
                        LOVE
                      </strong>

                      <small>
                        Completed
                      </small>

                    </div>

                  </div>
                );
              })}

          </div>
        )}

      </div>

    </section>
  );
}

export default WalletCard;
