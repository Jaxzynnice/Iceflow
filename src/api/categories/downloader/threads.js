const axios = require('axios');
const cheerio = require('cheerio');

module.exports = function(app) {
    async function threadsDl(threadsUrl) {
      const HasilNya = [];
      try {
        const InputData = {
          q: threadsUrl
        };
        const Link = await axios.post('https://lovethreads.net/api/AjaxSearch', new URLSearchParams(InputData), {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Origin': 'https://lovethreads.net',
            'Referer': 'https://lovethreads.net/'
          }
        });
        if (Link.status === 200) {
        const $ = cheerio.load(Link.data.data);
        const hasil = $('.download-items__btn').eq(1).find('a.abutton.is-success.is-fullwidth.btn-premium.mt-3').attr('href');
          return {
              hasil,
          };
            } else {
                throw new Error(`Failed Fetching Data with Status ${Link.status}`);
            }
        } catch (error) {
            console.error(error);
            throw new Error(error.message);
        }
    }

    app.get('/downloader/threads', async (req, res) => {
        try {
            const { url } = req.query;
            if (!url) {
                res.status(400).json({
                    status: false,
                    message: 'URL Required'
                });
            } else if (!/^(https?:\/\/)?(www\.)?threads\.(com|net)\/.+/i.test(url)) {
                res.status(400).json({
                  status: false,
                  message: 'URL Invalid'
                });
            }
      
            const result = await threadsDl(url);
            const response = await axios.get(result, {
                responseType: 'arraybuffer'
            });
            const vid = await Buffer.from(response.data);
            res.writeHead(200, {
                'Content-Type': 'video/mp4',
                'Content-Length': vid.length
            });
            res.end(vid);
        } catch (error) {
            console.error('Error in /downloader/threads route:', error);
            res.status(500).json({
                status: false,
                message: error.message
            });
        }
    });
};