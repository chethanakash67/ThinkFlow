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
  
  return `Analyze the problem requirements and design an efficient algorithm to solve it.`;
};

const fallbackEvaluation = (logicSteps, problem) => {
  // Basic fallback evaluation when AI is not available
  const analysis = analyzeLogicSteps(logicSteps, problem.test_cases, problem.expected_outputs);
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

const analyzeLogicSteps = (logicSteps, testCases, expectedOutputs) => {
  const analysis = {
    coveredTestCases: 0,
    missingSteps: [],
    incorrectConditions: [],
    edgeCasesHandled: false,
  };

  // Check if logic covers all test cases
  for (let i = 0; i < testCases.length; i++) {
    const testCase = testCases[i];
    const expected = expectedOutputs[i];
    
    // Simple heuristic: check if logic mentions key elements from test case
    const logicText = JSON.stringify(logicSteps).toLowerCase();
    const testCaseText = JSON.stringify(testCase).toLowerCase();
    
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

const generateExecutionSteps = (logicSteps, testCase) => {
  const executionSteps = [];
  
  logicSteps.forEach((step, index) => {
    const executionStep = {
      stepNumber: index + 1,
      stepDescription: step.description || step.step_description || `Step ${index + 1}`,
      variablesState: step.variables || {},
      conditionResult: step.condition_result !== undefined ? step.condition_result : null,
    };
    
    executionSteps.push(executionStep);
  });
  
  return executionSteps;
};

module.exports = {
  evaluateLogic,
  generateExecutionSteps,
};
