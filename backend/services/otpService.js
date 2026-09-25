const https = require("https");

async function sendOtpEmail(to, otp) {
  const apiKey = process.env.BREVO_API_KEY;

  if (!apiKey) {
    throw new Error("BREVO_API_KEY is not configured");
  }

  const data = JSON.stringify({
    sender: {
      name: "LOVE Network",
      email: process.env.BREVO_SENDER_EMAIL
    },
    to: [
      {
        email: to
      }
    ],
    subject: "LOVE Network - Your Verification Code",
    textContent: `Your LOVE Network verification code is: ${otp}

This code will expire in 10 minutes.

If you did not request this code, please ignore this email.`,
    htmlContent: `
      <div style="font-family:Arial,sans-serif;max-width:500px;margin:auto;padding:30px;background:#f5f7ff;border-radius:12px">
        <h2 style="color:#4f46e5">LOVE Network</h2>
        <p>Your verification code is:</p>

        <h1 style="letter-spacing:8px;text-align:center;color:#111827">
          ${otp}
        </h1>

        <p>This code will expire in <b>10 minutes</b>.</p>

        <p style="color:#6b7280;font-size:13px">
          If you did not request this code, please ignore this email.
        </p>
      </div>
    `
  });

  return new Promise((resolve, reject) => {
    const request = https.request(
      {
        hostname: "api.brevo.com",
        path: "/v3/smtp/email",
        method: "POST",
        headers: {
          "accept": "application/json",
          "api-key": apiKey,
          "content-type": "application/json",
          "content-length": Buffer.byteLength(data)
        }
      },
      (response) => {
        let body = "";

        response.on("data", (chunk) => {
          body += chunk;
        });

        response.on("end", () => {
          if (response.statusCode >= 200 && response.statusCode < 300) {
            resolve(JSON.parse(body || "{}"));
          } else {
            reject(
              new Error(
                `Brevo API error ${response.statusCode}: ${body}`
              )
            );
          }
        });
      }
    );

    request.on("error", reject);
    request.write(data);
    request.end();
  });
}

module.exports = { sendOtpEmail };
