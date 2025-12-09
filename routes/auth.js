const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticateToken, multiTenant } = require('../middleware/auth');

// Public routes
router.post('/register', authController.register);
router.post('/login', authController.login);

// Protected routes
router.post('/logout', authenticateToken, authController.logout);
router.get('/profile', authenticateToken, multiTenant, authController.getProfile);
router.put('/profile', authenticateToken, multiTenant, authController.updateProfile);

module.exports = router;