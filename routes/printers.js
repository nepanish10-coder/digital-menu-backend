const express = require('express');
const router = express.Router();
const { getPrinters } = require('../controllers/printerController');
const { authenticateToken, multiTenant } = require('../middleware/auth');

router.use(authenticateToken);
router.use(multiTenant);

router.get('/', getPrinters);

module.exports = router;
