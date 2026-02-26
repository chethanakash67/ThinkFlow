const { GoogleGenerativeAI } = require('@google/generative-ai');

const geminiKey = String(process.env.GEMINI_API_KEY || '').trim();
const hasGeminiKey = Boolean(
  geminiKey &&
  geminiKey.toLowerCase() !== 'your_gemini_api_key_here' &&
  geminiKey !== 'YOUR_GEMINI_API_KEY'
);

const genAI = hasGeminiKey ? new GoogleGenerativeAI(geminiKey) : null;

const normalize = (value) => String(value || '').toLowerCase();

const fallbackReasoningEvaluation = ({ intendedLogic, structuredCodeFlow }) => {
  const intended = normalize(intendedLogic);
  const flow = normalize(structuredCodeFlow);

  const wantsConditionBeforeOutput =
    intended.includes('before printing') ||
    intended.includes('before output') ||
    intended.includes('check') && intended.includes('before');

  const outputPos = Math.min(
    ...['print', 'output', 'display', 'return result']
      .map((token) => flow.indexOf(token))
      .filter((index) => index >= 0)
  );

  const conditionPos = Math.min(
    ...['if', 'condition', 'check', 'validate']
      .map((token) => flow.indexOf(token))
      .filter((index) => index >= 0)
  );

  const hasOutput = Number.isFinite(outputPos);
  const hasCondition = Number.isFinite(conditionPos);

  const mismatch = wantsConditionBeforeOutput && hasOutput && hasCondition && outputPos < conditionPos;

  if (mismatch) {
    return {
      matchesIntendedLogic: false,
      mismatchPoint: 'Result/output step executes before the condition check step.',
      whyMismatch: 'The workflow performs an action that depends on a condition before validating that condition.',
      conceptToReview: 'Condition checking and execution order in control flow.',
      improvementDirection: 'Place the decision/check step before any output that depends on that decision.',
      source: 'fallback'
    };
  }

  return {
    matchesIntendedLogic: true,
    mismatchPoint: hasCondition ? 'No critical ordering mismatch detected.' : 'Condition/check step is unclear in workflow.',
    whyMismatch: hasCondition
      ? 'Workflow order appears to follow intended sequencing at a high level.'
      : 'The flow does not clearly show where validation/condition logic is performed.',
    conceptToReview: hasCondition ? 'Workflow traceability between intent and execution.' : 'Explicit condition definition before action.',
    improvementDirection: hasCondition
      ? 'Keep each intended step explicitly mapped to one workflow step.'
      : 'Make condition and branching steps explicit before output or state changes.',
    source: 'fallback'
  };
};

const generateReasoningEvaluation = async ({ intendedLogic, structuredCodeFlow }) => {
  const fallback = fallbackReasoningEvaluation({ intendedLogic, structuredCodeFlow });

  if (!genAI) {
    return fallback;
  }

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const prompt = `You are Think Flow's reasoning evaluator.
You must analyze logic/workflow only.
Never generate code.
Never fix or rewrite code.

Input:
1) Intended Program Logic:
${intendedLogic}

2) Program Workflow:
${structuredCodeFlow}

Task:
- Compare intended logic vs workflow.
- Identify mismatches in logical steps or execution order.
- Explain reasoning issues in simple English.
- Provide conceptual guidance only.

Output STRICT JSON only:
{
  "matchesIntendedLogic": true or false,
  "mismatchPoint": "short sentence",
  "whyMismatch": "short explanation",
  "conceptToReview": "single concept",
  "improvementDirection": "conceptual improvement, no code"
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
      matchesIntendedLogic: Boolean(parsed.matchesIntendedLogic),
      mismatchPoint: parsed.mismatchPoint || fallback.mismatchPoint,
      whyMismatch: parsed.whyMismatch || fallback.whyMismatch,
      conceptToReview: parsed.conceptToReview || fallback.conceptToReview,
      improvementDirection: parsed.improvementDirection || fallback.improvementDirection,
      source: 'gemini'
    };
  } catch (error) {
    console.error('Reasoning model failed, using fallback:', error.message);
    return fallback;
  }
};

module.exports = { generateReasoningEvaluation };
