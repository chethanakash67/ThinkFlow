# ThinkFlow

An AI-assisted coding practice platform that helps beginners develop correct algorithmic thinking before writing source code.

## Overview

ThinkFlow is a web application that emphasizes logic-first coding. Users express solution logic using structured natural language input fields. The system evaluates logic correctness using AI, provides conceptual feedback, and visualizes step-by-step execution. Users may write code at any stage, but logic correctness is the primary evaluation metric.

## Features

### 🎯 Logic-First Approach
- Express solutions using structured logic steps
- Focus on algorithmic thinking before coding
- No free-form English logic - structured input only

### 🤖 AI-Powered Semantic Evaluation ⚡ NEW!
- **Gemini AI** integration for intelligent logic evaluation
- Understands **meaning**, not just exact text matching
- Different grammar/wording accepted if logic is correct
- Instant feedback on logic correctness
- Conceptual suggestions without full solution spoilers
- Detects missing steps, incorrect conditions, and edge-case failures

### 📊 Step-by-Step Visualization
- Visualize logic execution step-by-step
- See variable states and condition evaluations
- Understand algorithm flow

### 💡 AI Assistance
- Get hints and suggestions when stuck
- Problem-specific guidance
- Multiple difficulty-based approaches

### 💻 Code Editor Integration
- Write code anytime using Monaco editor
- Support for multiple programming languages
- Logic correctness remains the primary metric

### 📈 Progress Tracking
- Track logic versions and improvements
- View submission history
- Monitor scores and feedback

### 🔐 Secure Authentication
- JWT-based authentication
- Password hashing with bcrypt
- Email verification and password reset (optional)

## Tech Stack

### Frontend
- **Next.js 14** - React framework with App Router
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **Monaco Editor** - Code editor
- **Axios** - HTTP client
- **React Icons** - Icon library

### Backend
- **Node.js** - Runtime
- **Express.js** - Web framework
- **PostgreSQL** - Database
- **JWT** - Authentication
- **bcrypt** - Password hashing
- **express-validator** - Input validation

## Server Encryption

ThinkFlow now encrypts sensitive user data at rest on the backend.

Encrypted at rest:
- `users.email`
- `users.bio`
- `users.country`
- `users.github_url`
- competition request contact fields such as creator email, phone, and organization

Lookup-safe hashing:
- email lookups use a deterministic SHA-256 hash column such as `users.email_sha256`
- this keeps login/signup/reset flows queryable without storing readable emails in plaintext

How it works:
- AES-256-GCM encryption and OTP hashing live in [server/src/utils/secureData.js](./server/src/utils/secureData.js)
- encrypted values are stored in `*_encrypted` columns
- plaintext source columns are nulled during migration after encrypted copies are verified
- backup tables keep encrypted backups for migration safety

Required env vars:
- `FIELD_ENCRYPTION_KEY`
- `JWT_SECRET`
- database connection vars such as `DATABASE_URL` or `DB_*`

Important:
- all backend instances must share the exact same `FIELD_ENCRYPTION_KEY`
- the server will refuse to boot if `FIELD_ENCRYPTION_KEY` or `APP_ENCRYPTION_KEY` is missing or too short
- generate a strong local key with:

```bash
openssl rand -base64 32
```

Rotation:
- use `server/scripts/rotateEncryptionKey.js`
- run it with both keys present:

```bash
cd server
OLD_FIELD_ENCRYPTION_KEY="old-key" NEW_FIELD_ENCRYPTION_KEY="new-key" node scripts/rotateEncryptionKey.js
```

Deployment notes:
- set `FIELD_ENCRYPTION_KEY` in Render before deploying
- deploy all server instances with the same key
- never log or return the encryption key in responses

## Project Structure

