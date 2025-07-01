const axios = require('axios');

module.exports = function(app) {
    async function flux(logic) {
        try {
            const response = await axios.get(`https://fast-flux-demo.replicate.workers.dev/api/generate-image?text=${encodeURIComponent(logic)}`, {
                responseType: 'arraybuffer'
            });

            return Buffer.from(response.data);
        } catch (error) {
            console.error(error);
            throw new Error(error.message);
        }
    }

    app.get('/aiimg/flux', async (req, res) => {
        try {
            const {
                prompt
            } = req.query;
            if (!prompt) {
                return res.status(400).json({
                    status: false,
                    message: 'Text Required'
                });
            }
            const img = await flux(prompt);
            res.writeHead(200, {
                'Content-Type': 'image/webp',
                'Content-Length': img.length
            });
            res.end(img);
        } catch (error) {
            res.status(500).json({
                status: false,
                message: error.message
            });
        }
    });
};