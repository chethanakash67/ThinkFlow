# ThinkFlow Architecture Documentation

## ✅ Backend Error Fixed

**Root Cause:** The `errorHandler` middleware was exported as an object `{ errorHandler, notFound }` but imported directly, causing `app.use()` to receive an object instead of a function.

**Solution:** Changed import to destructure: `const { errorHandler, notFound } = require('../middleware/errorHandler')`

## 🏗️ Backend Architecture (Clean & Scalable)

### New Structure

```
server/
├── src/
│   ├── config/
│   │   └── db.js              # PostgreSQL connection & initialization
│   ├── controllers/
│   │   └── auth.controller.js # Authentication logic (signup/signin)
│   ├── routes/
│   │   └── auth.routes.js     # Auth route definitions
│   ├── middlewares/
│   │   └── auth.middleware.js # JWT verification & protection
│   ├── app.js                 # Express app configuration
│   └── server.js               # Server entry point
├── .env.example               # Environment variables template
└── package.json
```

### Key Files Explained

#### `src/config/db.js`
- **Purpose:** Centralized database configuration
- **Exports:** `pool`, `query`, `init`
- **Features:**
  - PostgreSQL connection pooling
  - Query helper with logging
  - Schema initialization
  - Error handling

#### `src/middlewares/auth.middleware.js`
- **Purpose:** JWT authentication and authorization
- **Exports:**
  - `authenticateToken` - Verifies JWT and attaches user to request
  - `requireAdmin` - Checks admin role
  - `generateToken` - Creates JWT tokens
- **Why:** Separation of concerns - authentication logic isolated from controllers

#### `src/controllers/auth.controller.js`
- **Purpose:** Handle authentication business logic
- **Endpoints:**
  - `POST /api/auth/signup` - User registration
  - `POST /api/auth/signin` - User login
  - `GET /api/auth/me` - Get current user (protected)
- **Features:**
  - Password hashing with bcrypt (10 rounds)
  - Email verification support
  - Password reset functionality
  - Input validation

#### `src/routes/auth.routes.js`
- **Purpose:** Define authentication routes
- **Why:** Route definitions separated from logic (MVC pattern)
- **Validation:** Uses express-validator for input validation

#### `src/app.js`
- **Purpose:** Express application setup
- **Why:** Separates app configuration from server startup
- **Features:**
  - CORS configuration
  - Body parser middleware
  - Route mounting
  - Error handling setup

#### `src/server.js`
- **Purpose:** Server entry point
- **Why:** Minimal entry point - just starts the server
- **Features:**
  - Database initialization
  - Server startup
  - Error handling

## 🔐 Authentication Implementation

### Backend Auth Flow

1. **Signup:**
   ```
   POST /api/auth/signup
   → Validate input (express-validator)
   → Check if user exists
   → Hash password (bcrypt, 10 rounds)
   → Create user in database
   → Generate JWT token
   → Return token + user data
   ```

2. **Signin:**
   ```
   POST /api/auth/signin
   → Validate input
   → Find user by email
   → Compare password (bcrypt.compare)
   → Generate JWT token
   → Return token + user data
   ```

3. **Protected Routes:**
   ```
   GET /api/auth/me
   → authenticateToken middleware
   → Extract token from Authorization header
   → Verify JWT
   → Fetch user from database
   → Attach to req.user
   → Controller returns user data
   ```

### JWT Token Structure
- **Payload:** `{ userId: number }`
- **Expiration:** 7 days
- **Storage:** HTTP-only cookies (frontend) or localStorage
- **Header Format:** `Authorization: Bearer <token>`

### Password Security
- **Hashing:** bcrypt with 10 salt rounds
- **Validation:** Minimum 8 characters, requires uppercase, lowercase, and number
- **Storage:** Never store plain text passwords

## 🎨 Frontend Architecture

### Structure

```
client/
├── app/                      # Next.js App Router
│   ├── page.tsx             # Landing page (SaaS-style)
│   ├── signin/              # Sign in page
│   ├── signup/              # Sign up page
│   ├── dashboard/           # User dashboard
│   └── problems/            # Problem pages
├── components/
│   └── ProtectedRoute.tsx   # Auth wrapper component
├── context/
│   └── auth.context.tsx     # Auth state management
├── lib/
│   ├── api.ts               # Axios client with interceptors
│   └── auth.ts              # Auth utility functions
└── .env.example
```

