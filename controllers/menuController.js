const { supabase } = require('../config/supabase');

const PUBLIC_RESTAURANT_FIELDS = '*';
const FALLBACK_RESTAURANT_FIELDS = 'id, name, logo_url, theme_color, phone, address, is_active, created_at, updated_at';
const COLUMN_NOT_FOUND = '42703';

// Resolve restaurant identifier for downstream queries (public routes use params, private ones use req.restaurantId)
const resolveRestaurantLookupKey = (req) => req.restaurantId || req.params?.restaurantId;

const applyAvailabilityDefaults = (restaurant) => {
    if (!restaurant) return restaurant;
    if (restaurant.is_accepting_orders === undefined) {
        restaurant.is_accepting_orders = true;
    }
    if (restaurant.service_hours === undefined) {
        restaurant.service_hours = null;
    }
    if (restaurant.offline_notice === undefined) {
        restaurant.offline_notice = null;
    }
    return restaurant;
};

const fetchRestaurantRecord = async (restaurantId, fields = PUBLIC_RESTAURANT_FIELDS) => {
    const response = await supabase
        .from('restaurants')
        .select(fields)
        .eq('id', restaurantId)
        .single();

    if (response.data) {
        response.data = applyAvailabilityDefaults(response.data);
    }

    return response;
};

const fetchRestaurantById = async (restaurantId) => {
    const result = await fetchRestaurantRecord(restaurantId);

    if (result.error?.code === COLUMN_NOT_FOUND) {
        const fallbackResult = await fetchRestaurantRecord(restaurantId, FALLBACK_RESTAURANT_FIELDS);
        return fallbackResult;
    }

    return result;
};

const fetchRestaurantByTableId = async (tableId) => {
    const { data: tableRecord, error: tableError } = await supabase
        .from('tables')
        .select('id, table_number, restaurant_id')
        .eq('id', tableId)
        .single();

    if (tableError) {
        return { data: null, error: tableError };
    }

    const { data: restaurant, error: restaurantError } = await fetchRestaurantById(tableRecord.restaurant_id);

    if (restaurantError) {
        return { data: null, error: restaurantError };
    }

    return {
        data: {
            restaurant,
            table: {
                id: tableRecord.id,
                table_number: tableRecord.table_number,
                restaurant_id: tableRecord.restaurant_id
            }
        },
        error: null
    };
};

const resolveRestaurantContext = async (identifier) => {
    const { data: restaurantDirect, error: directError } = await fetchRestaurantById(identifier);

    if (restaurantDirect) {
        return { restaurant: restaurantDirect };
    }

    if (directError && directError.code && !['PGRST116', COLUMN_NOT_FOUND].includes(directError.code)) {
        throw directError;
    }

    const { data: tableContext, error: tableError } = await fetchRestaurantByTableId(identifier);

    if (tableContext?.restaurant) {
        return {
            restaurant: tableContext.restaurant,
            table: tableContext.table
        };
    }

    if (tableError && tableError.code && !['PGRST116', COLUMN_NOT_FOUND].includes(tableError.code)) {
        throw tableError;
    }

    return { restaurant: null };
};

