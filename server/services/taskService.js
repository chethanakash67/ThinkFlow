const { db } = require('../models/database');

class TaskService {
  // Get all tasks with optional filtering
  static getAll(filters = {}) {
    return new Promise((resolve, reject) => {
      let query = 'SELECT * FROM tasks';
      const params = [];

      if (filters.status) {
        query += ' WHERE status = ?';
        params.push(filters.status);
      }

      query += ' ORDER BY created_at DESC';

      db.all(query, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  // Get task by ID
  static getById(id) {
    return new Promise((resolve, reject) => {
      db.get('SELECT * FROM tasks WHERE id = ?', [id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  // Create new task
  static create(taskData) {
    const { title, description, status, priority } = taskData;
    return new Promise((resolve, reject) => {
      const query = `
        INSERT INTO tasks (title, description, status, priority)
        VALUES (?, ?, ?, ?)
      `;
      db.run(
        query,
        [title, description || '', status || 'pending', priority || 'medium'],
        function(err) {
          if (err) reject(err);
          else resolve({ id: this.lastID });
        }
      );
    });
  }

  // Update task
  static update(id, taskData) {
    const { title, description, status, priority } = taskData;
    return new Promise((resolve, reject) => {
      const query = `
        UPDATE tasks 
        SET title = ?, description = ?, status = ?, priority = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;
      db.run(query, [title, description, status, priority, id], function(err) {
        if (err) reject(err);
        else resolve({ changes: this.changes });
      });
    });
  }

  // Delete task
  static delete(id) {
    return new Promise((resolve, reject) => {
      db.run('DELETE FROM tasks WHERE id = ?', [id], function(err) {
        if (err) reject(err);
        else resolve({ changes: this.changes });
      });
    });
  }

  // Get task statistics
  static getStats() {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
          SUM(CASE WHEN status = 'in-progress' THEN 1 ELSE 0 END) as in_progress,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending
        FROM tasks
      `;
      db.get(query, [], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }
}

module.exports = TaskService;
