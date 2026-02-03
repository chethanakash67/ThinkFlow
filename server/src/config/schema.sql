-- ThinkFlow PostgreSQL Database Schema-- ThinkFlow PostgreSQL Database Schema

-- COMPLETE: Includes OTP fields, all tables, indexes, and seed data-- UPDATED: Added OTP fields for signup/password reset flow



-- ============================================================================-- Users Table

-- TABLESCREATE TABLE IF NOT EXISTS users (

-- ============================================================================  id SERIAL PRIMARY KEY,

  name VARCHAR(255) NOT NULL,

-- Users Table  email VARCHAR(255) UNIQUE NOT NULL,

CREATE TABLE IF NOT EXISTS users (  password_hash VARCHAR(255) NOT NULL,

  id SERIAL PRIMARY KEY,  role VARCHAR(50) DEFAULT 'user' CHECK(role IN ('user', 'admin')),

  name VARCHAR(255) NOT NULL,  email_verified BOOLEAN DEFAULT FALSE,

  email VARCHAR(255) UNIQUE NOT NULL,  

  password_hash VARCHAR(255) NOT NULL,  -- OTP fields (ADDED)

  role VARCHAR(50) DEFAULT 'user' CHECK(role IN ('user', 'admin')),  otp_code VARCHAR(6),

  email_verified BOOLEAN DEFAULT FALSE,  otp_expires TIMESTAMP,

    otp_type VARCHAR(50) CHECK(otp_type IN ('signup', 'forgot-password')),

  -- OTP fields for signup/password reset  

  otp_code VARCHAR(6),  -- Legacy fields (kept for compatibility)

  otp_expires TIMESTAMP,  email_verification_token VARCHAR(255),

  otp_type VARCHAR(50) CHECK(otp_type IN ('signup', 'forgot-password')),  password_reset_token VARCHAR(255),

    password_reset_expires TIMESTAMP,

  -- Legacy fields (kept for compatibility)  

  email_verification_token VARCHAR(255),  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  password_reset_token VARCHAR(255),  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP

  password_reset_expires TIMESTAMP,);

  

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,-- Problems Table

  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMPCREATE TABLE IF NOT EXISTS problems (

);  id SERIAL PRIMARY KEY,

  title VARCHAR(255) NOT NULL,

-- Problems Table  description TEXT NOT NULL,

CREATE TABLE IF NOT EXISTS problems (  difficulty VARCHAR(50) NOT NULL CHECK(difficulty IN ('easy', 'medium', 'hard')),

  id SERIAL PRIMARY KEY,  test_cases JSONB NOT NULL,

  title VARCHAR(255) NOT NULL,  expected_outputs JSONB NOT NULL,

  description TEXT NOT NULL,  constraints TEXT,

  difficulty VARCHAR(50) NOT NULL CHECK(difficulty IN ('easy', 'medium', 'hard')),  examples JSONB,

  test_cases JSONB NOT NULL,  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  expected_outputs JSONB NOT NULL,  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP

  constraints TEXT,);

  examples JSONB,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,-- Logic Submissions Table

  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMPCREATE TABLE IF NOT EXISTS logic_submissions (

);  id SERIAL PRIMARY KEY,

  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

-- Logic Submissions Table  problem_id INTEGER NOT NULL REFERENCES problems(id) ON DELETE CASCADE,

CREATE TABLE IF NOT EXISTS logic_submissions (  logic_steps JSONB NOT NULL,

  id SERIAL PRIMARY KEY,  status VARCHAR(50) DEFAULT 'pending' CHECK(status IN ('pending', 'correct', 'partially_correct', 'incorrect')),

  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,  feedback TEXT,

  problem_id INTEGER NOT NULL REFERENCES problems(id) ON DELETE CASCADE,  score INTEGER DEFAULT 0,

  logic_steps JSONB NOT NULL,  version INTEGER DEFAULT 1,

  status VARCHAR(50) DEFAULT 'pending' CHECK(status IN ('pending', 'correct', 'partially_correct', 'incorrect')),  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  feedback TEXT,  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP

  score INTEGER DEFAULT 0,);

  version INTEGER DEFAULT 1,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,-- Code Submissions Table

  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMPCREATE TABLE IF NOT EXISTS code_submissions (

);  id SERIAL PRIMARY KEY,

  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

-- Code Submissions Table  problem_id INTEGER NOT NULL REFERENCES problems(id) ON DELETE CASCADE,

CREATE TABLE IF NOT EXISTS code_submissions (  logic_submission_id INTEGER REFERENCES logic_submissions(id) ON DELETE SET NULL,

  id SERIAL PRIMARY KEY,  code TEXT NOT NULL,

  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,  language VARCHAR(50) DEFAULT 'javascript',

  problem_id INTEGER NOT NULL REFERENCES problems(id) ON DELETE CASCADE,  status VARCHAR(50) DEFAULT 'pending' CHECK(status IN ('pending', 'correct', 'incorrect', 'error')),

  logic_submission_id INTEGER REFERENCES logic_submissions(id) ON DELETE SET NULL,  execution_result TEXT,

  code TEXT NOT NULL,  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  language VARCHAR(50) DEFAULT 'javascript',  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP

  status VARCHAR(50) DEFAULT 'pending' CHECK(status IN ('pending', 'correct', 'partially_correct', 'incorrect', 'error')),);

  execution_result TEXT,

  test_results JSONB,-- Execution Steps Table (for step-by-step visualization)

  execution_time INTEGER DEFAULT 0,CREATE TABLE IF NOT EXISTS execution_steps (

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,  id SERIAL PRIMARY KEY,

  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP  logic_submission_id INTEGER NOT NULL REFERENCES logic_submissions(id) ON DELETE CASCADE,

);  step_number INTEGER NOT NULL,

  step_description TEXT NOT NULL,

-- Execution Steps Table (for step-by-step visualization)  variables_state JSONB,

CREATE TABLE IF NOT EXISTS execution_steps (  condition_result BOOLEAN,

  id SERIAL PRIMARY KEY,  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP

  logic_submission_id INTEGER NOT NULL REFERENCES logic_submissions(id) ON DELETE CASCADE,);

  step_number INTEGER NOT NULL,

  step_description TEXT NOT NULL,-- Indexes for better performance

  variables_state JSONB,CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

  condition_result BOOLEAN,CREATE INDEX IF NOT EXISTS idx_users_otp ON users(otp_code, otp_expires) WHERE otp_code IS NOT NULL;

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMPCREATE INDEX IF NOT EXISTS idx_problems_difficulty ON problems(difficulty);

);CREATE INDEX IF NOT EXISTS idx_logic_submissions_user ON logic_submissions(user_id);

