const { generateAIText, hasOpenAIKey } = require('./aiClient');

const normalize = (value) => String(value || '').toLowerCase();

const splitLogicNodes = (userLogic) => {
  const parts = String(userLogic || '')
    .split(/\n+|(?:^|\s)(?:first|then|next|after that|finally|lastly|step \d+[:.)])/i)
    .map((part) => part.trim().replace(/^[,.;:\-\s]+/, '').trim())
    .filter(Boolean);

  return parts.length > 0 ? parts : [String(userLogic || '').trim()].filter(Boolean);
};

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

    const objectMatch = text.match(/\{[\s\S]*\}/);
    const arrayMatch = text.match(/\[[\s\S]*\]/);
    const candidates = [objectMatch, arrayMatch]
      .filter(Boolean)
      .sort((first, second) => first.index - second.index);

    for (const match of candidates) {
      try {
        return JSON.parse(match[0]);
      } catch (_) {
        // Try the next possible JSON boundary.
      }
    }

    return null;
  }
};

const sanitizeStatus = (status) => {
  if (status === 'valid' || status === 'warning' || status === 'invalid') return status;
  return 'warning';
};

const sanitizeNodeStatus = (status) => {
  if (status === 'correct' || status === 'warning' || status === 'error') return status;
  return 'warning';
};

const sanitizeValidation = (parsed, fallback) => {
  if (!parsed || typeof parsed !== 'object') return fallback;

  const feedbackNodes = Array.isArray(parsed.feedback_nodes)
    ? parsed.feedback_nodes
        .map((node, index) => ({
          id: Number.isFinite(Number(node.id)) ? Number(node.id) : index + 1,
          status: sanitizeNodeStatus(node.status),
          message: String(node.message || '').trim() || fallback.feedback_nodes[index]?.message || 'Review this logic step.'
        }))
        .filter((node) => node.message)
    : [];

  if (feedbackNodes.length === 0) return fallback;

  const hasError = feedbackNodes.some((node) => node.status === 'error');
  const hasWarning = feedbackNodes.some((node) => node.status === 'warning');

  return {
    overall_status: hasError ? 'invalid' : hasWarning ? 'warning' : sanitizeStatus(parsed.overall_status),
    feedback_nodes: feedbackNodes,
    source: 'openai'
  };
};

const mergeWithFallbackFindings = (primary, fallback) => {
  const nodes = [...(primary.feedback_nodes || [])];
  const seen = new Set(nodes.map((node) => `${node.id}:${node.status}:${normalize(node.message)}`));

  (fallback.feedback_nodes || [])
    .filter((node) => node.status === 'error' || /\b(equal|same frequency|tie|tie-breaker|edge case|empty|vague|frequency ordering)\b/i.test(node.message))
    .forEach((node) => {
      const key = `${node.id}:${node.status}:${normalize(node.message)}`;
      if (!seen.has(key)) {
        seen.add(key);
        nodes.push(node);
      }
    });

  const hasError = nodes.some((node) => node.status === 'error');
  const hasWarning = nodes.some((node) => node.status === 'warning');

  return {
    ...primary,
    overall_status: hasError ? 'invalid' : hasWarning ? 'warning' : primary.overall_status,
    feedback_nodes: nodes
  };
};

const getProblemText = (problemConstraints = {}) => {
  if (typeof problemConstraints === 'string') return problemConstraints;

  return [
    problemConstraints.title,
    problemConstraints.description,
    problemConstraints.constraints,
    Array.isArray(problemConstraints.examples) ? JSON.stringify(problemConstraints.examples) : problemConstraints.examples,
    Array.isArray(problemConstraints.expected_outputs) ? JSON.stringify(problemConstraints.expected_outputs) : ''
  ].filter(Boolean).join('\n');
};

const sanitizeInsightType = (type) => {
  if (type === 'error' || type === 'warning' || type === 'info') return type;
  if (type === 'correct') return 'info';
  return 'warning';
};

const getBlueprintLines = (text) => {
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
  return lines.length > 0 ? lines : [''];
};

const findLine = (lines, matcher, fallbackLine = 1) => {
  const index = lines.findIndex((line) => matcher(normalize(line), line));
  return index >= 0 ? index + 1 : fallbackLine;
};

