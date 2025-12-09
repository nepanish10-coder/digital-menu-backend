const { supabase } = require('../config/supabase');

const cleanText = (value) => (typeof value === 'string' ? value.trim() : '');

const coerceIngredientEntries = (input) => {
    if (Array.isArray(input)) {
        return input;
    }
    if (typeof input === 'string') {
        return input
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line) => {
                const [item, quantity, unit] = line.split('|').map((token) => token?.trim() || '');
                return { item, quantity, unit };
            });
    }
    return [];
};

const sanitizeIngredients = (input) => {
    return coerceIngredientEntries(input)
        .map((entry) => {
            if (!entry || typeof entry !== 'object') {
                return null;
            }
            const item = cleanText(entry.item || entry.name);
            const quantity = Number(entry.quantity);
            const unit = cleanText(entry.unit || entry.measure);
            if (!item) {
                return null;
            }
            const safeQuantity = Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
            return {
                item,
                quantity: safeQuantity,
                unit
            };
        })
        .filter(Boolean)
        .slice(0, 200);
};

const sanitizeInstructions = (input) => {
    const collection = Array.isArray(input)
        ? input
        : typeof input === 'string'
            ? input.split('\n')
            : [];

    return collection
        .map((step) => cleanText(step))
        .filter(Boolean)
        .slice(0, 200);
};

const normalizeRecipePayload = (body = {}) => {
    const errors = [];
    const name = cleanText(body.name);
    if (!name) {
        errors.push('Recipe name is required');
    }

    const ingredients = sanitizeIngredients(body.ingredients);
    if (!ingredients.length) {
        errors.push('Add at least one ingredient line');
    }

    const instructions = sanitizeInstructions(body.instructions);
    if (!instructions.length) {
        errors.push('Add at least one instruction');
    }

    const rawYield = Number(body.yield ?? body.portion_yield ?? 1);
    const portionYield = Number.isFinite(rawYield) && rawYield > 0 ? rawYield : 1;

    return {
        errors,
        payload: {
            name,
            category: cleanText(body.category) || 'General',
            description: cleanText(body.description) || null,
            prep_time: cleanText(body.prepTime) || null,
            portion_yield: portionYield,
            ingredients,
            instructions
        }
    };
};

const formatRecipeRecord = (record = {}) => ({
    id: record.id,
    restaurantId: record.restaurant_id,
    name: record.name,
    category: record.category,
    description: record.description,
    prepTime: record.prep_time,
    yield: record.portion_yield,
    ingredients: Array.isArray(record.ingredients) ? record.ingredients : [],
    instructions: Array.isArray(record.instructions) ? record.instructions : [],
    createdAt: record.created_at,
    updatedAt: record.updated_at
});

const listRecipes = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('recipes')
            .select('*')
            .eq('restaurant_id', req.restaurantId)
            .order('name', { ascending: true });

        if (error) {
            throw error;
        }

        const recipes = (data || []).map(formatRecipeRecord);
        res.json({ recipes });
    } catch (error) {
        console.error('List recipes error:', error);
        res.status(500).json({ error: 'Unable to load recipes' });
    }
};

const getRecipe = async (req, res) => {
    try {
        const { recipeId } = req.params;
        const { data, error } = await supabase
            .from('recipes')
            .select('*')
            .eq('id', recipeId)
            .eq('restaurant_id', req.restaurantId)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                return res.status(404).json({ error: 'Recipe not found' });
            }
            throw error;
        }

        res.json({ recipe: formatRecipeRecord(data) });
    } catch (error) {
        console.error('Get recipe error:', error);
        res.status(500).json({ error: 'Unable to load recipe' });
    }
};

const createRecipe = async (req, res) => {
    try {
        const { errors, payload } = normalizeRecipePayload(req.body);
        if (errors.length) {
            return res.status(400).json({ error: errors[0], errors });
        }

        const insertPayload = {
            restaurant_id: req.restaurantId,
            ...payload
        };

        const { data, error } = await supabase
            .from('recipes')
            .insert(insertPayload)
            .select('*')
            .single();

        if (error) {
            throw error;
        }

        res.status(201).json({
            recipe: formatRecipeRecord(data),
            message: 'Recipe created'
        });
    } catch (error) {
        console.error('Create recipe error:', error);
        res.status(500).json({ error: 'Unable to create recipe' });
    }
};

const updateRecipe = async (req, res) => {
    try {
        const { recipeId } = req.params;
        const { errors, payload } = normalizeRecipePayload(req.body);
        if (errors.length) {
            return res.status(400).json({ error: errors[0], errors });
        }

        const { data, error } = await supabase
            .from('recipes')
            .update(payload)
            .eq('id', recipeId)
            .eq('restaurant_id', req.restaurantId)
            .select('*')
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                return res.status(404).json({ error: 'Recipe not found' });
            }
            throw error;
        }

        res.json({
            recipe: formatRecipeRecord(data),
            message: 'Recipe updated'
        });
    } catch (error) {
        console.error('Update recipe error:', error);
        res.status(500).json({ error: 'Unable to update recipe' });
    }
};

const deleteRecipe = async (req, res) => {
    try {
        const { recipeId } = req.params;
        const { data, error } = await supabase
            .from('recipes')
            .delete()
            .eq('id', recipeId)
            .eq('restaurant_id', req.restaurantId)
            .select('id')
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                return res.status(404).json({ error: 'Recipe not found' });
            }
            throw error;
        }

        res.json({ message: 'Recipe deleted', id: data?.id || recipeId });
    } catch (error) {
        console.error('Delete recipe error:', error);
        res.status(500).json({ error: 'Unable to delete recipe' });
    }
};

module.exports = {
    listRecipes,
    getRecipe,
    createRecipe,
    updateRecipe,
    deleteRecipe
};
