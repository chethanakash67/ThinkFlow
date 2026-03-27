'use client';

import './profile.css';
import { useEffect, useState } from 'react';
import {
  FaCodeBranch,
  FaGlobe,
  FaSave,
  FaTrophy,
  FaUserCircle,
} from 'react-icons/fa';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/context/auth.context';
import api from '@/lib/api';

interface ProfileForm {
  name: string;
  bio: string;
  country: string;
  githubUrl: string;
  preferredLanguage: string;
}

const emptyProfile: ProfileForm = {
  name: '',
  bio: '',
  country: '',
  githubUrl: '',
  preferredLanguage: '',
};

export default function ProfilePage() {
  const { user: authUser, refreshUser } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [metrics, setMetrics] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [badges, setBadges] = useState<any[]>([]);
  const [rankings, setRankings] = useState<any>(null);
  const [form, setForm] = useState<ProfileForm>(emptyProfile);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const response = await api.get('/auth/profile');
        setProfile(response.data.profile);
        setMetrics(response.data.metrics);
        setStats(response.data.stats);
        setBadges(response.data.badges || []);
        setRankings(response.data.rankings || null);
        setForm({
          name: response.data.profile?.name || authUser?.name || '',
          bio: response.data.profile?.bio || '',
          country: response.data.profile?.country || '',
          githubUrl: response.data.profile?.githubUrl || '',
          preferredLanguage: response.data.profile?.preferredLanguage || '',
        });
      } catch (error) {
        console.error('Failed to fetch profile:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [authUser?.name]);

  const handleChange = (field: keyof ProfileForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const response = await api.put('/auth/profile', form);
      setProfile(response.data.profile);
      await refreshUser();
    } catch (error: any) {
      console.error('Failed to update profile:', error);
      window.alert(error.response?.data?.error || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (value: string) =>
    new Date(value).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });

  return (
    <ProtectedRoute>
      <div className="app-page profile-page">
        <main className="app-container profile-main">
          {loading ? (
            <div className="loading-shell">Loading your profile...</div>
          ) : (
            <>
              <section className="app-hero-card profile-hero">
                <div className="profile-identity">
                  <div className="profile-icon">
                    <FaUserCircle />
                  </div>
                  <div>
                    <p className="app-kicker">Profile</p>
                    <h1>{profile?.name || authUser?.name || 'ThinkFlow User'}</h1>
                    <p className="app-muted">
                      {profile?.bio || 'Write a short intro to tell other coders what you care about.'}
                    </p>
                  </div>
                </div>

                <div className="profile-hero-meta">
                  <div className="hero-meta-card">
                    <span>Global Rank</span>
                    <strong>{rankings?.globalRank ? `#${rankings.globalRank}` : 'Unranked'}</strong>
                  </div>
                  <div className="hero-meta-card">
                    <span>Weekly Points</span>
                    <strong>{stats?.weeklyPoints || 0}</strong>
                  </div>
                  <div className="hero-meta-card">
                    <span>Badges</span>
                    <strong>{badges.length}</strong>
                  </div>
                </div>
              </section>

              <section className="profile-grid">
                <article className="app-panel-card profile-card">
                  <div className="profile-card-head">
                    <div>
                      <p className="app-kicker">Details</p>
                      <h2>Public profile</h2>
                    </div>
                  </div>

                  <div className="profile-detail-list">
                    <div className="profile-detail-item">
                      <span>Email</span>
                      <strong>{profile?.email}</strong>
                    </div>
                    <div className="profile-detail-item">
                      <span>Country</span>
                      <strong>{profile?.country || 'Not set'}</strong>
                    </div>
                    <div className="profile-detail-item">
                      <span>GitHub</span>
                      <strong>{profile?.githubUrl || 'Not added'}</strong>
                    </div>
                    <div className="profile-detail-item">
                      <span>Preferred Language</span>
                      <strong>{profile?.preferredLanguage || metrics?.topLanguage || 'Not set'}</strong>
                    </div>
                    <div className="profile-detail-item">
                      <span>Member Since</span>
                      <strong>{profile?.createdAt ? formatDate(profile.createdAt) : 'Recently'}</strong>
                    </div>
                  </div>
                </article>

                <article className="app-panel-card profile-card">
                  <div className="profile-card-head">
                    <div>
                      <p className="app-kicker">Stats</p>
                      <h2>Performance</h2>
                    </div>
                  </div>

                  <div className="profile-stats-grid">
                    <div className="profile-stat-box">
                      <FaTrophy />
                      <span>Problems Solved</span>
                      <strong>{stats?.problemsSolved || metrics?.solvedProblems || 0}</strong>
                    </div>
                    <div className="profile-stat-box">
                      <FaGlobe />
                      <span>Competitions Joined</span>
                      <strong>{stats?.competitionsJoined || metrics?.joinedCompetitions || 0}</strong>
                    </div>
                    <div className="profile-stat-box">
                      <FaCodeBranch />
                      <span>Success Rate</span>
                      <strong>{stats?.successRate || 0}%</strong>
                    </div>
                    <div className="profile-stat-box">
                      <FaTrophy />
                      <span>Total Points</span>
                      <strong>{stats?.totalPoints || 0}</strong>
                    </div>
                  </div>
                </article>
              </section>

              <section className="profile-grid">
                <article className="app-panel-card profile-card profile-form-card" id="settings">
                  <div className="profile-card-head">
                    <div>
                      <p className="app-kicker">Editable Profile</p>
                      <h2>Update your info</h2>
                    </div>
                  </div>

                  <div className="profile-form-grid">
                    <label className="profile-field">
                      <span>Name</span>
                      <input value={form.name} onChange={(e) => handleChange('name', e.target.value)} />
                    </label>
                    <label className="profile-field">
                      <span>Country</span>
                      <input value={form.country} onChange={(e) => handleChange('country', e.target.value)} placeholder="India" />
                    </label>
                    <label className="profile-field profile-field-full">
                      <span>Bio</span>
                      <textarea value={form.bio} onChange={(e) => handleChange('bio', e.target.value)} rows={5} />
                    </label>
                    <label className="profile-field">
                      <span>GitHub</span>
                      <input value={form.githubUrl} onChange={(e) => handleChange('githubUrl', e.target.value)} placeholder="https://github.com/username" />
                    </label>
                    <label className="profile-field">
                      <span>Preferred Language</span>
                      <input value={form.preferredLanguage} onChange={(e) => handleChange('preferredLanguage', e.target.value)} placeholder="javascript" />
                    </label>
                  </div>

                  <button className="app-button" onClick={handleSave} disabled={saving}>
                    <FaSave />
                    {saving ? 'Saving...' : 'Save Profile'}
                  </button>
                </article>

                <article className="app-panel-card profile-card">
                  <div className="profile-card-head">
                    <div>
                      <p className="app-kicker">Badges</p>
                      <h2>Unlocked milestones</h2>
                    </div>
                  </div>

                  <div className="profile-badge-grid">
                    {badges.length === 0 ? (
                      <p className="app-muted">No badges yet. Your first solve unlocks the first one.</p>
                    ) : (
                      badges.map((badge) => (
                        <div key={badge.key} className="profile-badge-card">
                          <strong>{badge.label}</strong>
                          <p>{badge.description}</p>
                        </div>
                      ))
                    )}
                  </div>
                </article>
              </section>
            </>
          )}
        </main>
      </div>
    </ProtectedRoute>
  );
}
