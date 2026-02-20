const { GoogleGenerativeAI } = require('@google/generative-ai');

const hasGeminiKey = Boolean(
  process.env.GEMINI_API_KEY &&
  process.env.GEMINI_API_KEY !== 'your_gemini_api_key_here' &&
  process.env.GEMINI_API_KEY !== 'YOUR_GEMINI_API_KEY'
);

const genAI = hasGeminiKey ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;

const buildFallbackHelp = ({ problem, question, code, language, logicSteps }) => {
  const lowerTitle = (problem?.title || '').toLowerCase();
  const lowerQuestion = (question || '').toLowerCase();

  const hints = [];
  const nextSteps = [];
  const warnings = [];

  if (!code || !code.trim()) {
    warnings.push('No code detected yet. Start with a function signature first.');
    nextSteps.push('Write a minimal working solution before optimizing.');
  }

  if (lowerTitle.includes('two sum')) {
    hints.push('Use a hash map to track previously seen values and their indices.');
    hints.push('At each index i, check whether target - nums[i] already exists in the map.');
  } else if (lowerTitle.includes('palindrome')) {
    hints.push('Use two pointers (left/right), skipping non-alphanumeric chars.');
    hints.push('Compare lowercase forms while moving pointers inward.');
  } else if (lowerTitle.includes('interval')) {
    hints.push('Sort intervals by start value before merging.');
    hints.push('Merge when current.start <= lastMerged.end.');
  } else if (lowerTitle.includes('subarray')) {
    hints.push('Track current best ending sum and global best sum (Kadane).');
  } else {
    hints.push('List input constraints first, then choose a matching data structure.');
    hints.push('Use examples to validate edge cases early.');
  }

  if (problem?.difficulty === 'hard') {
    nextSteps.push('Document time/space complexity before coding final version.');
    nextSteps.push('Test edge cases: empty input, single value, large bounds.');
  } else {
    nextSteps.push('Validate with provided examples before submission.');
    nextSteps.push('Add one edge-case test not present in the prompt.');
  }

  if (language === 'javascript' && code && !/function|=>/.test(code)) {
    warnings.push('Define a clear function entry point so the judge can call your solution.');
  }

  if (Array.isArray(logicSteps) && logicSteps.length > 0) {
    hints.push('Your logic steps are present; align each major code block with one step.');
  }

  if (lowerQuestion.includes('optimiz')) {
    nextSteps.push('Compare current complexity against O(n), O(n log n), and O(n^2) alternatives.');
  }

  return {
    answer: `Focus on correctness first for "${problem.title}", then optimize after passing core test cases.`,
    hints,
    nextSteps,
    warnings,
    source: 'fallback'
  };
};

const generateAIHelp = async ({ problem, question, code, language, logicSteps }) => {
  const fallback = buildFallbackHelp({ problem, question, code, language, logicSteps });

  if (!genAI) {
    return fallback;
  }

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const prompt = `You are a senior coding interview coach.
Return strict JSON only.

Problem:
- Title: ${problem.title}
- Difficulty: ${problem.difficulty}
- Description: ${problem.description}
- Constraints: ${problem.constraints || 'N/A'}

User context:
- Language: ${language}
- Question: ${question || 'Review my current code and provide targeted guidance.'}
- Logic steps: ${Array.isArray(logicSteps) ? JSON.stringify(logicSteps) : '[]'}
- Code:
${code || '// No code provided'}

Rules:
1) Do not provide full final code.
2) Give practical debugging hints.
3) Keep advice actionable and specific.
4) Mention at most 2 major mistakes/risk areas.

Output JSON schema:
{
  "answer": "short coaching answer",
  "hints": ["hint1", "hint2", "hint3"],
  "nextSteps": ["step1", "step2"],
  "warnings": ["warning1"]
}`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    const match = text.match(/\{[\s\S]*\}/);

    if (!match) {
      return fallback;
    }

    const parsed = JSON.parse(match[0]);
    return {
      answer: parsed.answer || fallback.answer,
      hints: Array.isArray(parsed.hints) ? parsed.hints : fallback.hints,
      nextSteps: Array.isArray(parsed.nextSteps) ? parsed.nextSteps : fallback.nextSteps,
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings : fallback.warnings,
      source: 'gemini'
    };
  } catch (error) {
    console.error('AI help generation failed, falling back:', error.message);
    return fallback;
  }
};

module.exports = { generateAIHelp };
