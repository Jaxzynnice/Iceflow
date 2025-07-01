const axios = require('axios');
const cheerio = require('cheerio');
const FormData = require('form-data');

module.exports = function(app) {
    async function tiktokIo(tiktokUrl) {
        try {
            const form = new FormData();
            form.append('vid', tiktokUrl);
            form.append('prefix', 'dtGslxrcdcG9raW8uY29t'); // prefix nya gsh ngide dgnti
            const response = await axios.post('https://tiktokio.com/api/v1/tk-htmx', form, {
                headers: {
                    ...form.getHeaders(),
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                },
            });

            const $ = cheerio.load(response.data);

            const title = $('#tk-search-h2').text().trim();
            const thumbnail = $('img').attr('src');
            const downloadsUrl = $('.tk-down-link a');
            const results = {
                title,
                thumbnail,
                audio: '',
                video: {
                    watermark: '',
                    standard: '',
                    high: ''
                }
            };
        
            downloadsUrl.each((i, el) => {
                const urlText = $(el).text().trim();
                const urlUrls = $(el).attr('href');
                if (urlText.includes('Download without watermark (HD)')) {
                    results.video.high = urlUrls;
                } else if (urlText.includes('Download without watermark')) {
                    results.video.standard = urlUrls;
                } else if (urlText.includes('Download watermark')) {
                    results.video.watermark = urlUrls;
                } else if (urlText.includes('Download Mp3')) {
                    results.audio = urlUrls;
                }
            });

            return results;
        } catch (error) {
            console.error(error);
            throw new Error(error.message);
        }
    }

    app.get('/downloader/tiktok', async (req, res) => {
        try {
            const {
                url,
                apikey
            } = req.query;
            const { data } = await axios.get('https://iceflow.biz.id/src/routes.json');
            if (!url) {
                res.status(400).json({
                    status: false,
                    message: 'URL Required'
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
            
            const result = await tiktokIo(url);
            res.status(200).json({
                status: true,
                result
            });
        } catch (error) {
            console.error('Error in /downloader/tiktok route:', error);
            res.status(500).json({
                status: false,
                message: error.message
            });
        }
    });
};