const findLastMeaningfulLine = (lines) => {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (String(lines[index] || '').trim()) return index + 1;
  }
  return 1;
};

const clampInsightLine = (line, maxLine) => {
  const parsed = Number(line);
  if (!Number.isFinite(parsed)) return 1;
  return Math.min(Math.max(Math.round(parsed), 1), Math.max(maxLine, 1));
};

const sanitizeInsights = (parsed, fallbackInsights, maxLine) => {
  const rawInsights = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.insights)
      ? parsed.insights
      : [];

  if (rawInsights.length === 0) return fallbackInsights;

  return rawInsights
    .map((insight) => ({
      line: clampInsightLine(insight?.line, maxLine),
      type: sanitizeInsightType(insight?.type),
      message: String(insight?.message || '').trim()
    }))
    .filter((insight) => insight.message);
};

const dedupeInsights = (insights) => {
  const severity = { error: 0, warning: 1, info: 2 };
  const seen = new Set();

  return insights
    .filter((insight) => insight?.message)
    .sort((a, b) => {
      if (a.line !== b.line) return a.line - b.line;
      return severity[a.type] - severity[b.type];
    })
    .filter((insight) => {
      const key = `${insight.line}:${insight.type}:${normalize(insight.message)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

const mergeInsightsWithFallback = (primary, fallback) => {
  return dedupeInsights([
    ...(Array.isArray(primary) ? primary : []),
    ...(Array.isArray(fallback) ? fallback : [])
  ]);
};

const isCriticalMismatchInsight = (insight) => /critical mismatch/i.test(insight?.message || '');

const compactCriticalMismatchInsights = (insights) => {
  const deduped = dedupeInsights(insights);
  const criticalFindings = deduped.filter(isCriticalMismatchInsight);

  if (criticalFindings.length === 0) return deduped;

  const primaryCritical = criticalFindings.find((insight) => (
    /\bfail cases\b|\brequires\b|\bshould produce\b|\bexample\b/i.test(insight.message)
  )) || criticalFindings[0];

  return dedupeInsights([
    primaryCritical,
    {
      line: primaryCritical.line,
      type: 'warning',
      message: 'Rewrite the Blueprint for this problem: calculate each number\'s digit product, sort by digit product ascending, then tie by actual value ascending.'
    }
  ]);
};

const hasFrequencySortRequirement = (problemText) => (
  /\b(frequency|frequently|appearing most|most frequent|same frequency|equal frequency)\b/.test(problemText)
);

const hasValueDescendingTieRequirement = (problemText) => (
  /\b(same frequency|equal frequency|tie|ties|among elements with the same)\b/.test(problemText) &&
  /\b(value descending|descending value|value desc|larger value|higher value|greater value|sort by value descending|sort by value desc)\b/.test(problemText)
);

const fallbackLogicInsights = ({ userBlueprintText, problemDescription }) => {
  const lines = getBlueprintLines(userBlueprintText);
  const problemText = normalize(getProblemText(problemDescription));
  const logicText = normalize(userBlueprintText);
  const insights = [];
  const lastLine = findLastMeaningfulLine(lines);
  const sortLine = findLine(lines, (line) => /\b(sort|order|rearrange)\b/.test(line), lastLine);
  const countLine = findLine(lines, (line) => /\b(frequency|frequencies|freq|count|occurrence|occurrences|tally|map|hash|dictionary)\b/.test(line), 1);
  const complexityLine = findLine(lines, (line) => /\bo\s*\(\s*n\s*(?:log|lg)\s*n\s*\)|\bo\s*\(\s*n\s*\)|complexity|nested loop|compare every|pairwise\b/.test(line), lastLine);

  if (!logicText.trim()) {
    return [{
      line: 1,
      type: 'warning',
      message: 'Describe the logical flow before validating the Blueprint.'
    }];
  }

  const asksFrequencySort = hasFrequencySortRequirement(problemText);
  const asksValueDescendingTie = hasValueDescendingTieRequirement(problemText);
  const hasCountingLanguage = /\b(frequency|frequencies|freq|count|counts|occurrence|occurrences|tally)\b/.test(logicText);
  const hasCountingStructure = /\b(map|hash map|dictionary|object|table|counter)\b/.test(logicText);
  const hasSort = /\b(sort|order|rearrange)\b/.test(logicText);
  const hasFrequencyDescending = /\b(most frequent|higher frequency|highest frequency|frequency descending|descending frequency|freq descending|more frequent|sort by frequency desc|sort.*frequency.*desc)\b/.test(logicText);
  const hasWrongFrequencyOrder = /\b(frequency ascending|ascending frequency|lower frequency first|least frequent|increasing frequency|sort by frequency asc|sort.*frequency.*asc)\b/.test(logicText);
  const hasTieMention = /\b(same frequency|equal frequency|tie|ties|if.*freq(?:uency)?.*same|when.*freq(?:uency)?.*same|value descending|descending value|larger value|higher value|greater value|value desc)\b/.test(logicText);
  const hasTieDescending = /\b(value descending|descending value|value desc|larger value|higher value|greater value|larger number|higher number|greater number|sort.*value.*desc)\b/.test(logicText);
  const hasWrongTieBreaker = /\b(value ascending|ascending value|value asc|smaller value|lower value|smaller number|lower number|minimum value|min value|sort.*value.*asc)\b/.test(logicText);
  const claimsNLogN = /\bo\s*\(\s*n\s*(?:log|lg)\s*n\s*\)/.test(logicText);
  const claimsLinear = /\bo\s*\(\s*n\s*\)/.test(logicText);
  const hasNestedWork = /\b(nested loop|loop inside|compare every|every pair|pairwise|for each.*for each)\b/.test(logicText);

  if (asksFrequencySort && !hasCountingLanguage) {
    insights.push({
      line: countLine,
      type: 'error',
      message: 'Count each value with a frequency map before sorting.'
    });
  } else if (asksFrequencySort && !hasCountingStructure) {
    insights.push({
      line: countLine,
      type: 'warning',
      message: 'The frequency count is present; name the map, dictionary, or counter that stores it.'
    });
  }

  if (asksFrequencySort && hasWrongFrequencyOrder) {
    insights.push({
      line: sortLine,
      type: 'error',
      message: 'The frequency order is reversed. Values with higher frequency must come first.'
    });
  } else if (asksFrequencySort && (!hasSort || !hasFrequencyDescending)) {
    insights.push({
      line: sortLine,
      type: 'warning',
      message: 'Make the sort rule explicit: frequency descending comes first.'
    });
  }

  if (asksValueDescendingTie && hasWrongTieBreaker) {
    insights.push({
      line: sortLine,
      type: 'error',
      message: 'For equal frequencies, sort by value descending, not ascending or smaller first.'
    });
  } else if (asksValueDescendingTie && (!hasTieMention || !hasTieDescending)) {
    insights.push({
      line: sortLine,
      type: 'error',
      message: 'You forgot to sort by value descending for ties.'
    });
  }

  if ((claimsNLogN || /\bo\s*\(\s*n\s*(?:log|lg)\s*n\s*\)/.test(problemText)) && hasNestedWork) {
    insights.push({
      line: complexityLine,
      type: 'error',
      message: 'The described nested comparison flow is O(n^2), so O(n log n) is not achievable as written.'
    });
  }

  if (claimsLinear && hasSort) {
    insights.push({
      line: complexityLine,
      type: 'warning',
      message: 'Sorting makes this O(n log n), so do not describe it as O(n).'
    });
  }

  return dedupeInsights(insights);
};

const getExampleHint = (problemDescription = {}) => {
  const examples = typeof problemDescription === 'object' && Array.isArray(problemDescription.examples)
    ? problemDescription.examples
    : [];

  if (examples.length === 0) return 'the provided examples';

  const first = examples[0];
  if (!first?.input || first.output === undefined) return 'the provided examples';

  try {
    return `input ${JSON.stringify(first.input)} should produce ${JSON.stringify(first.output)}`;
  } catch (_) {
    return 'the provided examples';
  }
};

const fallbackRequirementLogicInsights = ({ userBlueprintText, problemDescription }) => {
  const lines = getBlueprintLines(userBlueprintText);
  const problemText = normalize(getProblemText(problemDescription));
  const logicText = normalize(userBlueprintText);
  const insights = [];
  const lastLine = findLastMeaningfulLine(lines);
  const firstLogicLine = findLine(lines, (line) => Boolean(line.trim()), 1);
  const sortLine = findLine(lines, (line) => /\b(sort|order|rearrange)\b/.test(line), lastLine);
  const exampleHint = getExampleHint(problemDescription);

  if (!logicText.trim()) {
    return [{
      line: 1,
      type: 'warning',
      message: 'Describe an algorithm before the Logic Auditor compares it with this problem.'
    }];
  }

  const isDigitProductProblem = /\bdigit product\b|\bproduct of (their )?digits\b/.test(problemText);
  const hasDigitProductLogic = /\bdigit product\b|\bproduct of (the )?digits\b|multiply.*digits|digits.*product|compute.*digits/.test(logicText);
  const hasFrequencySortLogic = /\bfrequency|frequencies|freq|most frequent|least frequent|count occurrences|frequency map\b/.test(logicText);
  const hasDigitProductTie = /\b(actual value ascending|value ascending|ascending value|smaller value|lower value|numeric ascending|number ascending)\b/.test(logicText);
  const hasWrongDigitProductTie = /\bactual value descending|value descending|descending value|larger value|higher value|greater value|number descending\b/.test(logicText);
  const hasSort = /\b(sort|order|rearrange)\b/.test(logicText);
  const hasProductAscending = (
    /\b(product\s+(?:asc|ascending)|ascending\s+product|digit\s+product\s+(?:asc|ascending)|smaller\s+product|lower\s+product)\b/.test(logicText) ||
    /\b(sort|order|rearrange)\b[\s\S]{0,120}\b(digit\s+product|product\s+of\s+(?:the\s+)?digits?|product)\b[\s\S]{0,120}\b(?:asc|ascending|increasing|low(?:er|est)?\s+to\s+high(?:er|est)?)\b/.test(logicText) ||
    /\b(?:asc|ascending|increasing|low(?:er|est)?\s+to\s+high(?:er|est)?)\b[\s\S]{0,120}\b(?:by|using|on)\b[\s\S]{0,80}\b(digit\s+product|product\s+of\s+(?:the\s+)?digits?|product)\b/.test(logicText)
  );
  const hasProductDescending = (
    /\b(product\s+(?:desc|descending)|descending\s+product|digit\s+product\s+(?:desc|descending)|larger\s+product|higher\s+product)\b/.test(logicText) ||
    /\b(sort|order|rearrange)\b[\s\S]{0,120}\b(digit\s+product|product\s+of\s+(?:the\s+)?digits?|product)\b[\s\S]{0,120}\b(?:desc|descending|decreasing|high(?:er|est)?\s+to\s+low(?:er|est)?)\b/.test(logicText) ||
    /\b(?:desc|descending|decreasing|high(?:er|est)?\s+to\s+low(?:er|est)?)\b[\s\S]{0,120}\b(?:by|using|on)\b[\s\S]{0,80}\b(digit\s+product|product\s+of\s+(?:the\s+)?digits?|product)\b/.test(logicText)
  );

  if (isDigitProductProblem && hasFrequencySortLogic && !hasDigitProductLogic) {
    insights.push({
      line: firstLogicLine,
      type: 'error',
      message: `CRITICAL MISMATCH: This Blueprint describes frequency sorting, but "${problemDescription.title || 'this problem'}" requires sorting by digit product. It will fail cases like ${exampleHint}.`
    });
  }

  if (isDigitProductProblem && !hasDigitProductLogic) {
    insights.push({
      line: firstLogicLine,
      type: 'error',
      message: 'CRITICAL MISMATCH: The Blueprint never calculates the product of each number\'s digits, which is the core requirement of this problem.'
    });
  }

  if (isDigitProductProblem && hasProductDescending) {
    insights.push({
      line: sortLine,
      type: 'error',
      message: 'The sort direction is wrong: digit products must be sorted ascending.'
    });
  } else if (isDigitProductProblem && (!hasSort || !hasProductAscending)) {
    insights.push({
      line: sortLine,
      type: 'warning',
      message: 'Missing sort rule: order numbers by digit product ascending.'
    });
  }

  if (isDigitProductProblem && hasWrongDigitProductTie) {
    insights.push({
      line: sortLine,
      type: 'error',
      message: 'Missing tie-breaker logic (actual value ascending). You described the opposite tie direction.'
    });
  } else if (isDigitProductProblem && !hasDigitProductTie) {
    insights.push({
      line: sortLine,
      type: 'warning',
      message: 'Missing tie-breaker logic (actual value ascending).'
    });
  }

  return compactCriticalMismatchInsights([
    ...insights,
    ...fallbackLogicInsights({ userBlueprintText, problemDescription })
  ]);
};

const getSortIssueStatus = ({ step, problemText }) => {
  const lowerStep = normalize(step);
  const lowerProblem = normalize(problemText);
  const wantsDescending = /\b(descending|largest|maximum|top|most frequent|highest|higher frequency)\b/.test(lowerProblem);
  const wantsAscending = /\b(ascending|smallest|minimum|lowest|increasing)\b/.test(lowerProblem);

  if (wantsDescending && /\b(sort ascending|ascending order|smallest first|increasing order|lower frequency first)\b/.test(lowerStep)) {
    return {
      status: 'error',
      message: 'Constraint Violation: This sorts ascending, but the problem requires descending priority.'
    };
  }

  if (wantsAscending && /\b(sort descending|descending order|largest first|decreasing order)\b/.test(lowerStep)) {
    return {
      status: 'error',
      message: 'Constraint Violation: This sorts descending, but the problem requires ascending priority.'
    };
  }

  if (/\bsort\b/.test(lowerStep) && !/\b(by|based on|ascending|descending|increasing|decreasing|frequency|value|tie|same)\b/.test(lowerStep)) {
    return {
      status: 'warning',
      message: 'This sort step is vague. Specify the exact comparator or ordering rule.'
    };
  }

  return null;
};

const fallbackValidation = (userLogic, problemConstraints = {}) => {
  const steps = splitLogicNodes(userLogic);
  const problemText = getProblemText(problemConstraints);
  const logicText = normalize(userLogic);
  const lowerProblem = normalize(problemText);
  const nodes = [];

  if (!logicText.trim()) {
    return {
      overall_status: 'warning',
      feedback_nodes: [
        {
          id: 1,
          status: 'warning',
          message: 'Start by describing the data structure, sorting rule, and final output.'
        }
      ],
      source: 'fallback'
    };
  }

  steps.forEach((step, index) => {
    const sortIssue = getSortIssueStatus({ step, problemText });
    if (sortIssue) {
      nodes.push({ id: index + 1, ...sortIssue });
      return;
    }

    const lowerStep = normalize(step);
    if (/\b(sort|order|rearrange)\b/.test(lowerStep)) {
      nodes.push({
        id: index + 1,
        status: 'correct',
        message: 'Sorting step is present; the comparator details will be checked against the problem rules.'
      });
      return;
    }

    if (/\b(frequency|count|map|hash|dictionary)\b/.test(lowerStep)) {
      nodes.push({
        id: index + 1,
        status: 'correct',
        message: 'Frequency map/counting approach is appropriate for grouping repeated values.'
      });
      return;
    }

    if (/\b(return|output|final|answer)\b/.test(lowerStep)) {
      nodes.push({
        id: index + 1,
        status: 'correct',
        message: 'Final output step is present.'
      });
      return;
    }

    nodes.push({
      id: index + 1,
      status: 'correct',
      message: 'This step is logically traceable.'
    });
  });

  const asksFrequencySort = /\bfrequency|frequently|appearing most\b/.test(lowerProblem);
  const asksTieBreaker = /\b(same frequency|equal frequency|tie|among elements with the same)\b/.test(lowerProblem);
  const hasFrequencyCounting = /\b(frequency|count|map|hash|dictionary)\b/.test(logicText);
  const hasSort = /\b(sort|order|rearrange)\b/.test(logicText);
  const hasFrequencyDescending = /\b(most frequent|higher frequency|highest frequency|frequency descending|descending frequency|more frequent)\b/.test(logicText);
  const hasTieBreaker = /\b(same frequency|equal frequency|tie|ties|if.*frequency.*same|when.*frequency.*same|value descending|larger number|larger value|descending value)\b/.test(logicText);
  const hasTieBreakerDescending = /\b(value descending|larger number|larger value|higher value|descending value)\b/.test(logicText);
  const hasWrongTieBreaker = /\b(value ascending|smaller number|smaller value|ascending value)\b/.test(logicText);
  const constraintsAllowEmpty = /\b0\s*(<=|≤)|empty|can be empty|length can be 0|0\s*<=\s*\w+\.length\b/i.test(problemText);
  const mentionsEmpty = /\b(empty|length 0|no elements|null)\b/.test(logicText);

  if (asksFrequencySort && !hasFrequencyCounting) {
    nodes.push({
      id: 1,
      status: 'warning',
      message: 'Missing core step: mention counting each value with a frequency map.'
    });
  }

  if (asksFrequencySort && (!hasSort || !hasFrequencyDescending)) {
    nodes.push({
      id: Math.max(steps.length, 1),
      status: 'warning',
      message: 'The frequency ordering is incomplete. Say that higher frequency comes first.'
    });
  }

  if (asksTieBreaker && !hasTieBreaker) {
    nodes.push({
      id: Math.max(steps.length, 1),
      status: 'warning',
      message: 'Did you consider what happens when frequencies are equal? Add the value-descending tie-breaker.'
    });
  }

  if (asksTieBreaker && hasTieBreaker && !hasTieBreakerDescending) {
    nodes.push({
      id: Math.max(steps.length, 1),
      status: 'warning',
      message: 'Tie-breaker is mentioned, but the direction should be value descending.'
    });
  }

  if (asksTieBreaker && hasWrongTieBreaker) {
    nodes.push({
      id: Math.max(steps.length, 1),
      status: 'error',
      message: 'Constraint Violation: equal-frequency values must be sorted descending, not ascending/smaller first.'
    });
  }

  if (constraintsAllowEmpty && !mentionsEmpty) {
    nodes.push({
      id: 1,
      status: 'warning',
      message: 'Edge case missing: mention what happens for an empty input.'
    });
  }

  const deduped = [];
  const seen = new Set();
  nodes.forEach((node) => {
    const key = `${node.id}:${node.status}:${node.message}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(node);
    }
  });

  const hasError = deduped.some((node) => node.status === 'error');
  const hasWarning = deduped.some((node) => node.status === 'warning');

  return {
    overall_status: hasError ? 'invalid' : hasWarning ? 'warning' : 'valid',
    feedback_nodes: deduped,
    source: 'fallback'
  };
};

