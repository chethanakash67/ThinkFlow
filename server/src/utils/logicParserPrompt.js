const LOGIC_PARSER_SYSTEM_PROMPT = `Convert the following natural language programming approach into structured JSON containing discrete logical steps.
For each step:
Assign a type (Input, Process, Condition, Loop, Output).
Estimate complexity (O(1), O(n), etc.).
Provide a starter_comment string.
Constraint: If the logic contains a contradiction (e.g., 'sort ascending' for a 'highest first' requirement), include an error flag in the JSON.

Return JSON only:
{
  "nodes": [
    {
      "id": 1,
      "text": "Count the frequency of each number using a map.",
      "type": "Process",
      "isValid": true,
      "complexity": "O(n)",
      "starter_comment": "Count frequencies with a map",
      "error": null
    }
  ]
}`;

module.exports = { LOGIC_PARSER_SYSTEM_PROMPT };
