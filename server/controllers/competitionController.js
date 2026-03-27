const { v4: uuidv4 } = require('uuid');
const { query, pool } = require('../src/config/db');
const { getLeaderboard } = require('../services/gamificationService');
const { decryptText, encryptText, hashLookupValue } = require('../src/utils/secureData');
const {
  sendCompetitionApprovalRequest,
  sendCompetitionDecisionEmail,
} = require('../src/services/emailService');

const ADMIN_EMAIL = process.env.COMPETITION_ADMIN_EMAIL || 'chethanakash67@gmail.com';
const API_BASE_URL = (
  process.env.API_BASE_URL ||
  process.env.BACKEND_URL ||
  process.env.RENDER_EXTERNAL_URL ||
  'http://localhost:3001'
).replace(/\/$/, '');

const slugify = (value) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

const getCompetitionStatus = (competition) => {
  if (competition.status === 'pending_approval' || competition.status === 'rejected') {
    return competition.status;
  }

  const now = Date.now();
  const startAt = new Date(competition.start_at || competition.startAt).getTime();
  const endAt = new Date(competition.end_at || competition.endAt).getTime();

  if (Number.isFinite(endAt) && endAt <= now) return 'completed';
  if (Number.isFinite(startAt) && startAt <= now) return 'open';
  return 'upcoming';
};

const formatCompetition = (competition) => ({
  id: competition.id,
  title: competition.title,
  slug: competition.slug,
  description: competition.description,
  difficulty: competition.difficulty,
  startAt: competition.start_at,
  endAt: competition.end_at,
  competitionDate: competition.competition_date || null,
  startTime: competition.start_time || null,
  endTime: competition.end_time || null,
  status: getCompetitionStatus(competition),
  maxParticipants: competition.max_participants,
  entryFee: competition.entry_fee,
  rewardPool: competition.reward_pool,
  isFeatured: competition.is_featured,
  participantCount: parseInt(competition.participant_count, 10) || 0,
  joined: !!competition.joined,
  creatorName: competition.creator_name || null,
  organizationName: competition.organization_name || null,
});

const formatRequest = (request) => ({
  id: request.id,
  competitionName: request.competition_name,
  status: request.status,
  competitionDate: request.competition_date,
  startTime: request.start_time,
  endTime: request.end_time,
  durationMinutes: request.duration_minutes,
  submittedAt: request.created_at,
  organizationName: decryptText(request.organization_name_encrypted || request.organization_name) || '',
});

const decryptCompetitionRequestFields = (request) => ({
  ...request,
  creator_email: decryptText(request.creator_email_encrypted || request.creator_email),
  creator_phone: decryptText(request.creator_phone_encrypted || request.creator_phone),
  organization_name: decryptText(request.organization_name_encrypted || request.organization_name),
});

const buildCompetitionDescription = (questions) => {
  if (!questions.length) {
    return 'Community-created coding competition.';
  }

  return `Tackle ${questions.length} custom challenge${questions.length > 1 ? 's' : ''} across practical problem-solving scenarios.`;
};

const normalizeDatePart = (dateValue) => {
  if (dateValue instanceof Date) {
    return dateValue.toISOString().slice(0, 10);
  }

  const parsedDate = new Date(dateValue);
  if (!Number.isNaN(parsedDate.getTime())) {
    return parsedDate.toISOString().slice(0, 10);
  }

  const rawValue = String(dateValue || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(rawValue)) {
    return rawValue;
  }

  throw new Error(`Invalid competition date: ${dateValue}`);
};

const buildCompetitionDateTime = (dateValue, timeValue) => {
  const normalizedDate = normalizeDatePart(dateValue);
  const normalizedTime = String(timeValue || '').trim();

  if (!/^\d{2}:\d{2}$/.test(normalizedTime)) {
    throw new Error(`Invalid competition time: ${timeValue}`);
  }

  const isoString = `${normalizedDate}T${normalizedTime}:00`;
  const parsedDate = new Date(isoString);

  if (Number.isNaN(parsedDate.getTime())) {
    throw new Error(`Invalid date/time combination: ${dateValue} ${timeValue}`);
  }

  return parsedDate;
};

