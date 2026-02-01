'use client';

import './dashboard.css';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import ProtectedRoute from '@/components/ProtectedRoute';
import { getCurrentUser } from '@/lib/auth';
import api from '@/lib/api';

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [recentSubmissions, setRecentSubmissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const userData = await getCurrentUser();
        setUser(userData);

        const statsResponse = await api.get('/submissions/dashboard');
        setStats(statsResponse.data.stats);
        setRecentSubmissions(statsResponse.data.recentSubmissions || []);
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    router.push('/login');
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <ProtectedRoute>
      <div className="dashboard-container">
        <header className="dashboard-header">
          <div className="header-content">
            <a href="/" className="brand-link">
              <div className="brand-icon"></div>
              <span className="brand-text">ThinkFlow</span>
            </a>
            <div className="header-actions">
              <a href="/problems" className="nav-link">Problems</a>
              <span className="user-email">{user?.email}</span>
              <button onClick={handleLogout} className="logout-button">
                Logout
              </button>
            </div>
          </div>
        </header>

        <main className="dashboard-main">
          {loading ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#666' }}>
              Loading...
            </div>
          ) : (
            <>
              <div className="welcome-section">
                <h1 className="welcome-title">Welcome back, {user?.name || 'User'}!</h1>
                <p className="welcome-subtitle">Continue your learning journey</p>
              </div>

              <div className="stats-grid">
                <div className="stat-card">
                  <div className="stat-header">
                    <span className="stat-label">Total Submissions</span>
                    <div className="stat-icon stat-icon-1">📝</div>
                  </div>
                  <div className="stat-value">{stats?.total_submissions || 0}</div>
                </div>

                <div className="stat-card">
                  <div className="stat-header">
                    <span className="stat-label">Correct Solutions</span>
                    <div className="stat-icon stat-icon-2">✓</div>
                  </div>
                  <div className="stat-value">{stats?.correct_count || 0}</div>
                </div>

                <div className="stat-card">
                  <div className="stat-header">
                    <span className="stat-label">Problems Attempted</span>
                    <div className="stat-icon stat-icon-3">🎯</div>
                  </div>
                  <div className="stat-value">{stats?.problems_attempted || 0}</div>
                </div>
              </div>

              <div className="quick-actions">
                <h2 className="section-title">Quick Actions</h2>
                <div className="actions-grid">
                  <a href="/problems" className="action-button">
                    Browse Problems
                  </a>
                  <button onClick={() => router.push('/problems')} className="action-button action-button-secondary">
                    Continue Learning
                  </button>
                </div>
              </div>

              <div className="recent-submissions">
                <h2 className="section-title">Recent Submissions</h2>
                {recentSubmissions.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-state-icon">📭</div>
                    <p className="empty-state-message">No submissions yet. Start solving problems!</p>
                    <a href="/problems" className="empty-state-button">
                      Browse Problems
                    </a>
                  </div>
                ) : (
                  <div className="submissions-list">
                    {recentSubmissions.map((submission: any, index: number) => (
                      <div key={submission.id || index} className="submission-item">
                        <div className="submission-details">
                          <div className="submission-problem">
                            Problem #{submission.problem_id}
                          </div>
                          <div className="submission-date">
                            {formatDate(submission.submitted_at)}
                          </div>
                        </div>
                        <span className={`submission-status ${
                          submission.is_correct ? 'status-passed' : 'status-failed'
                        }`}>
                          {submission.is_correct ? 'Passed' : 'Failed'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </main>
      </div>
    </ProtectedRoute>
  );
}
