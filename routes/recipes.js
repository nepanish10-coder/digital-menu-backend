const express = require('express');
const router = express.Router();
const recipeController = require('../controllers/recipeController');

// GET /api/recipes - get all recipes
router.get('/', recipeController.getAllRecipes);

// GET /api/recipes/:id - get one recipe
router.get('/:id', recipeController.getRecipeById);

// POST /api/recipes - create new recipe
router.post('/', recipeController.createRecipe);

// PUT /api/recipes/:id - update recipe
router.put('/:id', recipeController.updateRecipe);

// DELETE /api/recipes/:id - delete recipe
router.delete('/:id', recipeController.deleteRecipe);

module.exports = router;

