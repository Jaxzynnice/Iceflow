const fetch = require('node-fetch');

module.exports = function(app) {
    async function cats() {
        try {
            const response = await fetch('https://cataas.com/cat/meme', {
                responseType: 'arraybuffer'
            });
            return response.buffer();
        } catch (error) {
            console.error(error);
            throw new Error(error.message);
        }
    }
    
    app.get('/random/cats', async (req, res) => {
        try {
            const { apikey } = req.query;
            const settings = await fetch('https://iceflow.biz.id/src/routes.json');
            const set = await settings.json();
            if (!apikey) {
                res.status(400).json({
                    status: false,
                    message: 'Apikey Required'
                });
            } else if (apikey !== set.apiSettings.apikey[0]) {
                res.status(400).json({
                    status: false,
                    message: 'Apikey Invalid'
                });
            }
            
            const img = await cats();
            res.writeHead(200, {
                'Content-Type': 'image/jpeg',
                'Content-Length': img.length,
            });
            res.end(img);
        } catch (error) {
            console.error('Error in /random/cats route', error);
            res.status(500).json({
                status: false,
                message: error.message
            });
        }
    });
};