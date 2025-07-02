const rateLimit = require('express-rate-limit');
const isntKey = ['/', '/docs'];

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
    globalRateLimiter,
    requestLimiter
};