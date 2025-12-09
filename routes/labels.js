const express = require('express');
const router = express.Router();
const labelController = require('../controllers/labelController');
const { authenticateToken, multiTenant } = require('../middleware/auth');

router.use(authenticateToken);
router.use(multiTenant);

router.get('/', labelController.listLabels);
router.post('/', labelController.createLabel);
router.put('/:labelId', labelController.updateLabel);
router.delete('/:labelId', labelController.deleteLabel);

module.exports = router;
