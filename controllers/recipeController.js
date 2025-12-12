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
  const { id, name, category, ingredients, instructions } = req.body;
  const { data, error } = await supabase
    .from('recipes')
    .insert([{ id, name, category, ingredients, instructions }])
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
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
