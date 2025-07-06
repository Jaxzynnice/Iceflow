const fs = require('fs');
const cors = require('cors');
const path = require('path');
const chalk = require('chalk');
const crypto = require('crypto');
const multer = require('multer');
const express = require('express');
const mongoose = require('mongoose');
const {
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
} = require('./src/keySettings');

const app = express();
const PORT = process.env.PORT || 4000;

// MongoDB connection
mongoose.connect('mongodb+srv://Jaxzynnice:bSN7BN5mTIHeRD2Q@iceflow.acatmdn.mongodb.net/icefloww?retryWrites=true&w=majority&appName=Iceflow')
    .then(() => {
        console.log(chalk.bgHex('#90EE90').hex('#333').bold(' MongoDB Connected! ✓ '));
    })
    .catch(err => {
        console.error(chalk.bgHex('#FF6B6B').hex('#FFF').bold(' MongoDB Connection Error: '), err);
    });

app.enable('trust proxy', false);
app.set('json spaces', 2);
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cors());
app.use('/', express.static(path.join(__dirname, 'public')));
app.use('/src', express.static(path.join(__dirname, 'src')));

const settingsPath = path.join(__dirname, '/src/routers.json');
const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));

// Apply middleware
app.use(requestLimiter);
app.use(validateApiKey);

// Enhanced response middleware
app.use((req, res, next) => {
    const originalJson = res.json;
    res.json = function (data) {
        if (data && typeof data === 'object') {
            const responseData = {
                status: data.status !== undefined ? data.status : true,
                creator: settings.apiSettings.creator,
                ...data
            };
            
            return originalJson.call(this, responseData);
        }
        return originalJson.call(this, data);
    };
    next();
});

// API Key Management Endpoints
// Create API Key
app.post('/apikey/create', async (req, res) => {
    try {
        const {
            plan = 'FREE',
            timeUnit,
            limit,
            name,
            number,
            email
        } = req.body;
        
        // Validation
        if (!name) {
            res.status(400).json({
                status: false,
                message: 'Name Required'
            });
        } else if (!number) {
            res.status(400).json({
                status: false,
                message: 'Number Required'
            });
        } else if (!email) {
            res.status(400).json({
                status: false,
                message: 'Email Required'
            });
        }

        // Check if email already exists
        const existingKey = await ApiKey.findOne({ email });
        if (existingKey) {
            res.status(409).json({
                status: false,
                message: 'Apikey already exists for this email'
            });
        }

        // Validate plan
        if (!PLANS[plan]) {
            res.status(400).json({
                status: false,
                message: 'Plan Invalid. Available plans: ' + Object.keys(PLANS).join(', ')
            });
        }

        // Validate timeUnit if provided
        if (timeUnit && !TIME_UNITS[timeUnit]) {
            res.status(400).json({
                status: false,
                message: 'Time Unit Invalid. Available units: ' + Object.keys(TIME_UNITS).join(', ')
            });
        }

        // Create API key data
        const keyData = createApiKey(plan, limit, timeUnit);
        
        const newApiKey = new ApiKey({
            ...keyData,
            name,
            number,
            email
        });

        await newApiKey.save();

        const planInfo = newApiKey.getPlanInfo();

        res.status(201).json({
            status: true,
            data: {
                apikey: newApiKey.apikey,
                plan: newApiKey.plan,
                planInfo,
                user: {
                    name,
                    number,
                    email
                },
                createdAt: newApiKey.createdAt
            }
        });
    } catch (error) {
        console.error('Error in /apikey/create route:', error);
        res.status(500).json({
            status: false,
            message: error.message
        });
    }
});

