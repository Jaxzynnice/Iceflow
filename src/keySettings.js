const mongoose = require('mongoose');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');

// Plan Configuration
const PLANS = {
    FREE: {
        name: 'Free',
        defaultLimit: 100,
        defaultTimeUnit: 'second', // second, minute, day
        hasExpiration: false,
        features: ['basic_api_access']
    },
    PREMIUM: {
        name: 'Premium',
        defaultLimit: 1000,
        defaultTimeUnit: 'minute',
        hasExpiration: true,
        expirationDays: 30,
        features: ['basic_api_access', 'premium_endpoints', 'priority_support']
    },
    VVIP: {
        name: 'VVIP',
        defaultLimit: 10000,
        defaultTimeUnit: 'hour',
        hasExpiration: true,
        expirationDays: 90,
        features: ['basic_api_access', 'premium_endpoints', 'priority_support', 'unlimited_bandwidth']
    }
};

// Time Units Configuration
const TIME_UNITS = {
    second: { milliseconds: 1000, label: 'per second' },
    minute: { milliseconds: 60 * 1000, label: 'per minute' },
    hour: { milliseconds: 60 * 60 * 1000, label: 'per hour' },
    day: { milliseconds: 24 * 60 * 60 * 1000, label: 'per day' }
};

// API Key Schema
const apiKeySchema = new mongoose.Schema({
    apikey: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    plan: {
        type: String,
        required: true,
        enum: Object.keys(PLANS),
        default: 'FREE'
    },
    limit: {
        type: Number,
        required: true,
        default: function() {
            return PLANS[this.plan]?.defaultLimit || PLANS.FREE.defaultLimit;
        }
    },
    timeUnit: {
        type: String,
        required: true,
        enum: Object.keys(TIME_UNITS),
        default: function() {
            return PLANS[this.plan]?.defaultTimeUnit || PLANS.FREE.defaultTimeUnit;
        }
    },
    // User Information
    name: {
        type: String,
        required: true,
        trim: true
    },
    number: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true,
        index: true
    },
    // Status flags
    isActive: {
        type: Boolean,
        default: true
    },
    isAdmin: {
        type: Boolean,
        default: false
    },
    // Usage tracking
    todayHit: {
        type: Number,
        default: 0
    },
    totalHit: {
        type: Number,
        default: 0
    },
    // Rate limiting data
    rateLimitData: {
        lastReset: {
            type: Date,
            default: Date.now
        },
        currentUsage: {
            type: Number,
            default: 0
        },
        windowStart: {
            type: Date,
            default: Date.now
        }
    },
    // Plan expiration (for premium plans)
    planExpiration: {
        expiresAt: {
            type: Date,
            default: null
        },
        isExpired: {
            type: Boolean,
            default: false
        },
        originalPlan: {
            type: String,
            default: null
        }
    },
    // Request logs
    logs: {
        recentRequests: [{
            ip: {
                type: String,
                required: true
            },
            timestamp: {
                type: Date,
                default: Date.now
            },
            endpoint: {
                type: String,
                required: true
            },
            userAgent: String,
            success: {
                type: Boolean,
                default: true
            }
        }],
        lastUsed: {
            type: Date,
            default: Date.now
        },
        dailyResetAt: {
            type: Date,
            default: function() {
                const tomorrow = new Date();
                tomorrow.setDate(tomorrow.getDate() + 1);
                tomorrow.setHours(0, 0, 0, 0);
                return tomorrow;
            }
        }
    },
    // Timestamps
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Middleware to update updatedAt on save
apiKeySchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

// Method to check if plan is expired
apiKeySchema.methods.checkPlanExpiration = function() {
    if (!this.planExpiration.expiresAt) return false;
    
    const now = new Date();
    const isExpired = now > this.planExpiration.expiresAt;
    
    if (isExpired && !this.planExpiration.isExpired) {
        // Mark as expired and downgrade to FREE plan
        this.planExpiration.isExpired = true;
        this.planExpiration.originalPlan = this.plan;
        this.plan = 'FREE';
        this.limit = PLANS.FREE.defaultLimit;
        this.timeUnit = PLANS.FREE.defaultTimeUnit;
        this.rateLimitData.currentUsage = 0;
        this.rateLimitData.lastReset = now;
        this.rateLimitData.windowStart = now;
    }
    
    return isExpired;
};

// Method to check rate limit
apiKeySchema.methods.checkRateLimit = function() {
    const now = new Date();
    const timeUnit = TIME_UNITS[this.timeUnit];
    const windowDuration = timeUnit.milliseconds;
    
    // Check if we need to reset the window
    const timeSinceWindowStart = now.getTime() - this.rateLimitData.windowStart.getTime();
    
    if (timeSinceWindowStart >= windowDuration) {
        // Reset the window
        this.rateLimitData.windowStart = now;
        this.rateLimitData.currentUsage = 0;
        this.rateLimitData.lastReset = now;
    }
    
    // Check if limit exceeded
    const isLimitExceeded = this.rateLimitData.currentUsage >= this.limit;
    const remainingLimit = Math.max(0, this.limit - this.rateLimitData.currentUsage);
    const resetTime = new Date(this.rateLimitData.windowStart.getTime() + windowDuration);
    
    return {
        isLimitExceeded,
        remainingLimit,
        resetTime,
        currentUsage: this.rateLimitData.currentUsage,
        timeUnit: this.timeUnit,
        limit: this.limit
    };
};

// Method to increment usage
apiKeySchema.methods.incrementUsage = function(ip, endpoint, userAgent) {
    const now = new Date();
    
    // Check plan expiration first
    this.checkPlanExpiration();
    
    // Reset daily counter if needed
    if (now >= this.logs.dailyResetAt) {
        this.todayHit = 0;
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);
        this.logs.dailyResetAt = tomorrow;
    }
    
    // Increment counters
    this.rateLimitData.currentUsage += 1;
    this.todayHit += 1;
    this.totalHit += 1;
    this.logs.lastUsed = now;
    
    // Add to recent requests log (keep only last 10)
    const logEntry = {
        ip,
        timestamp: now,
        endpoint,
        userAgent,
        success: true
    };
    
    this.logs.recentRequests.unshift(logEntry);
    if (this.logs.recentRequests.length > 10) {
        this.logs.recentRequests = this.logs.recentRequests.slice(0, 10);
    }
    
    return this.save();
};

