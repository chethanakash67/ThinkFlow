const test = require('node:test');
const assert = require('node:assert/strict');

process.env.OPENAI_API_KEY = '';

const {
  fallbackLogicInsights,
  fallbackRequirementLogicInsights
} = require('../services/logicValidationService');

const frequencyProblem = {
  title: 'Sort by Frequency then Value',
  description: 'Given an array, sort it so elements appearing most frequently come first. Among elements with the same frequency, sort by value descending. Return the sorted array.',
  constraints: 'Expected time complexity: O(n log n).'
};

test('fallbackLogicInsights flags the missing value-descending tie breaker on the sort line', () => {
  const insights = fallbackLogicInsights({
    problemDescription: frequencyProblem,
    userBlueprintText: [
      'Count the frequency of every value using a map.',
      'Sort by frequency descending.',
      'Return the sorted array.'
    ].join('\n')
  });

  assert.deepEqual(
    insights.find((insight) => insight.message.includes('value descending')),
    {
      line: 2,
      type: 'error',
      message: 'You forgot to sort by value descending for ties.'
    }
  );
});

test('fallbackLogicInsights flags ascending tie logic for equal frequencies', () => {
  const insights = fallbackLogicInsights({
    problemDescription: frequencyProblem,
    userBlueprintText: [
      'Count frequencies in a dictionary.',
      'Sort by frequency descending, and for equal frequencies sort by value ascending.',
      'Return the answer.'
    ].join('\n')
  });

  assert.equal(insights.some((insight) => (
    insight.line === 2 &&
    insight.type === 'error' &&
    insight.message.includes('not ascending')
  )), true);
});

test('fallbackLogicInsights rejects O(n log n) when the described flow is nested comparison', () => {
  const insights = fallbackLogicInsights({
    problemDescription: frequencyProblem,
    userBlueprintText: [
      'Count frequencies with a map.',
      'Compare every pair with a nested loop to order by frequency and value descending.',
      'This is O(n log n).'
    ].join('\n')
  });

  assert.equal(insights.some((insight) => (
    insight.line === 2 &&
    insight.type === 'error' &&
    insight.message.includes('O(n^2)')
  )), true);
});

test('fallbackRequirementLogicInsights flags frequency logic for digit product problems', () => {
  const insights = fallbackRequirementLogicInsights({
    problemDescription: {
      title: 'Sort by Digit Product',
      description: 'Sort an array of integers by the product of their digits in ascending order. If two numbers have the same digit product, sort by actual value ascending.',
      examples: [
        {
          input: { nums: [13, 22, 111, 4] },
          output: [111, 13, 4, 22]
        }
      ]
    },
    userBlueprintText: [
      'Count the frequency of every number with a map.',
      'Sort by frequency descending and for ties sort by value descending.',
      'Return the array.'
    ].join('\n')
  });

  assert.equal(insights.some((insight) => (
    insight.line === 1 &&
    insight.type === 'error' &&
    insight.message.includes('CRITICAL MISMATCH') &&
    insight.message.includes('digit product')
  )), true);
  assert.equal(insights.filter((insight) => insight.message.includes('CRITICAL MISMATCH')).length, 1);
  assert.equal(insights.some((insight) => insight.message.includes('Rewrite the Blueprint')), true);
  assert.equal(insights.some((insight) => insight.message.includes('never calculates')), false);
});

test('fallbackRequirementLogicInsights accepts digit product calculation but warns about missing actual-value tie', () => {
  const insights = fallbackRequirementLogicInsights({
    problemDescription: {
      title: 'Sort by Digit Product',
      description: 'Sort an array of integers by the product of their digits in ascending order. If two numbers have the same digit product, sort by actual value ascending.'
    },
    userBlueprintText: [
      'Calculate the product of digits for each number.',
      'Sort by digit product ascending.',
      'Return the sorted numbers.'
    ].join('\n')
  });

  assert.equal(insights.some((insight) => (
    insight.type === 'warning' &&
    insight.message.includes('actual value ascending')
  )), true);
  assert.equal(insights.some((insight) => insight.message.includes('CRITICAL MISMATCH')), false);
});

test('fallbackRequirementLogicInsights accepts natural digit-product ascending wording', () => {
  const insights = fallbackRequirementLogicInsights({
    problemDescription: {
      title: 'Sort by Digit Product',
      description: 'Sort an array of integers by the product of their digits in ascending order. If two numbers have the same digit product, sort by actual value ascending.'
    },
    userBlueprintText: [
      'First, for each number in nums, calculate the product of its digits.',
      'Then, pair each number with its digit product.',
      'Next, sort the pairs by digit product in ascending order.',
      'If two numbers have the same digit product, sort those numbers by actual value ascending.',
      'Finally, return the numbers from the sorted pairs.'
    ].join('\n')
  });

  assert.equal(insights.some((insight) => insight.message.includes('Missing sort rule')), false);
  assert.equal(insights.some((insight) => insight.message.includes('CRITICAL MISMATCH')), false);
  assert.equal(insights.some((insight) => insight.message.includes('actual value ascending')), false);
});