const normalizeQuestions = (questions = []) =>
  questions.map((question, index) => ({
    title: (question.title || '').trim(),
    description: (question.description || '').trim(),
    sampleInput1: (question.sampleInput1 || '').trim(),
    sampleOutput1: (question.sampleOutput1 || '').trim(),
    sampleInput2: (question.sampleInput2 || '').trim(),
    sampleOutput2: (question.sampleOutput2 || '').trim(),
    constraints: (question.constraints || '').trim(),
    difficulty: (question.difficulty || 'medium').trim().toLowerCase(),
    orderIndex: index + 1,
  }));

const validateCompetitionRequest = ({ name, email, phone, competitionDate, startTime, endTime, durationMinutes, questions }) => {
  if (!name || name.trim().length < 3) return 'Competition name must be at least 3 characters long';
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'A valid email address is required';
  if (!phone || phone.trim().length < 8) return 'A valid phone number is required';
  if (!competitionDate || !startTime || !endTime) return 'Competition date, start time, and end time are required';
  if (!durationMinutes || Number(durationMinutes) <= 0) return 'Duration must be greater than 0';
  if (!Array.isArray(questions) || questions.length === 0) return 'At least one question is required';

  for (const question of questions) {
    if (!question.title || !question.description) {
      return 'Each question must include a title and description';
    }
  }

  return null;
};

const listCompetitions = async (req, res) => {
  try {
    const result = await query(
      `SELECT c.*,
              cr.competition_date,
              cr.start_time,
              cr.end_time,
              COUNT(DISTINCT cp.user_id) AS participant_count,
              BOOL_OR(cp.user_id = $1) AS joined
       FROM competitions c
       JOIN competition_requests cr
         ON cr.approved_competition_id = c.id
        AND cr.status = 'approved'
       LEFT JOIN competition_participants cp ON cp.competition_id = c.id
       WHERE c.status IN ('upcoming', 'open', 'completed')
       GROUP BY c.id
       ORDER BY
         CASE
           WHEN c.end_at < CURRENT_TIMESTAMP THEN 3
           WHEN c.start_at <= CURRENT_TIMESTAMP THEN 1
           ELSE 2
         END,
         c.start_at ASC`,
      [req.user.id]
    );

    return res.json({
      competitions: result.rows.map(formatCompetition),
    });
  } catch (error) {
    console.error('List competitions error:', error.message);
    return res.status(500).json({ error: 'Failed to fetch competitions' });
  }
};