### Key Components

#### `context/auth.context.tsx`
- **Purpose:** Global authentication state
- **Features:**
  - User state management
  - Login/register/logout methods
  - Auto-check authentication on mount
  - Loading states
- **Why:** Centralized auth state prevents prop drilling

#### `lib/api.ts`
- **Purpose:** HTTP client configuration
- **Features:**
  - Automatic token injection
  - Request/response interceptors
  - Error handling (401 redirects)
- **Why:** Single source of truth for API calls

#### `components/ProtectedRoute.tsx`
- **Purpose:** Protect routes that require authentication
- **Features:**
  - Checks auth status
  - Redirects to signin if not authenticated
  - Loading state
- **Why:** Reusable component for protected pages

## 📝 Environment Variables

### Backend (`server/.env`)
```env
PORT=5000
NODE_ENV=development
DB_USER=postgres
DB_HOST=localhost
DB_NAME=thinkflow
DB_PASSWORD=postgres
DB_PORT=5432
JWT_SECRET=your-super-secret-key-change-in-production
FRONTEND_URL=http://localhost:3000
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
```

### Frontend (`client/.env.local`)
```env
NEXT_PUBLIC_API_URL=http://localhost:5000/api
```

**Important:** Never commit `.env` files. Use `.env.example` as templates.

## 🎯 API Endpoints

### Authentication
- `POST /api/auth/signup` - Register new user
- `POST /api/auth/signin` - Login user
- `GET /api/auth/me` - Get current user (protected)
- `GET /api/auth/verify-email` - Verify email
- `POST /api/auth/forgot-password` - Request password reset
- `POST /api/auth/reset-password` - Reset password

### Response Format
```json
{
  "success": true,
  "message": "Operation successful",
  "token": "jwt-token-here",
  "user": {
    "id": 1,
    "name": "John Doe",
    "email": "john@example.com",
    "role": "user",
    "emailVerified": false
  }
}
```

## 🔒 Security Best Practices

1. **Password Hashing:** bcrypt with 10 salt rounds
2. **JWT Tokens:** 7-day expiration, secure secret
3. **Input Validation:** express-validator on all inputs
4. **SQL Injection:** Parameterized queries (pg library)
5. **CORS:** Configured for specific origin
6. **Error Handling:** No sensitive info in error messages
7. **Token Storage:** Secure HTTP-only cookies (recommended)

## 🚀 Running the Application

1. **Install dependencies:**
   ```bash
   npm install
   cd server && npm install && cd ..
   cd client && npm install && cd ..
   ```

2. **Set up environment:**
   - Copy `server/.env.example` to `server/.env`
   - Copy `client/.env.example` to `client/.env.local`
   - Update values

3. **Start PostgreSQL:**
   ```bash
   createdb thinkflow
   ```

4. **Run the app:**
   ```bash
   npm run dev
   ```

## 📊 Database Schema

See `database/schema.sql` for complete schema. Main tables:
- `users` - User accounts
- `problems` - Coding problems
- `logic_submissions` - Logic evaluations
- `code_submissions` - Code submissions
- `execution_steps` - Step-by-step visualization

## 🎨 Frontend Features

### Landing Page
- Professional SaaS-style design
- Hero section with CTA
- Features grid
- How it works section
- Why ThinkFlow section
- Footer with links
- Fully responsive

### Sign In/Sign Up Pages
- Clean, modern design
- Form validation
- Password requirements display
- Loading states
- Error handling
- Password visibility toggle
- Responsive design

## 🏆 Code Quality

- **Separation of Concerns:** Controllers, routes, middleware separated
- **Error Handling:** Consistent error responses
- **Type Safety:** TypeScript on frontend
- **Validation:** Input validation on all endpoints
- **Documentation:** Comments explaining why, not just what
- **Consistency:** Naming conventions followed
- **Security:** Best practices implemented

## 🔄 Migration Notes

Old routes (`/api/auth/register`, `/api/auth/login`) still work for backward compatibility, but new routes (`/api/auth/signup`, `/api/auth/signin`) are recommended.

All database queries now use the centralized `query` function from `src/config/db.js`.
