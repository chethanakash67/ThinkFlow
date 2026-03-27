const express = require('express');
const router = express.Router();
const competitionController = require('../controllers/competitionController');
const { authenticateToken } = require('../src/middlewares/auth.middleware');

router.get('/admin/approve', competitionController.approveCompetitionRequest);
router.get('/admin/reject', competitionController.renderRejectCompetitionRequest);
router.post('/admin/reject', competitionController.rejectCompetitionRequest);

router.use(authenticateToken);

router.get('/', competitionController.listCompetitions);
router.get('/leaderboards/overview', competitionController.getLeaderboardOverview);
router.get('/me/joined', competitionController.getMyCompetitions);
router.post('/requests', competitionController.createCompetitionRequest);
router.get('/:competitionId', competitionController.getCompetitionById);
router.post('/:competitionId/join', competitionController.joinCompetition);

module.exports = router;
