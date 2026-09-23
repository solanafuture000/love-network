import { useEffect, useState } from "react";
import { api } from "../services/api";

function HistoryCard() {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const loadHistory = async () => {
      try {
        const data = await api.getMiningHistory();

        if (!active) return;

        const items =
          data?.history ||
          data?.data ||
          data?.records ||
          [];

        setHistory(Array.isArray(items) ? items : []);
      } catch (error) {
        if (active) {
          setHistory([]);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    loadHistory();

    return () => {
      active = false;
    };
  }, []);

  return (
    <section className="settings-card" id="history">
      <div className="section-heading">
        <div>
          <span>Activity</span>
          <h3>Mining History</h3>
          <p>
            View your recent LOVE Network mining activity.
          </p>
        </div>

        <div className="settings-icon">
          History
        </div>
      </div>

      <div className="settings-list">
        {loading ? (
          <div className="wallet-empty">
            Loading mining history...
          </div>
        ) : history.length === 0 ? (
          <div className="wallet-empty">
            No mining history yet.
          </div>
        ) : (
          history.slice(0, 10).map((item, index) => (
            <div className="settings-row" key={item.id || index}>
              <div>
                <strong>
                  {item.status || item.type || "Mining Session"}
                </strong>

                <small>
                  {item.created_at ||
                    item.started_at ||
                    item.date ||
                    "Recent activity"}
                </small>
              </div>

              <strong>
                {item.reward !== undefined
                  ? `${Number(item.reward).toFixed(2)} LOVE`
                  : item.amount !== undefined
                  ? `${Number(item.amount).toFixed(2)} LOVE`
                  : "Completed"}
              </strong>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

export default HistoryCard;
