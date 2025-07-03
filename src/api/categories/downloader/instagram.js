const axios = require('axios');
const cheerio = require('cheerio');

module.exports = function(app) {
    async function yt5sIo(url) {
        try {
            const form = new URLSearchParams();
            form.append("q", decodeURIComponent(url));
            form.append("vt", "home");
 
            const response = await axios.post('https://yt5s.io/api/ajaxSearch', form, {
                headers: {
                    "Accept": "application/json",
                    "X-Requested-With": "XMLHttpRequest",
                    "Content-Type": "application/x-www-form-urlencoded",
                },
            });
 
            if (response.data.status === "ok") {
                const $ = cheerio.load(response.data.data);
                
                const videoUrl = $('a[title="Download Video"]').attr("href");
                const thumbnailUrl = $('img').attr("src");
 
                if (!videoUrl || !thumbnailUrl) {
                    throw new Error("Video or thumbnail not found in the response.");
                }
 
                return {
                    thumbnailUrl,
                    videoUrl
                };
            } else {
                throw new Error("Failed to fetch video: " + response.data.message);
            }
        } catch (error) {
            console.error(error);
            throw new Error(error.message);
        }
    }

    app.get('/downloader/instagram', async (req, res) => {
        try {
            const { url } = req.query;
            if (!url) {
                res.status(400).json({
                    status: false,
                    message: 'URL Required'
                });
            }
            
            const request = await yt5sIo(url);
            const response = await axios.get(request.videoUrl, {
                responseType: 'arraybuffer'
            });
            const vid = await Buffer.from(response.data);
            res.writeHead(200, {
                'Content-Type': 'video/mp4',
                'Content-Length': vid.length
            });
            res.end(vid);
        } catch (error) {
            console.error('Error in /downloader/instagram route:', error);
            res.status(500).json({
                status: false,
                message: error.message
            });
        }
    });
};