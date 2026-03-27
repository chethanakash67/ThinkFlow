'use client';

import './dashboard.css';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  FaBullseye,
  FaCheckCircle,
  FaFileAlt,
  FaInbox,
} from 'react-icons/fa';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/context/auth.context';
import api from '@/lib/api';

export default function DashboardPage() {
  const { user: authUser } = useAuth();
  const [stats, setStats] = useState<any>(null);
  const [recentSubmissions, setRecentSubmissions] = useState<any[]>([]);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [dashboardResponse, profileResponse] = await Promise.all([
          api.get('/submissions/dashboard'),
          api.get('/auth/profile'),
        ]);

        setStats(dashboardResponse.data.stats);
        setRecentSubmissions(dashboardResponse.data.recentSubmissions || []);
        setProfile(profileResponse.data.profile || null);
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const displayName = useMemo(
    () => (profile?.name || authUser?.name || 'User').toUpperCase(),
    [authUser?.name, profile?.name]
  );

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

  return (
    <ProtectedRoute>
      <div className="app-page dashboard-shell">
        <main className="app-container dashboard-layout">
          {loading ? (
            <div className="dashboard-loading">Loading your dashboard...</div>
          ) : (
            <>
              <section className="dashboard-welcome">
                <h1>Welcome back, {displayName}!</h1>
                <p>Continue your learning journey</p>
              </section>

              <section className="dashboard-stats">
                <article className="dashboard-stat-card">
                  <div className="dashboard-stat-top">
                    <span>Total Submissions</span>
                    <div className="dashboard-stat-icon">
                      <FaFileAlt />
                    </div>
                  </div>
                  <strong>{stats?.total_submissions || 0}</strong>
                </article>

                <article className="dashboard-stat-card">
                  <div className="dashboard-stat-top">
                    <span>Correct Solutions</span>
                    <div className="dashboard-stat-icon">
                      <FaCheckCircle />
                    </div>
                  </div>
                  <strong>{stats?.correct_count || 0}</strong>
                </article>

                <article className="dashboard-stat-card">
                  <div className="dashboard-stat-top">
                    <span>Problems Attempted</span>
                    <div className="dashboard-stat-icon">
                      <FaBullseye />
                    </div>
                  </div>
                  <strong>{stats?.problems_attempted || 0}</strong>
                </article>
              </section>

              <section className="dashboard-section">
                <h2>Quick Actions</h2>
                <div className="dashboard-actions">
                  <Link href="/problems" className="dashboard-primary-action">
                    Browse Problems
                  </Link>
                  <Link href="/problems" className="dashboard-secondary-action">
                    Continue Learning
                  </Link>
                </div>
              </section>

              <section className="dashboard-section">
                <h2>Recent Submissions</h2>
                <div className="dashboard-submissions-card">
                  {recentSubmissions.length > 0 ? (
                    <div className="dashboard-submission-list">
                      {recentSubmissions.slice(0, 5).map((submission: any) => (
                        <div key={submission.id} className="dashboard-submission-item">
                          <div>
                            <strong>{submission.title || `Problem #${submission.problem_id}`}</strong>
                            <p>{formatDate(submission.created_at)}</p>
                          </div>
                          <span className={`dashboard-submission-badge ${submission.status === 'correct' ? 'success' : 'error'}`}>
                            {submission.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="dashboard-empty-state">
                      <FaInbox />
                      <p>No submissions yet. Start solving problems!</p>
                      <Link href="/problems" className="dashboard-empty-button">
                        Browse Problems
                      </Link>
                    </div>
                  )}
                </div>
              </section>
            </>
          )}
        </main>
      </div>
    </ProtectedRoute>
  );
}
