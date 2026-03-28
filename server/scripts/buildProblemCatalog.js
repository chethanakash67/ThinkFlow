const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const DOC_PATH = '/Users/chethanakash/Desktop/100_coding_problems_with_hints.docx';
const OUTPUT_PATH = path.join(__dirname, '..', 'src', 'config', 'problemCatalog.js');
const SQL_OUTPUT_PATHS = [
  path.join(__dirname, '..', '..', 'database', 'seed_problems.sql'),
  path.join(__dirname, '..', 'src', 'config', 'seed_problems.sql'),
];

const raw = execFileSync('textutil', ['-convert', 'txt', '-stdout', DOC_PATH], {
  encoding: 'utf8',
  maxBuffer: 20 * 1024 * 1024,
});

const normalizeWhitespace = (value) =>
  value
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const stripTrailingNotes = (value) =>
  value
    .replace(/\s+\([^()]*\)\s*$/g, '')
    .trim();

const splitTopLevel = (value, separator = ',') => {
  const parts = [];
  let current = '';
  let squareDepth = 0;
  let roundDepth = 0;
  let curlyDepth = 0;
  let inString = false;
  let stringChar = '';

  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];
    const prev = value[i - 1];

    if ((char === '"' || char === '\'') && prev !== '\\') {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (stringChar === char) {
        inString = false;
        stringChar = '';
      }
      current += char;
      continue;
    }

    if (!inString) {
      if (char === '[') squareDepth += 1;
      if (char === ']') squareDepth -= 1;
      if (char === '(') roundDepth += 1;
      if (char === ')') roundDepth -= 1;
      if (char === '{') curlyDepth += 1;
      if (char === '}') curlyDepth -= 1;

      if (
        char === separator &&
        squareDepth === 0 &&
        roundDepth === 0 &&
        curlyDepth === 0
      ) {
        if (current.trim()) {
          parts.push(current.trim());
        }
        current = '';
        continue;
      }
    }

    current += char;
  }

  if (current.trim()) {
    parts.push(current.trim());
  }

  return parts;
};

const tupleToArray = (value) => {
  let result = '';
  let inString = false;
  let stringChar = '';

  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];
    const prev = value[i - 1];

    if ((char === '"' || char === '\'') && prev !== '\\') {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (stringChar === char) {
        inString = false;
        stringChar = '';
      }
      result += char;
      continue;
    }

    if (!inString && (char === '(' || char === ')')) {
      result += char === '(' ? '[' : ']';
      continue;
    }

    result += char;
  }

  return result;
};

const parsePrimitive = (value) => {
  const trimmed = stripTrailingNotes(value).trim();

  if (!trimmed) return '';
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed === 'null') return null;
  if (/^-?\d+$/.test(trimmed)) return Number(trimmed);
  if (/^-?\d+\.\d+$/.test(trimmed)) return Number(trimmed);

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith('\'') && trimmed.endsWith('\''))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
};

const parseArrayLike = (value) => {
  const normalized = tupleToArray(stripTrailingNotes(value).trim());
  if (!normalized.startsWith('[') || !normalized.endsWith(']')) {
    return parsePrimitive(normalized);
  }

  const inner = normalized.slice(1, -1).trim();
  if (!inner) return [];

  return splitTopLevel(inner).map(parseValue);
};

