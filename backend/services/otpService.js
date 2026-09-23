const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

async function sendOtpEmail(to, otp) {
  await transporter.sendMail({
    from: `"LOVE Network" <${process.env.GMAIL_USER}>`,
    to,
    subject: "LOVE Network - Your Verification Code",
    text: `Your LOVE Network verification code is: ${otp}\n\nThis code will expire in 10 minutes.`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:500px;margin:auto">
        <h2>LOVE Network</h2>
        <p>Your verification code is:</p>
        <h1 style="letter-spacing:6px">${otp}</h1>
        <p>This code will expire in <b>10 minutes</b>.</p>
        <p>If you did not request this code, please ignore this email.</p>
      </div>
    `,
  });
}

module.exports = { sendOtpEmail };
