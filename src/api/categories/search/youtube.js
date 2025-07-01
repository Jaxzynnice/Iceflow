const axios = require('axios');
const yts = require('yt-search');

module.exports = function(app) {
    app.get('/search/youtube', async (req, res) => {
        try {
            const {
                q,
                apikey
            } = req.query;
            const { data } = await axios.get('https://iceflow.biz.id/src/routes.json');
            if (!apikey) {
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
            
            const ytResults = await yts.search(q);
            const ytTracks = ytResults.videos.map(video => ({
                title: video.title,
                channel: video.author.name,
                duration: video.duration.timestamp,
                imageUrl: video.thumbnail,
                link: video.url
            }));
            res.status(200).json({
                status: true,
                result: ytTracks
            });
        } catch (error) {
            console.error('Error in /search/youtube route:', error);
            res.status(500).json({
                status: false,
                error: error.message
            });
        }
    });
}