-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- ThinkFlow Database Migration
-- Adds OTP fields to existing users table
-- Run this ONLY if you have an existing database
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- Run with:
-- psql -U postgres -d thinkflow -f migration_add_otp_fields.sql

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Step 1: Add OTP columns
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DO $$ 
BEGIN
    -- Add otp_code column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'otp_code'
    ) THEN
        ALTER TABLE users ADD COLUMN otp_code VARCHAR(6);
        RAISE NOTICE '✅ Added column: otp_code';
    ELSE
        RAISE NOTICE '⊙ Column already exists: otp_code';
    END IF;

    -- Add otp_expires column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'otp_expires'
    ) THEN
        ALTER TABLE users ADD COLUMN otp_expires TIMESTAMP;
        RAISE NOTICE '✅ Added column: otp_expires';
    ELSE
        RAISE NOTICE '⊙ Column already exists: otp_expires';
    END IF;

    -- Add otp_type column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'otp_type'
    ) THEN
        ALTER TABLE users ADD COLUMN otp_type VARCHAR(50);
        RAISE NOTICE '✅ Added column: otp_type';
    ELSE
        RAISE NOTICE '⊙ Column already exists: otp_type';
    END IF;
END $$;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Step 2: Add CHECK constraint for otp_type
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DO $$ 
BEGIN
    -- Check if constraint already exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.constraint_column_usage 
        WHERE table_name = 'users' AND constraint_name = 'users_otp_type_check'
    ) THEN
        ALTER TABLE users ADD CONSTRAINT users_otp_type_check 
        CHECK (otp_type IN ('signup', 'forgot-password'));
        RAISE NOTICE '✅ Added constraint: users_otp_type_check';
    ELSE
        RAISE NOTICE '⊙ Constraint already exists: users_otp_type_check';
    END IF;
END $$;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Step 3: Add index for OTP lookups (performance optimization)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE INDEX IF NOT EXISTS idx_users_otp 
ON users(otp_code, otp_expires) 
WHERE otp_code IS NOT NULL;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Step 4: Clean up any expired OTPs
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

UPDATE users 
SET otp_code = NULL, otp_expires = NULL, otp_type = NULL
WHERE otp_expires < NOW();

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Verification
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DO $$
DECLARE
    col_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO col_count
    FROM information_schema.columns
    WHERE table_name = 'users'
    AND column_name IN ('otp_code', 'otp_expires', 'otp_type');
    
    IF col_count = 3 THEN
        RAISE NOTICE '';
        RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
        RAISE NOTICE '✅ Migration completed successfully!';
        RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
        RAISE NOTICE '';
        RAISE NOTICE 'All OTP fields have been added to the users table:';
        RAISE NOTICE '  • otp_code (VARCHAR(6))';
        RAISE NOTICE '  • otp_expires (TIMESTAMP)';
        RAISE NOTICE '  • otp_type (VARCHAR(50))';
        RAISE NOTICE '';
        RAISE NOTICE 'Next steps:';
        RAISE NOTICE '  1. Verify .env file has correct SMTP configuration';
        RAISE NOTICE '  2. Run: node test-email.js';
        RAISE NOTICE '  3. Start your backend server';
        RAISE NOTICE '  4. Test the signup flow';
        RAISE NOTICE '';
    ELSE
        RAISE WARNING '';
        RAISE WARNING '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
        RAISE WARNING '⚠️  Migration incomplete!';
        RAISE WARNING '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
        RAISE WARNING '';
        RAISE WARNING 'Only % of 3 columns were added.', col_count;
        RAISE WARNING 'Please check for errors above and try again.';
        RAISE WARNING '';
    END IF;
END $$;

-- Show current table structure
\d users
