const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

async function sendOtpEmail(to, otp) {
  const mailOptions = {
    from: `"LOVE Network" <${process.env.GMAIL_USER}>`,
    to,
    subject: "LOVE Network - Your Verification Code",
    text: `Your LOVE Network verification code is: ${otp}

This code will expire in 10 minutes.

If you did not request this code, please ignore this email.`,
    html: `
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
    `,
  };

  return transporter.sendMail(mailOptions);
}

module.exports = { sendOtpEmail };