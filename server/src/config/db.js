/**
 * Database Configuration
 * Handles PostgreSQL connection and initialization
 */
const { Pool, Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Database configuration from environment
const dbConfig = {
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'thinkflow',
  password: process.env.DB_PASSWORD || 'postgres',
  port: parseInt(process.env.DB_PORT || '5432', 10),
};

let pool = null;

/**
 * Check if PostgreSQL service is running and database exists
 * Creates the database if it doesn't exist
 */
const ensureDatabaseExists = async () => {
  // Connect to default 'postgres' database to check/create our database
  const adminClient = new Client({
    user: dbConfig.user,
    host: dbConfig.host,
    password: dbConfig.password,
    port: dbConfig.port,
    database: 'postgres', // Connect to default database
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
 * Reads and executes schema.sql file
 */
const init = async () => {
  try {
    // Step 1: Ensure database exists
    await ensureDatabaseExists();

    // Step 2: Create connection pool
    const dbPool = createPool();

    // Step 3: Test connection
    await testConnection();

    // Step 4: Read and execute schema
    const schemaPath = path.join(__dirname, '../../../database/schema.sql');
    
    if (!fs.existsSync(schemaPath)) {
      throw new Error(`Schema file not found at: ${schemaPath}`);
    }

    const schema = fs.readFileSync(schemaPath, 'utf8');
    
    // Parse schema into individual statements
    const statements = parseSchemaStatements(schema);
    
    console.log(`📝 Parsed ${statements.length} schema statements...`);
    
    // Execute statements in order
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      const statementType = statement.trim().substring(0, 12).toUpperCase();
      
      try {
        // Execute the statement
        await dbPool.query(statement);
        
        // Log table creation
        if (statementType.includes('CREATE TABLE')) {
          const tableMatch = statement.match(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?(?:public\.)?(\w+)/i);
          if (tableMatch) {
            const tableName = tableMatch[1];
            console.log(`  ✓ Created table: ${tableName}`);
          }
        }
      } catch (error) {
        // Handle specific error codes
        if (error.code === '42P07') {
          // Table already exists (CREATE TABLE IF NOT EXISTS should prevent this, but handle it)
          const tableMatch = statement.match(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?(?:public\.)?(\w+)/i);
          if (tableMatch) {
            console.log(`  ⊙ Table already exists: ${tableMatch[1]}`);
          }
          continue;
        }
        
        if (error.code === '42710') {
          // Object already exists (indexes, constraints, etc.)
          console.log(`  ⊙ Object already exists, skipping...`);
          continue;
        }
        
        if (error.code === '23505') {
          // Unique constraint violation (INSERT duplicate)
          console.log(`  ⊙ Data already exists, skipping INSERT...`);
          continue;
        }
        
        // For other errors, log and re-throw
        console.error(`❌ Error executing statement ${i + 1}:`, error.message);
        console.error(`Statement preview:`, statement.substring(0, 100));
        throw error;
      }
    }
    
    // Verify critical tables exist
    const criticalTables = ['users', 'problems', 'logic_submissions', 'code_submissions', 'execution_steps'];
    console.log(`\n🔍 Verifying table existence...`);
    
    for (const tableName of criticalTables) {
      const exists = await tableExists(tableName);
      if (exists) {
        console.log(`  ✓ Table "${tableName}" exists`);
      } else {
        throw new Error(`❌ Critical table "${tableName}" does not exist after schema initialization`);
      }
    }
    
    console.log('\n✅ Database schema initialized successfully');
    return true;
  } catch (error) {
    console.error('\n❌ Failed to initialize database:', error.message);
    if (error.code) {
      console.error(`   Error code: ${error.code}`);
    }
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
    throw error;
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

module.exports = { pool: () => pool, query, init, close, testConnection, insertInitialData };
