const fs = require('fs');
const cors = require('cors');
const path = require('path');
const chalk = require('chalk');
const multer = require('multer');
const express = require('express');
const mongoose = require('mongoose');
const crypto = require('crypto');
const rl = require('./rateLimiter');

const app = express();
const PORT = process.env.PORT || 4000;

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/apikey_system';
mongoose.connect('mongodb+srv://Jaxzynnice:bSN7BN5mTIHeRD2Q@iceflow.acatmdn.mongodb.net/?retryWrites=true&w=majority&appName=Iceflow', {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log(chalk.bgHex('#90EE90').hex('#333').bold(' MongoDB Connected! ✓ '));
}).catch(err => {
    console.error(chalk.bgHex('#FF6B6B').hex('#FFF').bold(' MongoDB Connection Error: '), err);
});

// API Key Schema
const apiKeySchema = new mongoose.Schema({
    keyId: {
        type: String,
        required: true,
        unique: true
    },
    apiKey: {
        type: String,
        required: true,
        unique: true
    },
    name: {
        type: String,
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
    usageCount: {
        type: Number,
        default: 0
    },
    dailyLimit: {
        type: Number,
        default: 1000
    },
    lastUsed: {
        type: Date,
        default: Date.now
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

const ApiKey = mongoose.model('ApiKey', apiKeySchema);

app.enable("trust proxy");
app.set("json spaces", 2);
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cors());
app.use(rl.requestLimiter);
app.use(rl.globalRateLimiter);
app.use('/', express.static(path.join(__dirname, 'public')));
app.use('/src', express.static(path.join(__dirname, 'src')));

const settingsPath = path.join(__dirname, './src/routers.json');
const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));

// URLs yang dikecualikan dari validasi API key
const excludedPaths = [
    '/',
    '/apikey/create',
    '/apikey/check',
    '/apikey/delete',
    '/docs',
    '/health'
];

// Fungsi untuk generate API key
function generateApiKey() {
    const keyId = crypto.randomBytes(8).toString('hex');
    const apiKey = 'ak_' + crypto.randomBytes(32).toString('hex');
    return { keyId, apiKey };
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

// Apply API key validation middleware
app.use(validateApiKey);

// Enhanced response middleware
app.use((req, res, next) => {
    const originalJson = res.json;
    res.json = function (data) {
        if (data && typeof data === 'object') {
            const responseData = {
                status: data.status,
                creator: settings.apiSettings.creator,
                ...data
            };
            
            // Add API key usage info if available
            if (req.apiKeyInfo && data.status !== false) {
                responseData.apiUsage = {
                    used: req.apiKeyInfo.usageCount,
                    limit: req.apiKeyInfo.dailyLimit,
                    remaining: req.apiKeyInfo.dailyLimit - req.apiKeyInfo.usageCount
                };
            }
            
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
        const { name, email, dailyLimit } = req.body;
        
        if (!name || !email) {
            return res.status(400).json({
                status: false,
                message: 'Name and email are required'
            });
        }

        // Check if email already exists
        const existingKey = await ApiKey.findOne({ email });
        if (existingKey) {
            return res.status(409).json({
                status: false,
                message: 'API key already exists for this email'
            });
        }

        const { keyId, apiKey } = generateApiKey();
        
        const newApiKey = new ApiKey({
            keyId,
            apiKey,
            name,
            email,
            dailyLimit: dailyLimit || 1000
        });

        await newApiKey.save();

        res.status(201).json({
            status: true,
            message: 'API key created successfully',
            data: {
                keyId,
                apiKey,
                name,
                email,
                dailyLimit: newApiKey.dailyLimit,
                createdAt: newApiKey.createdAt
            }
        });
    } catch (error) {
        console.error('Create API key error:', error);
        res.status(500).json({
            status: false,
            message: 'Failed to create API key'
        });
    }
});

// Check API Key
app.get('/apikey/check', async (req, res) => {
    try {
        const { apikey } = req.query;
        
        if (!apikey) {
            return res.status(400).json({
                status: false,
                message: 'API key parameter is required'
            });
        }

        const keyData = await ApiKey.findOne({ apiKey: apikey });
        
        if (!keyData) {
            return res.status(404).json({
                status: false,
                message: 'API key not found'
            });
        }

        // Reset daily usage jika sudah lewat 24 jam
        const now = new Date();
        const lastUsed = new Date(keyData.lastUsed);
        const timeDiff = now.getTime() - lastUsed.getTime();
        const hoursDiff = timeDiff / (1000 * 3600);

        let currentUsage = keyData.usageCount;
        if (hoursDiff >= 24) {
            currentUsage = 0;
        }

        res.json({
            status: true,
            message: 'API key information retrieved successfully',
            data: {
                keyId: keyData.keyId,
                name: keyData.name,
                email: keyData.email,
                isActive: keyData.isActive,
                usageCount: currentUsage,
                dailyLimit: keyData.dailyLimit,
                remaining: keyData.dailyLimit - currentUsage,
                lastUsed: keyData.lastUsed,
                createdAt: keyData.createdAt
            }
        });
    } catch (error) {
        console.error('Check API key error:', error);
        res.status(500).json({
            status: false,
            message: 'Failed to check API key'
        });
    }
});

// Delete API Key
app.delete('/apikey/delete', async (req, res) => {
    try {
        const { apikey, email } = req.body;
        
        if (!apikey && !email) {
            return res.status(400).json({
                status: false,
                message: 'API key or email is required'
            });
        }

        let query = {};
        if (apikey) query.apiKey = apikey;
        if (email) query.email = email;

        const deletedKey = await ApiKey.findOneAndDelete(query);
        
        if (!deletedKey) {
            return res.status(404).json({
                status: false,
                message: 'API key not found'
            });
        }

        res.json({
            status: true,
            message: 'API key deleted successfully',
            data: {
                keyId: deletedKey.keyId,
                name: deletedKey.name,
                email: deletedKey.email
            }
        });
    } catch (error) {
        console.error('Delete API key error:', error);
        res.status(500).json({
            status: false,
            message: 'Failed to delete API key'
        });
    }
});

// List all API Keys (Admin endpoint)
app.get('/apikey/list', async (req, res) => {
    try {
        const { adminKey } = req.query;
        
        // Simple admin key check (you should implement proper admin authentication)
        if (adminKey !== process.env.ADMIN_KEY) {
            return res.status(403).json({
                status: false,
                message: 'Admin access required'
            });
        }

        const apiKeys = await ApiKey.find({}, {
            apiKey: 0 // Don't return actual API keys
        }).sort({ createdAt: -1 });

        res.json({
            status: true,
            message: 'API keys retrieved successfully',
            data: apiKeys,
            total: apiKeys.length
        });
    } catch (error) {
        console.error('List API keys error:', error);
        res.status(500).json({
            status: false,
            message: 'Failed to retrieve API keys'
        });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: true,
        message: 'API is running',
        timestamp: new Date().toISOString(),
        mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
    });
});

// Api Route
let totalRoutes = 0;
const apiFolder = path.join(__dirname, './src/api/categories');
fs.readdirSync(apiFolder).forEach((subfolder) => {
    const subfolderPath = path.join(apiFolder, subfolder);
    if (fs.statSync(subfolderPath).isDirectory()) {
        fs.readdirSync(subfolderPath).forEach((file) => {
            const filePath = path.join(subfolderPath, file);
            if (path.extname(file) === '.js') {
                require(filePath)(app);
                totalRoutes++;
                console.log(chalk.bgHex('#FFFF99').hex('#333').bold(` Loaded Route: ${path.basename(file)} `));
            }
        });
    }
});

console.log(chalk.bgHex('#90EE90').hex('#333').bold(' Load Complete! ✓ '));
console.log(chalk.bgHex('#90EE90').hex('#333').bold(` Total Routes Loaded: ${totalRoutes} `));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((req, res, next) => {
    res.status(404).sendFile(process.cwd() + "/public/error/404.html");
});

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).sendFile(process.cwd() + "/public/error/500.html");
});

app.listen(PORT, () => {
    console.log(chalk.bgHex('#90EE90').hex('#333').bold(` Server is running on port ${PORT} `));
});

module.exports = app;