// Method to get plan info
apiKeySchema.methods.getPlanInfo = function() {
    const planConfig = PLANS[this.plan] || PLANS.FREE;
    const rateLimit = this.checkRateLimit();
    
    return {
        plan: this.plan,
        planName: planConfig.name,
        features: planConfig.features,
        limit: this.limit,
        timeUnit: this.timeUnit,
        timeUnitLabel: TIME_UNITS[this.timeUnit].label,
        rateLimit,
        expiration: this.planExpiration.expiresAt ? {
            expiresAt: this.planExpiration.expiresAt,
            isExpired: this.planExpiration.isExpired,
            originalPlan: this.planExpiration.originalPlan
        } : null
    };
};

const ApiKey = mongoose.models.ApiKey || mongoose.model('ApiKey', apiKeySchema);

// URLs yang dikecualikan dari validasi API key
const excludedPaths = [
    '/',
    '/apikey/create',
    '/apikey/check',
    '/apikey/delete',
    '/apikey/list',
    '/docs',
    '/health'
];

// Fungsi untuk generate API key
function defaultKey() {
    const timestamp = Date.now().toString(36);
    const random = crypto.randomBytes(4).toString('hex');
    return `ice-${timestamp}-${random}`;
}

// Fungsi untuk create API key dengan expiration
function createApiKey(plan, customLimit = null, customTimeUnit = null) {
    const planConfig = PLANS[plan] || PLANS.FREE;
    const now = new Date();
    
    const keyData = {
        apikey: defaultKey(),
        plan,
        limit: customLimit || planConfig.defaultLimit,
        timeUnit: customTimeUnit || planConfig.defaultTimeUnit
    };
    
    // Set expiration for premium plans
    if (planConfig.hasExpiration) {
        const expirationDate = new Date(now);
        expirationDate.setDate(expirationDate.getDate() + planConfig.expirationDays);
        keyData.planExpiration = {
            expiresAt: expirationDate,
            isExpired: false,
            originalPlan: null
        };
    }
    
    return keyData;
}

