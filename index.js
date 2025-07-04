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
    defaultKey,
    validateApiKey,
    requestLimiter,
    secondRateLimiter,
    minuteRateLimiter,
    globalRateLimiter
} = require('/src/keySettings');

const app = express();
const PORT = process.env.PORT || 4000;

// MongoDB connection
mongoose.connect('mongodb+srv://Jaxzynnice:bSN7BN5mTIHeRD2Q@iceflow.acatmdn.mongodb.net/icefloww?retryWrites=true&w=majority&appName=Iceflow').then(() => {
    console.log(chalk.bgHex('#90EE90').hex('#333').bold(' MongoDB Connected! ✓ '));
}).catch(err => {
    console.error(chalk.bgHex('#FF6B6B').hex('#FFF').bold(' MongoDB Connection Error: '), err);
});

app.enable("trust proxy");
app.set("json spaces", 2);
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cors());
app.use('/', express.static(path.join(__dirname, 'public')));
app.use('/src', express.static(path.join(__dirname, 'src')));

const settingsPath = path.join(__dirname, '/src/routers.json');
const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));

// Key Settings
// Apply API key validation middleware
app.use(validateApiKey);
app.use(requestLimiter);
app.use(secondRateLimiter);
app.use(minuteRateLimiter);
app.use(globalRateLimiter);

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
            apikey,
            plan,
            limit,
            name,
            number,
            email
        } = req.body;
        
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
        
        const newApiKey = new ApiKey({
            apikey: apikey || defaultKey(),
            plan: plan || 'FREE',
            limit: limit || '1000',
            name,
            number,
            email
        });

        await newApiKey.save();

        res.status(201).json({
            status: true,
            data: {
                apikey: newApiKey.apikey,
                plan: newApiKey.plan,
                limit: newApiKey.limit,
                name,
                number,
                email,
                createdAt: newApiKey.createdAt
            }
        });
    } catch (error) {
        console.error('Error in /apikey/create route:', error);
        res.status(500).json({
            status: false,
            message: 'Failed to create Apikey'
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
            return res.status(404).json({
                status: false,
                message: 'Apikey Not Found'
            });
        }

        // Reset daily usage jika sudah lewat 24 jam
        const now = new Date();
        const lastUsed = new Date(keyData.lastUsed);
        const timeDiff = now.getTime() - lastUsed.getTime();
        const hoursDiff = timeDiff / (1000 * 3600);
        
        const {
            plan,
            limit,
            name,
            number,
            email,
            isActive,
            isAdmin,
            totalHit,
            createdAt,
            logs
        } = keyData;

        let todayHit = keyData.todayHit;
        if (hoursDiff >= 24) {
            todayHit = 0;
        }

        res.json({
            status: true,
            data: {
                apikey: keyData.apikey,
                plan,
                limit: limit - currentUsage,
                name,
                number,
                email,
                isActive,
                isAdmin,
                todayHit,
                totalHit,
                createdAt,
                logs
            }
        });
    } catch (error) {
        console.error('Error in /apikey/check route:', error);
        res.status(500).json({
            status: false,
            message: 'Failed to check Apikey'
        });
    }
});

// Delete API Key
app.delete('/apikey/delete', async (req, res) => {
    try {
        const {
            apikey,
            number,
            email
        } = req.body;
        
        if (!apikey) {
            res.status(400).json({
                status: false,
                message: 'Apikey Required'
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

        let query = {};
        if (apikey) query.apikey = apikey;
        if (email) query.email = email;

        const deletedKey = await ApiKey.findOneAndDelete(query);
        
        if (!deletedKey) {
            return res.status(404).json({
                status: false,
                message: 'Apikey Not Found'
            });
        }
        
        const {
            name,
            number,
            email
        } = deletedKey;

        res.json({
            status: true,
            data: {
                apikey,
                name,
                number,
                email
            }
        });
    } catch (error) {
        console.error('Error in /apikey/delete route:', error);
        res.status(500).json({
            status: false,
            message: 'Failed to delete Apikey'
        });
    }
});

// List all API Keys (Admin endpoint)
app.get('/apikey/list', async (req, res) => {
    try {
        const { adminKey } = req.query;
        
        // Simple admin key check (you should implement proper admin authentication)
        if (!adminKey) {
            res.status(400).json({
                status: false,
                message: 'Admin Acces Required'
            });
        } else if (adminKey !== 'admkey') {
            res.status(403).json({
                status: false,
                message: 'Admin access required'
            });
        }

        const apiKeys = await ApiKey.find({}, {
            apikey: 0 // Don't return actual API keys
        }).sort({ createdAt: -1 });

        res.json({
            status: true,
            total: apiKeys.length,
            data: apiKeys
        });
    } catch (error) {
        console.error('Error in /apikey/list route:', error);
        res.status(500).json({
            status: false,
            message: 'Failed to retrieve Apikeys'
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