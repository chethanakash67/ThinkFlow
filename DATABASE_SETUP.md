# Database Setup Guide

## Why the Error Occurs

The error `database "thinkflow" does not exist` happens because:

1. **PostgreSQL requires the database to exist before you can connect to it**
2. **The Pool connection is created immediately** when the module loads, attempting to connect to "thinkflow"
3. **If the database doesn't exist, PostgreSQL rejects the connection** with error code `3D000`

## Root Cause Analysis

The issue can be caused by:

1. ✅ **Database not created** - Most common cause
2. ✅ **Wrong database name in .env** - Typo in DB_NAME
3. ✅ **Wrong PostgreSQL user** - User doesn't have permission
4. ✅ **PostgreSQL service not running** - Service stopped
5. ✅ **Incorrect connection string** - Wrong host/port/credentials

## Terminal Commands to Diagnose and Fix

### 1. Check PostgreSQL Status

**macOS (Homebrew):**
```bash
brew services list | grep postgresql
# If not running:
brew services start postgresql
```

**Linux (systemd):**
```bash
sudo systemctl status postgresql
# If not running:
sudo systemctl start postgresql
```

**Check if PostgreSQL is accepting connections:**
```bash
pg_isready
# Should output: /tmp/.s.PGSQL.5432: accepting connections
```

### 2. List Existing Databases

```bash
psql -U postgres -l
# Or if you have a specific user:
psql -U your_username -l
```

**Alternative (list only database names):**
```bash
psql -U postgres -t -c "SELECT datname FROM pg_database WHERE datistemplate = false;"
```

### 3. Create the thinkflow Database

**Method 1: Using createdb command**
```bash
createdb -U postgres thinkflow
# Or with specific user:
createdb -U your_username thinkflow
```

**Method 2: Using psql**
```bash
psql -U postgres
# Then in psql prompt:
CREATE DATABASE thinkflow;
\q
```

**Method 3: The fixed code now does this automatically!**
The updated `db.js` will automatically create the database if it doesn't exist.

### 4. Verify Database Connection

```bash
psql -U postgres -d thinkflow -c "SELECT version();"
```

## .env Configuration

Ensure your `server/.env` file has:

```env
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=thinkflow
```

**Important Notes:**
- `DB_HOST` should be `localhost` for local development
- `DB_PORT` is usually `5432` (default PostgreSQL port)
- `DB_USER` is your PostgreSQL username (often `postgres`)
- `DB_PASSWORD` is your PostgreSQL password
- `DB_NAME` must match the database name you want to use

## How the Fix Works

The updated `db.js` now:

1. **Connects to default "postgres" database first** - This always exists
2. **Checks if "thinkflow" database exists** - Queries pg_database
3. **Creates "thinkflow" if missing** - Uses CREATE DATABASE
4. **Connects to "thinkflow" database** - Creates the connection pool
5. **Tests the connection** - Verifies it works
6. **Initializes schema** - Runs schema.sql

## Error Handling

The code now provides helpful error messages:

- **ECONNREFUSED**: PostgreSQL service not running
- **28P01**: Wrong username/password
- **3D000**: Cannot connect to default database
- **42P07/42710**: Table/index already exists (ignored)

## Testing the Fix

1. **Start your server:**
   ```bash
   cd server
   npm run dev
   ```

2. **Expected output:**
   ```
   ✅ Connected to PostgreSQL server
   📦 Creating database "thinkflow"...
   ✅ Database "thinkflow" created successfully
   ✅ Connected to database "thinkflow"
   ✅ Database connection test successful
   📝 Executing X schema statements...
   ✅ Database schema initialized successfully
   🚀 Server is running on port 5000
   ```

3. **If database already exists:**
   ```
   ✅ Connected to PostgreSQL server
   ✅ Database "thinkflow" already exists
   ✅ Connected to database "thinkflow"
   ✅ Database connection test successful
   📝 Executing X schema statements...
   ✅ Database schema initialized successfully
   🚀 Server is running on port 5000
   ```

## Troubleshooting

### Error: "Cannot connect to PostgreSQL server"

**Solution:**
```bash
# Check if PostgreSQL is running
pg_isready

# Start PostgreSQL (macOS)
brew services start postgresql

# Start PostgreSQL (Linux)
sudo systemctl start postgresql
```

### Error: "Authentication failed"

**Solution:**
1. Check your `.env` file for correct `DB_USER` and `DB_PASSWORD`
2. Try connecting manually:
   ```bash
   psql -U postgres
   ```
3. If that fails, reset PostgreSQL password or check pg_hba.conf

### Error: "Permission denied to create database"

**Solution:**
```bash
# Grant permissions to your user
psql -U postgres
ALTER USER your_username CREATEDB;
\q
```

Or use the `postgres` superuser account.

## Summary

The fix ensures:
- ✅ Database is created automatically if missing
- ✅ Clear error messages for common issues
- ✅ Connection tested before schema initialization
- ✅ Server only starts after successful DB connection
- ✅ Graceful error handling with helpful messages