const validateLogic = async (userLogic, problemConstraints = {}) => {
  const fallback = fallbackValidation(userLogic, problemConstraints);

  if (!hasOpenAIKey || !String(userLogic || '').trim()) {
    return fallback;
  }

  try {
    const steps = splitLogicNodes(userLogic);
    const prompt = `You are ThinkFlow's Logical Compiler.
Analyze the user's English-to-Code Blueprint before code is written.
Compare the user's logic against the problem requirements, constraints, examples, and edge cases.
Never generate code.
Return strict JSON only.

Problem:
${getProblemText(problemConstraints)}

User Blueprint Nodes:
${steps.map((step, index) => `${index + 1}. ${step}`).join('\n')}

Compiler rules:
1) Mark mathematically/contextually correct nodes as "correct".
2) Mark vague nodes as "warning", especially sort steps without exact criteria.
3) Mark contradictory nodes as "error", such as ascending when the problem requires descending.
4) Specifically check for missing edge cases and tie-breakers required by the prompt.
5) feedback_nodes.id must match the 1-based node number from User Blueprint Nodes. If feedback is global, attach it to the closest relevant node.

Output schema:
{
  "overall_status": "valid" | "warning" | "invalid",
  "feedback_nodes": [
    { "id": 1, "status": "correct", "message": "Frequency map approach is optimal." },
    { "id": 3, "status": "error", "message": "Constraint Violation: You are sorting ascending, but the problem requires descending." }
	  ]
	}`;

    const text = await generateAIText({
      prompt,
      instructions: 'You are ThinkFlow\'s logical compiler. Return one strict JSON object only.',
      json: true,
      maxOutputTokens: 1800
    });
    const parsed = safeParseJson(text);
    return mergeWithFallbackFindings(sanitizeValidation(parsed, fallback), fallback);
  } catch (error) {
    console.error('Logic validation OpenAI failed, using fallback:', error.message);
    return fallback;
  }
};

