# Port Conflict Resolution Guide

## Why This Error Occurs on macOS

The error `EADDRINUSE` (Address Already In Use) occurs when:

1. **Another process is already bound to port 5000** - Only one process can listen on a port at a time
2. **macOS AirPlay Receiver** - By default, macOS uses port 5000 for AirPlay Receiver service
3. **Previous Node.js process** - A previous server instance wasn't properly terminated
4. **Nodemon/zombie process** - Development tools sometimes leave processes running

## Common Causes

### 1. Another Node Process Still Running
- Previous server instance didn't shut down cleanly
- Multiple terminal windows running the same server
- Nodemon didn't restart properly

### 2. Previous Nodemon Instance Not Killed
- Nodemon watches for file changes and restarts
- If killed improperly (Ctrl+C twice), it may leave processes running
- Background processes can persist

### 3. macOS AirPlay Receiver Using Port 5000
- **Most common on macOS!**
- AirPlay Receiver service uses port 5000 by default
- Enabled in System Preferences > Sharing > AirPlay Receiver

## Terminal Commands to Fix

### Identify the Process Using Port 5000

**Method 1: Using lsof (List Open Files)**
```bash
lsof -i :5000
```

**Output example:**
```
COMMAND   PID        USER   FD   TYPE DEVICE SIZE/OFF NODE NAME
node      12345     user   23u  IPv4 0x...      0t0  TCP *:5000 (LISTEN)
```

**Method 2: Get just the PID**
```bash
lsof -ti :5000
```

**Method 3: More detailed info**
```bash
lsof -i :5000 | grep LISTEN
```

### Kill the Process Safely

**Method 1: Kill by PID (from lsof output)**
```bash
kill -9 <PID>
# Example: kill -9 12345
```

**Method 2: One-liner to find and kill**
```bash
lsof -ti :5000 | xargs kill -9
```

**Method 3: Graceful kill (try SIGTERM first, then SIGKILL)**
```bash
# Try graceful shutdown first
kill <PID>

# Wait a few seconds, then force kill if needed
kill -9 <PID>
```

**Method 4: Kill all Node processes (use with caution!)**
```bash
pkill -9 node
```

### Check if Port is Now Free

```bash
lsof -i :5000
# Should return nothing if port is free
```

## Change Port Using .env

### Step 1: Update .env File

Edit `server/.env`:
```env
PORT=5001
```

### Step 2: Update Frontend .env.local (if needed)

If your frontend connects to the backend, update `client/.env.local`:
```env
NEXT_PUBLIC_API_URL=http://localhost:5001/api
```

### Step 3: Restart Server

```bash
npm run dev
```

## Disable macOS AirPlay Receiver (Port 5000)

If you want to use port 5000 specifically:

1. Open **System Preferences**
2. Click **Sharing**
3. Uncheck **AirPlay Receiver**
4. Restart your server

**Note:** This disables AirPlay functionality on your Mac. Consider using a different port instead.

## Verify Port Configuration

The server uses:
```javascript
const PORT = process.env.PORT || 5000;
```

This means:
- If `PORT` is set in `.env`, it uses that value
- Otherwise, it defaults to `5000`

To verify your port is being read correctly:
```bash
# Check .env file
cat server/.env | grep PORT

# Or check environment variable
echo $PORT
```

## Quick Reference Commands

```bash
# Find process on port 5000
lsof -i :5000

# Kill process on port 5000
lsof -ti :5000 | xargs kill -9

# Check if port is free
lsof -i :5000

# Change port in .env
echo "PORT=5001" >> server/.env

# Restart server
npm run dev
```

## Prevention Tips

1. **Always use Ctrl+C once** - Let graceful shutdown complete
2. **Check for running processes** - Before starting server, check if port is in use
3. **Use different ports for different projects** - Avoid conflicts
4. **Kill processes properly** - Don't force-quit terminal windows
5. **Use port 3001+ for development** - Avoid macOS system ports (5000, 7000, etc.)

## Error Message Explained

When you see:
```
❌ Port 5000 is already in use
```

The server code now provides:
- Clear explanation of the error
- Common causes
- Step-by-step solutions
- Exact commands to run

This helps you resolve the issue quickly without searching for solutions.
