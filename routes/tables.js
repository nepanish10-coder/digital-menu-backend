const express = require('express');
const router = express.Router();
const tableController = require('../controllers/tableController');
const { authenticateToken, multiTenant } = require('../middleware/auth');

// All routes require authentication and multi-tenant validation
router.use(authenticateToken);
router.use(multiTenant);

// Table management routes
router.get('/', tableController.getTables);
router.post('/', tableController.createTable);
router.put('/:tableId', tableController.updateTable);
router.delete('/:tableId', tableController.deleteTable);

// QR code generation routes
router.post('/:tableId/qr', tableController.generateTableQr);
router.post('/generate-all-qr', tableController.generateAllQrs);

module.exports = router;