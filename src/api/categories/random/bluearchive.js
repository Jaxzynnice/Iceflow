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
            const { apikey } = req.query;
            const { data } = await axios.get('https://iceflow.biz.id/src/routers.json');
            if (!apikey) {
                res.status(400).json({
                    status: false,
                    message: 'Apikey Required'
                });
            } else if (apikey !== data.apiSettings.apikey[0]) {
                return res.status(400).json({
                    status: false,
                    message: 'Apikey Invalid'
                });
            }
            
            const img = await bluearchive();
            res.writeHead(200, {
                'Content-Type': 'image/png',
                'Content-Length': img.length,
            });
            res.end(img);
        } catch (error) {
            console.error('Error in /random/bluearchive route:', error);
            res.status(500).json({
                status: false,
                message: error.message
            });
        }
    });
};
