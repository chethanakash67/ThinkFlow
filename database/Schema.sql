-- ThinkFlow PostgreSQL Database Schema
-- UPDATED: Added OTP fields for signup/password reset flow

-- Users Table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'user' CHECK(role IN ('user', 'admin')),
  email_verified BOOLEAN DEFAULT FALSE,
  
  -- OTP fields (ADDED)
  otp_code VARCHAR(6),
  otp_expires TIMESTAMP,
  otp_type VARCHAR(50) CHECK(otp_type IN ('signup', 'forgot-password')),
  
  -- Legacy fields (kept for compatibility)
  email_verification_token VARCHAR(255),
  password_reset_token VARCHAR(255),
  password_reset_expires TIMESTAMP,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Problems Table
CREATE TABLE IF NOT EXISTS problems (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  difficulty VARCHAR(50) NOT NULL CHECK(difficulty IN ('easy', 'medium', 'hard')),
  test_cases JSONB NOT NULL,
  expected_outputs JSONB NOT NULL,
  constraints TEXT,
  examples JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Logic Submissions Table
CREATE TABLE IF NOT EXISTS logic_submissions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  problem_id INTEGER NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
  logic_steps JSONB NOT NULL,
  status VARCHAR(50) DEFAULT 'pending' CHECK(status IN ('pending', 'correct', 'partially_correct', 'incorrect')),
  feedback TEXT,
  score INTEGER DEFAULT 0,
  version INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Code Submissions Table
CREATE TABLE IF NOT EXISTS code_submissions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  problem_id INTEGER NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
  logic_submission_id INTEGER REFERENCES logic_submissions(id) ON DELETE SET NULL,
  code TEXT NOT NULL,
  language VARCHAR(50) DEFAULT 'javascript',
  status VARCHAR(50) DEFAULT 'pending' CHECK(status IN ('pending', 'correct', 'incorrect', 'error')),
  execution_result TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Execution Steps Table (for step-by-step visualization)
CREATE TABLE IF NOT EXISTS execution_steps (
  id SERIAL PRIMARY KEY,
  logic_submission_id INTEGER NOT NULL REFERENCES logic_submissions(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL,
  step_description TEXT NOT NULL,
  variables_state JSONB,
  condition_result BOOLEAN,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_otp ON users(otp_code, otp_expires) WHERE otp_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_problems_difficulty ON problems(difficulty);
CREATE INDEX IF NOT EXISTS idx_logic_submissions_user ON logic_submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_logic_submissions_problem ON logic_submissions(problem_id);
CREATE INDEX IF NOT EXISTS idx_code_submissions_user ON code_submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_code_submissions_problem ON code_submissions(problem_id);
CREATE INDEX IF NOT EXISTS idx_execution_steps_submission ON execution_steps(logic_submission_id);