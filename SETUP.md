# ThinkFlow Setup Guide

## Prerequisites

- Node.js 18+ installed
- PostgreSQL 12+ installed and running
- npm or yarn package manager

## Installation Steps

### 1. Install Dependencies

```bash
# Install root dependencies
npm install

# Install client dependencies
cd client
npm install

# Install server dependencies
cd ../server
npm install
cd ..
```

### 2. Set Up PostgreSQL Database

1. Create a PostgreSQL database:
```bash
createdb thinkflow
```

Or using psql:
```sql
CREATE DATABASE thinkflow;
```

2. Update database credentials in `server/.env`:
```env
DB_USER=postgres
DB_HOST=localhost
DB_NAME=thinkflow
DB_PASSWORD=your_password
DB_PORT=5432
```

### 3. Configure Environment Variables

**Server (`server/.env`):**
```env
PORT=5000
NODE_ENV=development
DB_USER=postgres
DB_HOST=localhost
DB_NAME=thinkflow
DB_PASSWORD=postgres
DB_PORT=5432
JWT_SECRET=your-secret-key-change-in-production
FRONTEND_URL=http://localhost:3000

# Optional: Email configuration for verification and password reset
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
```

**Client (`client/.env.local`):**
```env
NEXT_PUBLIC_API_URL=http://localhost:5000/api
```

### 4. Initialize Database Schema

The database schema will be automatically created when you start the server for the first time. The schema file is located at `database/schema.sql`.

### 5. Run the Application

**Option 1: Run both frontend and backend together (Recommended)**
```bash
npm run dev
```

**Option 2: Run separately**

Terminal 1 - Backend:
```bash
cd server
npm run dev
```

Terminal 2 - Frontend:
```bash
cd client
npm run dev
```

The application will be available at:
- Frontend: http://localhost:3000
- Backend API: http://localhost:5000
- Health Check: http://localhost:5000/health

## First Steps

1. Visit http://localhost:3000
2. Click "Sign Up" to create an account
3. After registration, you'll be redirected to the dashboard
4. Browse problems and start solving!

## Troubleshooting

**Database Connection Errors:**
- Ensure PostgreSQL is running: `pg_isready`
- Verify database credentials in `server/.env`
- Check if the database exists: `psql -l | grep thinkflow`

**Port Already in Use:**
- Change PORT in `server/.env`
- Update NEXT_PUBLIC_API_URL in `client/.env.local` accordingly

**CORS Errors:**
- Ensure FRONTEND_URL in `server/.env` matches your frontend URL
- Check that NEXT_PUBLIC_API_URL in `client/.env.local` matches your backend URL

**Module Not Found Errors:**
- Run `npm install` in both `client` and `server` directories
- Delete `node_modules` and `package-lock.json`, then reinstall

## Production Deployment

1. Set `NODE_ENV=production` in server `.env`
2. Use a strong `JWT_SECRET`
3. Configure proper database credentials
4. Set up SSL for PostgreSQL
5. Build the frontend: `cd client && npm run build`
6. Use a process manager like PM2 for the backend