const getCompetitionById = async (req, res) => {
  try {
    const { competitionId } = req.params;

    const competitionResult = await query(
      `SELECT c.*,
              cr.competition_date,
              cr.start_time,
              cr.end_time,
              COUNT(DISTINCT cp.user_id) AS participant_count,
              BOOL_OR(cp.user_id = $2) AS joined
       FROM competitions c
       JOIN competition_requests cr
         ON cr.approved_competition_id = c.id
        AND cr.status = 'approved'
       LEFT JOIN competition_participants cp ON cp.competition_id = c.id
       WHERE c.id = $1
       GROUP BY c.id`,
      [competitionId, req.user.id]
    );

    if (competitionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Competition not found' });
    }

    const problemsResult = await query(
      `SELECT p.id, p.title, p.difficulty, cp.order_index, cp.points
       FROM competition_problems cp
       JOIN problems p ON p.id = cp.problem_id
       WHERE cp.competition_id = $1
       ORDER BY cp.order_index ASC, p.id ASC`,
      [competitionId]
    );

    const leaderboardResult = await query(
      `WITH best_scores AS (
         SELECT cp2.competition_id,
                ls.user_id,
                ls.problem_id,
                MAX(ls.score) AS best_score,
                MAX(CASE WHEN ls.status = 'correct' THEN 1 ELSE 0 END) AS solved
         FROM competition_problems cp2
         JOIN logic_submissions ls ON ls.problem_id = cp2.problem_id
         WHERE cp2.competition_id = $1
         GROUP BY cp2.competition_id, ls.user_id, ls.problem_id
       )
       SELECT u.id AS user_id,
              u.name,
              COALESCE(SUM(bs.best_score), 0) AS total_score,
              COALESCE(SUM(bs.solved), 0) AS solved_count,
              MAX(part.joined_at) AS joined_at
       FROM competition_participants part
       JOIN users u ON u.id = part.user_id
       LEFT JOIN best_scores bs
         ON bs.user_id = part.user_id
        AND bs.competition_id = part.competition_id
       WHERE part.competition_id = $1
       GROUP BY u.id, u.name
       ORDER BY total_score DESC, solved_count DESC, joined_at ASC
       LIMIT 20`,
      [competitionId]
    );

    return res.json({
      competition: formatCompetition(competitionResult.rows[0]),
      problems: problemsResult.rows.map((problem) => ({
        id: problem.id,
        title: problem.title,
        difficulty: problem.difficulty,
        orderIndex: problem.order_index,
        points: problem.points,
      })),
      leaderboard: leaderboardResult.rows.map((entry, index) => ({
        rank: index + 1,
        userId: entry.user_id,
        name: entry.name,
        totalScore: parseInt(entry.total_score, 10) || 0,
        solvedCount: parseInt(entry.solved_count, 10) || 0,
      })),
    });
  } catch (error) {
    console.error('Get competition detail error:', error.message);
    return res.status(500).json({ error: 'Failed to fetch competition details' });
  }
};

const joinCompetition = async (req, res) => {
  try {
    const { competitionId } = req.params;

    const competitionResult = await query(
      `SELECT c.id, c.title, c.status, c.max_participants, c.start_at, c.end_at
       FROM competitions c
       JOIN competition_requests cr
         ON cr.approved_competition_id = c.id
        AND cr.status = 'approved'
       WHERE c.id = $1`,
      [competitionId]
    );

    if (competitionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Competition not found' });
    }

    const competition = competitionResult.rows[0];
    const derivedStatus = getCompetitionStatus(competition);
    if (!['upcoming', 'open'].includes(derivedStatus)) {
      return res.status(400).json({ error: 'This competition is no longer accepting participants' });
    }

    const participantCountResult = await query(
      'SELECT COUNT(*) AS participant_count FROM competition_participants WHERE competition_id = $1',
      [competitionId]
    );

    const participantCount = parseInt(participantCountResult.rows[0].participant_count, 10) || 0;
    if (competition.max_participants && participantCount >= competition.max_participants) {
      return res.status(400).json({ error: 'This competition has reached its participant limit' });
    }

    await query(
      `INSERT INTO competition_participants (competition_id, user_id)
       VALUES ($1, $2)
       ON CONFLICT (competition_id, user_id) DO NOTHING`,
      [competitionId, req.user.id]
    );

    return res.json({
      success: true,
      message: `You registered for ${competition.title}`,
    });
  } catch (error) {
    console.error('Join competition error:', error.message);
    return res.status(500).json({ error: 'Failed to join competition' });
  }
};

const getMyCompetitions = async (req, res) => {
  try {
    const [joinedResult, requestsResult] = await Promise.all([
      query(
        `SELECT c.*,
                cr.competition_date,
                cr.start_time,
                cr.end_time,
                part.joined_at,
                COUNT(DISTINCT all_participants.user_id) AS participant_count
         FROM competition_participants part
         JOIN competitions c ON c.id = part.competition_id
         JOIN competition_requests cr
           ON cr.approved_competition_id = c.id
          AND cr.status = 'approved'
         LEFT JOIN competition_participants all_participants ON all_participants.competition_id = c.id
         WHERE part.user_id = $1
         GROUP BY c.id, part.joined_at
         ORDER BY c.start_at ASC`,
        [req.user.id]
      ),
      query(
        `SELECT *
         FROM competition_requests
         WHERE creator_user_id = $1
         ORDER BY created_at DESC`,
        [req.user.id]
      ),
    ]);

    return res.json({
      competitions: joinedResult.rows.map((competition) => ({
        ...formatCompetition(competition),
        joinedAt: competition.joined_at,
      })),
      requests: requestsResult.rows.map(formatRequest),
    });
  } catch (error) {
    console.error('Get my competitions error:', error.message);
    return res.status(500).json({ error: 'Failed to fetch joined competitions' });
  }
};

