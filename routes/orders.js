const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const { authenticateToken, multiTenant } = require('../middleware/auth');

// Public route for customer order creation (no auth required)
router.post('/', orderController.createOrder);

// Protected routes for restaurant management
const protectedHandlers = [authenticateToken, multiTenant];

// Order management routes
router.post('/manual', protectedHandlers, orderController.createManualOrder);
router.get('/status/:status?', protectedHandlers, orderController.getOrdersByStatus);
router.put('/:orderId/accept', protectedHandlers, orderController.acceptOrder);
router.put('/:orderId/reject', protectedHandlers, orderController.rejectOrder);
router.put('/:orderId/start-cooking', protectedHandlers, orderController.startCooking);
router.put('/:orderId/finish', protectedHandlers, orderController.finishOrder);
router.post('/:orderId/print', protectedHandlers, orderController.printOrderHandler);
router.get('/stats', protectedHandlers, orderController.getOrderStats);

module.exports = router;