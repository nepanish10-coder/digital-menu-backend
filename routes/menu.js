const express = require('express');
const router = express.Router();
const menuController = require('../controllers/menuController');
const { authenticateToken, multiTenant } = require('../middleware/auth');

// Public route for customer menu (no auth required)
router.get('/public/:restaurantId', menuController.getFullMenu);

// Protected routes for restaurant management
router.use(authenticateToken);
router.use(multiTenant);

// Menu management routes
router.get('/', menuController.getFullMenu);
router.get('/categories', menuController.getCategories);
router.post('/categories', menuController.createCategory);
router.put('/categories/:categoryId', menuController.updateCategory);
router.delete('/categories/:categoryId', menuController.deleteCategory);

// Menu items routes
router.get('/categories/:categoryId/items', menuController.getItemsByCategory);
router.post('/items', menuController.createItem);
router.put('/items/:itemId', menuController.updateItem);
router.delete('/items/:itemId', menuController.deleteItem);

module.exports = router;