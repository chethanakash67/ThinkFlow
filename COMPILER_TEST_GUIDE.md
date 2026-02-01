# Quick Test Guide for Code Compiler

## Prerequisites
- Server running on port 3001 ✅
- Client running on port 3000 ✅
- Database migrated with new fields ✅
- vm2 package installed ✅

## Test Steps

### 1. Navigate to a Problem
1. Open your browser to `http://localhost:3000`
2. Log in to your account
3. Go to the Problems page
4. Click on any problem (e.g., "Two Sum")

### 2. Test the Code Editor
1. Click the "Show Code Editor" button
2. The Monaco code editor should appear

### 3. Write Sample Code
Try this simple Two Sum solution:

```javascript
function solution(nums) {
  const target = 9; // Example: finding two numbers that sum to 9
  const map = {};
  
  for (let i = 0; i < nums.length; i++) {
    const complement = target - nums[i];
    if (map[complement] !== undefined) {
      return [map[complement], i];
    }
    map[nums[i]] = i;
  }
  
  return [];
}
```

### 4. Submit Code
1. Click "Submit Code" button
2. Wait for execution (should be quick, < 1 second)
3. Check the results displayed below

### 5. Expected Results
You should see:
- ✅ Overall status (Correct/Partially Correct/Incorrect)
- ✅ Score (0-100)
- ✅ Individual test case results with:
  - Pass/fail indicator (green check or red X)
  - Input values
  - Expected output
  - Your actual output
  - Execution time (in milliseconds)
  - Error message (if any)

### 6. Test Error Handling
Try submitting code with errors:

**Syntax Error:**
```javascript
function solution(nums) {
  return [; // Missing closing bracket
}
```

**Runtime Error:**
```javascript
function solution(nums) {
  return nums.undefinedMethod(); // This will throw an error
}
```

**Timeout Test (infinite loop):**
```javascript
function solution(nums) {
  while(true) {} // This should timeout after 5 seconds
  return [];
}
```

### 7. Verify Database Storage
After submission, you can verify the data is saved:

```sql
SELECT id, status, score, test_results, execution_time 
FROM code_submissions 
ORDER BY created_at DESC 
LIMIT 1;
```

## What to Look For

### ✅ Success Indicators
- Code editor loads properly
- Submit button is enabled when code is written
- Results appear after submission
- Test cases show pass/fail status
- Execution time is displayed
- Score is calculated correctly

### ❌ Potential Issues
- If Monaco editor doesn't load: Check console for errors
- If submission fails: Check server logs for errors
- If no results show: Check network tab for API response
- If server crashes: Check for missing dependencies

## Troubleshooting

### Server Issues
```bash
# Restart the server
cd server
npm start
```

### Client Issues
```bash
# Restart the client
cd client
npm run dev
```

### Database Issues
```bash
# Re-run migration if needed
psql -U postgres -d thinkflow -f database/migration_add_code_execution_fields.sql
```

### Check Server Logs
Look for these messages:
- ✅ "ThinkFlow Server Running"
- ✅ "Ready to accept connections"
- Check for any error messages after code submission

## Expected API Response
When you submit code, the API should return:

```json
{
  "submission": {
    "id": 1,
    "status": "correct",
    "passedCount": 3,
    "totalCount": 3,
    "score": 100,
    "message": "All test cases passed!",
    "results": [
      {
        "input": [2, 7, 11, 15],
        "expectedOutput": [0, 1],
        "actualOutput": [0, 1],
        "passed": true,
        "executionTime": 2,
        "error": null
      }
    ]
  }
}
```

## Common Test Cases to Try

### Test 1: Perfect Solution
Should pass all test cases with 100% score

### Test 2: Partial Solution
Modify code to only work for some test cases
Should show "Partially Correct" status

### Test 3: Wrong Solution
Return wrong values
Should show "Incorrect" status

### Test 4: Code with Errors
Include syntax or runtime errors
Should show error message

## Support
If issues persist:
1. Check browser console for frontend errors
2. Check server terminal for backend errors
3. Verify database connection
4. Ensure all dependencies are installed
5. Review the CODE_COMPILER_FIX.md for implementation details