CREATE INDEX IF NOT EXISTS idx_logic_submissions_problem ON logic_submissions(problem_id);

-- Pending Registrations Table (for OTP flow)CREATE INDEX IF NOT EXISTS idx_code_submissions_user ON code_submissions(user_id);

CREATE TABLE IF NOT EXISTS pending_registrations (CREATE INDEX IF NOT EXISTS idx_code_submissions_problem ON code_submissions(problem_id);

  id SERIAL PRIMARY KEY,CREATE INDEX IF NOT EXISTS idx_execution_steps_submission ON execution_steps(logic_submission_id);
  full_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  otp VARCHAR(6) NOT NULL,
  otp_expiry TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_otp ON users(otp_code, otp_expires) WHERE otp_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_problems_difficulty ON problems(difficulty);
CREATE INDEX IF NOT EXISTS idx_logic_submissions_user ON logic_submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_logic_submissions_problem ON logic_submissions(problem_id);
CREATE INDEX IF NOT EXISTS idx_code_submissions_user ON code_submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_code_submissions_problem ON code_submissions(problem_id);
CREATE INDEX IF NOT EXISTS idx_execution_steps_submission ON execution_steps(logic_submission_id);

-- ============================================================================
-- SEED DATA: Sample Problems
-- ============================================================================

-- Problem 1: Two Sum (Easy)
INSERT INTO problems (title, description, difficulty, test_cases, expected_outputs, constraints, examples)
VALUES (
  'Two Sum',
  'Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.

You may assume that each input would have exactly one solution, and you may not use the same element twice.

You can return the answer in any order.',
  'easy',
  '[
    {"input": {"nums": [2,7,11,15], "target": 9}},
    {"input": {"nums": [3,2,4], "target": 6}},
    {"input": {"nums": [3,3], "target": 6}}
  ]'::jsonb,
  '[
    {"output": [0,1]},
    {"output": [1,2]},
    {"output": [0,1]}
  ]'::jsonb,
  '• 2 <= nums.length <= 104
• -109 <= nums[i] <= 109
• -109 <= target <= 109
• Only one valid answer exists.',
  '[
    {"input": {"nums": [2,7,11,15], "target": 9}, "output": [0,1], "explanation": "Because nums[0] + nums[1] == 9, we return [0, 1]."},
    {"input": {"nums": [3,2,4], "target": 6}, "output": [1,2], "explanation": "Because nums[1] + nums[2] == 6, we return [1, 2]."}
  ]'::jsonb
)
ON CONFLICT DO NOTHING;

