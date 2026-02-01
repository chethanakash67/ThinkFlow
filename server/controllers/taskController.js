const { db } = require('../models/database');

// Get all tasks
const getAllTasks = (req, res) => {
  db.all('SELECT * FROM tasks ORDER BY created_at DESC', [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
};

// Get task by ID
const getTaskById = (req, res) => {
  const { id } = req.params;
  db.get('SELECT * FROM tasks WHERE id = ?', [id], (err, row) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    if (!row) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    res.json(row);
  });
};

// Create new task
const createTask = (req, res) => {
  const { title, description, status, priority } = req.body;
  
  if (!title) {
    res.status(400).json({ error: 'Title is required' });
    return;
  }

  const query = `
    INSERT INTO tasks (title, description, status, priority)
    VALUES (?, ?, ?, ?)
  `;

  db.run(query, [title, description || '', status || 'pending', priority || 'medium'], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.status(201).json({ id: this.lastID, message: 'Task created successfully' });
  });
};

// Update task
const updateTask = (req, res) => {
  const { id } = req.params;
  const { title, description, status, priority } = req.body;

  const query = `
    UPDATE tasks 
    SET title = ?, description = ?, status = ?, priority = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `;

  db.run(query, [title, description, status, priority, id], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    if (this.changes === 0) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    res.json({ message: 'Task updated successfully' });
  });
};

// Delete task
const deleteTask = (req, res) => {
  const { id } = req.params;

  db.run('DELETE FROM tasks WHERE id = ?', [id], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    if (this.changes === 0) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    res.json({ message: 'Task deleted successfully' });
  });
};

module.exports = {
  getAllTasks,
  getTaskById,
  createTask,
  updateTask,
  deleteTask,
};