// Get all menu data (categories with items)
const getFullMenu = async (req, res) => {
    try {
        const lookupKey = resolveRestaurantLookupKey(req);

        if (!lookupKey) {
            return res.status(400).json({ error: 'Restaurant ID is required' });
        }

        const { restaurant, table } = await resolveRestaurantContext(lookupKey);

        if (!restaurant) {
            return res.status(404).json({ error: 'Restaurant not found' });
        }

        if (!restaurant.is_active) {
            return res.status(403).json({ error: 'Restaurant is inactive' });
        }

        const restaurantId = restaurant.id;

        // Get categories with their items scoped to restaurant
        const { data: categories, error: categoriesError } = await supabase
            .from('menu_categories')
            .select(`
                *,
                menu_items(*)
            `)
            .eq('restaurant_id', restaurantId)
            .eq('is_active', true)
            .order('sort_order', { ascending: true });

        if (categoriesError) {
            throw categoriesError;
        }

        // Filter out inactive items
        const filteredCategories = (categories || []).map(category => ({
            ...category,
            menu_items: category.menu_items.filter(item => item.is_available)
        }));

        const { password_hash, ...publicRestaurantData } = restaurant;

        res.json({
            restaurant: publicRestaurantData,
            table: table ? { id: table.id, table_number: table.table_number } : undefined,
            menu: filteredCategories
        });
    } catch (error) {
        console.error('Get full menu error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Get all categories
const getCategories = async (req, res) => {
    try {
        const { data: categories, error } = await supabase
            .from('menu_categories')
            .select('*')
            .eq('restaurant_id', req.restaurantId)
            .order('sort_order', { ascending: true });

        if (error) {
            throw error;
        }

        res.json({ categories });
    } catch (error) {
        console.error('Get categories error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Create category
const createCategory = async (req, res) => {
    try {
        const { name, description, sortOrder } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Category name is required' });
        }

        const { data: category, error } = await supabase
            .from('menu_categories')
            .insert({
                restaurant_id: req.restaurantId,
                name,
                description,
                sort_order: sortOrder || 0
            })
            .select()
            .single();

        if (error) {
            throw error;
        }

        res.status(201).json({
            message: 'Category created successfully',
            category
        });
    } catch (error) {
        console.error('Create category error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Update category
const updateCategory = async (req, res) => {
    try {
        const { categoryId } = req.params;
        const { name, description, sortOrder, isActive } = req.body;

        const updateData = {};
        if (name !== undefined) updateData.name = name;
        if (description !== undefined) updateData.description = description;
        if (sortOrder !== undefined) updateData.sort_order = sortOrder;
        if (isActive !== undefined) updateData.is_active = isActive;

        const { data: category, error } = await supabase
            .from('menu_categories')
            .update(updateData)
            .eq('id', categoryId)
            .eq('restaurant_id', req.restaurantId)
            .select()
            .single();

        if (error) {
            throw error;
        }

        if (!category) {
            return res.status(404).json({ error: 'Category not found' });
        }

        res.json({
            message: 'Category updated successfully',
            category
        });
    } catch (error) {
        console.error('Update category error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Delete category
const deleteCategory = async (req, res) => {
    try {
        const { categoryId } = req.params;

        const { error } = await supabase
            .from('menu_categories')
            .delete()
            .eq('id', categoryId)
            .eq('restaurant_id', req.restaurantId);

        if (error) {
            throw error;
        }

        res.json({ message: 'Category deleted successfully' });
    } catch (error) {
        console.error('Delete category error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Get items by category
const getItemsByCategory = async (req, res) => {
    try {
        const { categoryId } = req.params;

        const { data: items, error } = await supabase
            .from('menu_items')
            .select('*')
            .eq('restaurant_id', req.restaurantId)
            .eq('category_id', categoryId)
            .order('sort_order', { ascending: true });

        if (error) {
            throw error;
        }

        res.json({ items });
    } catch (error) {
        console.error('Get items by category error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Create menu item
const createItem = async (req, res) => {
    try {
        const { 
            categoryId, 
            name, 
            description, 
            price, 
            imageUrl, 
            isVegetarian, 
            isVegan, 
            allergens,
            sortOrder
        } = req.body;

        if (!categoryId || !name || !price) {
            return res.status(400).json({ error: 'Category ID, name, and price are required' });
        }

        const { data: item, error } = await supabase
            .from('menu_items')
            .insert({
                restaurant_id: req.restaurantId,
                category_id: categoryId,
                name,
                description,
                price: parseFloat(price),
                image_url: imageUrl,
                is_vegetarian: isVegetarian || false,
                is_vegan: isVegan || false,
                allergens: allergens || [],
                sort_order: sortOrder || 0
            })
            .select()
            .single();

        if (error) {
            throw error;
        }

        res.status(201).json({
            message: 'Menu item created successfully',
            item
        });
    } catch (error) {
        console.error('Create item error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Update menu item
const updateItem = async (req, res) => {
    try {
        const { itemId } = req.params;
        const { 
            categoryId, 
            name, 
            description, 
            price, 
            imageUrl, 
            isAvailable,
            isVegetarian, 
            isVegan, 
            allergens,
            sortOrder
        } = req.body;

        const updateData = {};
        if (categoryId !== undefined) updateData.category_id = categoryId;
        if (name !== undefined) updateData.name = name;
        if (description !== undefined) updateData.description = description;
        if (price !== undefined) updateData.price = parseFloat(price);
        if (imageUrl !== undefined) updateData.image_url = imageUrl;
        if (isAvailable !== undefined) updateData.is_available = isAvailable;
        if (isVegetarian !== undefined) updateData.is_vegetarian = isVegetarian;
        if (isVegan !== undefined) updateData.is_vegan = isVegan;
        if (allergens !== undefined) updateData.allergens = allergens;
        if (sortOrder !== undefined) updateData.sort_order = sortOrder;

        const { data: item, error } = await supabase
            .from('menu_items')
            .update(updateData)
            .eq('id', itemId)
            .eq('restaurant_id', req.restaurantId)
            .select()
            .single();

        if (error) {
            throw error;
        }

        if (!item) {
            return res.status(404).json({ error: 'Menu item not found' });
        }

        res.json({
            message: 'Menu item updated successfully',
            item
        });
    } catch (error) {
        console.error('Update item error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Delete menu item
const deleteItem = async (req, res) => {
    try {
        const { itemId } = req.params;

        const { error } = await supabase
            .from('menu_items')
            .delete()
            .eq('id', itemId)
            .eq('restaurant_id', req.restaurantId);

        if (error) {
            throw error;
        }

        res.json({ message: 'Menu item deleted successfully' });
    } catch (error) {
        console.error('Delete item error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

module.exports = {
    getFullMenu,
    getCategories,
    createCategory,
    updateCategory,
    deleteCategory,
    getItemsByCategory,
    createItem,
    updateItem,
    deleteItem
};