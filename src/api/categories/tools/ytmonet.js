const axios = require('axios');

module.exports = function(app) {
    async function ytmonet(url) {
        try {
            if (!/youtube.com|youtu.be/.test(url)) throw new Error('Invalid url');
            const { data } = await axios.post('https://timeskip.io/api/tools/youtube-monetization', {
                url
            }, {
                headers: {
                    'content-type': 'application/json'
                }
            });
            
            return data;
        } catch (error) {
            console.error(error.message);
            throw new Error('No result found');
        }
    }

    app.get('/tools/ytmonet', async (req, res) => {
        try {
            const {
                url
            } = req.query;
            if (!url) {
                return res.status(400).json({
                    status: false,
                    message: 'URL Required'
                });
            }
            const result = await ytmonet(url);
            res.status(200).json({
                status: true,
                result
            });
        } catch (error) {
            res.status(500).json({
                status: false,
                message: error.message
            });
        }
    });
};