// Middleware untuk validasi API key
const validateApiKey = async (req, res, next) => {
    const requestPath = req.path;
    
    // Skip validasi untuk path yang dikecualikan
    if (excludedPaths.includes(requestPath) || 
        requestPath.startsWith('/public/') || 
        requestPath.startsWith('/src/') ||
        requestPath.includes('error') ||
        requestPath.includes('.css') ||
        requestPath.includes('.js') ||
        requestPath.includes('.ico')) ||
        requestPath.includes('/')) ||
        requestPath.includes('/apikey/create')) ||
        requestPath.includes('/apikey/check')) ||
        requestPath.includes('/apikey/list')) ||
        requestPath.includes('/apikey/delete')) ||
        requestPath.includes('/docs')) ||
        requestPath.includes('/health')) {
        return next();
    }

    const apiKey = req.query.apikey;
    
    if (!apiKey) {
        res.status(401).json({
            status: false,
            message: 'Apikey Required',
        });
    }

    try {
        const keyData = await ApiKey.findOne({ 
            apikey: apiKey, 
            isActive: true 
        });

        if (!keyData) {
            res.status(401).json({
                status: false,
                message: 'Apikey Invalid',
            });
        }

        // Check plan expiration
        keyData.checkPlanExpiration();
        
        // Check rate limit
        const rateLimitResult = keyData.checkRateLimit();
        
        if (rateLimitResult.isLimitExceeded) {
            res.status(429).json({
                status: false,
                rateLimit: {
                    limit: rateLimitResult.limit,
                    remaining: rateLimitResult.remainingLimit,
                    resetTime: rateLimitResult.resetTime,
                    timeUnit: rateLimitResult.timeUnit
                }
            });
        }

        // Increment usage
        const clientIp = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'] || 'unknown';
        const userAgent = req.headers['user-agent'] || 'unknown';
        
        await keyData.incrementUsage(clientIp, requestPath, userAgent);

        // Attach API key info to request
        req.apiKeyInfo = {
            id: keyData._id,
            apikey: keyData.apikey,
            name: keyData.name,
            email: keyData.email,
            plan: keyData.plan,
            planInfo: keyData.getPlanInfo(),
            rateLimit: rateLimitResult
        };

        next();
    } catch (error) {
        console.error('Error in Apikey validation:', error);
        return res.status(500).json({
            status: false,
            message: 'Internal Server Error'
        });
    }
};

// Rate limiters
const globalRateLimiter = rateLimit({
    windowMs: 24 * 60 * 60 * 1000, // 24 hours
    max: 100000,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        status: false,
        message: 'Too many requests from this IP. Please try again later.'
    }
});

const minuteRateLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        status: false,
        message: 'Too many requests per minute. Please wait.'
    }
});

const secondRateLimiter = rateLimit({
    windowMs: 1000, // 1 second
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        status: false,
        message: 'Too many requests per second. Please slow down.'
    }
});

const requestLimiter = (req, res, next) => {
    const isExcluded = excludedPaths.includes(req.path);
    
    if (!isExcluded) {
        globalRateLimiter(req, res, () => {
            minuteRateLimiter(req, res, () => {
                secondRateLimiter(req, res, next);
            });
        });
    } else {
        next();
    }
};

module.exports = {
    ApiKey,
    PLANS,
    TIME_UNITS,
    defaultKey,
    createApiKey,
    validateApiKey,
    requestLimiter,
    secondRateLimiter,
    minuteRateLimiter,
    globalRateLimiter
};