'use client'

import { useState } from 'react'
import useSWR from 'swr'
import axios from 'axios'
import { FaPlus, FaTrash, FaCheck, FaEdit } from 'react-icons/fa'
import { format } from 'date-fns'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'

interface Task {
  id: number
  title: string
  description: string
  status: 'pending' | 'in-progress' | 'completed'
  priority: 'low' | 'medium' | 'high'
  created_at: string
  updated_at: string
}

const fetcher = (url: string) => axios.get(url).then(res => res.data)

type TaskStatus = Task['status']
type TaskPriority = Task['priority']

interface TaskFormData {
  title: string
  description: string
  status: TaskStatus
  priority: TaskPriority
}

const createEmptyFormData = (): TaskFormData => ({
  title: '',
  description: '',
  status: 'pending',
  priority: 'medium',
})

export default function TaskList() {
  const { data: tasks, error, mutate } = useSWR<Task[]>(`${API_URL}/api/tasks`, fetcher)
  const [isAdding, setIsAdding] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [formData, setFormData] = useState<TaskFormData>(createEmptyFormData())

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (editingId) {
        await axios.put(`${API_URL}/api/tasks/${editingId}`, formData)
        setEditingId(null)
      } else {
        await axios.post(`${API_URL}/api/tasks`, formData)
        setIsAdding(false)
      }
      setFormData(createEmptyFormData())
      mutate()
    } catch (error) {
      console.error('Error saving task:', error)
    }
  }

  const handleDelete = async (id: number) => {
    try {
      await axios.delete(`${API_URL}/api/tasks/${id}`)
      mutate()
    } catch (error) {
      console.error('Error deleting task:', error)
    }
  }

  const handleEdit = (task: Task) => {
    setEditingId(task.id)
    setFormData({
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
    })
    setIsAdding(true)
  }

  const handleStatusToggle = async (task: Task) => {
    const newStatus = task.status === 'completed' ? 'pending' : 'completed'
    try {
      await axios.put(`${API_URL}/api/tasks/${task.id}`, { ...task, status: newStatus })
      mutate()
    } catch (error) {
      console.error('Error updating task:', error)
    }
  }

  if (error) return <div className="text-red-500">Failed to load tasks</div>
  if (!tasks) return <div className="text-gray-500">Loading...</div>

  const priorityColors = {
    low: 'bg-green-100 text-green-800',
    medium: 'bg-yellow-100 text-yellow-800',
    high: 'bg-red-100 text-red-800',
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-white">Your Tasks</h2>
        <button
          onClick={() => {
            setIsAdding(!isAdding)
            setEditingId(null)
            setFormData(createEmptyFormData())
          }}
          className="bg-primary-500 hover:bg-primary-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
        >
          <FaPlus /> Add Task
        </button>
      </div>

      {isAdding && (
        <form onSubmit={handleSubmit} className="mb-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
          <input
            type="text"
            placeholder="Task title"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            className="w-full mb-3 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 dark:bg-gray-800 dark:text-white"
            required
          />
          <textarea
            placeholder="Task description"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            className="w-full mb-3 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 dark:bg-gray-800 dark:text-white"
            rows={3}
          />
          <div className="flex gap-3 mb-3">
            <select
              value={formData.priority}
              onChange={(e) => setFormData({ ...formData, priority: e.target.value as TaskPriority })}
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 dark:bg-gray-800 dark:text-white"
            >
              <option value="low">Low Priority</option>
              <option value="medium">Medium Priority</option>
              <option value="high">High Priority</option>
            </select>
            <select
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value as TaskStatus })}
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 dark:bg-gray-800 dark:text-white"
            >
              <option value="pending">Pending</option>
              <option value="in-progress">In Progress</option>
              <option value="completed">Completed</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              className="bg-primary-500 hover:bg-primary-600 text-white px-4 py-2 rounded-lg transition-colors"
            >
              {editingId ? 'Update Task' : 'Add Task'}
            </button>
            <button
              type="button"
              onClick={() => {
                setIsAdding(false)
                setEditingId(null)
                setFormData(createEmptyFormData())
              }}
              className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-4 py-2 rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="space-y-4">
        {tasks.length === 0 ? (
          <p className="text-center text-gray-500 py-8">No tasks yet. Create your first task!</p>
        ) : (
          tasks.map((task) => (
            <div
              key={task.id}
              className={`p-4 border rounded-lg transition-all ${
                task.status === 'completed'
                  ? 'bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 opacity-75'
                  : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:shadow-md'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <button
                      onClick={() => handleStatusToggle(task)}
                      className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                        task.status === 'completed'
                          ? 'bg-primary-500 border-primary-500'
                          : 'border-gray-300 hover:border-primary-500'
                      }`}
                    >
                      {task.status === 'completed' && <FaCheck className="text-white text-xs" />}
                    </button>
                    <h3
                      className={`text-lg font-semibold ${
                        task.status === 'completed'
                          ? 'line-through text-gray-500'
                          : 'text-gray-800 dark:text-white'
                      }`}
                    >
                      {task.title}
                    </h3>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${priorityColors[task.priority]}`}>
                      {task.priority}
                    </span>
                  </div>
                  {task.description && (
                    <p className="text-gray-600 dark:text-gray-300 ml-9 mb-2">{task.description}</p>
                  )}
                  <p className="text-xs text-gray-400 ml-9">
                    Created: {format(new Date(task.created_at), 'MMM dd, yyyy HH:mm')}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleEdit(task)}
                    className="text-blue-500 hover:text-blue-700 p-2"
                  >
                    <FaEdit />
                  </button>
                  <button
                    onClick={() => handleDelete(task.id)}
                    className="text-red-500 hover:text-red-700 p-2"
                  >
                    <FaTrash />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