```
thinkflow/
├── client/                      # Next.js frontend
│   ├── app/                     # App router pages
│   │   ├── page.tsx            # Landing page
│   │   ├── login/              # Login page
│   │   ├── signup/             # Signup page
│   │   ├── dashboard/          # User dashboard
│   │   └── problems/           # Problem pages
│   ├── components/             # React components
│   │   └── ProtectedRoute.tsx # Auth wrapper
│   ├── lib/                    # Utilities
│   │   ├── api.ts             # API client
│   │   └── auth.ts            # Auth utilities
│   └── package.json
│
├── server/                      # Node.js backend
│   ├── src/
│   │   └── server.js          # Express app entry
│   ├── controllers/           # Request handlers
│   │   ├── authController.js
│   │   ├── problemController.js
│   │   └── submissionController.js
│   ├── models/                # Database models
│   │   └── database.js        # PostgreSQL setup
│   ├── routes/                # API routes
│   │   ├── authRoutes.js
│   │   ├── problemRoutes.js
│   │   └── submissionRoutes.js
│   ├── services/              # Business logic
│   │   └── logicEvaluationService.js
│   ├── middleware/            # Express middleware
│   │   ├── auth.js           # JWT authentication
│   │   └── errorHandler.js   # Error handling
│   └── package.json
│
├── database/                   # Database files
│   └── schema.sql            # PostgreSQL schema
│
└── package.json               # Root package.json
```

## Getting Started

See [SETUP.md](./SETUP.md) for detailed installation and setup instructions.

### ⚠️ Important: AI Evaluation Setup

**To enable intelligent semantic logic evaluation, you MUST set up Gemini AI:**

📖 See [GEMINI_SETUP.md](./GEMINI_SETUP.md) for step-by-step instructions to get your FREE API key.

Without the API key, the system will use basic fallback evaluation (less accurate).

### Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   cd client && npm install && cd ..
   cd server && npm install && cd ..
   ```

2. **Set up PostgreSQL database:**
   ```bash
   createdb thinkflow
   ```

3. **Configure environment variables:**
   - Copy `server/.env.example` to `server/.env` and update values
   - Generate and set `FIELD_ENCRYPTION_KEY` with `openssl rand -base64 32`
   - **Add your GEMINI_API_KEY** (see GEMINI_SETUP.md)
   - Copy `client/.env.local.example` to `client/.env.local` and update values

4. **Run the application:**
```bash
npm run dev
```

5. **Visit http://localhost:3000**

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user (protected)
- `GET /api/auth/verify-email` - Verify email
- `POST /api/auth/forgot-password` - Request password reset
- `POST /api/auth/reset-password` - Reset password

### Problems
- `GET /api/problems` - Get all problems (with optional difficulty filter)
- `GET /api/problems/:id` - Get problem by ID
- `POST /api/problems` - Create problem (admin only)
- `PUT /api/problems/:id` - Update problem (admin only)
- `DELETE /api/problems/:id` - Delete problem (admin only)

### Submissions
- `POST /api/submissions/logic` - Submit logic for evaluation (protected)
- `GET /api/submissions/logic` - Get user's submissions (protected)
- `GET /api/submissions/logic/:submissionId/steps` - Get execution steps (protected)
- `POST /api/submissions/code` - Submit code (protected)
- `GET /api/submissions/dashboard` - Get dashboard stats (protected)

## Key Features Explained

### Structured Logic Input
Users break down solutions into structured steps with types:
- **Input Processing**: How input is received and parsed
- **Processing Step**: Core logic operations
- **Condition Check**: Decision points and branching
- **Output Generation**: Result formatting

### Logic Evaluation
The AI evaluation service:
- Validates logic structure
- Checks test case coverage
- Identifies missing steps
- Detects incorrect conditions
- Provides actionable feedback

### Security
- Password hashing with bcrypt (10 rounds)
- JWT tokens with 7-day expiration
- Protected routes with authentication middleware
- Input validation and sanitization
- Role-based access control (user/admin)

## Constraints

- **No free-form English logic** - Structured input fields only
- **No auto-generated solutions** - AI only evaluates, doesn't generate
- **Explainable evaluation** - Feedback is clear and educational
- **Logic-first** - Code is optional, logic correctness is primary

## Development

### Running in Development Mode

```bash
# Run both frontend and backend
npm run dev

# Or run separately
npm run dev:client  # Frontend on :3000
npm run dev:server  # Backend on :5000
```

### Building for Production

```bash
# Build frontend
cd client
npm run build
npm start

# Run backend
cd server
npm start
```

## Database Schema

The application uses PostgreSQL with the following main tables:
- `users` - User accounts and authentication
- `problems` - Coding problems with test cases
- `logic_submissions` - User logic submissions and evaluations
- `code_submissions` - User code submissions
- `execution_steps` - Step-by-step execution visualization data

See `database/schema.sql` for the complete schema.

## License

MIT

## Support

For setup issues, see [SETUP.md](./SETUP.md). For other questions, please create an issue in the project repository.
