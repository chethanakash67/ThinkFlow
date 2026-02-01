const { db } = require('../models/database');

class NoteService {
  // Get all notes with optional tag filtering
  static getAll(filters = {}) {
    return new Promise((resolve, reject) => {
      let query = 'SELECT * FROM notes';
      const params = [];

      if (filters.tag) {
        query += ' WHERE tags LIKE ?';
        params.push(`%${filters.tag}%`);
      }

      query += ' ORDER BY created_at DESC';

      db.all(query, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  // Get note by ID
  static getById(id) {
    return new Promise((resolve, reject) => {
      db.get('SELECT * FROM notes WHERE id = ?', [id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  // Create new note
  static create(noteData) {
    const { title, content, tags } = noteData;
    return new Promise((resolve, reject) => {
      const query = `
        INSERT INTO notes (title, content, tags)
        VALUES (?, ?, ?)
      `;
      db.run(query, [title, content, tags || ''], function(err) {
        if (err) reject(err);
        else resolve({ id: this.lastID });
      });
    });
  }

  // Update note
  static update(id, noteData) {
    const { title, content, tags } = noteData;
    return new Promise((resolve, reject) => {
      const query = `
        UPDATE notes 
        SET title = ?, content = ?, tags = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;
      db.run(query, [title, content, tags, id], function(err) {
        if (err) reject(err);
        else resolve({ changes: this.changes });
      });
    });
  }

  // Delete note
  static delete(id) {
    return new Promise((resolve, reject) => {
      db.run('DELETE FROM notes WHERE id = ?', [id], function(err) {
        if (err) reject(err);
        else resolve({ changes: this.changes });
      });
    });
  }

  // Search notes by title or content
  static search(searchTerm) {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT * FROM notes 
        WHERE title LIKE ? OR content LIKE ?
        ORDER BY created_at DESC
      `;
      const term = `%${searchTerm}%`;
      db.all(query, [term, term], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  // Get all unique tags
  static getTags() {
    return new Promise((resolve, reject) => {
      db.all('SELECT DISTINCT tags FROM notes WHERE tags IS NOT NULL AND tags != ""', [], (err, rows) => {
        if (err) reject(err);
        else {
          const tags = new Set();
          rows.forEach(row => {
            if (row.tags) {
              row.tags.split(',').forEach(tag => tags.add(tag.trim()));
            }
          });
          resolve(Array.from(tags));
        }
      });
    });
  }
}

module.exports = NoteService;