const parseObjectLike = (value) => {
  const inner = value.trim().replace(/^\{/, '').replace(/\}$/, '').trim();
  if (!inner) return {};

  const result = {};
  for (const part of splitTopLevel(inner)) {
    const separatorIndex = part.indexOf(':');
    if (separatorIndex === -1) {
      return parsePrimitive(value);
    }
    const key = part.slice(0, separatorIndex).trim().replace(/^['"]|['"]$/g, '');
    const rawValue = part.slice(separatorIndex + 1).trim();
    result[key] = parseValue(rawValue);
  }

  return result;
};

const parseAssignments = (value) => {
  const parts = splitTopLevel(value);
  const assignments = parts.filter((part) => /^[A-Za-z_][A-Za-z0-9_ ]*\s*=/.test(part));
  if (assignments.length !== parts.length || assignments.length === 0) {
    return null;
  }

  const result = {};
  for (const assignment of assignments) {
    const equalIndex = assignment.indexOf('=');
    const key = assignment.slice(0, equalIndex).trim();
    const rawValue = assignment.slice(equalIndex + 1).trim();
    result[key] = parseValue(rawValue);
  }

  return result;
};

function parseValue(value) {
  const cleaned = stripTrailingNotes(value).trim();
  if (!cleaned) return '';

  const assignments = parseAssignments(cleaned);
  if (assignments) return assignments;

  if (cleaned.startsWith('[')) return parseArrayLike(cleaned);
  if (cleaned.startsWith('{') && cleaned.endsWith('}')) return parseObjectLike(cleaned);

  return parsePrimitive(cleaned);
}

const extractSamples = (block) => {
  const sampleMatches = [...block.matchAll(/Sample\s+(\d+)\n([\s\S]*?)(?=\nSample\s+\d+|\n ?💡 Hints)/g)];

  return sampleMatches.map((match) => {
    const sampleBody = match[2].trim();
    const lines = sampleBody.split('\n').map((line) => line.trim()).filter(Boolean);
    const commentStart = lines.findIndex((line) => line.startsWith('//'));
    const dataLines = commentStart === -1 ? lines : lines.slice(0, commentStart);
    const explanationLines = commentStart === -1 ? [] : lines.slice(commentStart).map((line) => line.replace(/^\/\/\s?/, '').trim());

    const [inputLine = '', ...outputLines] = dataLines;
    const outputLine = outputLines.join(' ').trim();

    return {
      input: parseValue(inputLine),
      output: parseValue(outputLine),
      explanation: explanationLines.join(' ').trim(),
    };
  });
};

const sections = raw
  .split(/(?=Problem \d+ — )/g)
  .map((section) => section.trim())
  .filter((section) => /^Problem \d+ — /.test(section));

const problems = sections.map((section) => {
  const titleMatch = section.match(/^Problem\s+(\d+)\s+—\s+(.+?)\s+\[(Easy|Medium|Hard)\]/m);
  if (!titleMatch) {
    throw new Error(`Unable to parse problem header:\n${section.slice(0, 200)}`);
  }

  const [, number, title, difficultyRaw] = titleMatch;
  const descriptionMatch = section.match(/\]\s+🏷[^\n]+\n([\s\S]*?)\nConstraints:\s*(.+?)\n\s*\n📋 Sample Inputs & Outputs/m);
  if (!descriptionMatch) {
    throw new Error(`Unable to parse description for "${title}"`);
  }

  const description = normalizeWhitespace(descriptionMatch[1]);
  const constraints = normalizeWhitespace(descriptionMatch[2]).replace(/\s*\|\s*/g, '\n');
  const samples = extractSamples(section);

  if (!samples.length) {
    throw new Error(`No samples found for "${title}"`);
  }

  return {
    id: Number(number),
    title: title.trim(),
    description,
    difficulty: difficultyRaw.toLowerCase(),
    test_cases: samples.map((sample) => ({ input: sample.input })),
    expected_outputs: samples.map((sample) => ({ output: sample.output })),
    constraints,
    examples: samples.map((sample) => ({
      input: sample.input,
      output: sample.output,
      explanation: sample.explanation,
    })),
  };
});

const moduleSource = `module.exports = ${JSON.stringify(problems, null, 2)};\n`;
fs.writeFileSync(OUTPUT_PATH, moduleSource);

const escapeSql = (value) => String(value).replace(/'/g, "''");
const sqlLines = [
  '-- Generated from 100_coding_problems_with_hints.docx',
  'DELETE FROM problems;',
  '',
];

for (const { id, ...problem } of problems) {
  sqlLines.push('INSERT INTO problems (title, description, difficulty, test_cases, expected_outputs, constraints, examples)');
  sqlLines.push('VALUES (');
  sqlLines.push(`  '${escapeSql(problem.title)}',`);
  sqlLines.push(`  '${escapeSql(problem.description)}',`);
  sqlLines.push(`  '${escapeSql(problem.difficulty)}',`);
  sqlLines.push(`  '${escapeSql(JSON.stringify(problem.test_cases))}'::jsonb,`);
  sqlLines.push(`  '${escapeSql(JSON.stringify(problem.expected_outputs))}'::jsonb,`);
  sqlLines.push(`  '${escapeSql(problem.constraints || '')}',`);
  sqlLines.push(`  '${escapeSql(JSON.stringify(problem.examples || []))}'::jsonb`);
  sqlLines.push(');');
  sqlLines.push('');
}

const sqlSource = `${sqlLines.join('\n')}\n`;
for (const sqlPath of SQL_OUTPUT_PATHS) {
  fs.writeFileSync(sqlPath, sqlSource);
}

console.log(`Wrote ${problems.length} problems to ${OUTPUT_PATH}`);
