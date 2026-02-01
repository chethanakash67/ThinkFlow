-- Migration: Add test_results and execution_time columns to code_submissions table

-- Add test_results column to store detailed test case results
ALTER TABLE code_submissions 
ADD COLUMN IF NOT EXISTS test_results JSONB;

-- Add execution_time column to store how long the code took to execute
ALTER TABLE code_submissions 
ADD COLUMN IF NOT EXISTS execution_time INTEGER DEFAULT 0;

-- Update status check constraint to include partially_correct
ALTER TABLE code_submissions 
DROP CONSTRAINT IF EXISTS code_submissions_status_check;

ALTER TABLE code_submissions 
ADD CONSTRAINT code_submissions_status_check 
CHECK(status IN ('pending', 'correct', 'partially_correct', 'incorrect', 'error'));

-- Add comment for documentation
COMMENT ON COLUMN code_submissions.test_results IS 'JSON array containing detailed results for each test case';
COMMENT ON COLUMN code_submissions.execution_time IS 'Total execution time in milliseconds';
