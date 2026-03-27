const { query } = require('../src/config/db');

const POINTS_BY_DIFFICULTY = {
  easy: 10,
  medium: 20,
  hard: 30,
};

const BADGE_DEFINITIONS = [
  { key: 'first_solve', label: 'First Solve', description: 'Solve your first problem.' },
  { key: 'fifty_problems', label: '50 Problems', description: 'Solve 50 unique problems.' },
  { key: 'hundred_problems', label: '100 Problems', description: 'Solve 100 unique problems.' },
  { key: 'competition_winner', label: 'Competition Winner', description: 'Finish rank #1 in a completed competition.' },
];

const getPointsForDifficulty = (difficulty) =>
  POINTS_BY_DIFFICULTY[(difficulty || '').toLowerCase()] || 20;

const getSolvedProblemCount = async (userId) => {
  const result = await query(
    `SELECT COUNT(DISTINCT problem_id)::int AS solved_count
     FROM code_submissions
     WHERE user_id = $1 AND status = 'correct'`,
    [userId]
  );

  return result.rows[0]?.solved_count || 0;
};

const getCompetitionWinCount = async (userId) => {
  const result = await query(
    `WITH competition_scores AS (
       SELECT
         part.competition_id,
         part.user_id,
         COALESCE(SUM(best_scores.best_score), 0) AS total_score,
         COALESCE(SUM(best_scores.solved), 0) AS solved_count,
         MAX(part.joined_at) AS joined_at
       FROM competition_participants part
       LEFT JOIN (
         SELECT
           cp.competition_id,
           ls.user_id,
           ls.problem_id,
           MAX(ls.score) AS best_score,
           MAX(CASE WHEN ls.status = 'correct' THEN 1 ELSE 0 END) AS solved
         FROM competition_problems cp
         JOIN logic_submissions ls ON ls.problem_id = cp.problem_id
         GROUP BY cp.competition_id, ls.user_id, ls.problem_id
       ) best_scores
         ON best_scores.competition_id = part.competition_id
        AND best_scores.user_id = part.user_id
       JOIN competitions c ON c.id = part.competition_id
       WHERE (c.status = 'completed' OR c.end_at < CURRENT_TIMESTAMP)
       GROUP BY part.competition_id, part.user_id
     ),
     ranked AS (
       SELECT
         competition_id,
         user_id,
         DENSE_RANK() OVER (
           PARTITION BY competition_id
           ORDER BY total_score DESC, solved_count DESC, joined_at ASC
         ) AS rank
       FROM competition_scores
     )
     SELECT COUNT(*)::int AS win_count
     FROM ranked
     WHERE user_id = $1 AND rank = 1`,
    [userId]
  );

  return result.rows[0]?.win_count || 0;
};

const getUserPointsSummary = async (userId) => {
  const [pointsResult, weeklyPointsResult, solvedCount, winCount] = await Promise.all([
    query(
      `SELECT COALESCE(SUM(points), 0)::int AS total_points
       FROM user_points
       WHERE user_id = $1`,
      [userId]
    ),
    query(
      `SELECT COALESCE(SUM(points), 0)::int AS weekly_points
       FROM user_points
       WHERE user_id = $1 AND awarded_at >= CURRENT_TIMESTAMP - INTERVAL '7 days'`,
      [userId]
    ),
    getSolvedProblemCount(userId),
    getCompetitionWinCount(userId),
  ]);

  const totalPoints = pointsResult.rows[0]?.total_points || 0;
  const weeklyPoints = weeklyPointsResult.rows[0]?.weekly_points || 0;

  const badges = BADGE_DEFINITIONS.filter((badge) => {
    if (badge.key === 'first_solve') return solvedCount >= 1;
    if (badge.key === 'fifty_problems') return solvedCount >= 50;
    if (badge.key === 'hundred_problems') return solvedCount >= 100;
    if (badge.key === 'competition_winner') return winCount >= 1;
    return false;
  }).map((badge) => ({
    ...badge,
    earned: true,
  }));

  return {
    totalPoints,
    weeklyPoints,
    solvedCount,
    winCount,
    badges,
  };
};

const getUserRanks = async (userId) => {
  const [globalRankResult, weeklyRankResult] = await Promise.all([
    query(
      `WITH totals AS (
         SELECT
           user_id,
           COALESCE(SUM(points), 0)::int AS total_points
         FROM user_points
         GROUP BY user_id
       ),
       ranked AS (
         SELECT
           user_id,
           DENSE_RANK() OVER (ORDER BY total_points DESC, user_id ASC) AS rank
         FROM totals
       )
       SELECT rank FROM ranked WHERE user_id = $1`,
      [userId]
    ),
    query(
      `WITH totals AS (
         SELECT
           user_id,
           COALESCE(SUM(points), 0)::int AS total_points
         FROM user_points
         WHERE awarded_at >= CURRENT_TIMESTAMP - INTERVAL '7 days'
         GROUP BY user_id
       ),
       ranked AS (
         SELECT
           user_id,
           DENSE_RANK() OVER (ORDER BY total_points DESC, user_id ASC) AS rank
         FROM totals
       )
       SELECT rank FROM ranked WHERE user_id = $1`,
      [userId]
    ),
  ]);

  return {
    globalRank: globalRankResult.rows[0]?.rank || null,
    weeklyRank: weeklyRankResult.rows[0]?.rank || null,
  };
};

const getLeaderboard = async (window = 'global', limit = 10) => {
  const whereClause =
    window === 'weekly' ? `WHERE up.awarded_at >= CURRENT_TIMESTAMP - INTERVAL '7 days'` : '';

  const result = await query(
    `SELECT
       u.id AS user_id,
       u.name,
       COALESCE(SUM(up.points), 0)::int AS total_points
     FROM users u
     JOIN user_points up ON up.user_id = u.id
     ${whereClause}
     GROUP BY u.id, u.name
     ORDER BY total_points DESC, u.name ASC
     LIMIT $1`,
    [limit]
  );

  return result.rows.map((row, index) => ({
    rank: index + 1,
    userId: row.user_id,
    name: row.name,
    totalPoints: row.total_points,
  }));
};

const awardSolvePoints = async ({ userId, problemId, difficulty }) => {
  const existingSolve = await query(
    `SELECT id
     FROM user_points
     WHERE user_id = $1 AND source_type = 'problem_solve' AND source_id = $2`,
    [userId, problemId]
  );

  if (existingSolve.rows.length > 0) {
    return { awarded: false, points: 0 };
  }

  const points = getPointsForDifficulty(difficulty);

  await query(
    `INSERT INTO user_points (user_id, points, source_type, source_id, meta)
     VALUES ($1, $2, 'problem_solve', $3, $4)`,
    [userId, points, problemId, JSON.stringify({ difficulty })]
  );

  return { awarded: true, points };
};

module.exports = {
  BADGE_DEFINITIONS,
  POINTS_BY_DIFFICULTY,
  awardSolvePoints,
  getLeaderboard,
  getPointsForDifficulty,
  getSolvedProblemCount,
  getUserPointsSummary,
  getUserRanks,
};
