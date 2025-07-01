const axios = require('axios');

module.exports = function(app) {
    async function qc(pp, nick, teks) {
        try {
            const response = await axios.post('https://bot.lyo.su/quote/generate', {
                "type": "quote",
                "format": "png",
                "backgroundColor": "#ffffff",
                "width": 512,
                "height": 768,
                "scale": 2,
                "messages": [{
                    "entities": [],
                    "avatar": true,
                    "from": {
                        "id": 1,
                        "name": nick,
                        "photo": {
                            "url": pp
                        }
                    },
                    "text": teks,
                    "replyMessage": {}
                }]
            },
            {
                headers: {
                    "Content-Type": "application/json"
                }
            });

            return Buffer.from(response.data.result.image, "base64");
        } catch (error) {
            console.error("Error in qc function:", error);
            throw new Error(error.message);
        }
    }

    app.get('/maker/quotely', async (req, res) => {
        try {
            const {
                url,
                name,
                text,
                apikey
            } = req.query;
            const { data } = await axios.get('https://iceflow.biz.id/src/routers.json');
            if (!url) {
                res.status(400).json({
                    status: false,
                    message: 'URL Required'
                });
            } else if (!name) {
                res.status(400).json({
                    status: false,
                    message: 'Name Required'
                });
            } else if (!text) {
                res.status(400).json({
                    status: false,
                    message: 'Text Required'
                });
            } else if (!apikey) {
                res.status(400).json({
                    status: false,
                    message: 'Apikey Required'
                });
            } else if (apikey !== data.apiSettings.apikey[0]) {
                res.status(400).json({
                    status: false,
                    message: 'Apikey Invalid'
                });
            }
            
            const img = await qc(url, name, text);
            res.writeHead(200, {
                'Content-Type': 'image/png',
                'Content-Length': img.length
            });
            res.end(img);
        } catch (error) {
            console.error('Error in /maker/quotely route:', error);
            res.status(500).json({
                status: false,
                message: error.message
            });
        }
    });
};