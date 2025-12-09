const express = require('express');
const router = express.Router();
const waiterController = require('../controllers/waiterController');
const { authenticateToken, multiTenant } = require('../middleware/auth');

// Public endpoints for tables/customers
router.post('/call', waiterController.createCall);
router.get('/call/:callId', waiterController.getCallStatus);

// Protected endpoints for restaurant staff
router.use(authenticateToken);
router.use(multiTenant);

router.get('/calls', waiterController.getCalls);
router.put('/calls/:callId/respond', waiterController.respondToCall);
router.put('/calls/:callId/resolve', waiterController.resolveCall);

module.exports = router;
