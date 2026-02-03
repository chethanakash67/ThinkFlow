# SMTP Email Configuration for Render Deployment

## Overview

ThinkFlow uses email for OTP verification during signup and password reset. If SMTP is not configured on Render, the app will **auto-verify** users so signup still works!

## Current Behavior

### Without SMTP Configuration:
- ✅ Signup works (users are auto-verified)
- ✅ Users can login immediately after signup
- ❌ No OTP emails sent
- ❌ Password reset won't work

### With SMTP Configuration:
- ✅ OTP emails sent for signup verification
- ✅ OTP emails sent for password reset
- ✅ Full security with email verification

## Option 1: Use Gmail (Recommended for Testing)

### Step 1: Enable 2-Factor Authentication
1. Go to your Google Account settings
2. Navigate to Security
3. Enable 2-Factor Authentication

### Step 2: Generate App Password
1. Go to: https://myaccount.google.com/apppasswords
2. Select "Mail" and "Other (Custom name)"
3. Name it "ThinkFlow Render"
4. Click "Generate"
5. **Copy the 16-character password** (spaces don't matter)

### Step 3: Add Environment Variables to Render

In your Render dashboard, add these environment variables:

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-16-character-app-password
EMAIL_FROM=your-email@gmail.com
```

**Important:** Use the **App Password**, NOT your regular Gmail password!

## Option 2: Use SendGrid (Recommended for Production)

SendGrid offers 100 free emails/day forever.

### Step 1: Create SendGrid Account
1. Go to: https://signup.sendgrid.com/
2. Sign up (credit card NOT required for free tier)
3. Verify your email

### Step 2: Create API Key
1. Go to Settings → API Keys
2. Click "Create API Key"
3. Name it "ThinkFlow"
4. Select "Full Access"
5. **Copy the API key** (you won't see it again!)

### Step 3: Verify Sender Identity
1. Go to Settings → Sender Authentication
2. Click "Verify a Single Sender"
3. Enter your email and details
4. Verify the confirmation email

### Step 4: Add Environment Variables to Render

```
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=your-sendgrid-api-key
EMAIL_FROM=your-verified-sender@email.com
```

**Note:** `SMTP_USER` is literally the word "apikey", not your username!

## Option 3: Use Brevo (formerly Sendinblue)

Brevo offers 300 free emails/day.

### Step 1: Create Brevo Account
1. Go to: https://www.brevo.com/
2. Sign up for free
3. Verify your email

### Step 2: Get SMTP Credentials
1. Go to Settings → SMTP & API
2. Click on "SMTP" tab
3. Copy your SMTP credentials

### Step 3: Add Environment Variables to Render

```
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USER=your-brevo-login-email
SMTP_PASS=your-smtp-key
EMAIL_FROM=your-verified-sender@email.com
```

## How to Add Environment Variables to Render

1. Go to your Render dashboard
2. Select your **Web Service** (ThinkFlow backend)
3. Click on "Environment" in the left sidebar
4. Click "Add Environment Variable"
5. Add each variable one by one:
   - Key: `SMTP_HOST`
   - Value: `smtp.gmail.com` (or your provider)
6. Click "Save Changes"
7. **Render will automatically redeploy** with the new configuration

## Testing Email Configuration

After adding the SMTP environment variables:

1. Wait for Render to redeploy (check the "Events" tab)
2. Try signing up with a new email
3. Check your inbox (and spam folder!) for the OTP email
4. If no email arrives, check Render logs:
   - Go to your service
   - Click "Logs" tab
   - Look for email-related error messages

## Troubleshooting

### Gmail "Less Secure Apps" Error
✅ **Solution:** Use App Password (see Option 1 above)

### "Authentication Failed" Error
❌ **Problem:** Wrong SMTP credentials  
✅ **Solution:** Double-check SMTP_USER and SMTP_PASS

### "Connection Timeout" Error
❌ **Problem:** Wrong SMTP_HOST or SMTP_PORT  
✅ **Solution:** Verify the values for your provider

### Emails Going to Spam
✅ **Solution:** 
- Use a verified sender domain (SendGrid, Brevo)
- Add SPF/DKIM records (advanced)
- Ask users to check spam folder

## Default Behavior (No SMTP)

If you don't configure SMTP:
- ✅ Signup works (auto-verification)
- ✅ Login works immediately
- ❌ Password reset requires SMTP
- ⚠️  Users won't receive confirmation emails

## Security Notes

- **Never commit SMTP credentials to Git**
- **Use environment variables only**
- **Rotate API keys regularly**
- **Use App Passwords for Gmail** (never your main password)

## Questions?

If you're still having issues:
1. Check Render logs for specific error messages
2. Verify all environment variables are set correctly
3. Test your SMTP credentials locally first
4. Contact support with the error message from logs

---

**Pro Tip:** Start with Gmail App Password for quick testing, then move to SendGrid for production!
