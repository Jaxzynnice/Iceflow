const axios = require('axios');

module.exports = function(app) {
    async function ssWeb(url, device) {
      try {
        const fullPage = device.includes('dekstop');
        const response = await axios.post('https://api.magickimg.com/generate/website-screenshot', {
            url,
            device,
            fullPage
          },
          {
            headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/json',
              'Cache-Control': 'no-cache'
            },
            responseType: 'arraybuffer'
          });

        return response.data;
      } catch (error) {
        console.error(error);
        throw new Error(error.message);
      }
    }

    app.get('/tools/ssweb', async (req, res) => {
        try {
            const {
                url,
                device
            } = req.query;
            if (!url || !device) {
                return res.status(400).json({
                    status: false,
                    message: 'URL or Device Required'
                });
            }
            const result = await ssWeb(url, device);
            res.writeHead(200, {
                'Content-Type': 'image/jpeg',
                'Content-Length': result.length
            });
            res.end(result);
        } catch (error) {
            res.status(500).json({
                status: false,
                message: error.message
            });
        }
    });
};