const validateLogicInsights = async ({ userBlueprintText, problemDescription }) => {
  const blueprint = String(userBlueprintText || '');
  const problemText = getProblemText(problemDescription);
  const lines = getBlueprintLines(blueprint);
  const fallback = fallbackLogicInsights({ userBlueprintText: blueprint, problemDescription: problemText });

  if (!hasOpenAIKey || !blueprint.trim()) {
    return fallback;
  }

  try {
    const prompt = `You are ThinkFlow's Logic Analysis service for a validateLogic endpoint.
Input: userBlueprintText and problemDescription.
Task: Compare the two. Do not check syntax. Check logical flow only.

Specific checks:
1) Does the user handle the tie-breaker? If frequency is the same, sort by value descending.
2) Does the user handle the frequency count correctly?
3) Is the described time complexity O(n log n) actually achievable with their logic?

Return strict JSON only. The response must be a JSON object containing an "insights" array:
{
  "insights": [
    { "line": 2, "type": "error", "message": "You forgot to sort by value descending for ties." }
  ]
}

Rules:
- Use 1-based line numbers from User Blueprint Lines.
- type must be "error", "warning", or "info".
- If the logic is sound, return { "insights": [] }.
- Do not include syntax feedback or code generation advice.

Problem Description:
${problemText}

User Blueprint Lines:
${lines.map((line, index) => `${index + 1}: ${line}`).join('\n')}`;

    const text = await generateAIText({
      prompt,
      instructions: 'You are ThinkFlow\'s validateLogic service. Return one strict JSON object only.',
      json: true,
      maxOutputTokens: 1600
    });
    const parsed = safeParseJson(text);
    const insights = sanitizeInsights(parsed, fallback, lines.length);
    return mergeInsightsWithFallback(insights, fallback);
  } catch (error) {
    console.error('Logic insight analysis OpenAI failed, using fallback:', error.message);
    return fallback;
  }
};

