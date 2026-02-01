'use client'

import { useState } from 'react'
import useSWR from 'swr'
import axios from 'axios'
import { FaPlus, FaTrash, FaEdit } from 'react-icons/fa'
import { format } from 'date-fns'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'

interface Note {
  id: number
  title: string
  content: string
  tags: string
  created_at: string
  updated_at: string
}

const fetcher = (url: string) => axios.get(url).then(res => res.data)

export default function NoteList() {
  const { data: notes, error, mutate } = useSWR<Note[]>(`${API_URL}/api/notes`, fetcher)
  const [isAdding, setIsAdding] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    tags: '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (editingId) {
        await axios.put(`${API_URL}/api/notes/${editingId}`, formData)
        setEditingId(null)
      } else {
        await axios.post(`${API_URL}/api/notes`, formData)
        setIsAdding(false)
      }
      setFormData({ title: '', content: '', tags: '' })
      mutate()
    } catch (error) {
      console.error('Error saving note:', error)
    }
  }

  const handleDelete = async (id: number) => {
    try {
      await axios.delete(`${API_URL}/api/notes/${id}`)
      mutate()
    } catch (error) {
      console.error('Error deleting note:', error)
    }
  }

  const handleEdit = (note: Note) => {
    setEditingId(note.id)
    setFormData({
      title: note.title,
      content: note.content,
      tags: note.tags,
    })
    setIsAdding(true)
  }

  if (error) return <div className="text-red-500">Failed to load notes</div>
  if (!notes) return <div className="text-gray-500">Loading...</div>

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-white">Your Notes</h2>
        <button
          onClick={() => {
            setIsAdding(!isAdding)
            setEditingId(null)
            setFormData({ title: '', content: '', tags: '' })
          }}
          className="bg-primary-500 hover:bg-primary-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
        >
          <FaPlus /> Add Note
        </button>
      </div>

      {isAdding && (
        <form onSubmit={handleSubmit} className="mb-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
          <input
            type="text"
            placeholder="Note title"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            className="w-full mb-3 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 dark:bg-gray-800 dark:text-white"
            required
          />
          <textarea
            placeholder="Note content"
            value={formData.content}
            onChange={(e) => setFormData({ ...formData, content: e.target.value })}
            className="w-full mb-3 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 dark:bg-gray-800 dark:text-white"
            rows={6}
            required
          />
          <input
            type="text"
            placeholder="Tags (comma-separated)"
            value={formData.tags}
            onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
            className="w-full mb-3 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 dark:bg-gray-800 dark:text-white"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              className="bg-primary-500 hover:bg-primary-600 text-white px-4 py-2 rounded-lg transition-colors"
            >
              {editingId ? 'Update Note' : 'Add Note'}
            </button>
            <button
              type="button"
              onClick={() => {
                setIsAdding(false)
                setEditingId(null)
                setFormData({ title: '', content: '', tags: '' })
              }}
              className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-4 py-2 rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {notes.length === 0 ? (
          <p className="col-span-2 text-center text-gray-500 py-8">No notes yet. Create your first note!</p>
        ) : (
          notes.map((note) => (
            <div
              key={note.id}
              className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:shadow-md transition-all"
            >
              <div className="flex justify-between items-start mb-2">
                <h3 className="text-lg font-semibold text-gray-800 dark:text-white">{note.title}</h3>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleEdit(note)}
                    className="text-blue-500 hover:text-blue-700 p-1"
                  >
                    <FaEdit />
                  </button>
                  <button
                    onClick={() => handleDelete(note.id)}
                    className="text-red-500 hover:text-red-700 p-1"
                  >
                    <FaTrash />
                  </button>
                </div>
              </div>
              <p className="text-gray-600 dark:text-gray-300 mb-3 line-clamp-3">{note.content}</p>
              {note.tags && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {note.tags.split(',').map((tag, index) => (
                    <span
                      key={index}
                      className="px-2 py-1 bg-primary-100 text-primary-700 text-xs rounded-full"
                    >
                      {tag.trim()}
                    </span>
                  ))}
                </div>
              )}
              <p className="text-xs text-gray-400">
                {format(new Date(note.created_at), 'MMM dd, yyyy HH:mm')}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
