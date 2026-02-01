/**
 * Email Configuration Test
 * Tests SMTP connection and email sending
 */
require('dotenv').config();
const nodemailer = require('nodemailer');

const testEmail = async () => {
  console.log('🔍 Testing email configuration...\n');

  // Display current configuration
  console.log('Current SMTP settings:');
  console.log(`  Host: ${process.env.SMTP_HOST || 'smtp.gmail.com'}`);
  console.log(`  Port: ${process.env.SMTP_PORT || '587'}`);
  console.log(`  User: ${process.env.SMTP_USER || 'NOT SET'}`);
  console.log(`  Pass: ${process.env.SMTP_PASS ? '****** (set)' : 'NOT SET'}\n`);

  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.log('❌ SMTP_USER or SMTP_PASS not configured in .env file');
    console.log('📝 Please add these to your .env file:');
    console.log('   SMTP_USER=your-email@gmail.com');
    console.log('   SMTP_PASS=your-app-password\n');
    console.log('ℹ️  For Gmail, you need an App Password (not your regular password)');
    console.log('   Visit: https://myaccount.google.com/apppasswords\n');
    process.exit(1);
  }

  // Create transporter
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: process.env.SMTP_PORT || 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  try {
    // Verify connection
    console.log('🔄 Verifying SMTP connection...');
    await transporter.verify();
    console.log('✅ SMTP connection successful!\n');

    // Send test email
    console.log('📧 Sending test email...');
    const info = await transporter.sendMail({
      from: process.env.SMTP_USER,
      to: process.env.SMTP_USER, // Send to yourself
      subject: 'ThinkFlow Email Test',
      html: `
        <h2>✅ Email Configuration Successful!</h2>
        <p>Your ThinkFlow email system is working correctly.</p>
        <p>Timestamp: ${new Date().toISOString()}</p>
      `,
    });

    console.log('✅ Test email sent successfully!');
    console.log(`📬 Message ID: ${info.messageId}`);
    console.log(`📨 Preview: ${nodemailer.getTestMessageUrl(info) || 'N/A'}\n`);
    console.log('🎉 Email configuration is working perfectly!');

  } catch (error) {
    console.error('❌ Email test failed:', error.message);
    console.log('\n💡 Common issues:');
    console.log('   1. Wrong SMTP credentials');
    console.log('   2. Gmail App Password not generated (for Gmail)');
    console.log('   3. Less secure app access disabled (for Gmail)');
    console.log('   4. Firewall blocking port 587');
    console.log('   5. 2FA not enabled (required for Gmail App Passwords)\n');
    process.exit(1);
  }
};

// Run test
testEmail();
