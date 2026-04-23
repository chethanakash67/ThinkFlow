/**
 * Logic Evaluation Service with Gemini AI
 * Evaluates structured logic inputs semantically using AI
 * Provides intelligent feedback based on meaning, not exact text matching
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'YOUR_GEMINI_API_KEY');

const evaluateLogic = async (logicSteps, problem) => {
  try {
    const testCases = problem.test_cases;
    const expectedOutputs = problem.expected_outputs;
    
    // Validate logic structure
    if (!Array.isArray(logicSteps) || logicSteps.length === 0) {
      return {
        status: 'incorrect',
        score: 0,
        feedback: 'Logic steps must be provided as a non-empty array',
        suggestions: ['Provide at least one logic step'],
      };
    }

    // Use Gemini AI to evaluate logic semantically
    const aiEvaluation = await evaluateLogicWithAI(logicSteps, problem);
    
    return aiEvaluation;
  } catch (error) {
    console.error('Logic evaluation error:', error);
    // Fallback to basic evaluation if AI fails
    return fallbackEvaluation(logicSteps, problem);
  }
};

const evaluateLogicWithAI = async (logicSteps, problem) => {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-pro' });

    // Prepare the prompt for Gemini
    const prompt = `You are an expert programming instructor evaluating a student's problem-solving logic.

**Problem Title:** ${problem.title}
**Problem Description:** ${problem.description}
**Difficulty:** ${problem.difficulty}

**Expected Algorithm/Approach:**
The correct solution should follow these general steps for "${problem.title}":
${getExpectedApproach(problem)}

**Student's Logic Steps:**
${logicSteps.map((step, idx) => `${idx + 1}. [${step.type || 'process'}] ${step.description}`).join('\n')}

**Evaluation Criteria:**
1. Analyze if the student's logic is semantically correct, even if the wording is different
2. Focus on the MEANING and APPROACH, not exact word matching
3. Check if all essential algorithmic steps are covered
4. Verify if edge cases are considered
5. Assess if the logic would produce correct outputs

**Output Format (respond ONLY with valid JSON):**
{
  "status": "correct" | "partially_correct" | "incorrect",
  "score": 0-100,
  "feedback": "Clear explanation of what's right or wrong",
  "suggestions": ["specific improvement suggestion 1", "suggestion 2"],
  "isSemanticallySimilar": true | false,
  "missingConcepts": ["concept1", "concept2"]
}

Be lenient with different phrasings. If the student describes the same algorithmic approach with different words, mark it as correct.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    // Parse JSON response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const evaluation = JSON.parse(jsonMatch[0]);
      return {
        status: evaluation.status || 'incorrect',
        score: evaluation.score || 0,
        feedback: evaluation.feedback || 'Unable to evaluate',
        suggestions: evaluation.suggestions || [],
        analysis: {
          totalSteps: logicSteps.length,
          isSemanticallySimilar: evaluation.isSemanticallySimilar,
          missingConcepts: evaluation.missingConcepts || []
        }
      };
    }
    
    throw new Error('Invalid AI response format');
  } catch (error) {
    console.error('Gemini AI evaluation error:', error);
    throw error;
  }
};

const getExpectedApproach = (problem) => {
  const title = problem.title?.toLowerCase() || '';
  
  if (title.includes('two sum')) {
    return `- Use a hash map to store numbers and their indices
- For each number, check if complement (target - current) exists in hash map
- Return indices when complement is found`;
  }
  
  if (title.includes('reverse')) {
    return `- Use two pointers approach (start and end)
- Swap elements while pointers haven't met
- Move pointers towards center`;
  }
  
  if (title.includes('palindrome')) {
    return `- Use two pointers (left and right)
- Compare characters at both ends
- Move pointers inward if characters match
- Return false if any mismatch`;
  }
  
  if (title.includes('merge') && title.includes('interval')) {
    return `- Sort intervals by start time
- Initialize result list with first interval
- For each subsequent interval, check if it overlaps with last in result
- If overlap, merge by updating end time
- If no overlap, add to result`;
  }
  
  if (title.includes('maximum') && title.includes('subarray')) {
    return `- Use Kadane's algorithm or dynamic programming
- Track current sum and maximum sum
- At each element, decide to extend current subarray or start new
- Update maximum when current exceeds it`;
  }

  if (title.includes('frequency') && title.includes('value')) {
    return `- Count the frequency of each number using a map or dictionary
- Sort the numbers by increasing frequency
- If two numbers have the same frequency, sort them by value
- Return the reordered array after applying both rules`;
  }
  
  return `Analyze the problem requirements and design an efficient algorithm to solve it.`;
};

const getProblemConcepts = (problem) => {
  const title = problem.title?.toLowerCase() || '';
  const description = problem.description?.toLowerCase() || '';

  if (title.includes('frequency') && title.includes('value')) {
    return [
      ['frequency', 'count'],
      ['map', 'dictionary', 'hash map'],
      ['sort', 'sorted', 'reorder'],
      ['same frequency', 'equal frequency'],
      ['value', 'number'],
    ];
  }

  if (title.includes('two sum')) {
    return [
      ['hash map', 'map', 'dictionary'],
      ['target', 'complement'],
      ['index', 'indices'],
    ];
  }

  if (title.includes('palindrome')) {
    return [
      ['two pointer', 'left', 'right'],
      ['compare'],
      ['match', 'mismatch'],
    ];
  }

  if (title.includes('merge') && title.includes('interval')) {
    return [
      ['sort', 'sorted'],
      ['overlap', 'merge'],
      ['result', 'interval'],
    ];
  }

  if (description.includes('sort')) {
    return [['sort', 'sorted', 'reorder']];
  }

  return [];
};

const fallbackEvaluation = (logicSteps, problem) => {
  // Basic fallback evaluation when AI is not available
  const analysis = analyzeLogicSteps(logicSteps, problem.test_cases, problem.expected_outputs, problem);
  const feedback = generateFeedback(analysis, problem);
  const score = calculateScore(analysis, problem.test_cases.length);
  
  let status = 'incorrect';
  if (score === 100) {
    status = 'correct';
  } else if (score >= 50) {
    status = 'partially_correct';
  }

  return {
    status,
    score,
    feedback: feedback.message,
    suggestions: feedback.suggestions,
    analysis: {
      totalSteps: logicSteps.length,
      coveredTestCases: analysis.coveredTestCases,
      missingSteps: analysis.missingSteps,
    },
  };
};

const analyzeLogicSteps = (logicSteps, testCases, expectedOutputs, problem = {}) => {
  const analysis = {
    coveredTestCases: 0,
    missingSteps: [],
    incorrectConditions: [],
    edgeCasesHandled: false,
  };

  const logicText = JSON.stringify(logicSteps).toLowerCase();

  // Check if logic covers all test cases
  for (let i = 0; i < testCases.length; i++) {
    const testCase = testCases[i];
    
    // Extract key variables/values from test case
    const keyElements = extractKeyElements(testCase);
    
    let covered = false;
    for (const element of keyElements) {
      if (logicText.includes(element.toLowerCase())) {
        covered = true;
        break;
      }
    }
    
    if (covered) {
      analysis.coveredTestCases++;
    }
  }

  const conceptGroups = getProblemConcepts(problem);

  if (conceptGroups.length > 0) {
    const matchedConceptGroups = conceptGroups.filter((group) =>
      group.some((term) => logicText.includes(term))
    ).length;

    if (matchedConceptGroups > 0) {
      const conceptCoverage = Math.round((matchedConceptGroups / conceptGroups.length) * Math.max(testCases.length, 1));
      analysis.coveredTestCases = Math.max(
        analysis.coveredTestCases,
        Math.min(testCases.length, conceptCoverage)
      );
    }
  }

  // Check for common missing steps
  const requiredSteps = ['input', 'process', 'output'];
  const stepTypes = logicSteps.map(step => step.type || step.step_type || '').map(s => s.toLowerCase());
  
  requiredSteps.forEach(required => {
    if (!stepTypes.some(type => type.includes(required))) {
      analysis.missingSteps.push(`Missing ${required} step`);
    }
  });

  // Check for condition handling
  const hasConditions = logicSteps.some(step => 
    step.condition || step.if || step.when || 
    (step.description && (step.description.includes('if') || step.description.includes('when')))
  );
  
  if (!hasConditions && testCases.length > 1) {
    analysis.incorrectConditions.push('Logic should handle different cases/conditions');
  }

  // Check edge cases
  analysis.edgeCasesHandled = logicSteps.some(step => 
    step.description && (
      step.description.includes('edge') || 
      step.description.includes('empty') || 
      step.description.includes('null') ||
      step.description.includes('zero')
    )
  );

  return analysis;
};

const extractKeyElements = (testCase) => {
  const elements = [];
  const traverse = (obj) => {
    if (typeof obj === 'object' && obj !== null) {
      for (const key in obj) {
        if (typeof obj[key] === 'string' || typeof obj[key] === 'number') {
          elements.push(String(obj[key]));
        } else if (Array.isArray(obj[key])) {
          obj[key].forEach(item => {
            if (typeof item === 'string' || typeof item === 'number') {
              elements.push(String(item));
            }
          });
        } else {
          traverse(obj[key]);
        }
      }
    }
  };
  traverse(testCase);
  return elements;
};

const generateFeedback = (analysis, problem) => {
  const suggestions = [];
  let message = '';

  if (analysis.coveredTestCases === problem.test_cases.length) {
    message = 'Great! Your logic covers all test cases.';
  } else if (analysis.coveredTestCases > 0) {
    message = `Your logic covers ${analysis.coveredTestCases} out of ${problem.test_cases.length} test cases.`;
    suggestions.push('Consider how your logic handles different input scenarios');
  } else {
    message = 'Your logic needs to better address the problem requirements.';
    suggestions.push('Review the problem description and examples');
    suggestions.push('Break down the problem into smaller steps');
  }

  if (analysis.missingSteps.length > 0) {
    suggestions.push(...analysis.missingSteps);
  }

  if (analysis.incorrectConditions.length > 0) {
    suggestions.push(...analysis.incorrectConditions);
  }

  if (!analysis.edgeCasesHandled && problem.difficulty !== 'easy') {
    suggestions.push('Consider edge cases (empty inputs, boundary values, etc.)');
  }

  if (suggestions.length === 0) {
    suggestions.push('Your logic looks good! Try implementing it in code.');
  }

  return { message, suggestions };
};

const calculateScore = (analysis, totalTestCases) => {
  if (totalTestCases === 0) return 0;
  
  let score = 0;
  
  // Test case coverage (60% weight)
  const coverageScore = (analysis.coveredTestCases / totalTestCases) * 60;
  score += coverageScore;
  
  // Missing steps penalty (20% weight)
  const missingStepsPenalty = Math.min(analysis.missingSteps.length * 5, 20);
  score += (20 - missingStepsPenalty);
  
  // Condition handling (20% weight)
  if (analysis.incorrectConditions.length === 0) {
    score += 20;
  } else {
    score += Math.max(0, 20 - analysis.incorrectConditions.length * 5);
  }
  
  return Math.round(Math.min(100, Math.max(0, score)));
};

const TRACE_PURPOSES = {
  'Input Initialization': 'Start execution with known sample input values and initial variable state.',
  'Step Execution': 'Show how each logic instruction changes the current state.',
  'Condition Evaluation': 'Reveal the exact decision being checked and whether it is true or false.',
  'Control Flow Movement': 'Explain which branch or path execution follows next.',
  'Iteration Handling': 'Break repeated execution into individual loop iterations.',
  'Final Output Generation': 'Show the final state and learner-visible output.'
};

const cloneValue = (value) => {
  if (value === undefined) {
    return undefined;
  }

  return JSON.parse(JSON.stringify(value));
};

const toTraceVariables = (testCase) => {
  if (testCase && typeof testCase === 'object' && !Array.isArray(testCase)) {
    if (testCase.input !== undefined) {
      if (testCase.input && typeof testCase.input === 'object' && !Array.isArray(testCase.input)) {
        return cloneValue(testCase.input);
      }
      return { input: cloneValue(testCase.input) };
    }
    return cloneValue(testCase);
  }

  return testCase === undefined ? {} : { input: cloneValue(testCase) };
};

const inferStage = (stepType, description) => {
  const normalizedType = String(stepType || '').toLowerCase();
  const normalizedDescription = String(description || '').toLowerCase();

  if (normalizedType === 'input' || normalizedDescription.includes('input')) {
    return 'Input Initialization';
  }

  if (normalizedType === 'output' || normalizedDescription.includes('print') || normalizedDescription.includes('return')) {
    return 'Final Output Generation';
  }

  if (normalizedType === 'condition' || normalizedDescription.includes('if ') || normalizedDescription.startsWith('if(') || normalizedDescription.includes('else')) {
    return 'Condition Evaluation';
  }

  if (normalizedType === 'loop' || normalizedDescription.includes('for ') || normalizedDescription.includes('while ') || normalizedDescription.includes('iterate') || normalizedDescription.includes('loop')) {
    return 'Iteration Handling';
  }

  return 'Step Execution';
};

const parseLiteral = (rawValue, variables) => {
  const trimmed = String(rawValue || '').trim().replace(/[),.]$/, '');

  if (!trimmed) {
    return undefined;
  }

  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }

  if (/^(true|false)$/i.test(trimmed)) {
    return trimmed.toLowerCase() === 'true';
  }

  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith('\'') && trimmed.endsWith('\''))) {
    return trimmed.slice(1, -1);
  }

  if (Object.prototype.hasOwnProperty.call(variables, trimmed)) {
    return cloneValue(variables[trimmed]);
  }

  return undefined;
};

const parseAssignmentsFromText = (description, variables) => {
  const assignments = [];
  const matches = String(description || '').matchAll(/\b([a-zA-Z_]\w*)\s*=\s*([^,;\n]+)/g);

  for (const match of matches) {
    const variableName = match[1];
    const rawExpression = match[2].trim();
    let nextValue = parseLiteral(rawExpression, variables);

    if (nextValue === undefined) {
      const mathMatch = rawExpression.match(/^([a-zA-Z_]\w*)\s*([\+\-\*\/])\s*([a-zA-Z_]\w*|-?\d+(?:\.\d+)?)$/);
      if (mathMatch) {
        const leftValue = parseLiteral(mathMatch[1], variables);
        const rightValue = parseLiteral(mathMatch[3], variables);
        const operator = mathMatch[2];

        if (typeof leftValue === 'number' && typeof rightValue === 'number') {
          if (operator === '+') nextValue = leftValue + rightValue;
          if (operator === '-') nextValue = leftValue - rightValue;
          if (operator === '*') nextValue = leftValue * rightValue;
          if (operator === '/' && rightValue !== 0) nextValue = leftValue / rightValue;
        }
      }
    }

    if (nextValue !== undefined) {
      assignments.push({
        variable: variableName,
        value: nextValue,
      });
    }
  }

  return assignments;
};

const extractConditionExpression = (description) => {
  const text = String(description || '').trim();
  const ifMatch = text.match(/\bif\s*\(([^)]+)\)|\bif\b\s+(.+)/i);
  if (ifMatch) {
    return (ifMatch[1] || ifMatch[2] || '').trim().replace(/[.:]$/, '');
  }

  const whileMatch = text.match(/\bwhile\s*\(([^)]+)\)|\bwhile\b\s+(.+)/i);
  if (whileMatch) {
    return (whileMatch[1] || whileMatch[2] || '').trim().replace(/[.:]$/, '');
  }

  return '';
};

const evaluateSimpleCondition = (expression, variables) => {
  const cleaned = String(expression || '').trim();
  if (!cleaned) {
    return null;
  }

  const comparisonMatch = cleaned.match(/^([a-zA-Z_]\w*|-?\d+(?:\.\d+)?|true|false|"[^"]*"|'[^']*')\s*(===|==|!==|!=|>=|<=|>|<)\s*([a-zA-Z_]\w*|-?\d+(?:\.\d+)?|true|false|"[^"]*"|'[^']*')$/);
  if (!comparisonMatch) {
    return null;
  }

  const leftValue = parseLiteral(comparisonMatch[1], variables);
  const rightValue = parseLiteral(comparisonMatch[3], variables);
  const operator = comparisonMatch[2];

  if (leftValue === undefined || rightValue === undefined) {
    return null;
  }

  switch (operator) {
    case '>':
      return leftValue > rightValue;
    case '<':
      return leftValue < rightValue;
    case '>=':
      return leftValue >= rightValue;
    case '<=':
      return leftValue <= rightValue;
    case '==':
      return leftValue == rightValue; // eslint-disable-line eqeqeq
    case '===':
      return leftValue === rightValue;
    case '!=':
      return leftValue != rightValue; // eslint-disable-line eqeqeq
    case '!==':
      return leftValue !== rightValue;
    default:
      return null;
  }
};

const parseLoopDefinition = (description, variables) => {
  const text = String(description || '').trim();
  const forMatch = text.match(/\bfor\s+([a-zA-Z_]\w*)\s*=\s*([a-zA-Z_]\w*|-?\d+(?:\.\d+)?)\s+to\s+([a-zA-Z_]\w*|-?\d+(?:\.\d+)?)/i);
  if (!forMatch) {
    return null;
  }

  const loopVariable = forMatch[1];
  const start = parseLiteral(forMatch[2], variables);
  const end = parseLiteral(forMatch[3], variables);

  if (typeof start !== 'number' || typeof end !== 'number') {
    return null;
  }

  return {
    loopVariable,
    start,
    end,
    iterations: Math.max(0, Math.min(Math.abs(end - start) + 1, 8)),
    direction: start <= end ? 1 : -1,
  };
};

const createTraceStep = ({
  stepNumber,
  stage,
  stepDescription,
  variablesState,
  conditionResult = null,
  flowAction = null,
  iteration = null,
  systemOutput = null,
  purpose = TRACE_PURPOSES[stage],
  sourceStep = null,
}) => ({
  stepNumber,
  stage,
  stepDescription,
  variablesState: cloneValue(variablesState || {}),
  conditionResult,
  flowAction,
  iteration,
  systemOutput,
  purpose,
  sourceStep,
});

const generateExecutionSteps = (logicSteps, testCase, problem = null) => {
  const executionSteps = [];
  const variables = toTraceVariables(testCase);
  const sampleInput = testCase?.input !== undefined ? cloneValue(testCase.input) : cloneValue(testCase);
  const sampleOutput = problem?.expected_outputs?.[0]?.output ?? testCase?.output ?? null;
  let traceStepNumber = 1;

  executionSteps.push(createTraceStep({
    stepNumber: traceStepNumber++,
    stage: 'Input Initialization',
    stepDescription: 'Sample input is loaded and the initial variable state is prepared for tracing.',
    variablesState: variables,
    systemOutput: sampleInput,
    purpose: TRACE_PURPOSES['Input Initialization'],
    sourceStep: 0,
  }));

  logicSteps.forEach((step, index) => {
    const description = step.description || step.step_description || `Step ${index + 1}`;
    const stage = inferStage(step.type || step.step_type, description);
    const assignments = parseAssignmentsFromText(description, variables);

    assignments.forEach(({ variable, value }) => {
      variables[variable] = value;
    });

    if (stage === 'Condition Evaluation') {
      const expression = extractConditionExpression(description);
      const conditionResult = step.condition_result !== undefined
        ? step.condition_result
        : evaluateSimpleCondition(expression, variables);

      executionSteps.push(createTraceStep({
        stepNumber: traceStepNumber++,
        stage,
        stepDescription: description,
        variablesState: variables,
        conditionResult,
        systemOutput: expression || null,
        sourceStep: index + 1,
      }));

      executionSteps.push(createTraceStep({
        stepNumber: traceStepNumber++,
        stage: 'Control Flow Movement',
        stepDescription: conditionResult === null
          ? 'The system identifies a decision point and waits for the branch outcome from the logic.'
          : conditionResult
            ? 'Condition is true, so execution continues through the matching branch.'
            : 'Condition is false, so execution skips to the alternate path or next valid step.',
        variablesState: variables,
        conditionResult,
        flowAction: conditionResult === null ? 'Decision pending' : conditionResult ? 'Enter true branch' : 'Move to false branch',
        sourceStep: index + 1,
      }));
      return;
    }

    if (stage === 'Iteration Handling') {
      const loopDefinition = parseLoopDefinition(description, variables);

      executionSteps.push(createTraceStep({
        stepNumber: traceStepNumber++,
        stage,
        stepDescription: description,
        variablesState: variables,
        flowAction: loopDefinition ? `Loop prepared for ${loopDefinition.iterations} tracked iteration(s)` : 'Loop detected from structured logic',
        sourceStep: index + 1,
      }));

      if (loopDefinition) {
        let currentValue = loopDefinition.start;
        for (let iteration = 1; iteration <= loopDefinition.iterations; iteration += 1) {
          variables[loopDefinition.loopVariable] = currentValue;
          executionSteps.push(createTraceStep({
            stepNumber: traceStepNumber++,
            stage: 'Iteration Handling',
            stepDescription: `Iteration ${iteration}: ${loopDefinition.loopVariable} = ${currentValue}`,
            variablesState: variables,
            iteration,
            flowAction: 'Loop body executes for this iteration',
            sourceStep: index + 1,
          }));
          currentValue += loopDefinition.direction;
        }

        executionSteps.push(createTraceStep({
          stepNumber: traceStepNumber++,
          stage: 'Control Flow Movement',
          stepDescription: `Loop finishes after ${loopDefinition.iterations} tracked iteration(s).`,
          variablesState: variables,
          flowAction: 'Exit loop',
          sourceStep: index + 1,
        }));
      }
      return;
    }

    if (stage === 'Final Output Generation') {
      executionSteps.push(createTraceStep({
        stepNumber: traceStepNumber++,
        stage,
        stepDescription: description,
        variablesState: variables,
        systemOutput: sampleOutput,
        flowAction: 'Present final result',
        sourceStep: index + 1,
      }));
      return;
    }

    executionSteps.push(createTraceStep({
      stepNumber: traceStepNumber++,
      stage,
      stepDescription: description,
      variablesState: variables,
      flowAction: assignments.length > 0 ? 'Variables updated' : 'Step recorded',
      sourceStep: index + 1,
    }));
  });

  if (!executionSteps.some((step) => step.stage === 'Final Output Generation')) {
    executionSteps.push(createTraceStep({
      stepNumber: traceStepNumber++,
      stage: 'Final Output Generation',
      stepDescription: 'Trace ends by presenting the final observed output state for the sample run.',
      variablesState: variables,
      systemOutput: sampleOutput,
      flowAction: 'Present final result',
      sourceStep: logicSteps.length,
    }));
  }

  return executionSteps;
};

module.exports = {
  evaluateLogic,
  generateExecutionSteps,
};
