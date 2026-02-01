const { db } = require('../models/database');

// Get all notes
const getAllNotes = (req, res) => {
  db.all('SELECT * FROM notes ORDER BY created_at DESC', [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
};

// Get note by ID
const getNoteById = (req, res) => {
  const { id } = req.params;
  db.get('SELECT * FROM notes WHERE id = ?', [id], (err, row) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    if (!row) {
      res.status(404).json({ error: 'Note not found' });
      return;
    }
    res.json(row);
  });
};

// Create new note
const createNote = (req, res) => {
  const { title, content, tags } = req.body;
  
  if (!title || !content) {
    res.status(400).json({ error: 'Title and content are required' });
    return;
  }

  const query = `
    INSERT INTO notes (title, content, tags)
    VALUES (?, ?, ?)
  `;

  db.run(query, [title, content, tags || ''], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.status(201).json({ id: this.lastID, message: 'Note created successfully' });
  });
};

// Update note
const updateNote = (req, res) => {
  const { id } = req.params;
  const { title, content, tags } = req.body;

  const query = `
    UPDATE notes 
    SET title = ?, content = ?, tags = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `;

  db.run(query, [title, content, tags, id], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    if (this.changes === 0) {
      res.status(404).json({ error: 'Note not found' });
      return;
    }
    res.json({ message: 'Note updated successfully' });
  });
};

// Delete note
const deleteNote = (req, res) => {
  const { id } = req.params;

  db.run('DELETE FROM notes WHERE id = ?', [id], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    if (this.changes === 0) {
      res.status(404).json({ error: 'Note not found' });
      return;
    }
    res.json({ message: 'Note deleted successfully' });
  });
};

module.exports = {
  getAllNotes,
  getNoteById,
  createNote,
  updateNote,
  deleteNote,
};
