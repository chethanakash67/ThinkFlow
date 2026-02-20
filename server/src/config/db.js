/**
 * Database Configuration
 * Handles PostgreSQL connection and initialization
 */
const { Pool, Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Database configuration from environment
// Support both DATABASE_URL (Render/Heroku style) and individual variables
let dbConfig;

if (process.env.DATABASE_URL) {
  // Parse DATABASE_URL for production environments like Render
  const url = new URL(process.env.DATABASE_URL);
  dbConfig = {
    user: url.username,
    host: url.hostname,
    database: url.pathname.slice(1), // Remove leading '/'
    password: url.password,
    port: parseInt(url.port) || 5432,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  };
} else {
  // Use individual environment variables for local development
  dbConfig = {
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'thinkflow',
    password: process.env.DB_PASSWORD || 'postgres',
    port: parseInt(process.env.DB_PORT) || 5432
  };
}

let pool = null;

/**
 * Check if PostgreSQL service is running and database exists
 * Creates the database if it doesn't exist
 */
const ensureDatabaseExists = async () => {
  // Skip database creation in production (Render provides the database)
  if (process.env.DATABASE_URL || process.env.NODE_ENV === 'production') {
    console.log('✅ Using existing database (production mode)');
    return;
  }

  // Connect to default 'postgres' database to check/create our database
  const adminClient = new Client({
    user: dbConfig.user,
    host: dbConfig.host,
    password: dbConfig.password,
    port: dbConfig.port,
    database: 'postgres', // Connect to default database
    ssl: dbConfig.ssl
  });

  try {
    await adminClient.connect();
    console.log('✅ Connected to PostgreSQL server');

    // Check if database exists
    const dbCheckResult = await adminClient.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [dbConfig.database]
    );

    if (dbCheckResult.rows.length === 0) {
      // Database doesn't exist, create it
      console.log(`📦 Creating database "${dbConfig.database}"...`);
      await adminClient.query(`CREATE DATABASE "${dbConfig.database}"`);
      console.log(`✅ Database "${dbConfig.database}" created successfully`);
    } else {
      console.log(`✅ Database "${dbConfig.database}" already exists`);
    }

    await adminClient.end();
  } catch (error) {
    await adminClient.end().catch(() => {});
    
    // Provide helpful error messages
    if (error.code === 'ECONNREFUSED') {
      throw new Error(
        `❌ Cannot connect to PostgreSQL server at ${dbConfig.host}:${dbConfig.port}.\n` +
        `   Make sure PostgreSQL is running: brew services start postgresql (macOS) or sudo systemctl start postgresql (Linux)`
      );
    }
    
    if (error.code === '28P01') {
      throw new Error(
        `❌ Authentication failed for user "${dbConfig.user}".\n` +
        `   Check DB_USER and DB_PASSWORD in your .env file`
      );
    }

    if (error.code === '3D000') {
      throw new Error(
        `❌ Cannot connect to default "postgres" database.\n` +
        `   This usually means PostgreSQL is not properly installed or the default database was deleted.`
      );
    }

    throw new Error(
      `❌ Failed to ensure database exists: ${error.message}\n` +
      `   Error code: ${error.code}`
    );
  }
};

/**
 * Create connection pool to the target database
 */
const createPool = () => {
  if (pool) {
    return pool;
  }

  pool = new Pool({
    user: dbConfig.user,
    host: dbConfig.host,
    database: dbConfig.database,
    password: dbConfig.password,
    port: dbConfig.port,
    ssl: dbConfig.ssl,
    // Connection pool settings - increased for Render cold starts
    max: 20, // Maximum number of clients in the pool
    idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
    connectionTimeoutMillis: 15000, // 15 seconds for Render cold start
  });

  // Handle pool errors
  pool.on('error', (err) => {
    console.error('❌ Unexpected error on idle client', err);
    // Don't exit process on pool errors, let the application handle it
  });

  // Log successful connections
  pool.on('connect', (client) => {
    console.log(`✅ Connected to database "${dbConfig.database}"`);
  });

  return pool;
};

/**
 * Test database connection
 */
const testConnection = async () => {
  try {
    const testPool = createPool();
    const result = await testPool.query('SELECT NOW()');
    console.log(`✅ Database connection test successful (Server time: ${result.rows[0].now})`);
    return true;
  } catch (error) {
    console.error('❌ Database connection test failed:', error.message);
    throw error;
  }
};

/**
 * Check if a table exists using PostgreSQL's to_regclass function
 * This is safer than querying information_schema
 */
const tableExists = async (tableName, schema = 'public') => {
  try {
    const dbPool = createPool();
    const result = await dbPool.query(
      `SELECT to_regclass($1) IS NOT NULL AS exists`,
      [`${schema}.${tableName}`]
    );
    return result.rows[0].exists;
  } catch (error) {
    console.error(`Error checking if table ${tableName} exists:`, error.message);
    return false;
  }
};

/**
 * Parse SQL schema file into individual statements
 * Handles multi-line statements, comments, and semicolons inside strings correctly
 */
