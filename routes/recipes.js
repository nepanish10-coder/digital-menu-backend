const express = require('express');
const router = express.Router();
const recipeController = require('../controllers/recipeController');
const { authenticateToken, multiTenant } = require('../middleware/auth');

router.use(authenticateToken);
router.use(multiTenant);

router.get('/', recipeController.listRecipes);
router.post('/', recipeController.createRecipe);
router.get('/:recipeId', recipeController.getRecipe);
router.put('/:recipeId', recipeController.updateRecipe);
router.delete('/:recipeId', recipeController.deleteRecipe);

module.exports = router;
