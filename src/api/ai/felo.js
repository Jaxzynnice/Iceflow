const axios = require('axios');

module.exports = function(app) {
    async function felo(query) {
        try {
            const payload = {
                query,
                search_uuid: Date.now().toString() + Math.random().toString(36).substring(2, 15),
                search_options: {
                    langcode: "id-MM"
                },
                search_video: true,
            };

            const response = await axios.post("https://api.felo.ai/search/threads", payload, {
                headers: {
                    "Accept": "*/*",
                    "User-Agent": "Postify/1.0.0",
                    "Content-Encoding": "gzip, deflate, br, zstd",
                    "Content-Type": "application/json",
                },
                timeout: 30000,
                responseType: "text",
            });

            let result = '';
            response.data.split('\n').forEach((line) => {
                if (line.startsWith("data:")) {
                    const data = JSON.parse(line.slice(5).trim());
                    if (data.data?.text) {
                        result = data.data.text.replace(/\d+/g, '');
                    }
                }
            });

            return result;
        } catch (error) {
            console.error(error);
            throw new Error(error.message)
        }
    }

    app.get('/ai/felo',
        async (req, res) => {
            try {
                const {
                    text
                } = req.query;
                if (!text) {
                    return res.status(400).json({
                        status: false,
                        message: 'Text Required'
                    });
                }
                const message = await felo(text);
                res.status(200).json({
                    status: true,
                    message
                });
            } catch (error) {
                res.status(500).json({
                    status: false,
                    message: error.message
                });
            }
        });
};