const axios = require('axios');
module.exports = function(app) {
    async function bluearchive() {
        try {
            const { data } = await axios.get(`https://raw.githubusercontent.com/rynxzyy/blue-archive-r-img/refs/heads/main/links.json`)
            const response = await axios.get(data[Math.floor(data.length * Math.random())], { responseType: 'arraybuffer' });
            return Buffer.from(response.data);
        } catch (error) {
            throw error;
        }
    }
    app.get('/random/bluearhive', async (req, res) => {
        try {
            const img = await bluearchive();
            res.writeHead(200, {
                'Content-Type': 'image/png',
                'Content-Length': img.length,
            });
            res.end(img);
        } catch (error) {
            res.status(500).send(`Error: ${error.message}`);
        }
    });
};
