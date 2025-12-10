const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config();

// Import routes
const authRoutes = require('./routes/auth');
const tableRoutes = require('./routes/tables');
const menuRoutes = require('./routes/menu');
const orderRoutes = require('./routes/orders');
const printerRoutes = require('./routes/printers');
const restaurantRoutes = require('./routes/restaurant');
const waiterRoutes = require('./routes/waiter');
const recipeRoutes = require('./routes/recipes');
const labelRoutes = require('./routes/labels');

const app = express();
const PORT = process.env.PORT || 5503;

// Security middleware
app.use(helmet({
    contentSecurityPolicy: false, // Allow all content for development
    crossOriginEmbedderPolicy: false
}));

// CORS configuration
const toAbsoluteOrigin = (value) => {
    if (!value) return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^https?:\/\//i.test(trimmed)) {
        return trimmed.replace(/\/$/, '');
    }
    return `https://${trimmed.replace(/\/$/, '')}`;
};

const expandEnvOrigins = (value) => {
    if (!value) return [];
    return value
        .split(',')
        .map((part) => toAbsoluteOrigin(part))
        .filter(Boolean);
};

const fallbackHostedOrigins = [
    'https://digitalmenuai.netlify.app',
    process.env.RAILWAY_PUBLIC_DOMAIN && `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
];

const allowedOrigins = Array.from(new Set([
    process.env.FRONTEND_URL,
    process.env.ADMIN_URL,
    process.env.MENU_URL,
    process.env.KDS_URL,
    toAbsoluteOrigin(process.env.NETLIFY_URL),
    ...expandEnvOrigins(process.env.CORS_ALLOWED_ORIGINS),
    ...fallbackHostedOrigins,
    'http://localhost:3000',
    'http://localhost:5503',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5503'
].map((origin) => toAbsoluteOrigin(origin)).filter(Boolean)));

const isPrivateNetworkOrigin = (origin) => {
    if (!origin) return false;
    try {
        const { hostname } = new URL(origin);
        if (hostname === 'localhost' || hostname.startsWith('127.')) {
            return true;
        }
        if (hostname.startsWith('192.168.') || hostname.startsWith('10.')) {
            return true;
        }
        const private172 = hostname.match(/^172\.(1[6-9]|2\d|3[0-1])\./);
        return Boolean(private172);
    } catch (error) {
        console.warn('Unable to parse origin for CORS check:', origin, error.message);
        return false;
    }
};

const corsOptions = {
    origin: (origin, callback) => {
        // Allow requests from tools (like curl/Postman) or local file:// contexts with no origin header
        if (!origin || allowedOrigins.includes(origin) || isPrivateNetworkOrigin(origin)) {
            return callback(null, true);
        }

        return callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true,
    optionsSuccessStatus: 200
};
app.use((req, res, next) => {
    if (req.headers['access-control-request-private-network'] === 'true') {
        res.setHeader('Access-Control-Allow-Private-Network', 'true');
    }
    next();
});
if (process.env.NODE_ENV !== 'production') {
    console.log('[CORS] Allowed origins:', allowedOrigins.join(', ') || 'none');
}
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Rate limiting for production; keep generous limits during development
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: process.env.NODE_ENV === 'production' ? 100 : 10000,
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging middleware
if (process.env.NODE_ENV !== 'production') {
    app.use(morgan('dev'));
} else {
    app.use(morgan('combined'));
}

// Static file serving for uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/tables', tableRoutes);
app.use('/api/menu', menuRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/printers', printerRoutes);
app.use('/api/restaurant', restaurantRoutes);
app.use('/api/waiter', waiterRoutes);
app.use('/api/recipes', recipeRoutes);
app.use('/api/labels', labelRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        version: require('./package.json').version
    });
});

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        message: 'Digital Menu SaaS API',
        version: require('./package.json').version,
        endpoints: {
            auth: '/api/auth',
            tables: '/api/tables',
            menu: '/api/menu',
            orders: '/api/orders',
            waiter: '/api/waiter',
            recipes: '/api/recipes',
            labels: '/api/labels',
            health: '/api/health'
        }
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('Global error handler:', err);
    
    // Handle specific error types
    if (err.name === 'ValidationError') {
        return res.status(400).json({ error: err.message });
    }
    
    if (err.name === 'UnauthorizedError') {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    // Default error response
    res.status(500).json({ 
        error: process.env.NODE_ENV === 'production' 
            ? 'Internal server error' 
            : err.message 
    });
});

// Start server
const server = app.listen(PORT, () => {
    console.log(`🚀 Digital Menu SaaS Backend running on port ${PORT}`);
    console.log(`📱 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔗 API URL: http://localhost:${PORT}/api`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    server.close(() => {
        console.log('Process terminated');
    });
});

process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully');
    server.close(() => {
        console.log('Process terminated');
    });
});

module.exports = app;