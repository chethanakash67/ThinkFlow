const { generateAIText, hasOpenAIKey } = require('./aiClient');
const { LOGIC_PARSER_SYSTEM_PROMPT } = require('../src/utils/logicParserPrompt');
const { fallbackValidation } = require('./logicValidationService');

const normalize = (value) => String(value || '').toLowerCase();

const splitLogicNodes = (userLogic) => String(userLogic || '')
  .split(/\n+|(?:^|\s)(?:first|then|next|after that|finally|lastly|step \d+[:.)])/i)
  .map((part) => part.trim().replace(/^[,.;:\-\s]+/, '').trim())
  .filter(Boolean);

const safeParseJson = (text) => {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (_) {
    const fenced = text.match(/```json\s*([\s\S]*?)```/i);
    if (fenced?.[1]) {
      try {
        return JSON.parse(fenced[1]);
      } catch (_) {
        return null;
      }
    }
    const arrayMatch = text.match(/\[[\s\S]*\]/);
    if (!arrayMatch) return null;
    try {
      return JSON.parse(arrayMatch[0]);
    } catch (_) {
      return null;
    }
  }
};

const inferType = (text, index, total) => {
  const lower = normalize(text);
  if (/\b(input|parse|read|receive)\b/.test(lower)) return 'Input';
  if (index === total - 1 || /\b(return|output|print|answer)\b/.test(lower)) return 'Output';
  if (/\b(if|when|unless|condition|check)\b/.test(lower)) return 'Condition';
  if (/\b(loop|iterate|for each|while|traverse)\b/.test(lower)) return 'Loop';
  return 'Process';
};

const estimateComplexity = (text) => {
  const lower = normalize(text);
  if (/\bnested loop|matrix|grid|2d\b/.test(lower)) return 'O(n^2)';
  if (/\bsort|heap|priority queue\b/.test(lower)) return 'O(n log n)';
  if (/\bloop|iterate|for each|traverse|frequency|count|map|hash|dictionary\b/.test(lower)) return 'O(n)';
  return 'O(1)';
};

const detectContradiction = (text, problemContext = {}) => {
  const lower = normalize(text);
  const problemText = normalize([
    problemContext.title,
    problemContext.description,
    problemContext.constraints,
    Array.isArray(problemContext.examples) ? JSON.stringify(problemContext.examples) : problemContext.examples
  ].filter(Boolean).join('\n'));
  const wantsDescending = /\b(descending|largest|maximum|top|most frequent|highest|higher frequency)\b/.test(problemText);
  const wantsAscending = /\b(ascending|smallest|minimum|lowest|increasing)\b/.test(problemText);

  if (wantsDescending && /\b(sort ascending|ascending order|smallest first|increasing order|a\s*-\s*b)\b/.test(lower)) {
    return 'Contradiction: this step sorts ascending while the problem requires descending priority.';
  }

  if (wantsAscending && /\b(sort descending|descending order|largest first|decreasing order|b\s*-\s*a)\b/.test(lower)) {
    return 'Contradiction: this step sorts descending while the problem requires ascending priority.';
  }

  return null;
};

const toStarterComment = (text) => text
  .replace(/\s+/g, ' ')
  .replace(/[.]+$/, '')
  .trim();

const sanitizeNodes = (nodesPayload, problemContext, fallbackNodes) => {
  const nodes = Array.isArray(nodesPayload)
    ? nodesPayload
    : Array.isArray(nodesPayload?.nodes)
      ? nodesPayload.nodes
      : [];

  if (nodes.length === 0) return fallbackNodes;

  return nodes
    .map((node, index) => {
      const text = String(node.text || node.description || node.starter_comment || '').trim();
      if (!text) return null;
      const contradiction = detectContradiction(`${text} ${node.error || ''}`, problemContext);
      const error = node.error || contradiction || null;

      return {
        id: Number.isFinite(Number(node.id)) ? Number(node.id) : index + 1,
        text,
        type: ['Input', 'Process', 'Condition', 'Loop', 'Output'].includes(node.type) ? node.type : inferType(text, index, nodes.length),
        isValid: error ? false : node.isValid !== false,
        complexity: node.complexity || estimateComplexity(text),
        starter_comment: node.starter_comment || toStarterComment(text),
        error
      };
    })
    .filter(Boolean);
};

const fallbackParseLogic = ({ userLogic, problemContext = {} }) => {
  const parts = splitLogicNodes(userLogic);
  const validation = fallbackValidation(userLogic, problemContext);

  return parts.map((text, index) => {
    const feedback = validation.feedback_nodes?.find((node) => node.id === index + 1 && node.status === 'error');
    const contradiction = detectContradiction(text, problemContext);
    const error = feedback?.message || contradiction || null;

    return {
      id: index + 1,
      text,
      type: inferType(text, index, parts.length),
      isValid: !error,
      complexity: estimateComplexity(text),
      starter_comment: toStarterComment(text),
      error
    };
  });
};

const parseLogic = async ({ userLogic, problemContext = {} }) => {
  const fallbackNodes = fallbackParseLogic({ userLogic, problemContext });
  if (!hasOpenAIKey || !String(userLogic || '').trim()) return fallbackNodes;

  try {
    const prompt = `${LOGIC_PARSER_SYSTEM_PROMPT}

Problem context:
${JSON.stringify(problemContext, null, 2)}

Natural language programming approach:
${userLogic}

Return strict JSON only in this shape:
{
  "nodes": [
    {
      "id": 1,
      "text": "step text",
      "type": "Input | Process | Condition | Loop | Output",
      "isValid": true,
      "complexity": "O(n)",
      "starter_comment": "short comment",
      "error": null
    }
  ]
}`;

    const text = await generateAIText({
      prompt,
      instructions: 'You are ThinkFlow\'s logic parser. Convert English algorithm steps into structured JSON only.',
      json: true,
      maxOutputTokens: 1800
    });
    const parsed = safeParseJson(text);
    return sanitizeNodes(parsed, problemContext, fallbackNodes);
  } catch (error) {
    console.error('Logic parser OpenAI failed, using fallback:', error.message);
    return fallbackNodes;
  }
};

module.exports = {
  parseLogic,
  fallbackParseLogic
};