// Check API Key
app.get('/apikey/check', async (req, res) => {
    try {
        const { apikey } = req.query;
        
        if (!apikey) {
            res.status(400).json({
                status: false,
                message: 'Apikey Required'
            });
        }

        const keyData = await ApiKey.findOne({ apikey });
        
        if (!keyData) {
            res.status(404).json({
                status: false,
                message: 'Apikey Not Found'
            });
        }

        // Check plan expiration
        keyData.checkPlanExpiration();
        
        // Get current plan info
        const planInfo = keyData.getPlanInfo();

        res.json({
            status: true,
            data: {
                apikey: keyData.apikey,
                user: {
                    name: keyData.name,
                    number: keyData.number,
                    email: keyData.email
                },
                planInfo,
                usage: {
                    todayHit: keyData.todayHit,
                    totalHit: keyData.totalHit,
                    lastUsed: keyData.logs.lastUsed
                },
                status: {
                    isActive: keyData.isActive,
                    isAdmin: keyData.isAdmin
                },
                logs: {
                    recentRequests: keyData.logs.recentRequests.slice(0, 5), // Show only last 5 requests
                    dailyResetAt: keyData.logs.dailyResetAt
                },
                timestamps: {
                    createdAt: keyData.createdAt,
                    updatedAt: keyData.updatedAt
                }
            }
        });
    } catch (error) {
        console.error('Error in /apikey/check route:', error);
        res.status(500).json({
            status: false,
            message: error.message
        });
    }
});

// Update API Key Plan
app.put('/apikey/update', async (req, res) => {
    try {
        const { apikey, plan, limit, timeUnit } = req.body;
        
        if (!apikey) {
            res.status(400).json({
                status: false,
                message: 'Apikey Required'
            });
        }

        const keyData = await ApiKey.findOne({ apikey });
        
        if (!keyData) {
            res.status(404).json({
                status: false,
                message: 'Apikey Not Found'
            });
        }

        // Update plan if provided
        if (plan) {
            if (!PLANS[plan]) {
                res.status(400).json({
                    status: false,
                    message: 'Plan Invalid. Available plans: ' + Object.keys(PLANS).join(', ')
                });
            }
            
            const planConfig = PLANS[plan];
            keyData.plan = plan;
            keyData.limit = limit || planConfig.defaultLimit;
            keyData.timeUnit = timeUnit || planConfig.defaultTimeUnit;
            
            // Set expiration for premium plans
            if (planConfig.hasExpiration) {
                const now = new Date();
                const expirationDate = new Date(now);
                expirationDate.setDate(expirationDate.getDate() + planConfig.expirationDays);
                
                keyData.planExpiration.expiresAt = expirationDate;
                keyData.planExpiration.isExpired = false;
            } else {
                keyData.planExpiration.expiresAt = null;
                keyData.planExpiration.isExpired = false;
            }
            
            // Reset rate limit data
            keyData.rateLimitData.currentUsage = 0;
            keyData.rateLimitData.windowStart = new Date();
            keyData.rateLimitData.lastReset = new Date();
        }

        // Update individual fields if provided
        if (limit !== undefined) keyData.limit = limit;
        if (timeUnit && TIME_UNITS[timeUnit]) keyData.timeUnit = timeUnit;

        await keyData.save();

        const planInfo = keyData.getPlanInfo();

        res.json({
            status: true,
            data: {
                apikey: keyData.apikey,
                planInfo,
                updatedAt: keyData.updatedAt
            }
        });
    } catch (error) {
        console.error('Error in /apikey/update route:', error);
        res.status(500).json({
            status: false,
            message: error.message
        });
    }
});

// Delete API Key
app.delete('/apikey/delete', async (req, res) => {
    try {
        const { apikey, number, email } = req.body;
        
        if (!apikey && !number && !email) {
            res.status(400).json({
                status: false,
                message: 'At least one identifier is required (apikey, number, or email)'
            });
        }

        let query = {};
        if (apikey) query.apikey = apikey;
        if (number) query.number = number;
        if (email) query.email = email;

        const deletedKey = await ApiKey.findOneAndDelete(query);
        
        if (!deletedKey) {
            res.status(404).json({
                status: false,
                message: 'Apikey Not Found'
            });
        }

        res.json({
            status: true,
            data: {
                apikey: deletedKey.apikey,
                user: {
                    name: deletedKey.name,
                    number: deletedKey.number,
                    email: deletedKey.email
                }
            }
        });
    } catch (error) {
        console.error('Error in /apikey/delete route:', error);
        res.status(500).json({
            status: false,
            message: error.message
        });
    }
});

