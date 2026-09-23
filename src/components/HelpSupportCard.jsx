
import { useState } from "react";

function HelpSupportCard() {
  const [message, setMessage] = useState("");

  const handleAction = (text) => {
    setMessage(text);
  };

  return (
    <section className="settings-card" id="help">
      <div className="section-heading">
        <div>
          <span>Support</span>
          <h3>Help & Support</h3>
          <p>Get help with your LOVE Network account.</p>
        </div>

        <div className="settings-icon">
          ?
        </div>
      </div>

      <div className="settings-list">

        {/* Help Center */}
        <div className="settings-row">
          <div>
            <strong>Help Center</strong>
            <small>
              Find answers to common questions.
            </small>
          </div>

          <button
            type="button"
            className="settings-action-button"
            onClick={() =>
              handleAction(
                "Help Center will be available soon."
              )
            }
          >
            Open
          </button>
        </div>

        {/* Contact Support */}
        <div className="settings-row">
          <div>
            <strong>Contact Support</strong>
            <small>
              Get help from our support team.
            </small>
          </div>

          <button
            type="button"
            className="settings-action-button"
            onClick={() =>
              handleAction(
                "Support contact will be available soon."
              )
            }
          >
            Contact
          </button>
        </div>

        {/* Report Problem */}
        <div className="settings-row">
          <div>
            <strong>Report a Problem</strong>
            <small>
              Tell us if something is not working.
            </small>
          </div>

          <button
            type="button"
            className="settings-action-button"
            onClick={() =>
              handleAction(
                "Problem report form will be available soon."
              )
            }
          >
            Report
          </button>
        </div>

        {/* Terms */}
        <div className="settings-row">
          <div>
            <strong>Terms & Conditions</strong>
            <small>
              Review the rules of using LOVE Network.
            </small>
          </div>

          <button
            type="button"
            className="settings-action-button"
            onClick={() =>
              handleAction(
                "Terms & Conditions will be available soon."
              )
            }
          >
            View
          </button>
        </div>

        {/* Privacy */}
        <div className="settings-row">
          <div>
            <strong>Privacy Policy</strong>
            <small>
              Learn how your account data is handled.
            </small>
          </div>

          <button
            type="button"
            className="settings-action-button"
            onClick={() =>
              handleAction(
                "Privacy Policy will be available soon."
              )
            }
          >
            View
          </button>
        </div>

      </div>

      {message && (
        <div className="settings-message">
          {message}
        </div>
      )}
    </section>
  );
}

export default HelpSupportCard;
