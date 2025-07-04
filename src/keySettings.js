const isntKey = ['/', '/docs'];
const mongoose = require('mongoose');
const rateLimit = require('express-rate-limit');

// API Key Schema
const apiKeySchema = new mongoose.Schema({
    apikey: {
        type: String,
        required: true,
        unique: true
    },
    limit: {
        type: Number,
        default: 10
    },
    plan: {
        type: String,
        required: true
    },
    name: {
        type: String,
        required: true
    },
    number: {
        type: Number,
        required: true
    },
    email: {
        type: String,
        required: true
    },
    isActive: {
        type: Boolean,
        default: true
    },
    isAdmin: {
        type: Boolean,
        default: false
    },
    todayHit: {
        type: Number,
        default: 0
    },
    totalHit: {
        type: Number,
        default: 0
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    logs: {
        ipAddress:{
            type: Number,
            required: true,
            unique: true
        },
        lastUsed: {
            type: Date,
            default: Date.now
        }
    }
});

const ApiKey = mongoose.models.ApiKey || mongoose.model('ApiKey', apiKeySchema);

// URLs yang dikecualikan dari validasi API key
const excludedPaths = [
    '/',
    '/apikey/create',
    '/apikey/check',
    '/apikey/delete',
    '/docs',
    '/health'
];

// Fungsi untuk generate Apikey
function defaultKey() {
    const key = 'ice-' + crypto.randomBytes(5).toString('hex');
    return key;
}

// Middleware untuk validasi API key
const validateApiKey = async (req, res, next) => {
    const requestPath = req.path;
    
    // Skip validasi untuk path yang dikecualikan
    if (excludedPaths.includes(requestPath) || 
        requestPath.startsWith('/public/') || 
        requestPath.startsWith('/src/') ||
        requestPath.includes('error')) {
        return next();
    }

    const apiKey = req.query.apikey;
    
    if (!apiKey) {
        return res.status(401).json({
            status: false,
            message: 'Apikey Required'
        });
    }

    try {
        const keyData = await ApiKey.findOne({ 
            apiKey: apiKey, 
            isActive: true 
        });

        if (!keyData) {
            return res.status(401).json({
                status: false,
                message: 'Apikey Invalid'
            });
        }

        // Reset daily usage jika sudah lewat 24 jam
        const now = new Date();
        const lastUsed = new Date(keyData.lastUsed);
        const timeDiff = now.getTime() - lastUsed.getTime();
        const hoursDiff = timeDiff / (1000 * 3600);

        if (hoursDiff >= 24) {
            keyData.usageCount = 0;
        }

        // Check daily limit
        if (keyData.usageCount >= keyData.dailyLimit) {
            return res.status(429).json({
                status: false,
                message: 'Apikey Limit Exceeded',
                limit: keyData.dailyLimit,
                used: keyData.usageCount
            });
        }

        // Update usage count dan last used
        await ApiKey.findByIdAndUpdate(keyData._id, {
            $inc: { usageCount: 1 },
            lastUsed: now
        });

        // Attach API key info to request
        req.apiKeyInfo = {
            keyId: keyData.keyId,
            name: keyData.name,
            email: keyData.email,
            usageCount: keyData.usageCount + 1,
            dailyLimit: keyData.dailyLimit
        };

        next();
    } catch (error) {
        console.error('API Key validation error:', error);
        return res.status(500).json({
            status: false,
            message: error.message
        });
    }
};

const globalRateLimiter = rateLimit({
    windowMs: 24 * 60 * 60 * 1000,
    max: 100000,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        status: false,
        message: 'Too many requests, Please try again later.'
    }
});

const minuteRateLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        status: false,
        message: 'Please wait a moment, Gimme 1 minutes more'
    }
});

const secondRateLimiter = rateLimit({
    windowMs: 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        status: false,
        message: 'Calm down, U hit me too fast.'
    }
});

const requestLimiter = (req, res, next) => {
    if (!isntKey.includes(req.path)) {
        minuteRateLimiter(req, res, () => {
            secondRateLimiter(req, res, next);
        });
    } else {
        next();
    }
};

module.exports = {
    ApiKey,
    defaultKey,
    validateApiKey,
    requestLimiter,
    secondRateLimiter,
    minuteRateLimiter,
    globalRateLimiter
};