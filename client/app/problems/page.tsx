'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import ProtectedRoute from '@/components/ProtectedRoute'
import api from '@/lib/api'
import { getCurrentUser } from '@/lib/auth'
import { FaCircle, FaCheckCircle, FaArrowLeft, FaCode, FaChartBar, FaSignOutAlt } from 'react-icons/fa'
import './problems.css'

function ProblemsContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const difficultyFilter = searchParams.get('difficulty')
  const [problems, setProblems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDifficulty, setSelectedDifficulty] = useState<string | null>(difficultyFilter)
  const [user, setUser] = useState<any>(null)

  useEffect(() => {
    const loadUser = async () => {
      try {
        const userData = await getCurrentUser()
        setUser(userData)
      } catch (error) {
        console.error('Failed to load user:', error)
      }
    }
    loadUser()
  }, [])

  const handleLogout = () => {
    localStorage.removeItem('token')
    router.push('/login')
  }

  useEffect(() => {
    const fetchProblems = async () => {
      try {
        const params = selectedDifficulty ? { difficulty: selectedDifficulty } : {}
        const response = await api.get('/problems', { params })
        setProblems(response.data.problems)
      } catch (error) {
        console.error('Failed to fetch problems:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchProblems()
  }, [selectedDifficulty])

  const getStats = () => {
    const total = problems.length
    const easy = problems.filter(p => p.difficulty === 'easy').length
    const medium = problems.filter(p => p.difficulty === 'medium').length
    const hard = problems.filter(p => p.difficulty === 'hard').length
    return { total, easy, medium, hard }
  }

  const stats = getStats()

  return (
    <>
      {/* Navbar */}
      <nav className="problems-navbar">
        <div className="navbar-content">
          <Link href="/dashboard" className="navbar-brand">
            <div className="navbar-icon">
              <Image src="/assets/logo.jpeg" alt="ThinkFlow Logo" width={40} height={40} />
            </div>
            <span className="navbar-text">ThinkFlow</span>
          </Link>
          <div className="navbar-actions">
            <Link href="/dashboard" className="navbar-link navbar-link-back">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Back to Dashboard
            </Link>
            <Link href="/problems" className="navbar-link active">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M8 2L3 7H6V14H10V7H13L8 2Z" fill="currentColor"/>
              </svg>
              Problems
            </Link>
            <span className="navbar-email">{user?.email}</span>
            <button onClick={handleLogout} className="navbar-logout">
              <FaSignOutAlt /> Logout
            </button>
          </div>
        </div>
      </nav>

      <main className="problems-container">
        <div className="problems-wrapper">
        <div className="problems-header">
          <h1 className="problems-title">Coding Challenges</h1>
          <p className="problems-subtitle">
            Master your programming skills with carefully curated problems
          </p>

          <div className="problems-stats">
            <div className="stat-item">
              <div className="stat-label">Total Problems</div>
              <div className="stat-value">{stats.total}</div>
            </div>
            <div className="stat-item">
              <div className="stat-label">Easy</div>
              <div className="stat-value" style={{ color: '#00cec9' }}>{stats.easy}</div>
            </div>
            <div className="stat-item">
              <div className="stat-label">Medium</div>
              <div className="stat-value" style={{ color: '#fdcb6e' }}>{stats.medium}</div>
            </div>
            <div className="stat-item">
              <div className="stat-label">Hard</div>
              <div className="stat-value" style={{ color: '#ff7675' }}>{stats.hard}</div>
            </div>
          </div>
        </div>

        <div className="filter-buttons">
          <button
            onClick={() => setSelectedDifficulty(null)}
            className={`filter-btn ${selectedDifficulty === null ? 'active' : ''}`}
          >
            All Problems
          </button>
          <button
            onClick={() => setSelectedDifficulty('easy')}
            className={`filter-btn easy ${selectedDifficulty === 'easy' ? 'active' : ''}`}
          >
            Easy
          </button>
          <button
            onClick={() => setSelectedDifficulty('medium')}
            className={`filter-btn medium ${selectedDifficulty === 'medium' ? 'active' : ''}`}
          >
            Medium
          </button>
          <button
            onClick={() => setSelectedDifficulty('hard')}
            className={`filter-btn hard ${selectedDifficulty === 'hard' ? 'active' : ''}`}
          >
            Hard
          </button>
        </div>

        {loading ? (
          <div className="loading-container">
            <div className="loading-spinner"></div>
            <p className="loading-text">Loading problems...</p>
          </div>
        ) : (
          <div className="problems-list">
            {problems.length > 0 ? (
              problems.map((problem: any, index: number) => (
                <Link
                  key={problem.id}
                  href={`/problems/${problem.id}`}
                  className="problem-card"
                >
                  <div className="problem-card-content">
                    <div className="problem-header">
                      <div className="problem-title-section">
                        <div className="problem-number">#{index + 1}</div>
                        <h2 className="problem-title">{problem.title}</h2>
                        <div className="problem-meta">
                          <span className={`difficulty-badge ${problem.difficulty}`}>
                            {problem.difficulty}
                          </span>
                          <span className="problem-acceptance">
                            Acceptance: <span className="acceptance-rate">
                              {Math.floor(Math.random() * 30 + 40)}%
                            </span>
                          </span>
                        </div>
                      </div>
                      <div className="problem-status">
                        <div className={`status-indicator ${
                          problem.user_solved ? 'solved' : 
                          problem.user_attempted ? 'attempted' : 'unsolved'
                        }`}>
                          {problem.user_solved ? (
                            <FaCheckCircle size={14} />
                          ) : problem.user_attempted ? (
                            <FaCode size={14} />
                          ) : (
                            <FaCircle size={8} />
                          )}
                        </div>
                      </div>
                    </div>
                    <p className="problem-description">
                      {problem.description}
                    </p>
                    {problem.tags && problem.tags.length > 0 && (
                      <div className="problem-tags">
                        {problem.tags.map((tag: string, idx: number) => (
                          <span key={idx} className="problem-tag">{tag}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </Link>
              ))
            ) : (
              <div className="empty-state">
                <div className="empty-icon">
                  <FaChartBar />
                </div>
                <h3 className="empty-title">No Problems Found</h3>
                <p className="empty-description">
                  {selectedDifficulty 
                    ? `No ${selectedDifficulty} problems available at the moment.`
                    : 'Start your coding journey by selecting a difficulty level.'}
                </p>
                {selectedDifficulty && (
                  <button 
                    onClick={() => setSelectedDifficulty(null)}
                    className="empty-action"
                  >
                    Show All Problems
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
    </>
  )
}

export default function ProblemsPage() {
  return (
    <ProtectedRoute>
      <Suspense fallback={
        <div className="problems-container">
          <div className="loading-container">
            <div className="loading-spinner"></div>
            <p className="loading-text">Loading problems...</p>
          </div>
        </div>
      }>
        <ProblemsContent />
      </Suspense>
    </ProtectedRoute>
  )
}
