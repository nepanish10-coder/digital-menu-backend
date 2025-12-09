const bcrypt = require('bcryptjs');
const { supabase } = require('../config/supabase');
const { generateToken, createSession, deleteSession } = require('../middleware/auth');

// Restaurant registration
const register = async (req, res) => {
    try {
        const { name, email, password, phone, address } = req.body;
        const normalizedEmail = email?.trim().toLowerCase();

        // Validate input
        if (!name || !normalizedEmail || !password) {
            return res.status(400).json({ error: 'Name, email, and password are required' });
        }

        // Check if restaurant already exists
        const { data: existingRestaurant } = await supabase
            .from('restaurants')
            .select('id')
            .eq('email', normalizedEmail)
            .single();

        if (existingRestaurant) {
            return res.status(409).json({ error: 'Restaurant with this email already exists' });
        }

        // Hash password
        const saltRounds = 12;
        const passwordHash = await bcrypt.hash(password, saltRounds);

        // Create restaurant
        const { data: restaurant, error } = await supabase
            .from('restaurants')
            .insert({
                name,
                email: normalizedEmail,
                password_hash: passwordHash,
                phone,
                address
            })
            .select()
            .single();

        if (error) {
            throw error;
        }

        // Generate token and create session
        const token = generateToken(restaurant.id);
        await createSession(restaurant.id, token);

        // Remove password hash from response
        const { password_hash, ...restaurantData } = restaurant;

        res.status(201).json({
            message: 'Restaurant registered successfully',
            token,
            restaurant: restaurantData
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Restaurant login
const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const normalizedEmail = email?.trim().toLowerCase();

        // Validate input
        if (!normalizedEmail || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        // Find restaurant
        const { data: restaurant, error } = await supabase
            .from('restaurants')
            .select('*')
            .eq('email', normalizedEmail)
            .single();

        if (error || !restaurant) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        if (restaurant.is_active === false) {
            return res.status(403).json({ error: 'Account is inactive. Please contact support.' });
        }

        // Verify password
        const isValidPassword = await bcrypt.compare(password, restaurant.password_hash);
        
        if (!isValidPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Generate token and create session
        const token = generateToken(restaurant.id);
        await createSession(restaurant.id, token);

        // Remove password hash from response
        const { password_hash, ...restaurantData } = restaurant;

        res.json({
            message: 'Login successful',
            token,
            restaurant: restaurantData
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Restaurant logout
const logout = async (req, res) => {
    try {
        await deleteSession(req.token);
        res.json({ message: 'Logout successful' });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Get current restaurant profile
const getProfile = async (req, res) => {
    try {
        const { data: restaurant, error } = await supabase
            .from('restaurants')
            .select('*')
            .eq('id', req.restaurantId)
            .single();

        if (error) {
            throw error;
        }

        // Remove password hash from response
        const { password_hash, ...restaurantData } = restaurant;

        res.json({ restaurant: restaurantData });
    } catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

const sanitizeServiceAvailability = (restaurant) => {
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

const stripServiceAvailabilityFields = (payload) => {
    const clone = { ...payload };
    delete clone.is_accepting_orders;
    delete clone.service_hours;
    delete clone.offline_notice;
    return clone;
};

// Update restaurant profile
const updateProfile = async (req, res) => {
    try {
        const {
            name,
            phone,
            address,
            themeColor,
            logoUrl,
            logo_url,
            isAcceptingOrders,
            serviceHours,
            offlineNotice
        } = req.body;

        const updateData = {};
        if (name) updateData.name = name;
        if (phone) updateData.phone = phone;
        if (address) updateData.address = address;
        if (themeColor) updateData.theme_color = themeColor;
        if (logoUrl !== undefined && logoUrl !== null) updateData.logo_url = logoUrl;
        if (logo_url !== undefined && logo_url !== null) updateData.logo_url = logo_url;
        if (isAcceptingOrders !== undefined) updateData.is_accepting_orders = Boolean(isAcceptingOrders);
        if (serviceHours !== undefined) updateData.service_hours = serviceHours;
        if (offlineNotice !== undefined) updateData.offline_notice = offlineNotice;

        const fetchRestaurant = () => {
            return supabase
                .from('restaurants')
                .select('*')
                .eq('id', req.restaurantId)
                .single();
        };

        const performUpdate = async (payload) => {
            if (!payload || Object.keys(payload).length === 0) {
                return fetchRestaurant();
            }
            return supabase
                .from('restaurants')
                .update(payload)
                .eq('id', req.restaurantId)
                .select()
                .single();
        };

        let { data: restaurant, error } = await performUpdate(updateData);

        if (error?.code === '42703') {
            console.warn('Service availability columns missing; retrying profile update without is_accepting_orders/service_hours/offline_notice');
            const fallbackPayload = stripServiceAvailabilityFields(updateData);
            ({ data: restaurant, error } = await performUpdate(fallbackPayload));
            restaurant = sanitizeServiceAvailability(restaurant);
        }

        if (error) {
            throw error;
        }

        if (!restaurant) {
            const { data, error: fetchError } = await fetchRestaurant();
            if (fetchError) {
                throw fetchError;
            }
            restaurant = data;
        }

        restaurant = sanitizeServiceAvailability(restaurant);

        // Remove password hash from response
        const { password_hash, ...restaurantData } = restaurant;

        res.json({
            message: 'Profile updated successfully',
            restaurant: restaurantData
        });
    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

module.exports = {
    register,
    login,
    logout,
    getProfile,
    updateProfile
};