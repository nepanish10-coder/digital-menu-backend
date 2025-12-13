// backend/controllers/recipeController.js
const { supabase } = require('../config/supabase');

// Get all recipes
async function getAllRecipes(req, res) {
  const { data, error } = await supabase
    .from('recipes')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
}

// Get recipe by ID
async function getRecipeById(req, res) {
  const { id } = req.params;
  const { data, error } = await supabase
    .from('recipes')
    .select('*')
    .eq('id', id)
    .single();
  if (error) return res.status(404).json({ error: 'Recipe not found' });
  res.json(data);
}

// Create new recipe
async function createRecipe(req, res) {
  // Require restaurantId from auth middleware
  const restaurantId = req.restaurantId;
  if (!restaurantId) {
    return res.status(400).json({ error: 'Missing restaurant context' });
  }
  const { id, name, category, description, prepTime, yield: portion_yield, ingredients, instructions } = req.body;
  // Map frontend fields to DB columns
  const insertObj = {
    restaurant_id: restaurantId,
    name,
    category,
    description: description || '',
    prep_time: prepTime || '',
    portion_yield: portion_yield || 1,
    ingredients: Array.isArray(ingredients) ? ingredients : [],
    instructions: Array.isArray(instructions) ? instructions : []
  };
  if (id) insertObj.id = id;
  const { data, error } = await supabase
    .from('recipes')
    .insert([insertObj])
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json({ recipe: data, message: 'Recipe created' });
}

// Update recipe
async function updateRecipe(req, res) {
  const { id } = req.params;
  const { name, category, ingredients, instructions } = req.body;
  const { data, error } = await supabase
    .from('recipes')
    .update({ name, category, ingredients, instructions })
    .eq('id', id)
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
}

// Delete recipe
async function deleteRecipe(req, res) {
  const { id } = req.params;
  const { error } = await supabase
    .from('recipes')
    .delete()
    .eq('id', id);
  if (error) return res.status(400).json({ error: error.message });
  res.status(204).send();
}

module.exports = {
  getAllRecipes,
  getRecipeById,
  createRecipe,
  updateRecipe,
  deleteRecipe
};
