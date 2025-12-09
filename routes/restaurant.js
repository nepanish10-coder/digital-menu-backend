const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticateToken, multiTenant } = require('../middleware/auth');

// Restaurant profile
router.get('/profile', authenticateToken, multiTenant, authController.getProfile);

module.exports = router;