// List all API Keys (Admin endpoint)
app.get('/apikey/list', async (req, res) => {
    try {
        const { adminKey, page = 1, limit = 10 } = req.query;
        
        if (!adminKey || adminKey !== 'admkey') {
            res.status(403).json({
                status: false,
                message: 'Admin Access Required'
            });
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const total = await ApiKey.countDocuments();
        
        const apiKeys = await ApiKey.find({})
            .select('-logs.recentRequests') // Exclude detailed logs for performance
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        // Process each key to get plan info
        const processedKeys = apiKeys.map(key => {
            key.checkPlanExpiration();
            const planInfo = key.getPlanInfo();
            
            return {
                apikey: key.apikey,
                user: {
                    name: key.name,
                    number: key.number,
                    email: key.email
                },
                planInfo,
                usage: {
                    todayHit: key.todayHit,
                    totalHit: key.totalHit,
                    lastUsed: key.logs.lastUsed
                },
                status: {
                    isActive: key.isActive,
                    isAdmin: key.isAdmin
                },
                timestamps: {
                    createdAt: key.createdAt,
                    updatedAt: key.updatedAt
                }
            };
        });

        res.json({
            status: true,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                totalPages: Math.ceil(total / parseInt(limit))
            },
            data: processedKeys
        });
    } catch (error) {
        console.error('Error in /apikey/list route:', error);
        res.status(500).json({
            status: false,
            message: error.message
        });
    }
});

// Get available plans
app.get('/apikey/plans', (req, res) => {
    const planInfo = Object.keys(PLANS).map(planKey => {
        const plan = PLANS[planKey];
        return {
            key: planKey,
            name: plan.name,
            defaultLimit: plan.defaultLimit,
            defaultTimeUnit: plan.defaultTimeUnit,
            hasExpiration: plan.hasExpiration,
            expirationDays: plan.expirationDays,
            features: plan.features
        };
    });

    res.json({
        status: true,
        data: {
            plans: planInfo,
            timeUnits: Object.keys(TIME_UNITS).map(key => ({
                key,
                label: TIME_UNITS[key].label
            }))
        }
    });
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: true,
        message: 'API is running',
        mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
        uptime: process.uptime(),
    });
});

// Load API routes
let totalRoutes = 0;
const apiFolder = path.join(__dirname, './src/api/categories');

// Check if API folder exists
if (fs.existsSync(apiFolder)) {
    fs.readdirSync(apiFolder).forEach((subfolder) => {
        const subfolderPath = path.join(apiFolder, subfolder);
        if (fs.statSync(subfolderPath).isDirectory()) {
            fs.readdirSync(subfolderPath).forEach((file) => {
                const filePath = path.join(subfolderPath, file);
                if (path.extname(file) === '.js') {
                    try {
                        require(filePath)(app);
                        totalRoutes++;
                        console.log(chalk.bgHex('#FFFF99').hex('#333').bold(` Loaded Route: ${path.basename(file)} `));
                    } catch (error) {
                        console.error(chalk.bgHex('#FF6B6B').hex('#FFF').bold(` Error loading ${file}: `), error.message);
                    }
                }
            });
        }
    });
} else {
    console.log(chalk.bgHex('#FFA500').hex('#333').bold(' API folder not found, skipping route loading '));
}

console.log(chalk.bgHex('#90EE90').hex('#333').bold(' Load Complete! ✓ '));
console.log(chalk.bgHex('#90EE90').hex('#333').bold(` Total Routes Loaded: ${totalRoutes} `));

