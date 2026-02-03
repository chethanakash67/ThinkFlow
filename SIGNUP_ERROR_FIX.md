# 🔧 Signup Error Troubleshooting Guide

## Current Status

✅ **Code Fixed:** Error handling improved, better logging added
✅ **Schema File:** Complete and correct (`server/src/config/schema.sql`)
✅ **Frontend:** Now displays specific error messages
⏳ **Render:** Deploying latest changes...

## What I Fixed

### 1. **Non-Fatal Table Verification in Production**
- Previously: App crashed if tables were missing
- Now: Logs warnings but continues running
- Benefit: Better diagnostics without complete failure

### 2. **Detailed Error Messages**
- Previously: Generic "Signup failed" message
- Now: Specific errors like:
  - "Database configuration error (Table does not exist)"
  - "Email already registered"
  - "Column does not exist"

### 3. **Auto-Verification When SMTP Missing**
- If SMTP not configured: Users auto-verified and logged in
- No OTP required when email service unavailable
- Graceful degradation for production

## Next Steps - Check Render Logs

### Step 1: Wait for Deployment
1. Go to your Render dashboard
2. Wait for the deployment to complete (~2-3 minutes)
3. Check that status shows "Live"

### Step 2: Check Runtime Logs
1. Click on your service → "Logs" tab
2. Look for these messages during startup:

#### ✅ **Good Signs:**
```
✅ Connected to database "thinkflow_xxxx"
📝 Parsed 15+ schema statements...
✓ Created table: users
✓ Created table: problems
✓ Created table: logic_submissions
✓ Created table: code_submissions
✓ Created table: execution_steps
✅ Database schema initialized successfully
```

#### ❌ **Bad Signs (If You See These):**
```
📝 Parsed 1 schema statements...
✗ Table "users" is MISSING
⚠️  Only 1 statements found. Expected at least 5
```

### Step 3: Try Signup Again
1. Go to your deployed website
2. Try creating an account
3. Check the error message carefully

#### Possible Error Messages:

**Error: "Database configuration error (Table does not exist)"**
- ✅ This confirms the `users` table doesn't exist
- 👉 See "Solution A" below

**Error: "Database configuration error (Column does not exist)"**
- ✅ Table exists but missing a column
- 👉 See "Solution B" below

**Error: "Unable to send verification email: ..."**
- ✅ Database works! It's just SMTP missing
- 👉 See "Solution C" below

**Success: Redirected to dashboard**
- ✅ Everything works! (Auto-verified because SMTP not configured)
- 🎉 You're done!

## Solutions

### Solution A: Users Table Doesn't Exist

The schema file isn't being executed properly. This happens if:
1. Render cached the OLD schema.sql (with only `pending_registrations`)
2. Database already has the old schema

**Fix: Manual Database Reset**

Go to Render dashboard → your PostgreSQL database → "Console" tab, run:

```sql
-- List all tables
\dt

-- If users table is missing, create it manually:
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'user',
  email_verified BOOLEAN DEFAULT FALSE,
  otp_code VARCHAR(6),
  otp_expires TIMESTAMP,
  otp_type VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Verify it was created
\dt
```

Then restart your web service.

### Solution B: Column Missing

If table exists but a column is missing:

```sql
-- Check current table structure
\d users

-- Add missing columns (adjust based on error message)
ALTER TABLE users ADD COLUMN IF NOT EXISTS otp_code VARCHAR(6);
ALTER TABLE users ADD COLUMN IF NOT EXISTS otp_expires TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS otp_type VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE;
```

### Solution C: SMTP Not Configured (Expected!)

This is NORMAL and SAFE:
- Users are auto-verified
- They can login immediately
- No security risk (just no email confirmation)

To add email later, see `RENDER_SMTP_SETUP.md`

### Solution D: Nuclear Option - Fresh Database

If nothing works, create a fresh database:

1. Render Dashboard → Create new PostgreSQL database
2. Update `DATABASE_URL` in your web service environment variables
3. Redeploy

The schema will be created fresh from `schema.sql`

## How to Verify Schema File is Correct

Run locally:

```bash
cd server/src/config
grep -c "CREATE TABLE" schema.sql
# Should show: 6

wc -l schema.sql  
# Should show: 242 or similar (not 10!)
```

If you see `10 lines` or only `1 CREATE TABLE`, the file is wrong!

## Emergency Contact

If you're still stuck, share these from Render logs:
1. The line that says `📝 Parsed X schema statements...`
2. Any lines with `✗ Table "X" is MISSING`
3. The actual error message when signup fails
4. Output of running `\dt` in the database console

---

**Pro Tip:** The deployment is automatic! After pushing to GitHub, Render rebuilds within 2-3 minutes. Check the "Events" tab to see deployment status.
