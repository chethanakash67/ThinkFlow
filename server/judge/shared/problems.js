const fs = require('fs');
const path = require('path');

const problemFile = path.resolve(__dirname, 'problems.json');

const loadProblems = () => JSON.parse(fs.readFileSync(problemFile, 'utf8'));

const getProblemById = (problemId) => {
  const problems = loadProblems();
  return problems.find((problem) => problem.id === problemId) || null;
};

module.exports = {
  loadProblems,
  getProblemById,
};
