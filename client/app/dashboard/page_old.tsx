'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import ProtectedRoute from '@/components/ProtectedRoute'
import { getCurrentUser } from '@/lib/auth'
import api from '@/lib/api'
import { FaCode, FaCheckCircle, FaTrophy, FaChartLine } from 'react-icons/fa'

export default function DashboardPage() {
  const [user, setUser] = useState<any>(null)
  const [stats, setStats] = useState<any>(null)
  const [recentSubmissions, setRecentSubmissions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const userData = await getCurrentUser()
        setUser(userData)

        const statsResponse = await api.get('/submissions/dashboard')
        setStats(statsResponse.data.stats)
        setRecentSubmissions(statsResponse.data.recentSubmissions || [])
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  return (
    <ProtectedRoute>
      <main className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 pt-20">
        <div className="container mx-auto px-4 py-8">
          <div className="mb-8">
            <h1 className="text-4xl font-bold text-gray-900 mb-2">
              Welcome back, {user?.name || 'User'}!
            </h1>
            <p className="text-xl text-gray-600">Continue your learning journey</p>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <div className="bg-white rounded-xl shadow-lg p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="p-3 bg-blue-100 rounded-lg">
                      <FaCode className="text-blue-600 text-2xl" />
                    </div>
                    <span className="text-3xl font-bold text-gray-900">
                      {stats?.total_submissions || 0}
                    </span>
                  </div>
                  <p className="text-gray-600 font-medium">Total Submissions</p>
                </div>

                <div className="bg-white rounded-xl shadow-lg p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="p-3 bg-purple-100 rounded-lg">
                      <FaTrophy className="text-purple-600 text-2xl" />
                    </div>
                    <span className="text-3xl font-bold text-gray-900">
                      {stats?.problems_attempted || 0}
                    </span>
                  </div>
                  <p className="text-gray-600 font-medium">Problems Attempted</p>
                </div>

                <div className="bg-white rounded-xl shadow-lg p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="p-3 bg-green-100 rounded-lg">
                      <FaCheckCircle className="text-green-600 text-2xl" />
                    </div>
                    <span className="text-3xl font-bold text-green-600">
                      {stats?.correct_count || 0}
                    </span>
                  </div>
                  <p className="text-gray-600 font-medium">Correct Solutions</p>
                </div>

                <div className="bg-white rounded-xl shadow-lg p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="p-3 bg-indigo-100 rounded-lg">
                      <FaChartLine className="text-indigo-600 text-2xl" />
                    </div>
                    <span className="text-3xl font-bold text-indigo-600">
                      {stats?.average_score ? Math.round(stats.average_score) : 0}%
                    </span>
                  </div>
                  <p className="text-gray-600 font-medium">Average Score</p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-white rounded-xl shadow-lg p-6">
                  <h2 className="text-2xl font-bold text-gray-900 mb-4">Quick Actions</h2>
                  <div className="space-y-3">
                    <Link
                      href="/problems"
                      className="block w-full p-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg hover:from-indigo-700 hover:to-purple-700 transition-all text-center font-semibold"
                    >
                      Browse Problems
                    </Link>
                    <Link
                      href="/problems?difficulty=easy"
                      className="block w-full p-4 border-2 border-green-500 text-green-600 rounded-lg hover:bg-green-50 transition-all text-center font-semibold"
                    >
                      Easy Problems
                    </Link>
                    <Link
                      href="/problems?difficulty=medium"
                      className="block w-full p-4 border-2 border-yellow-500 text-yellow-600 rounded-lg hover:bg-yellow-50 transition-all text-center font-semibold"
                    >
                      Medium Problems
                    </Link>
                    <Link
                      href="/problems?difficulty=hard"
                      className="block w-full p-4 border-2 border-red-500 text-red-600 rounded-lg hover:bg-red-50 transition-all text-center font-semibold"
                    >
                      Hard Problems
                    </Link>
                  </div>
                </div>

                <div className="bg-white rounded-xl shadow-lg p-6">
                  <h2 className="text-2xl font-bold text-gray-900 mb-4">Recent Submissions</h2>
                  {recentSubmissions.length > 0 ? (
                    <div className="space-y-3">
                      {recentSubmissions.slice(0, 5).map((submission: any, index: number) => (
                        <div
                          key={index}
                          className="p-4 border border-gray-200 rounded-lg hover:border-indigo-300 transition-colors"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <Link
                              href={`/problems/${submission.problem_id}`}
                              className="font-semibold text-gray-900 hover:text-indigo-600"
                            >
                              {submission.problem_title || `Problem #${submission.problem_id}`}
                            </Link>
                            <span
                              className={`px-3 py-1 rounded-full text-xs font-semibold ${
                                submission.is_correct
                                  ? 'bg-green-100 text-green-700'
                                  : 'bg-red-100 text-red-700'
                              }`}
                            >
                              {submission.is_correct ? 'Correct' : 'Incorrect'}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-sm text-gray-600">
                            <span>Score: {Math.round(submission.score)}%</span>
                            <span>{new Date(submission.submitted_at).toLocaleDateString()}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <p className="text-gray-500 mb-4">No submissions yet</p>
                      <Link
                        href="/problems"
                        className="inline-block px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                      >
                        Start Solving
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </ProtectedRoute>
  )
}
