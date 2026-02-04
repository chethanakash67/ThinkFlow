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
    // Connection pool settings
    max: 20, // Maximum number of clients in the pool
    idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
    connectionTimeoutMillis: 2000, // Return an error after 2 seconds if connection cannot be established
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
      test_cases: JSON.stringify([
        {"input": {"nums": [2,7,11,15], "target": 9}},
        {"input": {"nums": [3,2,4], "target": 6}},
        {"input": {"nums": [3,3], "target": 6}}
      ]),
      expected_outputs: JSON.stringify([
        {"output": [0,1]},
        {"output": [1,2]},
        {"output": [0,1]}
      ]),
      constraints: '2 <= nums.length <= 104',
      examples: JSON.stringify([
        {"input": {"nums": [2,7,11,15], "target": 9}, "output": [0,1], "explanation": "Because nums[0] + nums[1] == 9, we return [0, 1]."}
      ])
    },
    {
      title: 'Reverse String',
      description: 'Write a function that reverses a string. The input string is given as an array of characters s.',
      difficulty: 'easy',
      test_cases: JSON.stringify([
        {"input": {"s": ["h","e","l","l","o"]}},
        {"input": {"s": ["H","a","n","n","a","h"]}}
      ]),
      expected_outputs: JSON.stringify([
        {"output": ["o","l","l","e","h"]},
        {"output": ["h","a","n","n","a","H"]}
      ]),
      constraints: '1 <= s.length <= 105',
      examples: JSON.stringify([
        {"input": {"s": ["h","e","l","l","o"]}, "output": ["o","l","l","e","h"], "explanation": "Reverse the characters in the array."}
      ])
    },
    {
      title: 'Valid Palindrome',
      description: 'A phrase is a palindrome if it reads the same forward and backward. Given a string s, return true if it is a palindrome.',
      difficulty: 'easy',
      test_cases: JSON.stringify([
        {"input": {"s": "A man, a plan, a canal: Panama"}},
        {"input": {"s": "race a car"}}
      ]),
      expected_outputs: JSON.stringify([
        {"output": true},
        {"output": false}
      ]),
      constraints: '1 <= s.length <= 2 * 105',
      examples: JSON.stringify([
        {"input": {"s": "A man, a plan, a canal: Panama"}, "output": true, "explanation": "amanaplanacanalpanama is a palindrome."}
      ])
    },
    {
      title: 'Maximum Subarray',
      description: 'Given an integer array nums, find the subarray with the largest sum, and return its sum.',
      difficulty: 'medium',
      test_cases: JSON.stringify([
        {"input": {"nums": [-2,1,-3,4,-1,2,1,-5,4]}},
        {"input": {"nums": [1]}},
        {"input": {"nums": [5,4,-1,7,8]}}
      ]),
      expected_outputs: JSON.stringify([
        {"output": 6},
        {"output": 1},
        {"output": 23}
      ]),
      constraints: '1 <= nums.length <= 105',
      examples: JSON.stringify([
        {"input": {"nums": [-2,1,-3,4,-1,2,1,-5,4]}, "output": 6, "explanation": "The subarray [4,-1,2,1] has the largest sum 6."}
      ])
    },
    {
      title: 'Merge Intervals',
      description: 'Given an array of intervals, merge all overlapping intervals.',
      difficulty: 'medium',
      test_cases: JSON.stringify([
        {"input": {"intervals": [[1,3],[2,6],[8,10],[15,18]]}},
        {"input": {"intervals": [[1,4],[4,5]]}}
      ]),
      expected_outputs: JSON.stringify([
        {"output": [[1,6],[8,10],[15,18]]},
        {"output": [[1,5]]}
      ]),
      constraints: '1 <= intervals.length <= 104',
      examples: JSON.stringify([
        {"input": {"intervals": [[1,3],[2,6],[8,10],[15,18]]}, "output": [[1,6],[8,10],[15,18]], "explanation": "Intervals [1,3] and [2,6] overlap, merge them into [1,6]."}
      ])
    }
  ];

  for (const problem of problems) {
    try {
      await dbPool.query(
        `INSERT INTO problems (title, description, difficulty, test_cases, expected_outputs, constraints, examples)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT DO NOTHING`,
        [problem.title, problem.description, problem.difficulty, problem.test_cases, problem.expected_outputs, problem.constraints, problem.examples]
      );
    } catch (e) {
      // Ignore duplicate errors
    }
  }
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
  
  console.log('✅ Migrations complete\n');
};

module.exports = { pool: () => pool, query, init, close, testConnection, insertInitialData, runMigrations };
