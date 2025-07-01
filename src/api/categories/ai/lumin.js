const axios = require('axios');

module.exports = function(app) {
    async function fetchContent(content) {
        try {
            const response = await axios.post('https://luminai.my.id/', { content });
            return response.data;
        } catch (error) {
            console.error("Error fetching content from LuminAI:", error);
            throw error;
        }
    }
    app.get('/ai/lumin', async (req, res) => {
        try {
            const {
                text,
                apikey
            } = req.query;
            if (!text) {
                return res.status(400).json({
                    status: false,
                    message: 'Text Required'
                });
            } else if (!apikey) {
                return res.status(400).json({
                    status: false,
                    message: 'Apikey Required'
                });
            }
            const { result } = await fetchContent(text);
            res.status(200).json({
                status: true,
                message: result
            });
        } catch (error) {
            console.error("Error in /ai/lumin route:", error);
            res.status(500).json({
                status: false,
                message: error.message
            });
        }
    });
};