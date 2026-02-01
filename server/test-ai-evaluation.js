/**
 * Test Gemini AI Logic Evaluation
 * Run this to test if your Gemini API key is working
 */

require('dotenv').config();
const { evaluateLogic } = require('./services/logicEvaluationService');

const testProblem = {
  id: 1,
  title: 'Merge Intervals',
  description: 'Given an array of intervals, merge all overlapping intervals.',
  difficulty: 'medium',
  test_cases: [
    { intervals: [[1,3],[2,6],[8,10],[15,18]] },
    { intervals: [[1,4],[4,5]] }
  ],
  expected_outputs: [
    [[1,6],[8,10],[15,18]],
    [[1,5]]
  ]
};

const testLogicSteps = [
  {
    type: 'input',
    description: 'Ensure the given intervals list is not null and contains valid start-end pairs.'
  },
  {
    type: 'process',
    description: 'Sort all intervals in ascending order based on their starting values.'
  },
  {
    type: 'process',
    description: 'Initialize an empty list to store the merged intervals.'
  },
  {
    type: 'loop',
    description: 'Traverse each interval from the sorted list one by one.'
  },
  {
    type: 'condition',
    description: 'Compare the start time of the current interval with the end time of the last interval stored in the result list.'
  },
  {
    type: 'process',
    description: 'If the intervals overlap, update the end time of the last interval to the maximum of both end times. If they do not overlap, add the current interval directly to the result list.'
  },
  {
    type: 'output',
    description: 'After completing the traversal, return the list containing all merged non-overlapping intervals.'
  }
];

async function testEvaluation() {
  console.log('🧪 Testing Gemini AI Logic Evaluation...\n');
  console.log('Problem:', testProblem.title);
  console.log('Difficulty:', testProblem.difficulty);
  console.log('\nStudent Logic Steps:');
  testLogicSteps.forEach((step, idx) => {
    console.log(`  ${idx + 1}. [${step.type}] ${step.description}`);
  });
  console.log('\n⏳ Evaluating with AI...\n');

  try {
    const result = await evaluateLogic(testLogicSteps, testProblem);
    
    console.log('✅ Evaluation Result:');
    console.log('━'.repeat(60));
    console.log(`Status: ${result.status.toUpperCase()}`);
    console.log(`Score: ${result.score}/100`);
    console.log(`\nFeedback: ${result.feedback}`);
    
    if (result.suggestions && result.suggestions.length > 0) {
      console.log('\nSuggestions:');
      result.suggestions.forEach((s, idx) => {
        console.log(`  ${idx + 1}. ${s}`);
      });
    }
    
    if (result.analysis) {
      console.log('\nAnalysis:');
      console.log(`  Total Steps: ${result.analysis.totalSteps}`);
      if (result.analysis.isSemanticallySimilar !== undefined) {
        console.log(`  Semantically Similar: ${result.analysis.isSemanticallySimilar ? '✅' : '❌'}`);
      }
    }
    console.log('━'.repeat(60));
    
    if (result.status === 'correct') {
      console.log('\n🎉 Success! The AI understood your logic correctly!');
    } else if (result.status === 'partially_correct') {
      console.log('\n⚠️  Partially correct. Review the suggestions above.');
    } else {
      console.log('\n❌ Needs improvement. Check the feedback and try again.');
    }
    
  } catch (error) {
    console.error('❌ Error during evaluation:', error.message);
    console.log('\n💡 Tips:');
    console.log('  1. Make sure GEMINI_API_KEY is set in server/.env');
    console.log('  2. Check your internet connection');
    console.log('  3. Verify your API key at https://makersuite.google.com/app/apikey');
  }
}

// Run the test
testEvaluation();
