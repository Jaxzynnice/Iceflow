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
                device,
                apikey
            } = req.query;
            const availableDevice = ['dekstop', 'mobile'];
            const { data } = await axios.get('https://iceflow.biz.id/src/routers.json');
            if (!url) {
                res.status(400).json({
                    status: false,
                    message: 'URL Required'
                });
            } else if (!device) {
                res.status(400).json({
                    status: false,
                    message: 'Device Required'
                });
            } else if (!availableDevice.includes(device.toLowerCase())) {
                res.status(400).json({
                    status: false,
                    message: 'Device not Available',
                    availableDevice
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
            
            const img = await ssWeb(url, device);
            res.writeHead(200, {
                'Content-Type': 'image/jpeg',
                'Content-Length': img.length
            });
            res.end(img);
        } catch (error) {
            console.erroe('Error in /tools/ssweb route:', error);
            res.status(500).json({
                status: false,
                message: error.message
            });
        }
    });
};