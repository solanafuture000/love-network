import React, { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Html5Qrcode } from "html5-qrcode";
import { api } from "../services/api";

const AUTO_LOCK_MS = 10 * 60 * 1000;

export default function WalletCard() {
  const [wallet, setWallet] = useState(null);
  const [privateKey, setPrivateKey] = useState("");
  const [newWallet, setNewWallet] = useState(null);
  const [loading, setLoading] = useState(true);
  const [unlocking, setUnlocking] = useState(false);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [transactions, setTransactions] = useState([]);
  const [showPrivateKey, setShowPrivateKey] = useState(false);

  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerStarting, setScannerStarting] = useState(false);
  const [scannerError, setScannerError] = useState("");

  const [receipt, setReceipt] = useState(null);

  const lockTimerRef = useRef(null);
  const scannerRef = useRef(null);

  useEffect(() => {
    setLoading(false);

    return () => {
      if (lockTimerRef.current) {
        clearTimeout(lockTimerRef.current);
      }

      stopQrScanner();
    };
  }, []);

  function startAutoLock() {
    if (lockTimerRef.current) {
      clearTimeout(lockTimerRef.current);
    }

    lockTimerRef.current = setTimeout(() => {
      lockWallet();
    }, AUTO_LOCK_MS);
  }

  async function stopQrScanner() {
    const scanner = scannerRef.current;

    if (!scanner) {
      return;
    }

    try {
      const state = scanner.getState();

      if (
        state === 2 ||
        state === 3
      ) {
        await scanner.stop();
      }
    } catch {
      // Scanner may already be stopped.
    }

    try {
      await scanner.clear();
    } catch {
      // Ignore cleanup errors.
    }

    scannerRef.current = null;
  }

  function lockWallet() {
    if (lockTimerRef.current) {
      clearTimeout(lockTimerRef.current);
      lockTimerRef.current = null;
    }

    stopQrScanner();

    setWallet(null);
    setPrivateKey("");
    setTransactions([]);
    setMessage("");
    setError("");
    setShowPrivateKey(false);
    setReceipt(null);
    setScannerOpen(false);
    setScannerError("");
  }

  async function handleCreateWallet() {
    setCreating(true);
    setError("");
    setMessage("");
    setNewWallet(null);

    try {
      const result = await api.createWallet("LOVE Wallet");

      if (!result?.success || !result?.wallet) {
        throw new Error(result?.message || "Failed to create wallet");
      }

      setNewWallet({
        ...result.wallet,
        privateKey: result.privateKey
      });

      setMessage(
        "New wallet created. Save the private key securely before leaving this page."
      );
    } catch (err) {
      setError(err.message || "Failed to create wallet");
    } finally {
      setCreating(false);
    }
  }

  async function handleUnlock() {
    const key = privateKey.trim();

    if (!key) {
      setError("Please paste your private key.");
      return;
    }

    setUnlocking(true);
    setError("");
    setMessage("");

    try {
      const listResult = await api.getWallets();

      if (!listResult?.success || !Array.isArray(listResult.wallets)) {
        throw new Error(
          listResult?.message || "Unable to access wallets."
        );
      }

      let unlockedWallet = null;

      for (const candidate of listResult.wallets) {
        try {
          const result = await api.unlockWallet(
            candidate.id,
            key
          );

          if (result?.success && result.wallet) {
            unlockedWallet = result.wallet;
            break;
          }
        } catch {
          // Try the next stored wallet.
        }
      }

      if (!unlockedWallet) {
        throw new Error(
          "Private key does not match any wallet."
        );
      }

      setWallet(unlockedWallet);
      setPrivateKey("");
      setNewWallet(null);
      setReceipt(null);

      startAutoLock();

      await loadTransactions(unlockedWallet.id);
    } catch (err) {
      setError(
        err.message || "Failed to unlock wallet."
      );
    } finally {
      setUnlocking(false);
    }
  }

  async function loadTransactions(walletId) {
    try {
      const result =
        await api.getWalletTransactions(walletId);

      if (
        result?.success &&
        Array.isArray(result.transactions)
      ) {
        setTransactions(result.transactions);
      } else {
        setTransactions([]);
      }
    } catch {
      setTransactions([]);
    }
  }

  function transactionLabel(type) {
    const value = String(type || "").toLowerCase();

    if (value.includes("deposit")) return "Deposit";
    if (value.includes("withdraw")) return "Withdrawal";

    if (
      value.includes("receive") ||
      value.includes("transfer_in") ||
      value.includes("transfer in")
    ) {
      return "Received";
    }

    if (
      value.includes("send") ||
      value.includes("transfer_out") ||
      value.includes("transfer out")
    ) {
      return "Sent";
    }

    if (value.includes("mining")) return "Mining Reward";

    return type || "Transaction";
  }

  function transactionIsPositive(type) {
    const value = String(type || "").toLowerCase();

    return (
      value.includes("deposit") ||
      value.includes("receive") ||
      value.includes("transfer_in") ||
      value.includes("transfer in") ||
      value.includes("mining")
    );
  }

  function extractLoveAddress(value) {
    const text = String(value || "")
      .trim()
      .toUpperCase();

    const match = text.match(/LOVE[A-Z0-9]{40}/);

    if (!match) {
      return "";
    }

    return match[0];
  }

  async function startQrScanner() {
    setScannerError("");
    setError("");
    setMessage("");
    setScannerOpen(true);
    setScannerStarting(true);

    try {
      await new Promise((resolve) => {
        setTimeout(resolve, 250);
      });

      await stopQrScanner();

      const scanner = new Html5Qrcode(
        "love-qr-reader"
      );

      scannerRef.current = scanner;

      await scanner.start(
        {
          facingMode: "environment"
        },
        {
          fps: 10,
          qrbox: {
            width: 240,
            height: 240
          },
          aspectRatio: 1
        },
        async (decodedText) => {
          const address =
            extractLoveAddress(decodedText);

          if (!address) {
            setScannerError(
              "This QR code does not contain a valid LOVE wallet address."
            );
            return;
          }

          const receiverInput =
            document.querySelector(
              'input[name="receiverAddress"]'
            );

          if (receiverInput) {
            receiverInput.value = address;
          }

          await stopQrScanner();

          setScannerOpen(false);
          setScannerStarting(false);
          setScannerError("");

          setMessage(
            "LOVE wallet address scanned successfully."
          );
        },
        () => {
          // Ignore normal QR scanning misses.
        }
      );

      setScannerStarting(false);
    } catch (err) {
      await stopQrScanner();

      setScannerStarting(false);
      setScannerOpen(false);

      setScannerError(
        err?.message ||
          "Unable to start camera. Please allow camera access."
      );

      setError(
        "Unable to start QR scanner. Please allow camera access and try again."
      );
    }
  }

  async function closeQrScanner() {
    await stopQrScanner();

    setScannerOpen(false);
    setScannerStarting(false);
    setScannerError("");
  }

  function downloadReceipt() {
    if (!receipt) {
      return;
    }

    const canvas =
      document.createElement("canvas");

    const ctx = canvas.getContext("2d");

    if (!ctx) {
      return;
    }

    const width = 900;
    const height = 1050;

    canvas.width = width;
    canvas.height = height;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = "#111827";
    ctx.textAlign = "center";

    ctx.font =
      "700 42px Arial";

    ctx.fillText(
      "LOVE Network",
      width / 2,
      70
    );

    ctx.font =
      "700 34px Arial";

    ctx.fillText(
      "Transaction Receipt",
      width / 2,
      125
    );

    ctx.font =
      "700 30px Arial";

    ctx.fillStyle = "#15803d";

    ctx.fillText(
      "TRANSACTION SUCCESSFUL",
      width / 2,
      180
    );

    ctx.textAlign = "left";
    ctx.fillStyle = "#111827";

    const rows = [
      ["Status", receipt.status],
      ["Amount", `${Number(receipt.amount).toFixed(6)} LOVE`],
      ["Fee", `${Number(receipt.fee || 0).toFixed(6)} LOVE`],
      ["Transaction ID", String(receipt.transactionId)],
      ["Reference", receipt.reference],
      ["From", receipt.senderWallet],
      ["To", receipt.receiverWallet],
      ["Date", receipt.date]
    ];

    let y = 250;

    for (const [label, value] of rows) {
      ctx.font =
        "700 22px Arial";

      ctx.fillStyle = "#374151";

      ctx.fillText(
        `${label}:`,
        55,
        y
      );

      ctx.font =
        "20px Arial";

      ctx.fillStyle = "#111827";

      const text = String(value || "");

      if (text.length > 55) {
        const first =
          text.slice(0, 55);

        const second =
          text.slice(55);

        ctx.fillText(
          first,
          250,
          y
        );

        y += 28;

        ctx.fillText(
          second,
          250,
          y
        );
      } else {
        ctx.fillText(
          text,
          250,
          y
        );
      }

      y += 70;
    }

    ctx.strokeStyle = "#d1d5db";
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.moveTo(55, y);
    ctx.lineTo(width - 55, y);
    ctx.stroke();

    y += 55;

    ctx.textAlign = "center";
    ctx.font =
      "18px Arial";

    ctx.fillStyle = "#6b7280";

    ctx.fillText(
      "Keep this receipt for your records.",
      width / 2,
      y
    );

    const link =
      document.createElement("a");

    link.download =
      `LOVE-Receipt-${receipt.transactionId}.png`;

    link.href =
      canvas.toDataURL("image/png");

    link.click();
  }

  async function handleSend(event) {
    event.preventDefault();

    const form =
      new FormData(event.currentTarget);

    const receiverAddress =
      String(
        form.get("receiverAddress") || ""
      )
        .trim()
        .toUpperCase();

    const amount =
      Number(form.get("amount"));

    if (!wallet) {
      setError(
        "Unlock your wallet first."
      );
      return;
    }

    if (!receiverAddress) {
      setError(
        "Receiver address is required."
      );
      return;
    }

    if (
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      setError(
        "Enter a valid amount."
      );
      return;
    }

    if (
      receiverAddress.length !== 44 ||
      !receiverAddress.startsWith("LOVE")
    ) {
      setError(
        "Invalid LOVE wallet address."
      );
      return;
    }

    setError("");
    setMessage("");
    setReceipt(null);

    try {
      const result =
        await api.transfer({
          receiverAddress,
          amount,
          walletId: wallet.id
        });

      if (!result?.success) {
        throw new Error(
          result?.message ||
            "Transfer failed."
        );
      }

      const transfer =
        result.transfer || {};

      setReceipt({
        reference:
          transfer.reference || "N/A",
        amount:
          Number(
            transfer.amount ?? amount
          ),
        fee:
          Number(
            transfer.fee || 0
          ),
        senderWallet:
          transfer.senderWallet ||
          address,
        receiverWallet:
          transfer.receiverWallet ||
          receiverAddress,
        senderBalance:
          Number(
            transfer.senderBalance ??
              0
          ),
        transactionId:
          transfer.transactionId ||
          "N/A",
        status:
          transfer.status ||
          "COMPLETED",
        date:
          new Date().toLocaleString()
      });

      setMessage(
        "LOVE transfer completed successfully."
      );

      event.currentTarget.reset();

      const refreshed =
        await api.getWallets();

      const updatedWallet =
        refreshed?.wallets?.find(
          (item) =>
            Number(item.id) ===
            Number(wallet.id)
        );

      if (updatedWallet) {
        setWallet(updatedWallet);
      }

      await loadTransactions(
        wallet.id
      );

      startAutoLock();
    } catch (err) {
      setError(
        err.message ||
          "Transfer failed."
      );
    }
  }

  if (loading) {
    return (
      <div className="dashboard-card">
        <div className="dashboard-card-title">
          LOVE Wallet
        </div>

        <div className="dashboard-card-subtitle">
          Loading...
        </div>
      </div>
    );
  }

  if (!wallet) {
    return (
      <div className="dashboard-card">
        <div className="dashboard-card-title">
          LOVE Wallet
        </div>

        <div className="dashboard-card-subtitle">
          Unlock your wallet with your private key.
        </div>

        <div style={{ marginTop: 20 }}>
          <label
            style={{
              display: "block",
              marginBottom: 8,
              fontWeight: 600
            }}
          >
            Private Key
          </label>

          <textarea
            value={privateKey}
            onChange={(e) => {
              setPrivateKey(
                e.target.value
              );
              setError("");
            }}
            placeholder="Paste your private key here"
            rows={5}
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: 12,
              resize: "vertical"
            }}
          />

          <button
            type="button"
            onClick={handleUnlock}
            disabled={unlocking}
            style={{
              width: "100%",
              marginTop: 10
            }}
          >
            {unlocking
              ? "Unlocking..."
              : "Unlock Wallet"}
          </button>
        </div>

        <div
          style={{
            textAlign: "center",
            margin: "18px 0",
            opacity: 0.7
          }}
        >
          OR
        </div>

        <button
          type="button"
          onClick={handleCreateWallet}
          disabled={creating}
          style={{
            width: "100%"
          }}
        >
          {creating
            ? "Creating..."
            : "Create Wallet"}
        </button>

        {newWallet && (
          <div
            style={{
              marginTop: 20,
              padding: 16,
              borderRadius: 12,
              border:
                "1px solid rgba(255,255,255,0.12)"
            }}
          >
            <strong>
              New Wallet Created
            </strong>

            <div
              style={{
                marginTop: 14
              }}
            >
              <strong>
                Public Address
              </strong>

              <div
                style={{
                  marginTop: 6,
                  wordBreak:
                    "break-all"
                }}
              >
                {newWallet.public_address ||
                  newWallet.publicAddress}
              </div>
            </div>

            <div
              style={{
                marginTop: 14
              }}
            >
              <strong>
                Public Key
              </strong>

              <div
                style={{
                  marginTop: 6,
                  wordBreak:
                    "break-all"
                }}
              >
                {newWallet.public_key ||
                  newWallet.publicKey}
              </div>
            </div>

            <div
              style={{
                marginTop: 16
              }}
            >
              <strong>
                Private Key
              </strong>

              <div
                style={{
                  marginTop: 8,
                  padding: 10,
                  borderRadius: 8,
                  background:
                    "rgba(0,0,0,0.2)",
                  wordBreak:
                    "break-all"
                }}
              >
                {showPrivateKey
                  ? newWallet.privateKey
                  : "Private key hidden. Click Show Private Key."}
              </div>

              <button
                type="button"
                onClick={() =>
                  setShowPrivateKey(
                    (value) => !value
                  )
                }
                style={{
                  marginTop: 10
                }}
              >
                {showPrivateKey
                  ? "Hide Private Key"
                  : "Show Private Key"}
              </button>
            </div>

            <div
              style={{
                marginTop: 14
              }}
            >
              Save this private key securely. It will not be shown again.
            </div>
          </div>
        )}

        {error && (
          <div
            style={{
              marginTop: 16
            }}
            className="error-message"
          >
            {error}
          </div>
        )}

        {message && (
          <div
            style={{
              marginTop: 16
            }}
            className="success-message"
          >
            {message}
          </div>
        )}
      </div>
    );
  }

  const address =
    wallet.public_address ||
    wallet.publicAddress;

  const balance =
    Number(wallet.balance || 0);

  return (
    <div className="dashboard-card">
      <div
        style={{
          display: "flex",
          justifyContent:
            "space-between",
          alignItems: "center",
          gap: 12
        }}
      >
        <div>
          <div className="dashboard-card-title">
            LOVE Wallet
          </div>

          <div className="dashboard-card-subtitle">
            Wallet Unlocked
          </div>
        </div>

        <button
          type="button"
          onClick={lockWallet}
        >
          Lock
        </button>
      </div>

      <div style={{ marginTop: 20 }}>
        <div className="dashboard-card-subtitle">
          Balance
        </div>

        <div
          style={{
            fontSize: 30,
            fontWeight: 700,
            marginTop: 4
          }}
        >
          {balance.toFixed(6)} LOVE
        </div>
      </div>

      <div style={{ marginTop: 18 }}>
        <div className="dashboard-card-subtitle">
          Wallet Address
        </div>

        <div
          style={{
            marginTop: 6,
            wordBreak: "break-all"
          }}
        >
          {address}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent:
            "center",
          margin: "22px 0"
        }}
      >
        <QRCodeSVG
          value={address}
          size={190}
        />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "1fr 1fr",
          gap: 12
        }}
      >
        <div
          style={{
            padding: 14,
            borderRadius: 12,
            border:
              "1px solid rgba(255,255,255,0.12)"
          }}
        >
          <strong>
            Receive
          </strong>

          <div
            style={{
              marginTop: 6,
              fontSize: 13,
              opacity: 0.7
            }}
          >
            Share your LOVE address or QR code.
          </div>
        </div>

        <form
          onSubmit={handleSend}
          style={{
            padding: 14,
            borderRadius: 12,
            border:
              "1px solid rgba(255,255,255,0.12)"
          }}
        >
          <strong>
            Send
          </strong>

          <div
            style={{
              display: "flex",
              gap: 8,
              marginTop: 10
            }}
          >
            <input
              name="receiverAddress"
              placeholder="Receiver LOVE address"
              style={{
                flex: 1,
                minWidth: 0,
                boxSizing:
                  "border-box",
                padding: 10
              }}
            />

            <button
              type="button"
              onClick={startQrScanner}
              style={{
                whiteSpace:
                  "nowrap"
              }}
            >
              Scan QR
            </button>
          </div>

          <input
            name="amount"
            type="number"
            min="0"
            step="0.000001"
            placeholder="Amount"
            style={{
              width: "100%",
              boxSizing:
                "border-box",
              marginTop: 8,
              padding: 10
            }}
          />

          <button
            type="submit"
            style={{
              width: "100%",
              marginTop: 8
            }}
          >
            Send LOVE
          </button>
        </form>
      </div>

      {scannerOpen && (
        <div
          style={{
            marginTop: 18,
            padding: 16,
            borderRadius: 12,
            border:
              "1px solid rgba(255,255,255,0.12)"
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent:
                "space-between",
              alignItems: "center",
              gap: 10
            }}
          >
            <strong>
              Scan LOVE Wallet QR
            </strong>

            <button
              type="button"
              onClick={closeQrScanner}
            >
              Close
            </button>
          </div>

          <div
            id="love-qr-reader"
            style={{
              width: "100%",
              maxWidth: 420,
              margin:
                "16px auto 0"
            }}
          />

          {scannerStarting && (
            <div
              style={{
                marginTop: 10,
                textAlign: "center"
              }}
            >
              Starting camera...
            </div>
          )}

          {scannerError && (
            <div
              className="error-message"
              style={{
                marginTop: 10
              }}
            >
              {scannerError}
            </div>
          )}

          <div
            style={{
              marginTop: 10,
              fontSize: 13,
              opacity: 0.7,
              textAlign: "center"
            }}
          >
            Point the camera at the receiver's LOVE wallet QR code.
          </div>
        </div>
      )}

      {receipt && (
        <div
          style={{
            marginTop: 20,
            padding: 18,
            borderRadius: 14,
            border:
              "1px solid rgba(255,255,255,0.16)"
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent:
                "space-between",
              alignItems: "center",
              gap: 12
            }}
          >
            <div>
              <div className="dashboard-card-title">
                Transaction Receipt
              </div>

              <div
                className="dashboard-card-subtitle"
                style={{
                  marginTop: 4
                }}
              >
                Transaction Successful
              </div>
            </div>

            <button
              type="button"
              onClick={downloadReceipt}
            >
              Save Receipt
            </button>
          </div>

          <div
            style={{
              marginTop: 16,
              display: "grid",
              gap: 10
            }}
          >
            <div>
              <strong>
                Status
              </strong>

              <div>
                {receipt.status}
              </div>
            </div>

            <div>
              <strong>
                Amount
              </strong>

              <div>
                {receipt.amount.toFixed(6)} LOVE
              </div>
            </div>

            <div>
              <strong>
                Fee
              </strong>

              <div>
                {receipt.fee.toFixed(6)} LOVE
              </div>
            </div>

            <div>
              <strong>
                Transaction ID
              </strong>

              <div
                style={{
                  wordBreak:
                    "break-all"
                }}
              >
                {receipt.transactionId}
              </div>
            </div>

            <div>
              <strong>
                Transfer Reference
              </strong>

              <div
                style={{
                  wordBreak:
                    "break-all"
                }}
              >
                {receipt.reference}
              </div>
            </div>

            <div>
              <strong>
                From
              </strong>

              <div
                style={{
                  wordBreak:
                    "break-all"
                }}
              >
                {receipt.senderWallet}
              </div>
            </div>

            <div>
              <strong>
                To
              </strong>

              <div
                style={{
                  wordBreak:
                    "break-all"
                }}
              >
                {receipt.receiverWallet}
              </div>
            </div>

            <div>
              <strong>
                Date
              </strong>

              <div>
                {receipt.date}
              </div>
            </div>
          </div>
        </div>
      )}

      {message && (
        <div
          style={{
            marginTop: 16
          }}
          className="success-message"
        >
          {message}
        </div>
      )}

      {error && (
        <div
          style={{
            marginTop: 16
          }}
          className="error-message"
        >
          {error}
        </div>
      )}

      <div style={{ marginTop: 24 }}>
        <div className="dashboard-card-title">
          Transactions
        </div>

        {transactions.length === 0 ? (
          <div
            className="dashboard-card-subtitle"
            style={{
              marginTop: 10
            }}
          >
            No transactions for this wallet.
          </div>
        ) : (
          <div
            style={{
              marginTop: 10
            }}
          >
            {transactions.map(
              (transaction) => {
                const positive =
                  transactionIsPositive(
                    transaction.type
                  );

                return (
                  <div
                    key={
                      transaction.id
                    }
                    style={{
                      padding:
                        "12px 0",
                      borderBottom:
                        "1px solid rgba(255,255,255,0.08)"
                    }}
                  >
                    <div
                      style={{
                        display:
                          "flex",
                        justifyContent:
                          "space-between",
                        gap: 12
                      }}
                    >
                      <strong>
                        {transactionLabel(
                          transaction.type
                        )}
                      </strong>

                      <span>
                        {positive
                          ? "+"
                          : "-"}
                        {Number(
                          transaction.amount ||
                            0
                        ).toFixed(6)}{" "}
                        LOVE
                      </span>
                    </div>

                    {transaction.description && (
                      <div
                        style={{
                          marginTop: 4,
                          fontSize: 13,
                          opacity: 0.65
                        }}
                      >
                        {
                          transaction.description
                        }
                      </div>
                    )}
                  </div>
                );
              }
            )}
          </div>
        )}
      </div>
    </div>
  );
}