// Root endpoint
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API documentation endpoint
app.get('/docs', (req, res) => {
    const documentation = {
        title: "API Documentation",
        version: "2.0.0",
        baseUrl: `${req.protocol}://${req.get('host')}`,
        endpoints: {
            "API Key Management": {
                "POST /apikey/create": {
                    description: "Create a new API key",
                    parameters: {
                        name: "User name (required)",
                        number: "Phone number (required)",
                        email: "Email address (required)",
                        plan: "Plan type (FREE, PREMIUM, VVIP) - default: FREE",
                        limit: "Custom limit (optional)",
                        timeUnit: "Time unit (second, minute, hour, day) - optional"
                    }
                },
                "GET /apikey/check": {
                    description: "Check API key information",
                    parameters: {
                        apikey: "API key to check (required)"
                    }
                },
                "PUT /apikey/update": {
                    description: "Update API key plan or settings",
                    parameters: {
                        apikey: "API key to update (required)",
                        plan: "New plan (optional)",
                        limit: "New limit (optional)",
                        timeUnit: "New time unit (optional)"
                    }
                },
                "DELETE /apikey/delete": {
                    description: "Delete an API key",
                    parameters: {
                        apikey: "API key to delete (optional)",
                        number: "Phone number (optional)",
                        email: "Email address (optional)"
                    }
                },
                "GET /apikey/list": {
                    description: "List all API keys (Admin only)",
                    parameters: {
                        adminKey: "Admin key (required)",
                        page: "Page number (default: 1)",
                        limit: "Items per page (default: 10)"
                    }
                },
                "GET /apikey/plans": {
                    description: "Get available plans and time units",
                    parameters: "None"
                }
            },
            "System": {
                "GET /health": {
                    description: "Health check endpoint",
                    parameters: "None"
                }
            }
        },
        plans: PLANS,
        timeUnits: TIME_UNITS,
        rateLimit: {
            global: "100,000 requests per day",
            minute: "60 requests per minute",
            second: "10 requests per second"
        }
    };

    res.json({
        status: true,
        message: "API Documentation",
        data: documentation
    });
});

// 404 handler
app.use((req, res, next) => {
    const errorPath = path.join(__dirname, 'public', 'error', '404.html');
    if (fs.existsSync(errorPath)) {
        res.status(404).sendFile(errorPath);
    } else {
        res.status(404).json({
            status: false,
            message: 'Endpoint Not Found',
            path: req.path,
            method: req.method
        });
    }
});

// Error handler
app.use((err, req, res, next) => {
    console.error('Server Error:', err.stack);
    
    const errorPath = path.join(__dirname, 'public', 'error', '500.html');
    if (fs.existsSync(errorPath)) {
        res.status(500).sendFile(errorPath);
    } else {
        res.status(500).json({
            status: false,
            message: 'Internal Server Error',
            ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
        });
    }
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log(chalk.bgHex('#FFA500').hex('#333').bold(' Received SIGTERM, shutting down gracefully '));
    mongoose.connection.close(() => {
        console.log(chalk.bgHex('#90EE90').hex('#333').bold(' MongoDB connection closed '));
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log(chalk.bgHex('#FFA500').hex('#333').bold(' Received SIGINT, shutting down gracefully '));
    mongoose.connection.close(() => {
        console.log(chalk.bgHex('#90EE90').hex('#333').bold(' MongoDB connection closed '));
        process.exit(0);
    });
});

// Start server
app.listen(PORT, () => {
    console.log(chalk.bgHex('#90EE90').hex('#333').bold(` Server is running on port ${PORT} `));
    console.log(chalk.bgHex('#87CEEB').hex('#333').bold(` Health check: http://localhost:${PORT}/health `));
    console.log(chalk.bgHex('#87CEEB').hex('#333').bold(` Documentation: http://localhost:${PORT}/docs `));
});

module.exports = app;