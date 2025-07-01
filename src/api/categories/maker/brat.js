const axios = require('axios');
const sharp = require('sharp');

module.exports = function(app) {
    async function playwright(code, timeout) {
        if (!code) throw new Error('Code diperlukan.');
        const executionTimeout = timeout ?? 3e5;

        try {
            const response = await axios.post('https://wudysoft-api.hf.space/playwright', {
                code: code,
                timeout: executionTimeout
            }, {
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            return response.data;
        } catch (error) {
            if (error.response) {
                return error.response.data;
            } else {
                throw new Error(error.message);
            }
        }
    }

    app.get('/maker/brat', async (req, res) => {
        try {
            const {
                text,
                theme
            } = req.query;
            const availableThemes = ['white', 'black', 'green', 'blue', 'strike'];
            if (!text || !theme) {
                res.status(400).json({
                    status: false,
                    message: 'Text or Theme Required'
                })
            } else if (!availableThemes.includes(theme.toLowerCase())) {
                res.status(400).json({
                    status: false,
                    message: 'Theme not available',
                    availableThemes
                });
                return
            }

            const resp = await playwright(`
                const { chromium } = require('playwright');

                (async () => {
                try {
                const text = '${text}', color = '${theme}';

                const iPhone13 = {
                userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1',
                viewport: { width: 390, height: 844 },
                deviceScaleFactor: 3,
                isMobile: true,
                hasTouch: true
                };

                const browser = await chromium.launch({ headless: true });
                const context = await browser.newContext({
                ...iPhone13,
                locale: 'en-US'
                });
                const page = await context.newPage();

                await page.goto('https://www.bratgenerator.com/', { waitUntil: 'domcontentloaded' });

                await page.waitForSelector(\`#toggleButton\${color.charAt(0).toUpperCase() + color.slice(1)}\`);
                await page.click(\`#toggleButton\${color.charAt(0).toUpperCase() + color.slice(1)}\`);

                await page.waitForSelector('#textInput');
                await page.fill('#textInput', text);

                const textOverlay = await page.$('#textOverlay');
                if (textOverlay) {
                const buffer = await textOverlay.screenshot();
                console.log(buffer.toString('base64'));
                } else {
                console.log('Element not found');
                }

                await browser.close();
                } catch (error) {
                console.error(error);
                }
                })();
                `);

            let img = Buffer.from(resp.output, 'base64');

            if (theme.toLowerCase() === 'black') {
                img = await sharp(buff)
                .flop()
                .toBuffer();
            }
            res.writeHead(200, {
                'Content-Type': 'image/png',
                'Content-Length': img.length
            });
            res.end(img);
        } catch (error) {
            console.error("Error in /maker/brat route:", error);
            res.status(500).json({
                status: false,
                message: error.message
            });
        }
    });
};