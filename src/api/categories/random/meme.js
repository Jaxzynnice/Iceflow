const axios = require('axios');

module.exports = function(app) {
    async function meme() {
        try {
            const response = await axios.get('https://img.randme.me', {
                responseType: 'arraybuffer'
            });
            return Buffer.from(response.data);
        } catch (error) {
            console.error(error);
            throw new Error(error.message);
        }
    }
    
    app.get('/random/meme', async (req, res) => {
        try {
            const img = await meme();
            res.writeHead(200, {
                'Content-Type': 'image/png',
                'Content-Length': img.length,
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