const validateLogicAgainstProblem = async ({ userBlueprintText, problem }) => {
  const blueprint = String(userBlueprintText || '');
  const problemContext = problem && typeof problem === 'object'
    ? problem
    : { description: String(problem || '') };
  const problemText = getProblemText(problemContext);
  const lines = getBlueprintLines(blueprint);
  const fallback = fallbackRequirementLogicInsights({
    userBlueprintText: blueprint,
    problemDescription: problemContext
  });

  if (!hasOpenAIKey || !blueprint.trim()) {
    return fallback;
  }

  try {
    const prompt = `You are ThinkFlow's Requirement-Logic Validator.
Compare the user's English Blueprint text against the specific goal of the assigned problem.
Do not check code syntax. Do not reward a generic algorithm unless it solves this exact problem.

Critical rule:
If the user is describing an algorithm for a different problem, flag this as a CRITICAL MISMATCH.
Example: describing Frequency Sort when the problem is Digit Product must be an error.

For every issue, explain why the logic will not work for the specific examples or test cases.

Return strict JSON only as an object containing an "insights" array:
{
  "insights": [
    { "line": 1, "type": "error", "message": "CRITICAL MISMATCH: This solves frequency sorting, but Sort by Digit Product requires sorting by product of digits." }
  ]
}

Allowed type values: "error", "warning", "info".
Use 1-based line numbers from User Blueprint Lines.
Return { "insights": [] } only when the Blueprint solves this exact problem.

Problem Title:
${problemContext.title || 'Untitled Problem'}

Problem Requirements:
${problemText}

User Blueprint Lines:
${lines.map((line, index) => `${index + 1}: ${line}`).join('\n')}`;

    const text = await generateAIText({
      prompt,
      instructions: 'You are ThinkFlow\'s requirement-logic validator. Return one strict JSON object only.',
      json: true,
      maxOutputTokens: 1600
    });
    const parsed = safeParseJson(text);
    const insights = sanitizeInsights(parsed, fallback, lines.length);
    return compactCriticalMismatchInsights(mergeInsightsWithFallback(insights, fallback));
  } catch (error) {
    console.error('Requirement-logic validation OpenAI failed, using fallback:', error.message);
    return fallback;
  }
};

module.exports = {
  validateLogic,
  validateLogicAgainstProblem,
  validateLogicInsights,
  fallbackRequirementLogicInsights,
  fallbackLogicInsights,
  fallbackValidation
};