const parseSchemaStatements = (schemaContent) => {
  const statements = [];
  let currentStatement = '';
  let inString = false;
  let stringChar = null;
  let inLineComment = false;
  let inBlockComment = false;
  let i = 0;
  
  while (i < schemaContent.length) {
    const char = schemaContent[i];
    const nextChar = schemaContent[i + 1];
    
    // Handle block comment start
    if (!inString && !inLineComment && char === '/' && nextChar === '*') {
      inBlockComment = true;
      i += 2;
      continue;
    }
    
    // Handle block comment end
    if (inBlockComment && char === '*' && nextChar === '/') {
      inBlockComment = false;
      i += 2;
      continue;
    }
    
    // Skip characters inside block comments
    if (inBlockComment) {
      i++;
      continue;
    }
    
    // Handle line comment start
    if (!inString && char === '-' && nextChar === '-') {
      inLineComment = true;
      i += 2;
      continue;
    }
    
    // Handle line comment end
    if (inLineComment && (char === '\n' || char === '\r')) {
      inLineComment = false;
      currentStatement += ' ';
      i++;
      continue;
    }
    
    // Skip characters inside line comments
    if (inLineComment) {
      i++;
      continue;
    }
    
    // Handle string delimiters (single quotes for SQL, double quotes for identifiers)
    if ((char === "'" || char === '"') && !inString) {
      inString = true;
      stringChar = char;
      currentStatement += char;
      i++;
      continue;
    }
    
    // Handle escaped quotes inside strings (PostgreSQL uses '' for escaped single quote)
    if (inString && char === stringChar) {
      if (nextChar === stringChar) {
        // Escaped quote - add both and skip
        currentStatement += char + nextChar;
        i += 2;
        continue;
      } else {
        // End of string
        inString = false;
        stringChar = null;
        currentStatement += char;
        i++;
        continue;
      }
    }
    
    // Handle dollar-quoted strings (PostgreSQL feature: $$ or $tag$)
    if (!inString && char === '$') {
      // Find the end of the dollar quote tag
      let tagEnd = i + 1;
      while (tagEnd < schemaContent.length && 
             (schemaContent[tagEnd].match(/[a-zA-Z0-9_]/) || schemaContent[tagEnd] === '$')) {
        if (schemaContent[tagEnd] === '$') {
          tagEnd++;
          break;
        }
        tagEnd++;
      }
      
      const tag = schemaContent.substring(i, tagEnd);
      if (tag.endsWith('$')) {
        // Valid dollar quote tag found
        const closingTagIndex = schemaContent.indexOf(tag, tagEnd);
        if (closingTagIndex !== -1) {
          // Add entire dollar-quoted string
          currentStatement += schemaContent.substring(i, closingTagIndex + tag.length);
          i = closingTagIndex + tag.length;
          continue;
        }
      }
    }
    
    // Handle statement terminator (semicolon outside of strings)
    if (!inString && char === ';') {
      const trimmed = currentStatement.trim();
      if (trimmed.length > 0) {
        statements.push(trimmed);
      }
      currentStatement = '';
      i++;
      continue;
    }
    
    // Add character to current statement
    currentStatement += char;
    i++;
  }
  
  // Add final statement if exists
  const finalTrimmed = currentStatement.trim();
  if (finalTrimmed.length > 0) {
    statements.push(finalTrimmed);
  }
  
  return statements.filter(stmt => stmt.length > 0);
};

/**
 * Initialize database schema
 * Creates tables directly without parsing schema.sql
 */
