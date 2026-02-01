# Gemini AI Setup Instructions

## Get Your Free Gemini API Key

Your logic evaluation now uses Google's Gemini AI to understand the **meaning** of your logic steps, not just exact text matching! This means different grammar and wording will still be marked as correct if the logic is semantically correct.

### Step 1: Get Gemini API Key (FREE)

1. Go to: **https://makersuite.google.com/app/apikey**
2. Sign in with your Google account
3. Click **"Create API Key"**
4. Copy your API key

### Step 2: Add API Key to Project

1. Open the file: `server/.env`
2. Find the line: `GEMINI_API_KEY=your_gemini_api_key_here`
3. Replace `your_gemini_api_key_here` with your actual API key

Example:
```
GEMINI_API_KEY=AIzaSyAbC123XyZ456-YourActualKeyHere
```

### Step 3: Restart the Server

```bash
cd server
npm run dev
```

## How It Works

### Before (String Matching):
- ❌ "Sort intervals by start time" → **Correct**
- ❌ "Arrange intervals based on starting values" → **Incorrect** (same meaning, different words!)

### After (AI Semantic Understanding):
- ✅ "Sort intervals by start time" → **Correct**
- ✅ "Arrange intervals based on starting values" → **Correct** (AI understands it's the same!)
- ✅ "Order the intervals using their beginning points" → **Correct** (AI gets the meaning!)

## Benefits

✅ **Grammar-Flexible**: Different phrasings of the same logic are accepted  
✅ **Semantic Understanding**: AI focuses on meaning, not exact words  
✅ **Better Feedback**: More intelligent suggestions based on your logic  
✅ **Lenient Grading**: As long as your approach is correct, you pass!  
✅ **Fallback Support**: If AI fails, basic evaluation still works  

## Troubleshooting

### "Invalid AI response format" error:
- Check if your GEMINI_API_KEY is correct in `.env`
- Restart the server after adding the key
- Make sure you have internet connection

### Logic still marked incorrect:
- The AI analyzes the algorithmic approach, not just keywords
- Make sure your logic steps actually describe the correct algorithm
- Check if you're missing essential steps (input validation, core processing, output)

## API Key Limits (Free Tier)

- **60 requests per minute**
- **1500 requests per day**
- More than enough for learning and testing!

---

**Need Help?** 
- Gemini AI Documentation: https://ai.google.dev/docs
- API Key Management: https://makersuite.google.com/app/apikey
