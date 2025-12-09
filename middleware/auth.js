const jwt = require('jsonwebtoken');
const { supabase } = require('../config/supabase');

const JWT_SECRET = process.env.JWT_SECRET || 'your-fallback-secret';

// Authentication middleware
const authenticateToken = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (!token) {
            return res.status(401).json({ error: 'Access token required' });
        }

        // Verify JWT token
        const decoded = jwt.verify(token, JWT_SECRET);
        
        // Check if session exists in database
        const { data: session, error } = await supabase
            .from('sessions')
            .select('*')
            .eq('token', token)
            .single();

        if (error || !session) {
            return res.status(401).json({ error: 'Invalid or expired session' });
        }

        // Check if session is expired
        if (new Date(session.expires_at) < new Date()) {
            return res.status(401).json({ error: 'Session expired' });
        }

        // Attach restaurant info to request
        req.restaurantId = decoded.restaurantId;
        req.token = token;
        
        next();
    } catch (error) {
        console.error('Auth middleware error:', error);
        return res.status(401).json({ error: 'Invalid token' });
    }
};

// Generate JWT token
const generateToken = (restaurantId) => {
    return jwt.sign(
        { restaurantId },
        JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );
};

// Create session in database
const createSession = async (restaurantId, token) => {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24); // 24 hours

    const { data, error } = await supabase
        .from('sessions')
        .insert({
            restaurant_id: restaurantId,
            token: token,
            expires_at: expiresAt.toISOString()
        })
        .select()
        .single();

    if (error) {
        throw error;
    }

    return data;
};

// Delete session
const deleteSession = async (token) => {
    const { error } = await supabase
        .from('sessions')
        .delete()
        .eq('token', token);

    if (error) {
        console.error('Error deleting session:', error);
    }
};

// Multi-tenant middleware - ensures restaurant isolation
const multiTenant = (req, res, next) => {
    if (!req.restaurantId) {
        return res.status(401).json({ error: 'Restaurant ID not found' });
    }
    next();
};

module.exports = {
    authenticateToken,
    generateToken,
    createSession,
    deleteSession,
    multiTenant
};