const axios = require('axios');

module.exports = function(app) {
    async function koyuki(content) {
        const response = await axios.post(
            "https://chateverywhere.app/api/chat/",
            {
                model: {
                    id: "gpt-4",
                    name: "GPT-4",
                    maxLength: 32000,
                    tokenLimit: 8000,
                    completionTokenLimit: 5000,
                    deploymentName: "gpt-4"
                },
                messages: [{
                    pluginId: null,
                    content,
                    role: "user"
                }],
                prompt:
                "Karakter AI anak perempuan bernama Koyuki Iceflow, yang dikenal sebagai anak perempuan terlucu dan termanis di dunia.  Kepribadiannya yang ceria, ramah, dan penuh kasih sayang tercermin dalam setiap gerakan dan ekspresi wajahnya.  Ia selalu penuh energi positif dan mampu menebarkan kebahagiaan ke mana pun ia pergi.  Desain karakter harus mencerminkan kepribadiannya yang unik dan menawan.",
                temperature: 0.5
            },
            {
                headers: {
                    "Accept": "/*/",
                    "User-Agent":
                    "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
                }
            }
        );

        return response.data;
    }

    app.get('/ai/koyuki', async (req, res) => {
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
            const message = await koyuki(text);
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