-- Problem 2: Reverse String (Easy)
INSERT INTO problems (title, description, difficulty, test_cases, expected_outputs, constraints, examples)
VALUES (
  'Reverse String',
  'Write a function that reverses a string. The input string is given as an array of characters s.

You must do this by modifying the input array in-place with O(1) extra memory.',
  'easy',
  '[
    {"input": {"s": ["h","e","l","l","o"]}},
    {"input": {"s": ["H","a","n","n","a","h"]}},
    {"input": {"s": ["A"," ","m","a","n"]}}
  ]'::jsonb,
  '[
    {"output": ["o","l","l","e","h"]},
    {"output": ["h","a","n","n","a","H"]},
    {"output": ["n","a","m"," ","A"]}
  ]'::jsonb,
  '• 1 <= s.length <= 105
• s[i] is a printable ascii character.',
  '[
    {"input": {"s": ["h","e","l","l","o"]}, "output": ["o","l","l","e","h"], "explanation": "Reverse the characters in the array."},
    {"input": {"s": ["H","a","n","n","a","h"]}, "output": ["h","a","n","n","a","H"], "explanation": "Reverse the string Hannah."}
  ]'::jsonb
)
ON CONFLICT DO NOTHING;

-- Problem 3: Valid Palindrome (Easy)
INSERT INTO problems (title, description, difficulty, test_cases, expected_outputs, constraints, examples)
VALUES (
  'Valid Palindrome',
  'A phrase is a palindrome if, after converting all uppercase letters into lowercase letters and removing all non-alphanumeric characters, it reads the same forward and backward. Alphanumeric characters include letters and numbers.

Given a string s, return true if it is a palindrome, or false otherwise.',
  'easy',
  '[
    {"input": {"s": "A man, a plan, a canal: Panama"}},
    {"input": {"s": "race a car"}},
    {"input": {"s": " "}}
  ]'::jsonb,
  '[
    {"output": true},
    {"output": false},
    {"output": true}
  ]'::jsonb,
  '• 1 <= s.length <= 2 * 105
• s consists only of printable ASCII characters.',
  '[
    {"input": {"s": "A man, a plan, a canal: Panama"}, "output": true, "explanation": "After processing, it becomes amanaplanacanalpanama which is a palindrome."},
    {"input": {"s": "race a car"}, "output": false, "explanation": "After processing, it becomes raceacar which is not a palindrome."}
  ]'::jsonb
)
ON CONFLICT DO NOTHING;

-- Problem 4: Maximum Subarray (Medium)
INSERT INTO problems (title, description, difficulty, test_cases, expected_outputs, constraints, examples)
VALUES (
  'Maximum Subarray',
  'Given an integer array nums, find the subarray with the largest sum, and return its sum.

A subarray is a contiguous part of an array.',
  'medium',
  '[
    {"input": {"nums": [-2,1,-3,4,-1,2,1,-5,4]}},
    {"input": {"nums": [1]}},
    {"input": {"nums": [5,4,-1,7,8]}}
  ]'::jsonb,
  '[
    {"output": 6},
    {"output": 1},
    {"output": 23}
  ]'::jsonb,
  '• 1 <= nums.length <= 105
• -104 <= nums[i] <= 104',
  '[
    {"input": {"nums": [-2,1,-3,4,-1,2,1,-5,4]}, "output": 6, "explanation": "The subarray [4,-1,2,1] has the largest sum 6."},
    {"input": {"nums": [1]}, "output": 1, "explanation": "The subarray [1] has the largest sum 1."}
  ]'::jsonb
)
ON CONFLICT DO NOTHING;

-- Problem 5: Merge Intervals (Medium)
INSERT INTO problems (title, description, difficulty, test_cases, expected_outputs, constraints, examples)
VALUES (
  'Merge Intervals',
  'Given an array of intervals where intervals[i] = [starti, endi], merge all overlapping intervals, and return an array of the non-overlapping intervals that cover all the intervals in the input.',
  'medium',
  '[
    {"input": {"intervals": [[1,3],[2,6],[8,10],[15,18]]}},
    {"input": {"intervals": [[1,4],[4,5]]}},
    {"input": {"intervals": [[1,4],[0,4]]}}
  ]'::jsonb,
  '[
    {"output": [[1,6],[8,10],[15,18]]},
    {"output": [[1,5]]},
    {"output": [[0,4]]}
  ]'::jsonb,
  '• 1 <= intervals.length <= 104
• intervals[i].length == 2
• 0 <= starti <= endi <= 104',
  '[
    {"input": {"intervals": [[1,3],[2,6],[8,10],[15,18]]}, "output": [[1,6],[8,10],[15,18]], "explanation": "Since intervals [1,3] and [2,6] overlap, merge them into [1,6]."},
    {"input": {"intervals": [[1,4],[4,5]]}, "output": [[1,5]], "explanation": "Intervals [1,4] and [4,5] are considered overlapping."}
  ]'::jsonb
)
ON CONFLICT DO NOTHING;
