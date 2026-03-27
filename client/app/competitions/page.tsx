'use client';

import './competitions.css';
import { useEffect, useMemo, useState } from 'react';
import {
  FaCalendarAlt,
  FaCheckCircle,
  FaClock,
  FaLayerGroup,
  FaMedal,
  FaPlus,
  FaTrophy,
  FaUsers,
} from 'react-icons/fa';
import ProtectedRoute from '@/components/ProtectedRoute';
import api from '@/lib/api';

type CompetitionQuestion = {
  title: string;
  description: string;
  sampleInput1: string;
  sampleOutput1: string;
  sampleInput2: string;
  sampleOutput2: string;
  constraints: string;
  difficulty: string;
};

const createEmptyQuestion = (): CompetitionQuestion => ({
  title: '',
  description: '',
  sampleInput1: '',
  sampleOutput1: '',
  sampleInput2: '',
  sampleOutput2: '',
  constraints: '',
  difficulty: 'medium',
});

export default function CompetitionsPage() {
  const [competitions, setCompetitions] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedCompetition, setSelectedCompetition] = useState<any>(null);
  const [problems, setProblems] = useState<any[]>([]);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [leaderboardsOverview, setLeaderboardsOverview] = useState<any>({ global: [], weekly: [] });
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [joiningId, setJoiningId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [basicInfo, setBasicInfo] = useState({
    name: '',
    email: '',
    phone: '',
    organizationName: '',
  });
  const [questions, setQuestions] = useState<CompetitionQuestion[]>([createEmptyQuestion()]);
  const [timing, setTiming] = useState({
    competitionDate: '',
    startTime: '',
    endTime: '',
    durationMinutes: '45',
  });

  const loadCompetitionDetail = async (competitionId: number) => {
    const detailResponse = await api.get(`/competitions/${competitionId}`);
    setSelectedCompetition(detailResponse.data.competition);
    setProblems(detailResponse.data.problems || []);
    setLeaderboard(detailResponse.data.leaderboard || []);
  };

  const loadPageData = async (preferredId?: number) => {
    const [competitionsResponse, myCompetitionsResponse, leaderboardResponse] = await Promise.all([
      api.get('/competitions'),
      api.get('/competitions/me/joined'),
      api.get('/competitions/leaderboards/overview'),
    ]);

    const nextCompetitions = competitionsResponse.data.competitions || [];
    setCompetitions(nextCompetitions);
    setRequests(myCompetitionsResponse.data.requests || []);
    setLeaderboardsOverview(leaderboardResponse.data || { global: [], weekly: [] });

    if (nextCompetitions.length === 0) {
      setSelectedId(null);
      setSelectedCompetition(null);
      setProblems([]);
      setLeaderboard([]);
      return;
    }

    const nextId = preferredId || nextCompetitions[0].id;
    setSelectedId(nextId);
    await loadCompetitionDetail(nextId);
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        await loadPageData();
      } catch (error) {
        console.error('Failed to fetch competitions:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleSelectCompetition = async (competitionId: number) => {
    try {
      setSelectedId(competitionId);
      await loadCompetitionDetail(competitionId);
    } catch (error) {
      console.error('Failed to load competition detail:', error);
    }
  };

  const handleJoin = async (competitionId: number) => {
    try {
      setJoiningId(competitionId);
      await api.post(`/competitions/${competitionId}/join`);
      await loadPageData(competitionId);
    } catch (error: any) {
      console.error('Failed to join competition:', error);
      window.alert(error.response?.data?.error || 'Failed to join competition');
    } finally {
      setJoiningId(null);
    }
  };

  const handleQuestionCountChange = (count: number) => {
    setQuestions((current) => {
      const next = [...current];
      if (count > next.length) {
        while (next.length < count) next.push(createEmptyQuestion());
      } else {
        next.length = count;
      }
      return next;
    });
  };

  const updateQuestion = (index: number, field: keyof CompetitionQuestion, value: string) => {
    setQuestions((current) =>
      current.map((question, questionIndex) =>
        questionIndex === index ? { ...question, [field]: value } : question
      )
    );
  };

  const handleSubmitRequest = async () => {
    try {
      setSubmitting(true);
      const response = await api.post('/competitions/requests', {
        ...basicInfo,
        ...timing,
        durationMinutes: Number(timing.durationMinutes),
        questions,
      });
      window.alert(response.data.warning || response.data.message || 'Competition submitted for approval.');
      setCurrentStep(1);
      setBasicInfo({ name: '', email: '', phone: '', organizationName: '' });
      setQuestions([createEmptyQuestion()]);
      setTiming({ competitionDate: '', startTime: '', endTime: '', durationMinutes: '45' });
      await loadPageData(selectedId || undefined);
    } catch (error: any) {
      console.error('Failed to submit competition:', error);
      window.alert(
        error.response?.data?.details ||
        error.response?.data?.error ||
        'Failed to submit competition'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const groupedCompetitions = useMemo(() => {
    const groups = {
      active: competitions.filter((competition) => competition.status === 'open'),
      upcoming: competitions.filter((competition) => competition.status === 'upcoming'),
      past: competitions.filter((competition) => competition.status === 'completed'),
    };

    return groups;
  }, [competitions]);

  const formatDate = (value: string) =>
    new Date(value).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  const renderCompetitionSection = (title: string, description: string, items: any[]) => (
    <section className="competition-section">
      <div className="competition-section-head">
        <div>
          <p className="app-kicker">{title}</p>
          <h2>{description}</h2>
        </div>
      </div>

      <div className="competition-card-grid">
        {items.length === 0 ? (
          <div className="competition-empty-card">Nothing here yet.</div>
        ) : (
          items.map((competition) => (
            <button
              key={competition.id}
              className={`competition-overview-card ${competition.id === selectedId ? 'selected' : ''}`}
              onClick={() => handleSelectCompetition(competition.id)}
            >
              <div className="competition-overview-top">
                <span className={`competition-pill competition-pill-${competition.status}`}>{competition.status}</span>
                {competition.joined ? <span className="joined-pill">Joined</span> : null}
              </div>
              <h3>{competition.title}</h3>
              <p>{competition.description}</p>
              <div className="competition-meta-row">
                <span><FaUsers /> {competition.participantCount}</span>
                <span><FaLayerGroup /> {competition.difficulty}</span>
              </div>
              <div className="competition-meta-row">
                <span><FaCalendarAlt /> {formatDate(competition.startAt)}</span>
              </div>
            </button>
          ))
        )}
      </div>
    </section>
  );

  return (
    <ProtectedRoute>
      <div className="app-page competitions-page">
        <main className="app-container competitions-main">
          {loading ? (
            <div className="loading-shell">Loading competitions...</div>
          ) : (
            <>
              <section className="app-hero-card competitions-hero">
                <div>
                  <p className="app-kicker">Competitions</p>
                  <h1>Compete in rounds that feel native to ThinkFlow.</h1>
                  <p className="app-muted">
                    Browse active, upcoming, and completed rounds, preview the top performers, or create your own competition and send it through approval.
                  </p>
                </div>
                <div className="competitions-hero-stats">
                  <div className="hero-stat-card">
                    <span>Active + Upcoming</span>
                    <strong>{groupedCompetitions.active.length + groupedCompetitions.upcoming.length}</strong>
                  </div>
                  <div className="hero-stat-card">
                    <span>Pending Requests</span>
                    <strong>{requests.filter((request) => request.status === 'pending_approval').length}</strong>
                  </div>
                  <div className="hero-stat-card">
                    <span>Global Leaders</span>
                    <strong>{leaderboardsOverview.global.length}</strong>
                  </div>
                </div>
              </section>

              <section className="competitions-layout">
                <div className="competitions-left-column">
                  {renderCompetitionSection('Active Competitions', 'Join live rounds happening now.', groupedCompetitions.active)}
                  {renderCompetitionSection('Upcoming Competitions', 'Plan your next sprint before the timer starts.', groupedCompetitions.upcoming)}
                  {renderCompetitionSection('Past Competitions', 'Look back at the rounds that already wrapped.', groupedCompetitions.past)}
                </div>

                <aside className="competitions-right-column">
                  <div className="app-panel-card competition-detail-panel">
                    {selectedCompetition ? (
                      <>
                        <div className="competition-detail-head">
                          <div>
                            <p className="app-kicker">Selected Round</p>
                            <h2>{selectedCompetition.title}</h2>
                            <p className="app-muted">{selectedCompetition.description}</p>
                          </div>
                          {selectedCompetition.joined ? (
                            <button className="app-button secondary" disabled>
                              <FaCheckCircle /> Joined
                            </button>
                          ) : (
                            <button
                              className="app-button"
                              onClick={() => handleJoin(selectedCompetition.id)}
                              disabled={joiningId === selectedCompetition.id}
                            >
                              {joiningId === selectedCompetition.id ? 'Joining...' : 'Join Competition'}
                            </button>
                          )}
                        </div>

                        <div className="competition-detail-chips">
                          <div className="detail-chip"><FaUsers /> {selectedCompetition.participantCount} participants</div>
                          <div className="detail-chip"><FaClock /> Ends {formatDate(selectedCompetition.endAt)}</div>
                          <div className="detail-chip"><FaTrophy /> {selectedCompetition.rewardPool} reward points</div>
                        </div>

                        <div className="competition-detail-card">
                          <div className="detail-card-head">
                            <h3>Problem lineup</h3>
                            <span>{problems.length} questions</span>
                          </div>
                          <div className="detail-list">
                            {problems.map((problem) => (
                              <div key={problem.id} className="detail-list-item">
                                <div>
                                  <strong>{problem.orderIndex}. {problem.title}</strong>
                                  <p className="app-muted">{problem.difficulty}</p>
                                </div>
                                <span>{problem.points} pts</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="competition-detail-card">
                          <div className="detail-card-head">
                            <h3>Leaderboard preview</h3>
                            <span>Top {leaderboard.length}</span>
                          </div>
                          <div className="detail-list">
                            {leaderboard.length === 0 ? (
                              <div className="competition-empty-card">No ranked entries yet.</div>
                            ) : (
                              leaderboard.slice(0, 5).map((entry) => (
                                <div key={entry.userId} className="detail-list-item leaderboard-row">
                                  <div className="leaderboard-rank">
                                    <FaMedal />
                                    <span>#{entry.rank}</span>
                                  </div>
                                  <div>
                                    <strong>{entry.name}</strong>
                                    <p className="app-muted">{entry.solvedCount} solved</p>
                                  </div>
                                  <span>{entry.totalScore}</span>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="competition-empty-card">Select a competition to preview it here.</div>
                    )}
                  </div>

                  <div className="leaderboard-preview-grid">
                    <div className="app-panel-card leaderboard-preview-card">
                      <div className="detail-card-head">
                        <h3>Global Ranking</h3>
                        <span>Top coders</span>
                      </div>
                      <div className="detail-list">
                        {leaderboardsOverview.global.map((entry: any) => (
                          <div key={`global-${entry.userId}`} className="detail-list-item leaderboard-row">
                            <span>#{entry.rank}</span>
                            <strong>{entry.name}</strong>
                            <span>{entry.totalPoints}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="app-panel-card leaderboard-preview-card">
                      <div className="detail-card-head">
                        <h3>Weekly Ranking</h3>
                        <span>Last 7 days</span>
                      </div>
                      <div className="detail-list">
                        {leaderboardsOverview.weekly.map((entry: any) => (
                          <div key={`weekly-${entry.userId}`} className="detail-list-item leaderboard-row">
                            <span>#{entry.rank}</span>
                            <strong>{entry.name}</strong>
                            <span>{entry.totalPoints}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </aside>
              </section>

              <section className="competition-builder-grid">
                <article className="app-panel-card competition-builder-card">
                  <div className="competition-builder-head">
                    <div>
                      <p className="app-kicker">Create Competition</p>
                      <h2>Submit a round for approval</h2>
                    </div>
                    <div className="builder-steps">
                      {[1, 2, 3, 4].map((step) => (
                        <button
                          key={step}
                          className={`builder-step ${currentStep === step ? 'active' : ''}`}
                          onClick={() => setCurrentStep(step)}
                        >
                          {step}
                        </button>
                      ))}
                    </div>
                  </div>

                  {currentStep === 1 ? (
                    <div className="builder-form-grid">
                      <label className="builder-field">
                        <span>Name</span>
                        <input value={basicInfo.name} onChange={(e) => setBasicInfo((current) => ({ ...current, name: e.target.value }))} />
                      </label>
                      <label className="builder-field">
                        <span>Email</span>
                        <input type="email" value={basicInfo.email} onChange={(e) => setBasicInfo((current) => ({ ...current, email: e.target.value }))} />
                      </label>
                      <label className="builder-field">
                        <span>Phone Number</span>
                        <input value={basicInfo.phone} onChange={(e) => setBasicInfo((current) => ({ ...current, phone: e.target.value }))} />
                      </label>
                      <label className="builder-field">
                        <span>Organization</span>
                        <input value={basicInfo.organizationName} onChange={(e) => setBasicInfo((current) => ({ ...current, organizationName: e.target.value }))} placeholder="Optional" />
                      </label>
                    </div>
                  ) : null}

                  {currentStep === 2 ? (
                    <div className="builder-step-body">
                      <label className="builder-field builder-count-field">
                        <span>Number of questions</span>
                        <input
                          type="number"
                          min={1}
                          max={10}
                          value={questions.length}
                          onChange={(e) => handleQuestionCountChange(Number(e.target.value) || 1)}
                        />
                      </label>

                      <div className="question-builder-list">
                        {questions.map((question, index) => (
                          <div key={index} className="question-builder-card">
                            <div className="question-builder-head">
                              <h3>Question {index + 1}</h3>
                              <select value={question.difficulty} onChange={(e) => updateQuestion(index, 'difficulty', e.target.value)}>
                                <option value="easy">Easy</option>
                                <option value="medium">Medium</option>
                                <option value="hard">Hard</option>
                              </select>
                            </div>
                            <div className="builder-form-grid">
                              <label className="builder-field">
                                <span>Title</span>
                                <input value={question.title} onChange={(e) => updateQuestion(index, 'title', e.target.value)} />
                              </label>
                              <label className="builder-field builder-field-full">
                                <span>Description</span>
                                <textarea value={question.description} onChange={(e) => updateQuestion(index, 'description', e.target.value)} rows={4} />
                              </label>
                              <label className="builder-field">
                                <span>Sample Input 1</span>
                                <textarea value={question.sampleInput1} onChange={(e) => updateQuestion(index, 'sampleInput1', e.target.value)} rows={3} />
                              </label>
                              <label className="builder-field">
                                <span>Sample Output 1</span>
                                <textarea value={question.sampleOutput1} onChange={(e) => updateQuestion(index, 'sampleOutput1', e.target.value)} rows={3} />
                              </label>
                              <label className="builder-field">
                                <span>Sample Input 2</span>
                                <textarea value={question.sampleInput2} onChange={(e) => updateQuestion(index, 'sampleInput2', e.target.value)} rows={3} />
                              </label>
                              <label className="builder-field">
                                <span>Sample Output 2</span>
                                <textarea value={question.sampleOutput2} onChange={(e) => updateQuestion(index, 'sampleOutput2', e.target.value)} rows={3} />
                              </label>
                              <label className="builder-field builder-field-full">
                                <span>Constraints</span>
                                <textarea value={question.constraints} onChange={(e) => updateQuestion(index, 'constraints', e.target.value)} rows={3} />
                              </label>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {currentStep === 3 ? (
                    <div className="builder-form-grid">
                      <label className="builder-field">
                        <span>Competition Date</span>
                        <input type="date" value={timing.competitionDate} onChange={(e) => setTiming((current) => ({ ...current, competitionDate: e.target.value }))} />
                      </label>
                      <label className="builder-field">
                        <span>Start Time</span>
                        <input type="time" value={timing.startTime} onChange={(e) => setTiming((current) => ({ ...current, startTime: e.target.value }))} />
                      </label>
                      <label className="builder-field">
                        <span>End Time</span>
                        <input type="time" value={timing.endTime} onChange={(e) => setTiming((current) => ({ ...current, endTime: e.target.value }))} />
                      </label>
                      <label className="builder-field">
                        <span>Duration (mins)</span>
                        <input type="number" min={1} value={timing.durationMinutes} onChange={(e) => setTiming((current) => ({ ...current, durationMinutes: e.target.value }))} />
                      </label>
                    </div>
                  ) : null}

                  {currentStep === 4 ? (
                    <div className="builder-review">
                      <div className="review-card">
                        <h3>Submission summary</h3>
                        <p className="app-muted">
                          Your competition will be saved as <strong>Pending Approval</strong>, emailed to {` `}
                          <strong>chethanakash67@gmail.com</strong>, and the creator will receive an approval or rejection email.
                        </p>
                        <ul className="review-list">
                          <li>{basicInfo.name || 'Untitled competition'}</li>
                          <li>{questions.length} question(s)</li>
                          <li>{timing.competitionDate || 'Date not set'} · {timing.startTime || '--:--'} to {timing.endTime || '--:--'}</li>
                          <li>{timing.durationMinutes || 0} minutes</li>
                        </ul>
                      </div>
                    </div>
                  ) : null}

                  <div className="builder-actions">
                    <button className="app-button ghost" onClick={() => setCurrentStep((step) => Math.max(1, step - 1))} disabled={currentStep === 1}>
                      Back
                    </button>
                    {currentStep < 4 ? (
                      <button className="app-button" onClick={() => setCurrentStep((step) => Math.min(4, step + 1))}>
                        Next Step
                      </button>
                    ) : (
                      <button className="app-button" onClick={handleSubmitRequest} disabled={submitting}>
                        <FaPlus />
                        {submitting ? 'Submitting...' : 'Submit For Approval'}
                      </button>
                    )}
                  </div>
                </article>

                <article className="app-panel-card competition-builder-card">
                  <div className="competition-builder-head">
                    <div>
                      <p className="app-kicker">Approval Queue</p>
                      <h2>Your submitted competitions</h2>
                    </div>
                  </div>

                  <div className="detail-list">
                    {requests.length === 0 ? (
                      <div className="competition-empty-card">No competition requests submitted yet.</div>
                    ) : (
                      requests.map((request) => (
                        <div key={request.id} className="detail-list-item">
                          <div>
                            <strong>{request.competitionName}</strong>
                            <p className="app-muted">
                              {request.competitionDate} · {request.startTime} to {request.endTime}
                            </p>
                          </div>
                          <span className={`competition-pill competition-pill-${request.status}`}>{request.status.replace('_', ' ')}</span>
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
