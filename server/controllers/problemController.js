const { query } = require('../src/config/db');

// Get all problems with optional difficulty filter
const getProblems = async (req, res) => {
  try {
    const { difficulty } = req.query;
    let problems;

    if (difficulty && ['easy', 'medium', 'hard'].includes(difficulty)) {
      const result = await query(
        'SELECT id, title, description, difficulty, constraints, examples, created_at FROM problems WHERE difficulty = $1 ORDER BY created_at DESC',
        [difficulty]
      );
      problems = result.rows;
    } else {
      const result = await query(
        'SELECT id, title, description, difficulty, constraints, examples, created_at FROM problems ORDER BY created_at DESC'
      );
      problems = result.rows;
    }

    res.json({ problems });
  } catch (error) {
    console.error('Get problems error:', error);
    res.status(500).json({ error: 'Failed to fetch problems' });
  }
};

// Get single problem by ID
const getProblemById = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      'SELECT * FROM problems WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Problem not found' });
    }

    res.json({ problem: result.rows[0] });
  } catch (error) {
    console.error('Get problem error:', error);
    res.status(500).json({ error: 'Failed to fetch problem' });
  }
};

// Create new problem (admin only)
const createProblem = async (req, res) => {
  try {
    const { title, description, difficulty, testCases, expectedOutputs, constraints, examples } = req.body;

    if (!title || !description || !difficulty || !testCases || !expectedOutputs) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (!['easy', 'medium', 'hard'].includes(difficulty)) {
      return res.status(400).json({ error: 'Invalid difficulty level' });
    }

    const result = await query(
      `INSERT INTO problems (title, description, difficulty, test_cases, expected_outputs, constraints, examples)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [title, description, difficulty, JSON.stringify(testCases), JSON.stringify(expectedOutputs), constraints || null, examples ? JSON.stringify(examples) : null]
    );

    res.status(201).json({ problem: result.rows[0] });
  } catch (error) {
    console.error('Create problem error:', error);
    res.status(500).json({ error: 'Failed to create problem' });
  }
};

// Update problem (admin only)
const updateProblem = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, difficulty, testCases, expectedOutputs, constraints, examples } = req.body;

    const updateFields = [];
    const values = [];
    let paramCount = 1;

    if (title) {
      updateFields.push(`title = $${paramCount++}`);
      values.push(title);
    }
    if (description) {
      updateFields.push(`description = $${paramCount++}`);
      values.push(description);
    }
    if (difficulty) {
      if (!['easy', 'medium', 'hard'].includes(difficulty)) {
        return res.status(400).json({ error: 'Invalid difficulty level' });
      }
      updateFields.push(`difficulty = $${paramCount++}`);
      values.push(difficulty);
    }
    if (testCases) {
      updateFields.push(`test_cases = $${paramCount++}`);
      values.push(JSON.stringify(testCases));
    }
    if (expectedOutputs) {
      updateFields.push(`expected_outputs = $${paramCount++}`);
      values.push(JSON.stringify(expectedOutputs));
    }
    if (constraints !== undefined) {
      updateFields.push(`constraints = $${paramCount++}`);
      values.push(constraints);
    }
    if (examples !== undefined) {
      updateFields.push(`examples = $${paramCount++}`);
      values.push(examples ? JSON.stringify(examples) : null);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const result = await query(
      `UPDATE problems SET ${updateFields.join(', ')} WHERE id = $${paramCount} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Problem not found' });
    }

    res.json({ problem: result.rows[0] });
  } catch (error) {
    console.error('Update problem error:', error);
    res.status(500).json({ error: 'Failed to update problem' });
  }
};

// Delete problem (admin only)
const deleteProblem = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query('DELETE FROM problems WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Problem not found' });
    }

    res.json({ message: 'Problem deleted successfully' });
  } catch (error) {
    console.error('Delete problem error:', error);
    res.status(500).json({ error: 'Failed to delete problem' });
  }
};

module.exports = {
  getProblems,
  getProblemById,
  createProblem,
  updateProblem,
  deleteProblem,
};
