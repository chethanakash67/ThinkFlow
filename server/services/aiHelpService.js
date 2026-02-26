const { GoogleGenerativeAI } = require('@google/generative-ai');

const geminiKey = String(process.env.GEMINI_API_KEY || '').trim();
const hasGeminiKey = Boolean(
  geminiKey &&
  geminiKey.toLowerCase() !== 'your_gemini_api_key_here' &&
  geminiKey !== 'YOUR_GEMINI_API_KEY'
);

const genAI = hasGeminiKey ? new GoogleGenerativeAI(geminiKey) : null;

const normalize = (value) => String(value || '').toLowerCase();

const addUnique = (list, value) => {
  if (!value) return;
  if (!list.includes(value)) list.push(value);
};

const capList = (list, max = 5) => list.slice(0, max);

const hasUnbalancedDelimiters = (code) => {
  const pairs = [
    ['(', ')'],
    ['{', '}'],
    ['[', ']']
  ];

  for (const [open, close] of pairs) {
    let balance = 0;
    for (const ch of code) {
      if (ch === open) balance += 1;
      if (ch === close) balance -= 1;
      if (balance < 0) return true;
    }
    if (balance !== 0) return true;
  }

  return false;
};

const getCodeFacts = ({ code, language }) => {
  const src = String(code || '');
  const lang = normalize(language);

  return {
    lines: src.split('\n').filter((line) => line.trim()).length,
    hasFunction: /(function\s+\w+|\w+\s+\w+\s*\([^)]*\)\s*\{|def\s+\w+\s*\(|class\s+solution|public\s+.*\s+\w+\s*\()/i.test(src),
    hasReturn: /\breturn\b/.test(src),
    hasLoop: /\bfor\b|\bwhile\b/.test(src),
    hasNestedLoop: /\b(for|while)\b[\s\S]{0,180}\b(for|while)\b/.test(src),
    hasCondition: /\bif\b|\bswitch\b|\?\s*.+\s*:/.test(src),
    hasRecursion: /\b(\w+)\s*\([^)]*\)[\s\S]{0,300}\b\1\s*\(/.test(src),
    hasQueue: /\bqueue\s*<|std::queue|deque|arraydeque|\bqueue\b.*new|collections\.deque|\bdeque\b/i.test(src),
    hasMap: /\bunordered_map\b|\bhashmap\b|\bmap<|dict\b|object\b|new\s+Map\(/i.test(src),
    hasNullRootCheck: /if\s*\(\s*!?\s*root\s*\)|if\s*\(\s*root\s*==\s*(nullptr|null)\s*\)|if\s+not\s+root/i.test(src),
    hasLevelLoop: /\bq\.size\(\)|\bqueue\.size\(\)|levelSize|nodesInLevel|len\s*\(\s*queue\s*\)/i.test(src),
    hasTodo: /TODO|FIXME|pass\b|\.\.\.|\/\/\s*(write|implement|todo)/i.test(src),
    hasDebugLog: /console\.log|printf\s*\(|System\.out\.print|std::cout\s*<</i.test(src),
    hasComplexityComment: /O\s*\([^)]+\)/i.test(src),
    hasUnbalancedDelimiters: hasUnbalancedDelimiters(src),
    isCpp: lang === 'cpp' || lang === 'c++',
    isJs: lang === 'javascript' || lang === 'js',
    isPython: lang === 'python'
  };
};

const buildStaticHelp = ({ problem, question, code, language, logicSteps }) => {
  const lowerTitle = normalize(problem?.title);
  const lowerQuestion = normalize(question);
  const codeText = String(code || '');
  const facts = getCodeFacts({ code: codeText, language });

  const hints = [];
  const nextSteps = [];
  const warnings = [];

  if (!codeText.trim()) {
    return {
      answer: 'No code detected yet. Add a first draft so analysis can target your implementation.',
      hints: ['Start with function/class signature and expected return type.'],
      nextSteps: ['Write a minimal working version, then run Analyze Code again.'],
      warnings: ['Analysis needs non-empty code.'],
      source: 'static-analysis'
    };
  }

  if (facts.hasUnbalancedDelimiters) {
    addUnique(warnings, 'Possible unbalanced (), {}, or [] detected. Check bracket pairing.');
  }
  if (facts.hasTodo) {
    addUnique(warnings, 'Code still contains TODO/placeholder sections.');
  }
  if (facts.hasDebugLog) {
    addUnique(warnings, 'Debug output detected; remove logs before final submission.');
  }
  if (!facts.hasFunction) {
    addUnique(warnings, 'No clear entry function/class found for the judge to call.');
  }
  if (!facts.hasCondition) {
    addUnique(nextSteps, 'Add guard checks for edge cases (empty input, null root, bounds).');
  }
  if (!facts.hasReturn && (facts.isJs || facts.isPython || facts.isCpp)) {
    addUnique(nextSteps, 'Verify the solution returns the expected output value/type.');
  }
  if (!facts.hasComplexityComment) {
    addUnique(nextSteps, 'Add quick time/space complexity notes to validate your approach.');
  }

  if (lowerTitle.includes('binary tree') && lowerTitle.includes('level order')) {
    if (!facts.hasNullRootCheck) {
      addUnique(warnings, 'Missing early null-root check for empty tree input.');
    }
    if (!facts.hasQueue) {
      addUnique(hints, 'Level-order traversal usually uses a queue (BFS) to process nodes by depth.');
    }
    if (!facts.hasLevelLoop) {
      addUnique(hints, 'Capture current queue size each round to build one level at a time.');
    }
    if (facts.hasRecursion && !facts.hasQueue) {
      addUnique(hints, 'If you use DFS, group values by depth index to match level-order output format.');
    }
  } else if (lowerTitle.includes('two sum')) {
    if (!facts.hasMap) {
      addUnique(hints, 'Use a hash map for value -> index lookup to reach O(n).');
    }
    if (facts.hasNestedLoop) {
      addUnique(nextSteps, 'Current pattern looks quadratic; replace nested scans with map lookup.');
    }
  } else if (lowerTitle.includes('palindrome')) {
    addUnique(hints, 'Two-pointer scan with normalization is usually the simplest robust approach.');
  } else if (lowerTitle.includes('interval')) {
    addUnique(hints, 'Sort by start time first, then merge overlaps in one pass.');
  } else if (lowerTitle.includes('subarray')) {
    addUnique(hints, 'Track a running best/state variable instead of recomputing every window.');
  }

  if (!facts.hasLoop && !facts.hasRecursion) {
    addUnique(nextSteps, 'Core traversal/iteration logic is unclear; add explicit loop or recursion.');
  }

  if (Array.isArray(logicSteps) && logicSteps.length > 0) {
    if (facts.lines < logicSteps.length * 2) {
      addUnique(nextSteps, 'Implementation seems shorter than planned logic steps; verify each step is represented.');
    } else {
      addUnique(hints, 'Map each logic step to a matching code block to avoid missed cases.');
    }
  }

  if (lowerQuestion.includes('optimiz') && facts.hasNestedLoop) {
    addUnique(nextSteps, 'Optimization target: remove nested loop hotspots and prefer O(n)/O(n log n) strategy.');
  }

  if (!hints.length) addUnique(hints, 'Structure is reasonable; focus on edge-case handling and output shape checks.');
  if (!nextSteps.length) addUnique(nextSteps, 'Run one custom test for empty input and one for max-size input.');

  const riskCount = warnings.length;
  const answer = riskCount
    ? `Found ${riskCount} risk area(s) in your current ${language} code; fix those first, then validate edge cases.`
    : `Code structure looks mostly solid for "${problem?.title || 'this problem'}". Focus on edge cases and output format validation.`;

  return {
    answer,
    hints: capList(hints, 5),
    nextSteps: capList(nextSteps, 4),
    warnings: capList(warnings, 4),
    source: 'static-analysis'
  };
};

const safeParseHelp = (text) => {
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch (_) {
    const fenced = text.match(/```json\s*([\s\S]*?)```/i);
    if (fenced && fenced[1]) {
      try {
        return JSON.parse(fenced[1]);
      } catch (_) {
        return null;
      }
    }

    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch (_) {
      return null;
    }
  }
};

const generateAIHelp = async ({ problem, question, code, language, logicSteps }) => {
  const staticHelp = buildStaticHelp({ problem, question, code, language, logicSteps });

  if (!genAI) {
    return staticHelp;
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
1) Analyze the code provided, not generic advice.
2) Do not provide full final code.
3) Give practical debugging hints tied to observed code patterns.
4) Mention at most 3 major risk areas.
5) Keep each hint and next step to one sentence.

Output JSON schema:
{
  "answer": "short coaching answer",
  "hints": ["hint1", "hint2", "hint3"],
  "nextSteps": ["step1", "step2"],
  "warnings": ["warning1"]
}`;

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json' }
    });
    const response = await result.response;
    const text = response.text();
    const parsed = safeParseHelp(text);

    if (!parsed || typeof parsed !== 'object') {
      return staticHelp;
    }

    return {
      answer: parsed.answer || staticHelp.answer,
      hints: Array.isArray(parsed.hints) && parsed.hints.length ? capList(parsed.hints, 5) : staticHelp.hints,
      nextSteps: Array.isArray(parsed.nextSteps) && parsed.nextSteps.length ? capList(parsed.nextSteps, 4) : staticHelp.nextSteps,
      warnings: Array.isArray(parsed.warnings) ? capList(parsed.warnings, 4) : staticHelp.warnings,
      source: 'gemini'
    };
  } catch (error) {
    console.error('AI help generation failed, using static analysis:', error.message);
    return staticHelp;
  }
};

module.exports = { generateAIHelp };