const createCompetitionRequest = async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      organizationName = '',
      competitionDate,
      startTime,
      endTime,
      durationMinutes,
      questions = [],
    } = req.body;

    const normalizedQuestions = normalizeQuestions(questions);
    const validationError = validateCompetitionRequest({
      name,
      email,
      phone,
      competitionDate,
      startTime,
      endTime,
      durationMinutes,
      questions: normalizedQuestions,
    });

    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const approvalToken = uuidv4();
    const rejectToken = uuidv4();

    const requestResult = await query(
      `INSERT INTO competition_requests (
         creator_user_id,
         creator_name,
         creator_email,
         creator_email_encrypted,
         creator_email_sha256,
         creator_phone,
         creator_phone_encrypted,
         organization_name,
         organization_name_encrypted,
         competition_name,
         competition_date,
         start_time,
         end_time,
         duration_minutes,
         question_count,
         approval_token,
         rejection_token
       )
       VALUES ($1, $2, NULL, $3, $4, NULL, $5, NULL, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [
        req.user.id,
        req.user.name,
        encryptText(email.trim().toLowerCase()),
        hashLookupValue(email.trim().toLowerCase()),
        encryptText(phone.trim()),
        encryptText(organizationName.trim() || null),
        name.trim(),
        competitionDate,
        startTime,
        endTime,
        Number(durationMinutes),
        normalizedQuestions.length,
        approvalToken,
        rejectToken,
      ]
    );

    const competitionRequest = requestResult.rows[0];

    for (const question of normalizedQuestions) {
      await query(
        `INSERT INTO competition_request_questions (
           request_id,
           order_index,
           title,
           description,
           sample_input_1,
           sample_output_1,
           sample_input_2,
           sample_output_2,
           constraints,
           difficulty
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          competitionRequest.id,
          question.orderIndex,
          question.title,
          question.description,
          question.sampleInput1 || null,
          question.sampleOutput1 || null,
          question.sampleInput2 || null,
          question.sampleOutput2 || null,
          question.constraints || null,
          ['easy', 'medium', 'hard'].includes(question.difficulty) ? question.difficulty : 'medium',
        ]
      );
    }

    const approveUrl = `${API_BASE_URL}/api/competitions/admin/approve?token=${approvalToken}`;
    const rejectUrl = `${API_BASE_URL}/api/competitions/admin/reject?token=${rejectToken}`;

    let emailWarning = null;

    try {
      await sendCompetitionApprovalRequest({
        adminEmail: ADMIN_EMAIL,
        creatorName: req.user.name,
        creatorEmail: email.trim().toLowerCase(),
        phone: phone.trim(),
        organization: organizationName.trim(),
        competitionName: name.trim(),
        competitionDate,
        startTime,
        endTime,
        durationMinutes: Number(durationMinutes),
        questionCount: normalizedQuestions.length,
        questions: normalizedQuestions,
        approveUrl,
        rejectUrl,
      });
    } catch (emailError) {
      emailWarning = 'Competition saved as pending approval, but the admin notification email could not be sent.';
      console.error('Competition approval email error:', emailError.message);
    }

    return res.status(201).json({
      success: true,
      message: emailWarning || 'Competition submitted for approval',
      warning: emailWarning,
      request: formatRequest(competitionRequest),
    });
  } catch (error) {
    console.error('Create competition request error:', error.message);
    return res.status(500).json({
      error: 'Failed to submit competition for approval',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

const getLeaderboardOverview = async (req, res) => {
  try {
    const [globalLeaderboard, weeklyLeaderboard] = await Promise.all([
      getLeaderboard('global', 8),
      getLeaderboard('weekly', 8),
    ]);

    return res.json({
      global: globalLeaderboard,
      weekly: weeklyLeaderboard,
    });
  } catch (error) {
    console.error('Get leaderboard overview error:', error.message);
    return res.status(500).json({ error: 'Failed to fetch leaderboard overview' });
  }
};

const approveCompetitionRequest = async (req, res) => {
  const db = pool();
  let client = null;

  try {
    const { token } = req.query;
    if (!token) {
      return res.status(400).send('Missing approval token.');
    }

    const requestResult = await query(
      `SELECT *
       FROM competition_requests
       WHERE approval_token = $1`,
      [token]
    );

    if (requestResult.rows.length === 0) {
      return res.status(404).send('Approval request not found.');
    }

    const request = decryptCompetitionRequestFields(requestResult.rows[0]);
    if (request.status !== 'pending_approval') {
      return res.status(400).send(`This request is already ${request.status}.`);
    }

    const questionsResult = await query(
      `SELECT *
       FROM competition_request_questions
       WHERE request_id = $1
       ORDER BY order_index ASC`,
      [request.id]
    );

    client = await db.connect();
    await client.query('BEGIN');

    const slugBase = slugify(request.competition_name) || `competition-${request.id}`;
    const uniqueSlug = `${slugBase}-${request.id}`;
    const startAt = buildCompetitionDateTime(request.competition_date, request.start_time);
    let endAt = buildCompetitionDateTime(request.competition_date, request.end_time);

    if (endAt <= startAt) {
      endAt = new Date(endAt.getTime() + 24 * 60 * 60 * 1000);
    }

    const status = endAt <= new Date() ? 'completed' : startAt <= new Date() ? 'open' : 'upcoming';

    const competitionResult = await client.query(
      `INSERT INTO competitions (
         title,
         slug,
         description,
         difficulty,
         start_at,
         end_at,
         status,
         reward_pool,
         is_featured
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, FALSE)
       RETURNING id`,
      [
        request.competition_name,
        uniqueSlug,
        buildCompetitionDescription(questionsResult.rows),
        'mixed',
        startAt.toISOString(),
        endAt.toISOString(),
        status,
        questionsResult.rows.length * 100,
      ]
    );

    const competitionId = competitionResult.rows[0].id;

    for (const question of questionsResult.rows) {
      const insertProblemResult = await client.query(
        `INSERT INTO problems (
           title,
           description,
           difficulty,
           test_cases,
           expected_outputs,
           constraints,
           examples
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [
          question.title,
          question.description,
          question.difficulty || 'medium',
          JSON.stringify([
            { input: question.sample_input_1 || '' },
            { input: question.sample_input_2 || question.sample_input_1 || '' },
          ]),
          JSON.stringify([
            { output: question.sample_output_1 || '' },
            { output: question.sample_output_2 || question.sample_output_1 || '' },
          ]),
          question.constraints || null,
          JSON.stringify([
            {
              input: question.sample_input_1 || '',
              output: question.sample_output_1 || '',
              explanation: 'Sample case 1',
            },
            {
              input: question.sample_input_2 || '',
              output: question.sample_output_2 || '',
              explanation: 'Sample case 2',
            },
          ]),
        ]
      );

      let problemId = insertProblemResult.rows[0]?.id;

      if (!problemId) {
        const existingProblemResult = await client.query(
          `SELECT id
           FROM problems
           WHERE LOWER(BTRIM(title)) = LOWER(BTRIM($1))
           LIMIT 1`,
          [question.title]
        );

        if (existingProblemResult.rows.length === 0) {
          throw new Error(`Unable to create or find problem: ${question.title}`);
        }

        problemId = existingProblemResult.rows[0].id;
      }

      const pointMap = { easy: 10, medium: 20, hard: 30 };
      await client.query(
        `INSERT INTO competition_problems (competition_id, problem_id, order_index, points)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (competition_id, problem_id)
         DO UPDATE SET
           order_index = EXCLUDED.order_index,
           points = EXCLUDED.points`,
        [
          competitionId,
          problemId,
          question.order_index,
          pointMap[(question.difficulty || 'medium').toLowerCase()] || 20,
        ]
      );
    }

    await client.query(
      `UPDATE competition_requests
       SET status = 'approved',
           approved_at = CURRENT_TIMESTAMP,
           approved_competition_id = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [competitionId, request.id]
    );

    await client.query('COMMIT');

    try {
      await sendCompetitionDecisionEmail({
        creatorEmail: request.creator_email,
        creatorName: request.creator_name,
        competitionName: request.competition_name,
        approved: true,
      });
    } catch (emailError) {
      console.error('Competition approval confirmation email error:', emailError.message);
    }

    return res.send(`
      <html>
        <body style="font-family: Arial, sans-serif; padding: 32px;">
          <h2>Competition approved</h2>
          <p>${request.competition_name} is now live.</p>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('Approve competition request error:', error.message);
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('Approve competition rollback error:', rollbackError.message);
      }
    }

    return res.status(500).send(
      process.env.NODE_ENV === 'development'
        ? `Failed to approve competition request. ${error.message}`
        : 'Failed to approve competition request.'
    );
  } finally {
    if (client) {
      client.release();
    }
  }
};

const renderRejectCompetitionRequest = async (req, res) => {
  const { token } = req.query;
  if (!token) {
    return res.status(400).send('Missing rejection token.');
  }

  return res.send(`
    <html>
      <body style="font-family: Arial, sans-serif; padding: 32px; max-width: 560px; margin: 0 auto;">
        <h2>Reject competition request</h2>
        <form method="POST" action="/api/competitions/admin/reject">
          <input type="hidden" name="token" value="${token}" />
          <label for="reason" style="display: block; margin-bottom: 8px;">Reason</label>
          <textarea id="reason" name="reason" rows="6" style="width: 100%; padding: 12px; margin-bottom: 16px;"></textarea>
          <button type="submit" style="padding: 12px 18px;">Reject request</button>
        </form>
      </body>
    </html>
  `);
};

const rejectCompetitionRequest = async (req, res) => {
  try {
    const token = req.body.token || req.query.token;
    const reason = (req.body.reason || req.query.reason || '').trim();

    if (!token) {
      return res.status(400).send('Missing rejection token.');
    }

    const requestResult = await query(
      `SELECT *
       FROM competition_requests
       WHERE rejection_token = $1`,
      [token]
    );

    if (requestResult.rows.length === 0) {
      return res.status(404).send('Rejection request not found.');
    }

    const request = decryptCompetitionRequestFields(requestResult.rows[0]);
    if (request.status !== 'pending_approval') {
      return res.status(400).send(`This request is already ${request.status}.`);
    }

    await query(
      `UPDATE competition_requests
       SET status = 'rejected',
           rejection_reason = $1,
           rejected_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [reason || null, request.id]
    );

    await sendCompetitionDecisionEmail({
      creatorEmail: request.creator_email,
      creatorName: request.creator_name,
      competitionName: request.competition_name,
      approved: false,
      reason,
    });

    return res.send(`
      <html>
        <body style="font-family: Arial, sans-serif; padding: 32px;">
          <h2>Competition rejected</h2>
          <p>${request.competition_name} has been rejected.</p>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('Reject competition request error:', error.message);
    return res.status(500).send('Failed to reject competition request.');
  }
};

module.exports = {
  approveCompetitionRequest,
  createCompetitionRequest,
  getCompetitionById,
  getLeaderboardOverview,
  getMyCompetitions,
  joinCompetition,
  listCompetitions,
  rejectCompetitionRequest,
  renderRejectCompetitionRequest,
};