const init = async () => {
  try {
    // Step 1: Ensure database exists
    await ensureDatabaseExists();

    // Step 2: Create connection pool
    const dbPool = createPool();

    // Step 3: Test connection
    await testConnection();

    // Step 4: Create tables directly (more reliable than parsing SQL file)
    console.log('📝 Creating database tables...');

    // Create users table
    await dbPool.query(`
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
        email_verification_token VARCHAR(255),
        password_reset_token VARCHAR(255),
        password_reset_expires TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('  ✓ Table: users');

    // Create problems table
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS problems (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,
        difficulty VARCHAR(50) NOT NULL,
        test_cases JSONB NOT NULL,
        expected_outputs JSONB NOT NULL,
        constraints TEXT,
        examples JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('  ✓ Table: problems');

    // Create logic_submissions table
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS logic_submissions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        problem_id INTEGER NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
        logic_steps JSONB NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        feedback TEXT,
        score INTEGER DEFAULT 0,
        version INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('  ✓ Table: logic_submissions');

    // Create code_submissions table
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS code_submissions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        problem_id INTEGER NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
        logic_submission_id INTEGER REFERENCES logic_submissions(id) ON DELETE SET NULL,
        code TEXT NOT NULL,
        language VARCHAR(50) DEFAULT 'javascript',
        status VARCHAR(50) DEFAULT 'pending',
        execution_result TEXT,
        test_results JSONB,
        execution_time INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('  ✓ Table: code_submissions');

    // Create execution_steps table
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS execution_steps (
        id SERIAL PRIMARY KEY,
        logic_submission_id INTEGER NOT NULL REFERENCES logic_submissions(id) ON DELETE CASCADE,
        step_number INTEGER NOT NULL,
        step_description TEXT NOT NULL,
        variables_state JSONB,
        condition_result BOOLEAN,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('  ✓ Table: execution_steps');

    // Create pending_registrations table
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS pending_registrations (
        id SERIAL PRIMARY KEY,
        full_name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        otp VARCHAR(6) NOT NULL,
        otp_expiry TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('  ✓ Table: pending_registrations');

    // Create indexes
    console.log('📝 Creating indexes...');
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)',
      'CREATE INDEX IF NOT EXISTS idx_problems_difficulty ON problems(difficulty)',
      'CREATE INDEX IF NOT EXISTS idx_logic_submissions_user ON logic_submissions(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_logic_submissions_problem ON logic_submissions(problem_id)',
      'CREATE INDEX IF NOT EXISTS idx_code_submissions_user ON code_submissions(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_code_submissions_problem ON code_submissions(problem_id)',
      'CREATE INDEX IF NOT EXISTS idx_execution_steps_submission ON execution_steps(logic_submission_id)'
    ];

    for (const indexSql of indexes) {
      try {
        await dbPool.query(indexSql);
      } catch (e) {
        // Ignore index already exists errors
      }
    }
    console.log('  ✓ Indexes created');

    // Seed sample problems if none exist
    const problemCount = await dbPool.query('SELECT COUNT(*) FROM problems');
    if (parseInt(problemCount.rows[0].count) === 0) {
      console.log('📝 Seeding sample problems...');
      await seedProblems(dbPool);
      console.log('  ✓ Sample problems added');
    }

    console.log('\n✅ Database schema initialized successfully');
    return true;
  } catch (error) {
    console.error('\n❌ Failed to initialize database:', error.message);
    if (error.code) {
      console.error(`   Error code: ${error.code}`);
    }
    throw error;
  }
};

/**
 * Seed sample problems
 */
const seedProblems = async (dbPool) => {
  const problems = [
    {
      title: 'Two Sum',
      description: 'Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.',
      difficulty: 'easy',
      test_cases: [{ input: { nums: [2, 7, 11, 15], target: 9 } }],
      expected_outputs: [{ output: [0, 1] }],
      constraints: '2 <= nums.length <= 10^4',
      examples: [{ input: { nums: [2, 7, 11, 15], target: 9 }, output: [0, 1], explanation: 'nums[0] + nums[1] = 9.' }]
    },
    {
      title: 'Reverse String',
      description: 'Write a function that reverses a string represented as an array of characters in-place.',
      difficulty: 'easy',
      test_cases: [{ input: { s: ['h', 'e', 'l', 'l', 'o'] } }],
      expected_outputs: [{ output: ['o', 'l', 'l', 'e', 'h'] }],
      constraints: '1 <= s.length <= 10^5',
      examples: [{ input: { s: ['h', 'e', 'l', 'l', 'o'] }, output: ['o', 'l', 'l', 'e', 'h'], explanation: 'Swap mirrored pairs.' }]
    },
    {
      title: 'Valid Palindrome',
      description: 'Given a string s, return true if it is a palindrome after converting to lowercase and removing non-alphanumeric characters.',
      difficulty: 'easy',
      test_cases: [{ input: { s: 'A man, a plan, a canal: Panama' } }],
      expected_outputs: [{ output: true }],
      constraints: '1 <= s.length <= 2 * 10^5',
      examples: [{ input: { s: 'A man, a plan, a canal: Panama' }, output: true, explanation: 'Filtered string reads the same in both directions.' }]
    },
    {
      title: 'Maximum Subarray',
      description: 'Given an integer array nums, find the contiguous subarray with the largest sum and return its sum.',
      difficulty: 'medium',
      test_cases: [{ input: { nums: [-2, 1, -3, 4, -1, 2, 1, -5, 4] } }],
      expected_outputs: [{ output: 6 }],
      constraints: '1 <= nums.length <= 10^5',
      examples: [{ input: { nums: [-2, 1, -3, 4, -1, 2, 1, -5, 4] }, output: 6, explanation: 'Best subarray is [4, -1, 2, 1].' }]
    },
    {
      title: 'Merge Intervals',
      description: 'Given an array of intervals, merge all overlapping intervals.',
      difficulty: 'medium',
      test_cases: [{ input: { intervals: [[1, 3], [2, 6], [8, 10], [15, 18]] } }],
      expected_outputs: [{ output: [[1, 6], [8, 10], [15, 18]] }],
      constraints: '1 <= intervals.length <= 10^4',
      examples: [{ input: { intervals: [[1, 3], [2, 6], [8, 10], [15, 18]] }, output: [[1, 6], [8, 10], [15, 18]], explanation: 'Intervals [1,3] and [2,6] overlap.' }]
    },
    {
      title: 'Contains Duplicate',
      description: 'Given an integer array nums, return true if any value appears at least twice.',
      difficulty: 'easy',
      test_cases: [{ input: { nums: [1, 2, 3, 1] } }],
      expected_outputs: [{ output: true }],
      constraints: '1 <= nums.length <= 10^5',
      examples: [{ input: { nums: [1, 2, 3, 1] }, output: true, explanation: 'Value 1 appears twice.' }]
    },
    {
      title: 'Best Time to Buy and Sell Stock',
      description: 'Given prices where prices[i] is the stock price on day i, return the maximum profit from one transaction.',
      difficulty: 'easy',
      test_cases: [{ input: { prices: [7, 1, 5, 3, 6, 4] } }],
      expected_outputs: [{ output: 5 }],
      constraints: '1 <= prices.length <= 10^5',
      examples: [{ input: { prices: [7, 1, 5, 3, 6, 4] }, output: 5, explanation: 'Buy at 1 and sell at 6.' }]
    },
    {
      title: 'Valid Anagram',
      description: 'Given two strings s and t, return true if t is an anagram of s.',
      difficulty: 'easy',
      test_cases: [{ input: { s: 'anagram', t: 'nagaram' } }],
      expected_outputs: [{ output: true }],
      constraints: '1 <= s.length, t.length <= 5 * 10^4',
      examples: [{ input: { s: 'anagram', t: 'nagaram' }, output: true, explanation: 'Both strings have identical character counts.' }]
    },
    {
      title: 'Binary Search',
      description: 'Given a sorted array and target, return target index if found, otherwise -1.',
      difficulty: 'easy',
      test_cases: [{ input: { nums: [-1, 0, 3, 5, 9, 12], target: 9 } }],
      expected_outputs: [{ output: 4 }],
      constraints: 'n is in [1, 10^4]',
      examples: [{ input: { nums: [-1, 0, 3, 5, 9, 12], target: 9 }, output: 4, explanation: '9 exists at index 4.' }]
    },
    {
      title: 'Climbing Stairs',
      description: 'You can climb 1 or 2 steps. Return how many distinct ways to reach the top of n stairs.',
      difficulty: 'easy',
      test_cases: [{ input: { n: 5 } }],
      expected_outputs: [{ output: 8 }],
      constraints: '1 <= n <= 45',
      examples: [{ input: { n: 5 }, output: 8, explanation: 'Fibonacci progression.' }]
    },
    {
      title: 'Missing Number',
      description: 'Given nums containing n distinct numbers in [0, n], return the missing number.',
      difficulty: 'easy',
      test_cases: [{ input: { nums: [3, 0, 1] } }],
      expected_outputs: [{ output: 2 }],
      constraints: '1 <= nums.length <= 10^4',
      examples: [{ input: { nums: [3, 0, 1] }, output: 2, explanation: '2 is missing from [0, 3].' }]
    },
    {
      title: 'Single Number',
      description: 'Every element appears twice except one. Return that single one.',
      difficulty: 'easy',
      test_cases: [{ input: { nums: [4, 1, 2, 1, 2] } }],
      expected_outputs: [{ output: 4 }],
      constraints: '1 <= nums.length <= 3 * 10^4',
      examples: [{ input: { nums: [4, 1, 2, 1, 2] }, output: 4, explanation: 'XOR cancels duplicate pairs.' }]
    },
    {
      title: 'Move Zeroes',
      description: 'Move all 0s to the end while maintaining the relative order of non-zero elements.',
      difficulty: 'easy',
      test_cases: [{ input: { nums: [0, 1, 0, 3, 12] } }],
      expected_outputs: [{ output: [1, 3, 12, 0, 0] }],
      constraints: '1 <= nums.length <= 10^4',
      examples: [{ input: { nums: [0, 1, 0, 3, 12] }, output: [1, 3, 12, 0, 0], explanation: 'Shift non-zero values left.' }]
    },
    {
      title: "Pascal's Triangle",
      description: 'Given an integer numRows, return the first numRows of Pascal\'s triangle.',
      difficulty: 'easy',
      test_cases: [{ input: { numRows: 5 } }],
      expected_outputs: [{ output: [[1], [1, 1], [1, 2, 1], [1, 3, 3, 1], [1, 4, 6, 4, 1]] }],
      constraints: '1 <= numRows <= 30',
      examples: [{ input: { numRows: 5 }, output: [[1], [1, 1], [1, 2, 1], [1, 3, 3, 1], [1, 4, 6, 4, 1]], explanation: 'Each internal value is sum of two above.' }]
    },
    {
      title: 'Intersection of Two Arrays II',
      description: 'Return an array of common elements between two arrays, including multiplicities.',
      difficulty: 'easy',
      test_cases: [{ input: { nums1: [1, 2, 2, 1], nums2: [2, 2] } }],
      expected_outputs: [{ output: [2, 2] }],
      constraints: '1 <= nums1.length, nums2.length <= 1000',
      examples: [{ input: { nums1: [1, 2, 2, 1], nums2: [2, 2] }, output: [2, 2], explanation: '2 appears twice in both arrays.' }]
    },
    {
      title: 'Product of Array Except Self',
      description: 'Return an array answer where answer[i] equals product of all elements except nums[i].',
      difficulty: 'medium',
      test_cases: [{ input: { nums: [1, 2, 3, 4] } }],
      expected_outputs: [{ output: [24, 12, 8, 6] }],
      constraints: '2 <= nums.length <= 10^5',
      examples: [{ input: { nums: [1, 2, 3, 4] }, output: [24, 12, 8, 6], explanation: 'Use prefix and suffix products.' }]
    },
    {
      title: 'Top K Frequent Elements',
      description: 'Return the k most frequent elements in the array.',
      difficulty: 'medium',
      test_cases: [{ input: { nums: [1, 1, 1, 2, 2, 3], k: 2 } }],
      expected_outputs: [{ output: [1, 2] }],
      constraints: '1 <= nums.length <= 10^5',
      examples: [{ input: { nums: [1, 1, 1, 2, 2, 3], k: 2 }, output: [1, 2], explanation: '1 and 2 have highest frequencies.' }]
    },
    {
      title: 'Group Anagrams',
      description: 'Group strings that are anagrams of each other.',
      difficulty: 'medium',
      test_cases: [{ input: { strs: ['eat', 'tea', 'tan', 'ate', 'nat', 'bat'] } }],
      expected_outputs: [{ output: [['eat', 'tea', 'ate'], ['tan', 'nat'], ['bat']] }],
      constraints: '1 <= strs.length <= 10^4',
      examples: [{ input: { strs: ['eat', 'tea', 'tan', 'ate', 'nat', 'bat'] }, output: [['eat', 'tea', 'ate'], ['tan', 'nat'], ['bat']], explanation: 'Sort chars to build grouping key.' }]
    },
    {
      title: 'Longest Consecutive Sequence',
      description: 'Return the length of the longest consecutive elements sequence.',
      difficulty: 'medium',
      test_cases: [{ input: { nums: [100, 4, 200, 1, 3, 2] } }],
      expected_outputs: [{ output: 4 }],
      constraints: '0 <= nums.length <= 10^5',
      examples: [{ input: { nums: [100, 4, 200, 1, 3, 2] }, output: 4, explanation: 'Sequence is [1,2,3,4].' }]
    },
    {
      title: '3Sum',
      description: 'Return all unique triplets [a,b,c] such that a + b + c = 0.',
      difficulty: 'medium',
      test_cases: [{ input: { nums: [-1, 0, 1, 2, -1, -4] } }],
      expected_outputs: [{ output: [[-1, -1, 2], [-1, 0, 1]] }],
      constraints: '3 <= nums.length <= 3000',
      examples: [{ input: { nums: [-1, 0, 1, 2, -1, -4] }, output: [[-1, -1, 2], [-1, 0, 1]], explanation: 'Use sorting plus two pointers.' }]
    },
    {
      title: 'Container With Most Water',
      description: 'Given heights, find two lines that together with x-axis form a container holding max water.',
      difficulty: 'medium',
      test_cases: [{ input: { height: [1, 8, 6, 2, 5, 4, 8, 3, 7] } }],
      expected_outputs: [{ output: 49 }],
      constraints: '2 <= height.length <= 10^5',
      examples: [{ input: { height: [1, 8, 6, 2, 5, 4, 8, 3, 7] }, output: 49, explanation: 'Best pair is height 8 and 7 with width 7.' }]
    },
    {
      title: 'Search in Rotated Sorted Array',
      description: 'Given a rotated sorted array and target, return index if found, else -1.',
      difficulty: 'medium',
      test_cases: [{ input: { nums: [4, 5, 6, 7, 0, 1, 2], target: 0 } }],
      expected_outputs: [{ output: 4 }],
      constraints: '1 <= nums.length <= 5000',
      examples: [{ input: { nums: [4, 5, 6, 7, 0, 1, 2], target: 0 }, output: 4, explanation: 'Binary search on sorted half each step.' }]
    },
    {
      title: 'Find Minimum in Rotated Sorted Array',
      description: 'Find the minimum element in a rotated sorted array with unique elements.',
      difficulty: 'medium',
      test_cases: [{ input: { nums: [3, 4, 5, 1, 2] } }],
      expected_outputs: [{ output: 1 }],
      constraints: '1 <= nums.length <= 5000',
      examples: [{ input: { nums: [3, 4, 5, 1, 2] }, output: 1, explanation: 'Pivot point gives minimum.' }]
    },
    {
      title: 'Kth Largest Element in an Array',
      description: 'Find the kth largest element in an unsorted array.',
      difficulty: 'medium',
      test_cases: [{ input: { nums: [3, 2, 1, 5, 6, 4], k: 2 } }],
      expected_outputs: [{ output: 5 }],
      constraints: '1 <= k <= nums.length <= 10^5',
      examples: [{ input: { nums: [3, 2, 1, 5, 6, 4], k: 2 }, output: 5, explanation: 'Second largest is 5.' }]
    },
    {
      title: 'Longest Substring Without Repeating Characters',
      description: 'Return the length of the longest substring without repeating characters.',
      difficulty: 'medium',
      test_cases: [{ input: { s: 'abcabcbb' } }],
      expected_outputs: [{ output: 3 }],
      constraints: '0 <= s.length <= 5 * 10^4',
      examples: [{ input: { s: 'abcabcbb' }, output: 3, explanation: 'Longest unique substring is "abc".' }]
    },
    {
      title: 'Longest Palindromic Substring',
      description: 'Given a string s, return the longest palindromic substring.',
      difficulty: 'medium',
      test_cases: [{ input: { s: 'babad' } }],
      expected_outputs: [{ output: 'bab' }],
      constraints: '1 <= s.length <= 1000',
      examples: [{ input: { s: 'babad' }, output: 'bab', explanation: '"aba" is also valid.' }]
    },
    {
      title: 'Letter Combinations of a Phone Number',
      description: 'Given digits 2-9, return all possible letter combinations.',
      difficulty: 'medium',
      test_cases: [{ input: { digits: '23' } }],
      expected_outputs: [{ output: ['ad', 'ae', 'af', 'bd', 'be', 'bf', 'cd', 'ce', 'cf'] }],
      constraints: '0 <= digits.length <= 4',
      examples: [{ input: { digits: '23' }, output: ['ad', 'ae', 'af', 'bd', 'be', 'bf', 'cd', 'ce', 'cf'], explanation: 'Use backtracking over digit mappings.' }]
    },
    {
      title: 'Generate Parentheses',
      description: 'Generate all combinations of n pairs of well-formed parentheses.',
      difficulty: 'medium',
      test_cases: [{ input: { n: 3 } }],
      expected_outputs: [{ output: ['((()))', '(()())', '(())()', '()(())', '()()()'] }],
      constraints: '1 <= n <= 8',
      examples: [{ input: { n: 3 }, output: ['((()))', '(()())', '(())()', '()(())', '()()()'], explanation: 'Track open and close counts.' }]
    },
    {
      title: 'Permutations',
      description: 'Given an array of distinct integers, return all possible permutations.',
      difficulty: 'medium',
      test_cases: [{ input: { nums: [1, 2, 3] } }],
      expected_outputs: [{ output: [[1, 2, 3], [1, 3, 2], [2, 1, 3], [2, 3, 1], [3, 1, 2], [3, 2, 1]] }],
      constraints: '1 <= nums.length <= 6',
      examples: [{ input: { nums: [1, 2, 3] }, output: [[1, 2, 3], [1, 3, 2], [2, 1, 3], [2, 3, 1], [3, 1, 2], [3, 2, 1]], explanation: 'Use backtracking with swap/visited.' }]
    },
    {
      title: 'Subsets',
      description: 'Given an integer array nums of unique elements, return all possible subsets.',
      difficulty: 'medium',
      test_cases: [{ input: { nums: [1, 2, 3] } }],
      expected_outputs: [{ output: [[], [1], [2], [3], [1, 2], [1, 3], [2, 3], [1, 2, 3]] }],
      constraints: '1 <= nums.length <= 10',
      examples: [{ input: { nums: [1, 2, 3] }, output: [[], [1], [2], [3], [1, 2], [1, 3], [2, 3], [1, 2, 3]], explanation: 'Each element can be picked or skipped.' }]
    },
    {
      title: 'Word Search',
      description: 'Given a 2D board and a word, return true if the word exists in the grid.',
      difficulty: 'medium',
      test_cases: [{ input: { board: [['A', 'B', 'C', 'E'], ['S', 'F', 'C', 'S'], ['A', 'D', 'E', 'E']], word: 'ABCCED' } }],
      expected_outputs: [{ output: true }],
      constraints: '1 <= m, n <= 6',
      examples: [{ input: { board: [['A', 'B', 'C', 'E'], ['S', 'F', 'C', 'S'], ['A', 'D', 'E', 'E']], word: 'ABCCED' }, output: true, explanation: 'DFS with backtracking over neighbors.' }]
    },
    {
      title: 'Number of Islands',
      description: 'Given a grid of 1s and 0s, count the number of islands.',
      difficulty: 'medium',
      test_cases: [{ input: { grid: [['1', '1', '1', '1', '0'], ['1', '1', '0', '1', '0'], ['1', '1', '0', '0', '0'], ['0', '0', '0', '0', '0']] } }],
      expected_outputs: [{ output: 1 }],
      constraints: '1 <= m, n <= 300',
      examples: [{ input: { grid: [['1', '1', '1', '1', '0'], ['1', '1', '0', '1', '0'], ['1', '1', '0', '0', '0'], ['0', '0', '0', '0', '0']] }, output: 1, explanation: 'Flood fill connected land.' }]
    },
    {
      title: 'Rotting Oranges',
      description: 'Given a grid, return minimum minutes until all fresh oranges become rotten.',
      difficulty: 'medium',
      test_cases: [{ input: { grid: [[2, 1, 1], [1, 1, 0], [0, 1, 1]] } }],
      expected_outputs: [{ output: 4 }],
      constraints: '1 <= m, n <= 10',
      examples: [{ input: { grid: [[2, 1, 1], [1, 1, 0], [0, 1, 1]] }, output: 4, explanation: 'Multi-source BFS by minute layers.' }]
    },
    {
      title: 'Course Schedule',
      description: 'Return true if you can finish all courses given prerequisite pairs.',
      difficulty: 'medium',
      test_cases: [{ input: { numCourses: 2, prerequisites: [[1, 0]] } }],
      expected_outputs: [{ output: true }],
      constraints: '1 <= numCourses <= 2000',
      examples: [{ input: { numCourses: 2, prerequisites: [[1, 0]] }, output: true, explanation: 'Graph has no cycle.' }]
    },
    {
      title: 'Pacific Atlantic Water Flow',
      description: 'Return coordinates where water can flow to both Pacific and Atlantic oceans.',
      difficulty: 'medium',
      test_cases: [{ input: { heights: [[1, 2, 2, 3, 5], [3, 2, 3, 4, 4], [2, 4, 5, 3, 1], [6, 7, 1, 4, 5], [5, 1, 1, 2, 4]] } }],
      expected_outputs: [{ output: [[0, 4], [1, 3], [1, 4], [2, 2], [3, 0], [3, 1], [4, 0]] }],
      constraints: '1 <= m, n <= 200',
      examples: [{ input: { heights: [[1, 2, 2, 3, 5], [3, 2, 3, 4, 4], [2, 4, 5, 3, 1], [6, 7, 1, 4, 5], [5, 1, 1, 2, 4]] }, output: [[0, 4], [1, 3], [1, 4], [2, 2], [3, 0], [3, 1], [4, 0]], explanation: 'Run reverse BFS/DFS from both oceans.' }]
    },
    {
      title: 'Coin Change',
      description: 'Given coin denominations and amount, return minimum coins needed to make amount.',
      difficulty: 'medium',
      test_cases: [{ input: { coins: [1, 2, 5], amount: 11 } }],
      expected_outputs: [{ output: 3 }],
      constraints: '1 <= coins.length <= 12',
      examples: [{ input: { coins: [1, 2, 5], amount: 11 }, output: 3, explanation: '11 = 5 + 5 + 1.' }]
    },
    {
      title: 'House Robber',
      description: 'Given money in houses in a line, return max amount without robbing adjacent houses.',
      difficulty: 'medium',
      test_cases: [{ input: { nums: [2, 7, 9, 3, 1] } }],
      expected_outputs: [{ output: 12 }],
      constraints: '1 <= nums.length <= 100',
      examples: [{ input: { nums: [2, 7, 9, 3, 1] }, output: 12, explanation: 'Rob houses with values 2, 9, and 1.' }]
    },
    {
      title: 'House Robber II',
      description: 'Same as House Robber but houses are in a circle.',
      difficulty: 'medium',
      test_cases: [{ input: { nums: [2, 3, 2] } }],
      expected_outputs: [{ output: 3 }],
      constraints: '1 <= nums.length <= 100',
      examples: [{ input: { nums: [2, 3, 2] }, output: 3, explanation: 'Cannot rob first and last together.' }]
    },
    {
      title: 'Decode Ways',
      description: 'Given a string of digits, return number of ways to decode where A=1, B=2, ..., Z=26.',
      difficulty: 'medium',
      test_cases: [{ input: { s: '226' } }],
      expected_outputs: [{ output: 3 }],
      constraints: '1 <= s.length <= 100',
      examples: [{ input: { s: '226' }, output: 3, explanation: 'Possible decodes: BZ, VF, BBF.' }]
    },
    {
      title: 'Unique Paths',
      description: 'Count unique paths from top-left to bottom-right in an m x n grid moving only down or right.',
      difficulty: 'medium',
      test_cases: [{ input: { m: 3, n: 7 } }],
      expected_outputs: [{ output: 28 }],
      constraints: '1 <= m, n <= 100',
      examples: [{ input: { m: 3, n: 7 }, output: 28, explanation: 'Dynamic programming over grid cells.' }]
    },
    {
      title: 'Jump Game',
      description: 'Given nums where each value is max jump length at index, return whether end is reachable.',
      difficulty: 'medium',
      test_cases: [{ input: { nums: [2, 3, 1, 1, 4] } }],
      expected_outputs: [{ output: true }],
      constraints: '1 <= nums.length <= 10^4',
      examples: [{ input: { nums: [2, 3, 1, 1, 4] }, output: true, explanation: 'Greedy furthest-reach works.' }]
    },
    {
      title: 'Partition Equal Subset Sum',
      description: 'Return true if array can be partitioned into two subsets with equal sum.',
      difficulty: 'medium',
      test_cases: [{ input: { nums: [1, 5, 11, 5] } }],
      expected_outputs: [{ output: true }],
      constraints: '1 <= nums.length <= 200',
      examples: [{ input: { nums: [1, 5, 11, 5] }, output: true, explanation: 'Can split into [1,5,5] and [11].' }]
    },
    {
      title: 'Longest Increasing Subsequence',
      description: 'Given nums, return the length of the longest strictly increasing subsequence.',
      difficulty: 'medium',
      test_cases: [{ input: { nums: [10, 9, 2, 5, 3, 7, 101, 18] } }],
      expected_outputs: [{ output: 4 }],
      constraints: '1 <= nums.length <= 2500',
      examples: [{ input: { nums: [10, 9, 2, 5, 3, 7, 101, 18] }, output: 4, explanation: 'One LIS is [2,3,7,101].' }]
    },
    {
      title: 'Edit Distance',
      description: 'Return minimum number of operations to convert word1 to word2.',
      difficulty: 'hard',
      test_cases: [{ input: { word1: 'horse', word2: 'ros' } }],
      expected_outputs: [{ output: 3 }],
      constraints: '0 <= word1.length, word2.length <= 500',
      examples: [{ input: { word1: 'horse', word2: 'ros' }, output: 3, explanation: 'Replace, remove, remove.' }]
    },
    {
      title: 'Min Cost Climbing Stairs',
      description: 'Given cost where you can climb 1 or 2 steps, return minimum cost to reach the top.',
      difficulty: 'easy',
      test_cases: [{ input: { cost: [10, 15, 20] } }],
      expected_outputs: [{ output: 15 }],
      constraints: '2 <= cost.length <= 1000',
      examples: [{ input: { cost: [10, 15, 20] }, output: 15, explanation: 'Start at index 1 then jump to top.' }]
    },
    {
      title: 'LRU Cache',
      description: 'Design a data structure that follows the Least Recently Used cache policy.',
      difficulty: 'medium',
      test_cases: [{ input: { operations: ['LRUCache', 'put', 'put', 'get', 'put', 'get', 'put', 'get', 'get', 'get'], arguments: [[2], [1, 1], [2, 2], [1], [3, 3], [2], [4, 4], [1], [3], [4]] } }],
      expected_outputs: [{ output: [null, null, null, 1, null, -1, null, -1, 3, 4] }],
      constraints: '1 <= capacity <= 3000',
      examples: [{ input: { operations: ['LRUCache', 'put', 'put', 'get'], arguments: [[2], [1, 1], [2, 2], [1]] }, output: [null, null, null, 1], explanation: 'Use hashmap + doubly linked list.' }]
    },
    {
      title: 'Implement Trie',
      description: 'Implement a trie with insert, search, and startsWith operations.',
      difficulty: 'medium',
      test_cases: [{ input: { operations: ['Trie', 'insert', 'search', 'search', 'startsWith'], arguments: [[], ['apple'], ['apple'], ['app'], ['app']] } }],
      expected_outputs: [{ output: [null, null, true, false, true] }],
      constraints: '1 <= word.length <= 2000',
      examples: [{ input: { operations: ['Trie', 'insert', 'search'], arguments: [[], ['apple'], ['apple']] }, output: [null, null, true], explanation: 'Trie nodes store child links by character.' }]
    },
    {
      title: 'Add and Search Word',
      description: 'Design a structure that supports adding words and searching with "." wildcard.',
      difficulty: 'medium',
      test_cases: [{ input: { operations: ['WordDictionary', 'addWord', 'addWord', 'addWord', 'search', 'search', 'search', 'search'], arguments: [[], ['bad'], ['dad'], ['mad'], ['pad'], ['bad'], ['.ad'], ['b..']] } }],
      expected_outputs: [{ output: [null, null, null, null, false, true, true, true] }],
      constraints: '1 <= word.length <= 500',
      examples: [{ input: { operations: ['WordDictionary', 'addWord', 'search'], arguments: [[], ['bad'], ['b..']] }, output: [null, null, true], explanation: 'Wildcard can match any single character.' }]
    },
    {
      title: 'Linked List Cycle',
      description: 'Given the head of a linked list, return true if there is a cycle.',
      difficulty: 'easy',
      test_cases: [{ input: { head: [3, 2, 0, -4], pos: 1 } }],
      expected_outputs: [{ output: true }],
      constraints: '0 <= number of nodes <= 10^4',
      examples: [{ input: { head: [3, 2, 0, -4], pos: 1 }, output: true, explanation: 'Tail links back to node index 1.' }]
    },
    {
      title: 'Binary Tree Level Order Traversal',
      description: 'Given the root of a binary tree, return level-order traversal of node values.',
      difficulty: 'medium',
      test_cases: [{ input: { root: [3, 9, 20, null, null, 15, 7] } }],
      expected_outputs: [{ output: [[3], [9, 20], [15, 7]] }],
      constraints: '0 <= number of nodes <= 2000',
      examples: [{ input: { root: [3, 9, 20, null, null, 15, 7] }, output: [[3], [9, 20], [15, 7]], explanation: 'Use BFS queue by levels.' }]
    }
  ];

  let insertedCount = 0;

  for (const problem of problems) {
    try {
      const insertResult = await dbPool.query(
        `INSERT INTO problems (title, description, difficulty, test_cases, expected_outputs, constraints, examples)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT DO NOTHING`,
        [
          problem.title,
          problem.description,
          problem.difficulty,
          JSON.stringify(problem.test_cases),
          JSON.stringify(problem.expected_outputs),
          problem.constraints,
          JSON.stringify(problem.examples)
        ]
      );
      insertedCount += insertResult.rowCount || 0;
    } catch (e) {
      // Ignore duplicate errors
    }
  }

  return insertedCount;
};

/**
 * Query helper function with logging
 */
const query = async (text, params) => {
  if (!pool) {
    throw new Error('Database pool not initialized. Call init() first.');
  }

  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    
    // Log slow queries in development
    if (process.env.NODE_ENV === 'development' && duration > 100) {
      console.log('⚠️  Slow query:', { text: text.substring(0, 100), duration, rows: res.rowCount });
    }
    
    return res;
  } catch (error) {
    console.error('❌ Query error:', { 
      text: text.substring(0, 100), 
      error: error.message,
      code: error.code 
    });
    throw error;
  }
};

/**
 * Close database connections gracefully
 */
const close = async () => {
  if (pool) {
    await pool.end();
    pool = null;
    console.log('✅ Database connections closed');
  }
};

// Insert initial data into problems table
const insertInitialData = async () => {
  try {
    const dbPool = createPool();
    
    // Insert a sample problem
    await dbPool.query(`
      INSERT INTO problems (title, description, difficulty, test_cases, expected_outputs, constraints, examples)
      VALUES (
        'Problem Title',
        'Problem description text',
        'easy',
        '["test1", "test2"]',  -- JSON array as string
        '["output1", "output2"]',  -- JSON array as string
        'Constraints text',
        '[{"input": "example", "output": "result"}]'  -- JSON array as string
      )
    `);
    
    console.log('✅ Initial data inserted into problems table');
  } catch (error) {
    console.error('❌ Error inserting initial data:', error.message);
    throw error;
  }
};

/**
 * Run migrations to add missing columns to existing tables
 * This is called after schema init to ensure columns exist
 */
const runMigrations = async () => {
  const dbPool = createPool();
  console.log('\n🔄 Running migrations...');
  
  const migrations = [
    {
      name: 'Add otp_code to users',
      check: `SELECT column_name FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'otp_code'`,
      run: `ALTER TABLE users ADD COLUMN otp_code VARCHAR(6)`
    },
    {
      name: 'Add otp_expires to users',
      check: `SELECT column_name FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'otp_expires'`,
      run: `ALTER TABLE users ADD COLUMN otp_expires TIMESTAMP`
    },
    {
      name: 'Add otp_type to users',
      check: `SELECT column_name FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'otp_type'`,
      run: `ALTER TABLE users ADD COLUMN otp_type VARCHAR(50)`
    },
    {
      name: 'Add email_verified to users',
      check: `SELECT column_name FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'email_verified'`,
      run: `ALTER TABLE users ADD COLUMN email_verified BOOLEAN DEFAULT FALSE`
    },
    {
      name: 'Add test_results to code_submissions',
      check: `SELECT column_name FROM information_schema.columns WHERE table_name = 'code_submissions' AND column_name = 'test_results'`,
      run: `ALTER TABLE code_submissions ADD COLUMN test_results JSONB`
    },
    {
      name: 'Add execution_time to code_submissions',
      check: `SELECT column_name FROM information_schema.columns WHERE table_name = 'code_submissions' AND column_name = 'execution_time'`,
      run: `ALTER TABLE code_submissions ADD COLUMN execution_time INTEGER DEFAULT 0`
    }
  ];

  for (const migration of migrations) {
    try {
      const checkResult = await dbPool.query(migration.check);
      if (checkResult.rows.length === 0) {
        await dbPool.query(migration.run);
        console.log(`  ✅ ${migration.name}`);
      } else {
        console.log(`  ⊙ ${migration.name} (already exists)`);
      }
    } catch (error) {
      console.error(`  ❌ ${migration.name}: ${error.message}`);
    }
  }

  // Keep only the newest row for each normalized problem title
  try {
    const dedupeResult = await dbPool.query(`
      WITH ranked_problems AS (
        SELECT
          id,
          ROW_NUMBER() OVER (
            PARTITION BY LOWER(BTRIM(title))
            ORDER BY created_at DESC, id DESC
          ) AS row_num
        FROM problems
      )
      DELETE FROM problems p
      USING ranked_problems rp
      WHERE p.id = rp.id AND rp.row_num > 1
      RETURNING p.id
    `);
    if (dedupeResult.rowCount > 0) {
      console.log(`  ✅ Removed ${dedupeResult.rowCount} duplicate problem rows`);
    } else {
      console.log('  ⊙ Problem deduplication (no duplicates found)');
    }
  } catch (error) {
    console.error(`  ❌ Problem deduplication: ${error.message}`);
  }

  // Prevent future duplicates regardless of title casing/whitespace
  try {
    await dbPool.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_problems_title_unique_normalized ON problems (LOWER(BTRIM(title)))'
    );
    console.log('  ✅ Unique problem-title index ensured');
  } catch (error) {
    console.error(`  ❌ Unique problem-title index: ${error.message}`);
  }

  // Backfill any missing catalog problems for existing databases
  try {
    const insertedCount = await seedProblems(dbPool);
    console.log(`  ✅ Seeded ${insertedCount} new problems from catalog`);
  } catch (error) {
    console.error(`  ❌ Problem catalog seed: ${error.message}`);
  }
  
  console.log('✅ Migrations complete\n');
};

module.exports = { pool: () => pool, query, init, close, testConnection, insertInitialData, runMigrations };
