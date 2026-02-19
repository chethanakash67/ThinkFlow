require('dotenv').config();
const nodemailer = require('nodemailer');

console.log('🔍 Starting SMTP verification...');

const config = {
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  user: process.env.SMTP_USER,
  // key: process.env.RESEND_API_KEY ? 'Present' : 'Missing'
};

console.log('📝 Configuration loaded:');
console.log(`  Host: ${config.host}`);
console.log(`  Port: ${config.port}`);
console.log(`  User: ${config.user}`);
console.log(`  Pass: ${process.env.SMTP_PASS ? '****** (present)' : '❌ MISSING'}`);

if (!config.host || !config.user || !process.env.SMTP_PASS) {
  console.error('\n❌ Missing required environment variables!');
  console.error('Please check your .env file or Render environment variables.');
  process.exit(1);
}

const transporter = nodemailer.createTransport({
  host: config.host,
  port: config.port,
  secure: config.port === 465, // true for 465, false for other ports
  auth: {
    user: config.user,
    pass: process.env.SMTP_PASS,
  },
  debug: true, // Enable debug output
  logger: true // Log to console
});

async function verify() {
  try {
    console.log('\n🔄 Verifying connection...');
    await transporter.verify();
    console.log('✅ SMTP Connection verified successfully!');

    console.log('\n📧 Sending test email...');
    const info = await transporter.sendMail({
      from: `"${config.user}" <${config.user}>`, // Use verify sender
      to: config.user, // Send to self
      subject: 'SMTP Verification Test',
      text: 'If you receive this, your SMTP configuration is working correctly.',
      html: '<b>If you receive this, your SMTP configuration is working correctly.</b>',
    });

    console.log('✅ Test email sent!');
    console.log(`📬 Message ID: ${info.messageId}`);
    console.log(`📨 Preview URL: ${nodemailer.getTestMessageUrl(info)}`);

  } catch (error) {
    console.error('\n❌ Verification Failed:');
    console.error(error);
  }
}

verify();
